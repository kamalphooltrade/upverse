// Shared helpers for /api/v1 route handlers: auth gate, JSON, error shape, rate limit, audit of denials.
import { z } from "zod";
import { principalFrom, allowed, deny, type Principal } from "./auth";
import { withData, uid, nowIso } from "./store";
import type { ApiScope } from "./types";

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });

const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, perMin = 60): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + 60_000 }); return true; }
  if (b.n >= perMin) return false;
  b.n++;
  return true;
}

/** Gate: returns principal or a denial Response. Logs denials (SPEC F11: every call logged incl. denied). */
export async function gate(req: Request, scope: ApiScope | null): Promise<{ p: Principal } | { res: Response }> {
  const p = await principalFrom(req);
  const key = p.kind === "token" ? `t:${p.id}` : p.kind === "owner" ? "owner" : `ip:${req.headers.get("x-forwarded-for") ?? "local"}`;
  if (!rateLimit(key)) return { res: deny(429, "rate_limited", "เกิน 60 ครั้ง/นาที") };
  if (scope && !allowed(p, scope)) {
    await withData((d) => { d.audit.push({ id: uid(), ts: nowIso(), actor: key, action: "api.denied", entity: "route", entityId: new URL(req.url).pathname, meta: { scope, kind: p.kind } }); });
    return { res: deny(p.kind === "anon" ? 401 : 403, "forbidden", p.kind === "anon" ? "ต้องล็อกอินหรือใส่ Bearer token" : `token นี้ไม่มี scope ${scope}`) };
  }
  return { p };
}

export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return { ok: false, res: deny(400, "bad_json", "body ต้องเป็น JSON") }; }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: json({ error: { code: "validation", message: "ข้อมูลไม่ถูกต้อง", issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 422 }) };
  return { ok: true, data: r.data };
}

export const actorOf = (p: Principal): "owner" | "agent" | "api" => (p.kind === "owner" ? "owner" : p.kind === "token" && /agent/i.test(p.label) ? "agent" : "api");
