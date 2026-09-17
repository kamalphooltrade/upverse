// API tokens: create (raw shown once), list, revoke. No "tickets:confirm" scope exists by design.
import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { newApiToken } from "@/lib/auth";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import { API_SCOPES } from "@/lib/types";
export async function GET(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const d = await readData();
  return json({ scopes: API_SCOPES, tokens: d.apiTokens.map((t) => ({ id: t.id, prefix: t.prefix, label: t.label, scopes: t.scopes, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, revokedAt: t.revokedAt })) });
}
export async function POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const b = await parseBody(req, z.object({ label: z.string().min(1).max(60), scopes: z.array(z.enum(API_SCOPES)).min(1) }));
  if (!b.ok) return b.res;
  const { raw, prefix, hash } = newApiToken();
  const t = await withData((d) => { const x = { id: uid(), prefix, hash, scopes: b.data.scopes, label: b.data.label, createdAt: nowIso(), lastUsedAt: null, revokedAt: null }; d.apiTokens.push(x); audit(d, "owner", "token.create", "token", x.id, { label: x.label, scopes: x.scopes }); return x; });
  return json({ token: raw, id: t.id, prefix, scopes: t.scopes, note: "แสดงครั้งเดียว — เก็บไว้ในที่ปลอดภัย" }, { status: 201 });
}
export async function DELETE(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  const ok = await withData((d) => { const t = d.apiTokens.find((x) => x.id === id); if (!t) return false; t.revokedAt = nowIso(); audit(d, "owner", "token.revoke", "token", t.id, {}); return true; });
  return ok ? json({ revoked: id }) : json({ error: { code: "not_found", message: "ไม่พบ" } }, { status: 404 });
}
