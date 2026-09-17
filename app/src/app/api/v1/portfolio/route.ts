// GET /api/v1/portfolio?account=<id|all> — positions valued at latest quotes + cash + P&L split (stock vs FX).
import { gate, json } from "@/lib/api";
import { readData } from "@/lib/store";
import { getQuotes, getUsdThb } from "@/lib/prices";
import { positionsFrom, cashFrom, realizedFrom, thbInvested, valuePositions } from "@/lib/portfolio";

export async function GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const url = new URL(req.url);
  const account = url.searchParams.get("account") ?? "all";
  const d = await readData();
  const accId = account === "all" ? undefined : account;
  const positions = positionsFrom(d.transactions, accId);
  const cash = cashFrom(d.transactions, accId);
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  const v = valuePositions(positions, quotes, cash);
  let fx = d.settings.fxUsdThb;
  if (!fx || Date.now() - new Date(fx.asOf).getTime() > 6 * 3600e3) { try { fx = await getUsdThb(); } catch { /* keep last */ } }
  const invested = thbInvested(d.transactions, accId);
  const realized = realizedFrom(d.transactions, accId);
  const unrealized = v.rows.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const totalThbNow = fx ? v.total * fx.rate : null;
  // FX P&L = (rate now − avg rate paid) × USD invested; stock P&L = unrealized + realized + dividends (USD)
  const fxPnlThb = fx && invested.avgRate ? (fx.rate - invested.avgRate) * invested.usd : null;
  return json({
    account,
    as_of: new Date().toISOString(),
    total_usd: v.total, invested_usd: v.invested, cash_usd: v.cash, cash_pct: v.cashPct,
    total_thb: totalThbNow != null ? Math.round(totalThbNow) : null,
    fx: fx ? { ...fx } : null,
    pnl: { unrealized_usd: Math.round(unrealized * 100) / 100, realized_usd: realized.realized, dividends_usd: realized.dividends, fees_usd: realized.fees, fx_pnl_thb: fxPnlThb != null ? Math.round(fxPnlThb) : null, thb_invested: invested.thb, avg_rate_paid: invested.avgRate },
    holdings: v.rows.map((r) => ({ symbol: r.symbol, qty: r.qty, avg_cost: r.avgCost, cost_basis: r.costBasis, price: r.price, market_value: r.marketValue, weight_pct: r.weightPct, pnl: r.pnl, pnl_pct: r.pnlPct, quote_source: r.quote?.source ?? null, quote_as_of: r.quote?.asOf ?? null, market_state: r.quote?.marketState ?? null, stale: r.quote?.stale ?? null })),
    missing_quotes: v.missing,
    accounts: d.accounts.map((a) => ({ id: a.id, kind: a.kind, label: a.label, environment: a.environment })),
    caveats: ["ราคาจาก yahoo (ชั้น 2) อาจดีเลย์ — ห้ามใช้ตัดสินตั๋วเงินจริงโดยไม่ verify", "ต้นทุนเฉลี่ยจากสมุดบันทึกของผู้ใช้ ไม่ใช่จากโบรกเกอร์ จนกว่าจะเชื่อม Webull"],
  });
}
