import { gate, json, safe } from "@/lib/api";
import { readData, withData } from "@/lib/store";
import { evaluate } from "../route";
import { confirmPhraseFor } from "@/lib/risk";

async function _GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const { id } = await ctx.params;
  const d = await readData();
  const t = d.tickets.find((x) => x.id === id);
  if (!t) return json({ error: { code: "not_found", message: "ไม่พบตั๋ว" } }, { status: 404 });
  // re-evaluate live (fresh quote) when still open
  if (["proposed"].includes(t.status)) {
    const ev = await evaluate(d, t);
    t.riskCheck = ev.checks;
    t.confirmPhrase = confirmPhraseFor(t, ev.qty);
    await withData((dd) => { const x = dd.tickets.find((y) => y.id === id); if (x) { x.riskCheck = ev.checks; x.confirmPhrase = t.confirmPhrase; x.updatedAt = new Date().toISOString(); } });
    return json({ ticket: t, quote: ev.quote, log: d.orderLog.filter((l) => l.ticketId === id) });
  }
  return json({ ticket: t, quote: null, log: d.orderLog.filter((l) => l.ticketId === id) });
}
export const GET = safe(_GET);
