// POST /api/v1/theses/:id {action: "confirm" | "reject" | "stale", reason?} — owner session only (AI drafts need a human).
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { isOwnerSession } from "@/lib/auth";
import { withData, nowIso, audit } from "@/lib/store";
async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner" || !(await isOwnerSession())) return json({ error: { code: "owner_session_required", message: "ยืนยัน/ปฏิเสธ thesis ได้จากเซสชันเจ้าของเท่านั้น (API token ทำไม่ได้)" } }, { status: 403 });
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ action: z.enum(["confirm", "reject", "stale"]), reason: z.string().max(500).optional() }));
  if (!b.ok) return b.res;
  const r = await withData((d) => {
    const t = (d.theses ?? []).find((x) => x.id === id);
    if (!t) return null;
    if (b.data.action === "confirm") { t.status = "confirmed"; t.confirmedAt = nowIso(); t.staleReason = null; }
    else if (b.data.action === "reject") { t.status = "rejected"; t.staleReason = b.data.reason ?? "ปฏิเสธโดยเจ้าของ"; }
    else { t.status = "stale"; t.staleReason = b.data.reason ?? "ข้อมูลเปลี่ยน"; }
    audit(d, "owner", `thesis.${b.data.action}`, "thesis", id, { symbol: t.symbol, reason: b.data.reason ?? null });
    return t;
  });
  return r ? json({ thesis: r }) : json({ error: { code: "not_found", message: "ไม่พบ thesis" } }, { status: 404 });
}
export const POST = safe(_POST);
