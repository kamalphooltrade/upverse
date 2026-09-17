import { z } from "zod";
import { checkPassphrase, makeSessionToken, ownerConfigured, SESSION_COOKIE } from "@/lib/auth";
import { json, parseBody, safe } from "@/lib/api";
import { withData, audit } from "@/lib/store";
import { cookies } from "next/headers";

async function _POST(req: Request) {
  if (!ownerConfigured()) return json({ ok: true, note: "ยังไม่ตั้ง UPVERSE_OWNER_PASSPHRASE — โหมด dev เปิดให้เข้าได้เลย" });
  const b = await parseBody(req, z.object({ passphrase: z.string().min(1) }));
  if (!b.ok) return b.res;
  const ok = checkPassphrase(b.data.passphrase);
  await withData((d) => audit(d, "anon", ok ? "auth.login" : "auth.login_failed", "session", null, {}));
  if (!ok) return json({ error: { code: "bad_passphrase", message: "รหัสผ่านไม่ถูกต้อง" } }, { status: 401 });
  const c = await cookies();
  c.set(SESSION_COOKIE, makeSessionToken(30), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return json({ ok: true });
}
export const POST = safe(_POST);
