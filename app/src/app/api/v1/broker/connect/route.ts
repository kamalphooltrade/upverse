// POST /api/v1/broker/connect {appKey, appSecret} — owner only. Encrypts at rest, requests token, reports 2FA state.
// Keys never echo back; only last4. Requires UPVERSE_MASTER_KEY.
import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { withData, audit, nowIso } from "@/lib/store";
import { encryptSecret, masterKeyConfigured, createToken, checkToken, listAccounts, WebullError } from "@/lib/webull";
export async function POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  if (!masterKeyConfigured()) return json({ error: { code: "no_master_key", message: "ตั้ง UPVERSE_MASTER_KEY (32 ไบต์ hex/base64) ใน .env.local ก่อน" } }, { status: 422 });
  const b = await parseBody(req, z.object({ appKey: z.string().min(8).max(200), appSecret: z.string().min(8).max(200) }));
  if (!b.ok) return b.res;
  const creds = { appKey: b.data.appKey.trim(), appSecret: b.data.appSecret.trim(), region: "th" as const };
  const last4 = creds.appKey.slice(-4);
  let status: "connected" | "needs_2fa" | "error" = "error"; let lastError: string | null = null; let token: string | null = null; let accounts: unknown = null;
  try {
    const t = await createToken(creds);
    token = t.token;
    if (t.status === "NORMAL") status = "connected";
    else { const c = await checkToken(creds, t.token); status = c.status === "NORMAL" ? "connected" : "needs_2fa"; }
    if (status === "connected") { try { accounts = await listAccounts({ ...creds, token }); } catch (e) { lastError = e instanceof Error ? e.message : String(e); } }
  } catch (e) {
    lastError = e instanceof WebullError ? `${e.status} ${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
  }
  await withData((d) => {
    d.brokerCredentials = { appKeyEnc: encryptSecret(creds.appKey), appSecretEnc: encryptSecret(creds.appSecret), keyLast4: last4, region: "th", environment: d.settings.environment, status, lastOkAt: status === "connected" ? nowIso() : null, lastError };
    audit(d, "owner", "broker.connect", "broker", null, { status, last4 });
  });
  return json({ status, key_last4: last4, last_error: lastError, accounts, next: status === "needs_2fa" ? "อนุมัติการเข้าถึงในแอป Webull (2FA) แล้วกด 'ตรวจสถานะ'" : status === "connected" ? "เชื่อมแล้ว — เลือกบัญชีที่จะ sync" : "ตรวจกุญแจ/สิทธิ์ OpenAPI แล้วลองใหม่" });
}
