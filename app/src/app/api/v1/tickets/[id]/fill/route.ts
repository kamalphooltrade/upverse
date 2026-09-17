// POST /api/v1/tickets/:id/fill — manual rail: owner reports actual fill → creates ledger transaction (source manual_after_ticket).
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { withData, uid, nowIso, audit } from "@/lib/store";

async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ price: z.number().positive(), qty: z.number().positive(), fees: z.number().nonnegative().default(0), fxRateThb: z.number().positive().nullable().optional(), ts: z.string().datetime({ offset: true }).optional() }));
  if (!b.ok) return b.res;
  const r = await withData((d) => {
    const t = d.tickets.find((x) => x.id === id);
    if (!t) return { error: "ไม่พบตั๋ว" };
    if (!["confirmed", "sent"].includes(t.status)) return { error: `สถานะ ${t.status} บันทึก fill ไม่ได้ (ต้อง confirmed/sent)` };
    const ts = b.data.ts ?? nowIso();
    const amount = t.side === "buy" ? -(b.data.qty * b.data.price + b.data.fees) : b.data.qty * b.data.price - b.data.fees;
    d.transactions.push({ id: uid(), accountId: t.accountId, ts, symbol: t.symbol, type: t.side, qty: b.data.qty, price: b.data.price, amountUsd: Math.round(amount * 100) / 100, fxRateThb: b.data.fxRateThb ?? null, fees: b.data.fees, note: `จากตั๋ว ${t.id.slice(0, 8)}${t.tag ? " · " + t.tag : ""}`, source: "manual_after_ticket", ticketId: t.id, brokerOrderId: t.brokerOrderId });
    t.status = "filled"; t.fill = { price: b.data.price, qty: b.data.qty, ts }; t.updatedAt = nowIso();
    d.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "fill", fromStatus: "confirmed", toStatus: "filled", actor: "owner", detail: `${b.data.qty} @ ${b.data.price}` });
    audit(d, "owner", "ticket.fill", "ticket", id, { qty: b.data.qty, price: b.data.price });
    return { ticket: t };
  });
  if ("error" in r) return json({ error: { code: "bad_state", message: r.error } }, { status: 409 });
  return json({ ...r, next: "บันทึก journal ภายใน 24 ชม." });
}
export const POST = safe(_POST);
