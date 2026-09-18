// GET /api/v1/portfolio?account=<id|all> — positions valued at latest quotes + cash + P&L split (stock vs FX).
import { gate, json, safe } from "@/lib/api";
import { readData } from "@/lib/store";
import { getQuotes, getUsdThb } from "@/lib/prices";
import { assemblePortfolio, realizedFrom, thbInvested, valuePositions } from "@/lib/portfolio";

async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const url = new URL(req.url);
  const account = url.searchParams.get("account") ?? "all";
  const d = await readData();
  const asm = assemblePortfolio(d, account);
  const { wanted, liveAsOf } = asm;
  const cash = asm.cash;
  const merged = new Map(asm.rows.map((r) => [r.symbol, r]));
  const positions = asm.rows;
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  // prefer Webull last_price when the snapshot is fresher than the yahoo quote (tier 1 over tier 2)
  for (const p of positions) {
    const q = quotes[p.symbol];
    const yahooAsOf = q && !("error" in q) ? new Date(q.asOf).getTime() : 0;
    if (p.brokerLast != null && liveAsOf && new Date(liveAsOf).getTime() >= yahooAsOf) {
      quotes[p.symbol] = { symbol: p.symbol, price: p.brokerLast, prevClose: q && !("error" in q) ? q.prevClose : null, change: q && !("error" in q) && q.prevClose != null ? p.brokerLast - q.prevClose : null, changePct: q && !("error" in q) && q.prevClose ? ((p.brokerLast - q.prevClose) / q.prevClose) * 100 : null, currency: "USD", marketState: q && !("error" in q) ? q.marketState : "UNKNOWN", asOf: liveAsOf, source: "Webull (ชั้น 1 · ตอน sync)", stale: false };
    }
  }
  const v = valuePositions(positions.map(({ symbol, qty, avgCost, costBasis }) => ({ symbol, qty, avgCost, costBasis })), quotes, Math.round(cash * 100) / 100);
  let fx = d.settings.fxUsdThb;
  if (!fx || Date.now() - new Date(fx.asOf).getTime() > 6 * 3600e3) { try { fx = await getUsdThb(); } catch { /* keep last */ } }
  const paperIds = wanted.filter((a) => a.kind === "manual_paper").map((a) => a.id);
  const paperTx = d.transactions.filter((t) => paperIds.includes(t.accountId));
  const invested = thbInvested(paperTx);
  const realized = realizedFrom(paperTx);
  const unrealized = v.rows.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const totalThbNow = fx ? v.total * fx.rate : null;
  const fxPnlThb = fx && invested.avgRate ? (fx.rate - invested.avgRate) * invested.usd : null;
  const liveSnap = (d.liveSnapshots ?? []).filter((s) => wanted.some((a) => a.id === s.accountId));
  return json({
    account,
    as_of: new Date().toISOString(),
    live: liveSnap.length ? { as_of: liveAsOf, accounts: liveSnap.map((s) => ({ accountId: s.accountId, cash_usd: s.cashUsd, buying_power_usd: s.buyingPowerUsd, market_value_usd: s.marketValueUsd, unrealized_usd: s.unrealizedUsd, total_thb_reported: s.totalThbReported, positions: s.positions.length })) } : null,
    total_usd: v.total, invested_usd: v.invested, cash_usd: v.cash, cash_pct: v.cashPct,
    total_thb: totalThbNow != null ? Math.round(totalThbNow) : null,
    fx: fx ? { ...fx } : null,
    pnl: { unrealized_usd: Math.round(unrealized * 100) / 100, realized_usd: realized.realized, dividends_usd: realized.dividends, fees_usd: realized.fees, fx_pnl_thb: fxPnlThb != null ? Math.round(fxPnlThb) : null, thb_invested: invested.thb, avg_rate_paid: invested.avgRate },
    holdings: v.rows.map((r) => ({ symbol: r.symbol, qty: r.qty, avg_cost: r.avgCost, cost_basis: r.costBasis, price: r.price, market_value: r.marketValue, weight_pct: r.weightPct, pnl: r.pnl, pnl_pct: r.pnlPct, quote_source: r.quote?.source ?? null, quote_as_of: r.quote?.asOf ?? null, market_state: r.quote?.marketState ?? null, stale: r.quote?.stale ?? null, accounts: merged.get(r.symbol)?.accounts ?? [] })),
    missing_quotes: v.missing,
    accounts: d.accounts.map((a) => ({ id: a.id, kind: a.kind, label: a.label, environment: a.environment })),
    caveats: [liveSnap.length ? "บัญชี Webull: จำนวน/ต้นทุน/ราคามาจาก Webull ตอน sync ล่าสุด (กด \"ดึงจาก Webull\" เพื่ออัปเดต)" : "ยังไม่มี snapshot จาก Webull — กด \"ดึงจาก Webull\" ในหน้าพอร์ต", "ราคา yahoo (ชั้น 2) อาจดีเลย์ — ห้ามใช้ตัดสินตั๋วเงินจริงโดยไม่ verify"],
  });
}
export const GET = safe(_GET);
