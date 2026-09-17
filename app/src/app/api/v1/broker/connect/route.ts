// POST /api/v1/broker/connect {appKey, appSecret} — owner only. Encrypts keys, creates a token (Webull sends SMS),
// returns instructions for verifying in the Webull app. Keys never echo back; only last4.
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { withData, audit } from "@/lib/store";
import { encryptSecret, masterKeyConfigured } from "@/lib/webull";
import { beginVerification } from "@/lib/webull/session";
async function _POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  if (!masterKeyConfigured()) return json({ error: { code: "no_master_key", message: "ตั้ง UPVERSE_MASTER_KEY (32 ไบต์ hex) ใน env ก่อน" } }, { status: 422 });
  const b = await parseBody(req, z.object({ appKey: z.string().min(8).max(200), appSecret: z.string().min(8).max(200) }));
  if (!b.ok) return b.res;
  const appKey = b.data.appKey.trim(), appSecret = b.data.appSecret.trim();
  await withData((d) => {
    d.brokerCredentials = { appKeyEnc: encryptSecret(appKey), appSecretEnc: encryptSecret(appSecret), keyLast4: appKey.slice(-4), region: "th", environment: d.settings.environment, status: "needs_2fa", lastOkAt: null, lastError: null, accessTokenEnc: null, tokenStatus: null, tokenCreatedAt: null, tokenExpires: null, tokenLastUsedAt: null, accounts: null };
    audit(d, "owner", "broker.keys_saved", "broker", null, { last4: appKey.slice(-4) });
  });
  const view = await beginVerification();
  return json({ ...view, next: view.status === "connected" ? "เชื่อมแล้ว" : view.status === "needs_2fa" ? "Webull ส่ง SMS แล้ว — ไปยืนยันในแอป Webull ตามขั้นตอน แล้วกด \"ตรวจสถานะ\"" : "สร้าง token ไม่สำเร็จ — ตรวจกุญแจ/สิทธิ์ OpenAPI แล้วกด \"ขอรหัสใหม่\"" });
}
export const POST = safe(_POST);
