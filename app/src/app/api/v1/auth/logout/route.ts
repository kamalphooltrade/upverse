import { SESSION_COOKIE } from "@/lib/auth";
import { json } from "@/lib/api";
import { cookies } from "next/headers";
export async function POST() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return json({ ok: true });
}
