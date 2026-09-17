// PUT /api/v1/auth/passphrase {current, next} — owner session only. Stores scrypt hash in DB; env value becomes irrelevant.
// GET → where the passphrase currently comes from (env | db | none).
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { checkPassphrase, hashPassphrase, ownerPassphraseSource, isOwnerSession, makeSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { withData, audit, nowIso } from "@/lib/store";
import { cookies } from "next/headers";

async function _GET(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const src = await ownerPassphraseSource();
  return json({ source: src, note: src === "env" ? "ใช้ค่าจาก UPVERSE_OWNER_PASSPHRASE (env) — เปลี่ยนในหน้านี้ได้ แล้ว env จะไม่ถูกใช้อีก" : src === "db" ? "ใช้รหัสที่ตั้งในแอป (เก็บเป็น hash)" : "ยังไม่ตั้ง (โหมด dev)" });
}
async function _PUT(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner" || !(await isOwnerSession())) return json({ error: { code: "owner_session_required", message: "ต้องเป็นเซสชันเจ้าของในหน้าจอ (API token ทำไม่ได้)" } }, { status: 403 });
  const b = await parseBody(req, z.object({ current: z.string().default(""), next: z.string().min(10, "อย่างน้อย 10 ตัวอักษร").max(200) }));
  if (!b.ok) return b.res;
  const src = await ownerPassphraseSource();
  if (src !== "none" && !(await checkPassphrase(b.data.current))) {
    await withData((d) => audit(d, "owner", "auth.passphrase_change_failed", "owner", null, { reason: "current mismatch" }));
    return json({ error: { code: "bad_current", message: "รหัสผ่านเดิมไม่ถูกต้อง" } }, { status: 401 });
  }
  if (b.data.next === b.data.current) return json({ error: { code: "same", message: "รหัสใหม่ต้องต่างจากเดิม" } }, { status: 422 });
  const { hash, salt } = hashPassphrase(b.data.next);
  await withData((d) => { d.owner = { passphraseHash: hash, salt, changedAt: nowIso() }; audit(d, "owner", "auth.passphrase_changed", "owner", null, { previous_source: src }); });
  // rotate session so other devices must sign in again
  const c = await cookies();
  c.set(SESSION_COOKIE, makeSessionToken(30), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return json({ ok: true, source: "db", note: "เปลี่ยนแล้ว — อุปกรณ์อื่นต้องเข้าสู่ระบบใหม่ · ค่าใน env ไม่ถูกใช้อีก (ลบออกจาก Vercel ได้)" });
}
export const GET = safe(_GET);
export const PUT = safe(_PUT);
