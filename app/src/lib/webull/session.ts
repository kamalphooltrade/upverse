// Webull token lifecycle (per developer.webull.co.th/apis/docs/authentication/token, verified 18 Sep 2026):
//  create → status PENDING + SMS sent to the phone bound to the Webull account
//  user: Webull app → Menu → Messages → OpenAPI Notifications → "Check Now" → enter SMS code → confirm (within 5 minutes)
//  check → NORMAL (valid; INVALID after 15 consecutive days without API calls; EXPIRED if not verified in 5 min)
// The code is NEVER typed into UPVerse. We only create/check/refresh and remember the token (encrypted).
import type { DataFile } from "../types";
import { withData, nowIso, audit } from "../store";
import { createToken, checkToken, refreshToken, listAccounts, decryptSecret, encryptSecret, WebullError, type WebullCreds } from "./index";

export const TWO_FA_WINDOW_MS = 5 * 60 * 1000;
export const IDLE_INVALID_DAYS = 15;

export function credsFrom(d: DataFile): WebullCreds | null {
  const bc = d.brokerCredentials;
  if (!bc) return null;
  return { appKey: decryptSecret(bc.appKeyEnc), appSecret: decryptSecret(bc.appSecretEnc), region: "th", token: bc.accessTokenEnc ? decryptSecret(bc.accessTokenEnc) : null };
}

export interface BrokerView {
  status: "unset" | "needs_2fa" | "connected" | "expired" | "error";
  tokenStatus: string | null;
  keyLast4: string | null;
  twoFaDeadline: string | null; // ISO
  twoFaSecondsLeft: number | null;
  tokenExpires: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  accounts: NonNullable<DataFile["brokerCredentials"]>["accounts"];
  instructions: string[];
}

const INSTRUCTIONS = [
  "เปิดแอป Webull → Menu → Messages → OpenAPI Notifications",
  "เปิดข้อความล่าสุด แล้วกด \"Check Now\"",
  "กรอกรหัส SMS ที่ส่งไปเบอร์ที่ผูกบัญชี Webull แล้วยืนยัน (มีเวลา 5 นาทีนับจากกด \"เชื่อม\")",
  "กลับมาที่นี่แล้วกด \"ตรวจสถานะ\" — ไม่ต้องกรอกรหัสในแอปนี้",
];

export function viewOf(d: DataFile): BrokerView {
  const bc = d.brokerCredentials;
  if (!bc) return { status: "unset", tokenStatus: null, keyLast4: null, twoFaDeadline: null, twoFaSecondsLeft: null, tokenExpires: null, lastOkAt: null, lastError: null, accounts: null, instructions: [] };
  const deadline = bc.tokenStatus === "PENDING" && bc.tokenCreatedAt ? new Date(new Date(bc.tokenCreatedAt).getTime() + TWO_FA_WINDOW_MS) : null;
  const left = deadline ? Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000)) : null;
  return { status: bc.status, tokenStatus: bc.tokenStatus, keyLast4: bc.keyLast4, twoFaDeadline: deadline?.toISOString() ?? null, twoFaSecondsLeft: left, tokenExpires: bc.tokenExpires, lastOkAt: bc.lastOkAt, lastError: bc.lastError, accounts: bc.accounts, instructions: bc.status === "needs_2fa" ? INSTRUCTIONS : [] };
}

/** Create a fresh token (sends an SMS). Use on first connect or when the previous token is EXPIRED/INVALID. */
export async function beginVerification(): Promise<BrokerView> {
  return withData(async (d) => {
    const creds = credsFrom(d);
    const bc = d.brokerCredentials;
    if (!creds || !bc) throw new Error("ยังไม่มีกุญแจ Webull");
    try {
      const t = await createToken({ ...creds, token: null });
      bc.accessTokenEnc = encryptSecret(t.token);
      bc.tokenStatus = (t.status as "PENDING" | "NORMAL") ?? "PENDING";
      bc.tokenCreatedAt = nowIso();
      bc.tokenExpires = t.expires != null ? String(t.expires) : null;
      bc.lastError = null;
      bc.status = t.status === "NORMAL" ? "connected" : "needs_2fa";
      if (t.status === "NORMAL") { bc.lastOkAt = nowIso(); bc.tokenLastUsedAt = nowIso(); }
      audit(d, "owner", "broker.token_create", "broker", null, { status: t.status });
    } catch (e) {
      bc.status = "error"; bc.tokenStatus = null;
      bc.lastError = e instanceof WebullError ? `${e.status} ${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
      audit(d, "owner", "broker.token_create_failed", "broker", null, { error: bc.lastError });
    }
    return viewOf(d);
  });
}

/** Check the stored token (no SMS). Called by the "ตรวจสถานะ" button and before API use. */
export async function checkVerification(loadAccounts = true): Promise<BrokerView> {
  return withData(async (d) => {
    const creds = credsFrom(d);
    const bc = d.brokerCredentials;
    if (!creds || !bc) throw new Error("ยังไม่มีกุญแจ Webull");
    if (!creds.token) { bc.status = "error"; bc.lastError = "ยังไม่มี token — กด \"ขอรหัสใหม่\""; return viewOf(d); }
    try {
      const c = await checkToken({ ...creds, token: null }, creds.token);
      bc.tokenStatus = (c.status as BrokerView["tokenStatus"] as "PENDING" | "NORMAL" | "INVALID" | "EXPIRED") ?? null;
      bc.tokenExpires = c.expires != null ? String(c.expires) : bc.tokenExpires;
      if (c.status === "NORMAL") {
        bc.status = "connected"; bc.lastOkAt = nowIso(); bc.tokenLastUsedAt = nowIso(); bc.lastError = null;
        if (loadAccounts) {
          try {
            const raw = await listAccounts({ ...creds, token: c.token || creds.token });
            const arr = Array.isArray(raw) ? raw : (raw as { accounts?: unknown[] }).accounts ?? [];
            bc.accounts = (arr as Array<Record<string, unknown>>).map((a) => ({ account_id: String(a.account_id ?? a.accountId ?? ""), account_number: a.account_number ? String(a.account_number) : undefined, account_type: a.account_type ? String(a.account_type) : undefined }));
          } catch (e) { bc.lastError = "เชื่อมแล้ว แต่ดึงรายการบัญชีไม่ได้: " + (e instanceof Error ? e.message : String(e)); }
        }
      } else if (c.status === "PENDING") {
        bc.status = "needs_2fa";
      } else {
        bc.status = "expired"; bc.lastError = c.status === "EXPIRED" ? "ไม่ได้ยืนยันภายใน 5 นาที — กด \"ขอรหัสใหม่\"" : "token ใช้ไม่ได้แล้ว (ไม่มีการเรียก 15 วัน) — กด \"ขอรหัสใหม่\"";
      }
      audit(d, "owner", "broker.token_check", "broker", null, { status: c.status });
    } catch (e) {
      bc.status = "error";
      bc.lastError = e instanceof WebullError ? `${e.status} ${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    }
    return viewOf(d);
  });
}

/** Keep the token alive (INVALID after 15 idle days). Safe to call daily from the nightly job. */
export async function keepAlive(): Promise<void> {
  await withData(async (d) => {
    const creds = credsFrom(d);
    const bc = d.brokerCredentials;
    if (!creds?.token || !bc || bc.status !== "connected") return;
    try { await refreshToken({ ...creds, token: null }, creds.token); bc.tokenLastUsedAt = nowIso(); } catch (e) { bc.lastError = "keep-alive: " + (e instanceof Error ? e.message : String(e)); }
  });
}
