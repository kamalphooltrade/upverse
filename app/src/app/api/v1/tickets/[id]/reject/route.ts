import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { withData, uid, nowIso, audit } from "@/lib/store";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ reason: z.string().min(1).max(500) }));
  if (!b.ok) return b.res;
  const r = await withData((d) => {
    const t = d.tickets.find((x) => x.id === id);
    if (!t) return null;
    const from = t.status;
    t.status = "cancelled"; t.updatedAt = nowIso();
    d.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "reject", fromStatus: from, toStatus: "cancelled", actor: "owner", detail: b.data.reason });
    d.journal.push({ id: uid(), ts: nowIso(), ticketId: id, symbol: t.symbol, decision: "ไม่ทำ", thesisShort: t.rationale.slice(0, 200), emotion: "ลังเล", expectation: "", reviewDays: 30, outcome: null, lesson: b.data.reason });
    audit(d, "owner", "ticket.reject", "ticket", id, { reason: b.data.reason });
    return t;
  });
  return r ? json({ ticket: r, note: "บันทึกเหตุผลลง journal แล้ว (แก้ไขได้)" }) : json({ error: { code: "not_found", message: "ไม่พบตั๋ว" } }, { status: 404 });
}
