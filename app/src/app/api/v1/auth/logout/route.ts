import { SESSION_COOKIE } from "@/lib/auth";
import { json, safe } from "@/lib/api";
import { cookies } from "next/headers";
async function _POST() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return json({ ok: true });
}
export const POST = safe(_POST);
