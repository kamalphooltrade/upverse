// Portfolio math (SPEC F2.3 / F2.5). Average-cost method; quantities are fractional.
import type { Position, Quote, Transaction } from "../types";

export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build positions from transactions using average cost. Sells reduce qty at avg cost (realized P&L tracked separately). */
export function positionsFrom(txs: Transaction[], accountId?: string): Position[] {
  const map = new Map<string, { qty: number; cost: number }>();
  const sorted = [...txs]
    .filter((t) => !accountId || t.accountId === accountId)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  for (const t of sorted) {
    if (!t.symbol) continue;
    const s = t.symbol.toUpperCase();
    const cur = map.get(s) ?? { qty: 0, cost: 0 };
    if (t.type === "buy") {
      cur.qty = r6(cur.qty + t.qty);
      cur.cost = r2(cur.cost + t.qty * t.price + t.fees);
    } else if (t.type === "sell") {
      const avg = cur.qty > 0 ? cur.cost / cur.qty : 0;
      cur.qty = r6(cur.qty - t.qty);
      cur.cost = r2(Math.max(0, cur.cost - t.qty * avg));
      if (cur.qty <= 0.0000005) {
        cur.qty = 0;
        cur.cost = 0;
      }
    } else if (t.type === "split" && t.qty > 0) {
      // qty here = split ratio (e.g. 4 for 4:1)
      cur.qty = r6(cur.qty * t.qty);
    }
    map.set(s, cur);
  }
  return [...map.entries()]
    .filter(([, v]) => v.qty > 0)
    .map(([symbol, v]) => ({ symbol, qty: v.qty, costBasis: v.cost, avgCost: r2(v.cost / v.qty) }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Cash (USD) in an account from the ledger: deposits/fx/dividends/sells in, buys/fees/withdrawals out. */
export function cashFrom(txs: Transaction[], accountId?: string): number {
  return r2(
    txs
      .filter((t) => !accountId || t.accountId === accountId)
      .reduce((sum, t) => sum + t.amountUsd, 0),
  );
}

/** Realized P&L from sells (avg-cost) + dividends. */
export function realizedFrom(txs: Transaction[], accountId?: string): { realized: number; dividends: number; fees: number } {
  const map = new Map<string, { qty: number; cost: number }>();
  let realized = 0, dividends = 0, fees = 0;
  for (const t of [...txs].filter((t) => !accountId || t.accountId === accountId).sort((a, b) => a.ts.localeCompare(b.ts))) {
    fees += t.fees;
    if (t.type === "dividend") dividends += t.amountUsd;
    if (!t.symbol) continue;
    const s = t.symbol.toUpperCase();
    const cur = map.get(s) ?? { qty: 0, cost: 0 };
    if (t.type === "buy") {
      cur.qty += t.qty;
      cur.cost += t.qty * t.price + t.fees;
    } else if (t.type === "sell") {
      const avg = cur.qty > 0 ? cur.cost / cur.qty : 0;
      realized += t.qty * (t.price - avg) - t.fees;
      cur.qty -= t.qty;
      cur.cost -= t.qty * avg;
    }
    map.set(s, cur);
  }
  return { realized: r2(realized), dividends: r2(dividends), fees: r2(fees) };
}

/** THB deposited (from deposit/fx rows with fxRateThb) — used to split "stock P&L" vs "FX P&L". */
export function thbInvested(txs: Transaction[], accountId?: string): { thb: number; usd: number; avgRate: number | null } {
  let thb = 0, usd = 0;
  for (const t of txs) {
    if (accountId && t.accountId !== accountId) continue;
    if ((t.type === "deposit" || t.type === "fx") && t.fxRateThb && t.amountUsd > 0) {
      thb += t.amountUsd * t.fxRateThb;
      usd += t.amountUsd;
    }
  }
  return { thb: r2(thb), usd: r2(usd), avgRate: usd > 0 ? r2(thb / usd) : null };
}

export interface HoldingRow extends Position {
  price: number | null;
  marketValue: number | null;
  weightPct: number | null;
  pnl: number | null;
  pnlPct: number | null;
  quote: Quote | null;
}

export function valuePositions(positions: Position[], quotes: Record<string, Quote | { error: string }>, cash: number) {
  const rows: HoldingRow[] = positions.map((p) => {
    const q = quotes[p.symbol];
    const quote = q && !("error" in q) ? q : null;
    const price = quote?.price ?? null;
    const mv = price != null ? r2(price * p.qty) : null;
    return {
      ...p,
      price,
      quote,
      marketValue: mv,
      weightPct: null,
      pnl: mv != null ? r2(mv - p.costBasis) : null,
      pnlPct: mv != null && p.costBasis > 0 ? r2(((mv - p.costBasis) / p.costBasis) * 100) : null,
    };
  });
  const invested = rows.reduce((s, r) => s + (r.marketValue ?? 0), 0);
  const total = r2(invested + cash);
  for (const r of rows) r.weightPct = r.marketValue != null && total > 0 ? r2((r.marketValue / total) * 100) : null;
  const missing = rows.filter((r) => r.marketValue == null).map((r) => r.symbol);
  return { rows, invested: r2(invested), cash: r2(cash), total, cashPct: total > 0 ? r2((cash / total) * 100) : 0, missing };
}

/** Required annual return so that FV(start) + FV(monthly) = target over `years`. Bisection; returns decimal. */
export function requiredAnnualReturn(target: number, start: number, monthly: number, years: number): number | null {
  if (years <= 0 || target <= 0) return null;
  const fv = (r: number) => {
    const m = Math.pow(1 + r, 1 / 12) - 1;
    const n = Math.round(years * 12);
    const fvMonthly = m === 0 ? monthly * n : monthly * ((Math.pow(1 + m, n) - 1) / m);
    return start * Math.pow(1 + r, years) + fvMonthly;
  };
  if (fv(0) >= target) return 0;
  let lo = 0, hi = 5;
  if (fv(hi) < target) return null; // unreachable even at 500%/yr
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Projected path (monthly) for a given annual return. */
export function projectPath(start: number, monthly: number, years: number, annual: number): number[] {
  const m = Math.pow(1 + annual, 1 / 12) - 1;
  const n = Math.round(years * 12);
  const out = [start];
  let v = start;
  for (let i = 0; i < n; i++) {
    v = v * (1 + m) + monthly;
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assemble holdings across accounts: webull_live → last broker snapshot (qty/cost/last from Webull = tier 1),
// manual_paper → ledger. Shared by /portfolio and /portfolio/review so both show the same numbers.
import type { DataFile, Account } from "../types";
export interface AssembledRow extends Position { accountId: string; brokerLast: number | null; brokerUnrealized: number | null }
export interface Assembled { rows: Array<AssembledRow & { accounts: string[] }>; cash: number; liveAsOf: string | null; wanted: Account[] }
export function assemblePortfolio(d: DataFile, account = "all"): Assembled {
  const wanted = account === "all" ? d.accounts.filter((a) => a.isActive) : d.accounts.filter((a) => a.id === account);
  const rows: AssembledRow[] = [];
  let cash = 0;
  let liveAsOf: string | null = null;
  for (const a of wanted) {
    if (a.kind === "webull_live") {
      const snap = (d.liveSnapshots ?? []).find((s) => s.accountId === a.id);
      if (!snap) continue;
      if (liveAsOf === null || snap.asOf > liveAsOf) liveAsOf = snap.asOf;
      cash += snap.cashUsd;
      for (const p of snap.positions) rows.push({ symbol: p.symbol, qty: p.qty, avgCost: p.costPrice, costBasis: r2(p.costPrice * p.qty), accountId: a.id, brokerLast: p.lastPrice, brokerUnrealized: p.unrealized });
    } else {
      for (const p of positionsFrom(d.transactions, a.id)) rows.push({ ...p, accountId: a.id, brokerLast: null, brokerUnrealized: null });
      cash += cashFrom(d.transactions, a.id);
    }
  }
  const merged = new Map<string, AssembledRow & { accounts: string[] }>();
  for (const r of rows) {
    const cur = merged.get(r.symbol);
    if (!cur) merged.set(r.symbol, { ...r, accounts: [r.accountId] });
    else { const qty = cur.qty + r.qty; cur.costBasis = r2(cur.costBasis + r.costBasis); cur.qty = r6(qty); cur.avgCost = r2(cur.costBasis / qty); cur.brokerLast = cur.brokerLast ?? r.brokerLast; cur.accounts.push(r.accountId); }
  }
  return { rows: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), cash: r2(cash), liveAsOf, wanted };
}

/** Earliest buy timestamp per symbol from the ledger (Webull fills are a recent window only → may be null). */
export function firstBuyTs(txs: Transaction[], symbol: string): string | null {
  const t = txs.filter((x) => x.symbol?.toUpperCase() === symbol && x.type === "buy").sort((a, b) => a.ts.localeCompare(b.ts))[0];
  return t?.ts ?? null;
}
