// GET /api/v1/portfolio/review?account=all — allocation vs plan, per-holding review (stage · trend template · RS vs SPY ·
// valuation · quality · thesis · fees) with rule-based action + averaging-down permission, rotation candidates with gates.
import { gate, json, safe } from "@/lib/api";
import { readData, withData } from "@/lib/store";
import { getQuotes, getBars, getUsdThb } from "@/lib/prices";
import { assemblePortfolio, valuePositions, firstBuyTs } from "@/lib/portfolio";
import { snapshot, type Snapshot } from "@/lib/scan/indicators";
import { getFundamentals, type Fundamentals } from "@/lib/scan/fundamentals";
import { getUniverse, type Constituent } from "@/lib/scan/universe";
import { reviewPortfolio, type ReviewInput } from "@/lib/review";

const MAX_CANDIDATES = 16;

async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const account = new URL(req.url).searchParams.get("account") ?? "all";
  const d = await readData();
  const asm = assemblePortfolio(d, account);
  const quotes = await getQuotes(asm.rows.map((p) => p.symbol));
  for (const p of asm.rows) {
    const q = quotes[p.symbol];
    const yahooAsOf = q && !("error" in q) ? new Date(q.asOf).getTime() : 0;
    if (p.brokerLast != null && asm.liveAsOf && new Date(asm.liveAsOf).getTime() >= yahooAsOf) quotes[p.symbol] = { symbol: p.symbol, price: p.brokerLast, prevClose: null, change: null, changePct: null, currency: "USD", marketState: "UNKNOWN", asOf: asm.liveAsOf, source: "Webull (ชั้น 1 · ตอน sync)", stale: false };
  }
  const v = valuePositions(asm.rows.map(({ symbol, qty, avgCost, costBasis }) => ({ symbol, qty, avgCost, costBasis })), quotes, asm.cash);
  let fx = d.settings.fxUsdThb;
  if (!fx || Date.now() - new Date(fx.asOf).getTime() > 6 * 3600e3) { try { fx = await getUsdThb(); } catch { /* keep */ } }
  const rules = d.riskRules[d.riskRules.length - 1];
  const holdingSyms = v.rows.map((r) => r.symbol);

  // candidates: watchlist + latest scan top-5 per model + theses with verdict "เพิ่ม" — excluding holdings
  const latestRuns = new Map<string, (typeof d.scanRuns)[number]>();
  for (const r of d.scanRuns) { const cur = latestRuns.get(r.modelKey); if (!cur || cur.runAt < r.runAt) latestRuns.set(r.modelKey, r); }
  const scanTags: Record<string, string | null> = {};
  const candMap = new Map<string, string>();
  for (const w of d.watchlist) if (!holdingSyms.includes(w.symbol)) candMap.set(w.symbol, "watchlist");
  for (const [model, run] of latestRuns) {
    if (model === "AVOID") continue;
    for (const x of run.results.slice(0, 5)) { scanTags[x.symbol] = scanTags[x.symbol] ?? model; if (!holdingSyms.includes(x.symbol) && !candMap.has(x.symbol)) candMap.set(x.symbol, `scan:${model}`); }
    for (const x of run.results) scanTags[x.symbol] = scanTags[x.symbol] ?? model;
  }
  for (const t of d.theses ?? []) if (t.verdict === "เพิ่ม" && t.status !== "rejected" && !holdingSyms.includes(t.symbol) && !candMap.has(t.symbol)) candMap.set(t.symbol, "thesis");
  for (const s of rules.coreSymbols) candMap.delete(s); // core ETFs are the "next money" path, not rotation targets
  const candidates = [...candMap.entries()].slice(0, MAX_CANDIDATES).map(([symbol, source]) => ({ symbol, source }));

  const syms = [...new Set([...holdingSyms, ...candidates.map((c) => c.symbol), "SPY"])];
  const [barsRes, fundRes, uniRes] = await Promise.all([
    Promise.allSettled(syms.map((s) => getBars(s, "2y"))),
    Promise.allSettled(syms.filter((s) => s !== "SPY" && !rules.coreSymbols.includes(s)).map((s) => getFundamentals(s))),
    getUniverse().catch(() => null),
  ]);
  const snapshots: Record<string, Snapshot | null> = {};
  syms.forEach((s, i) => { const r = barsRes[i]; snapshots[s] = r.status === "fulfilled" ? snapshot(r.value) : null; });
  const fundamentals: Record<string, Fundamentals | null> = {};
  syms.filter((s) => s !== "SPY" && !rules.coreSymbols.includes(s)).forEach((s, i) => { const r = fundRes[i]; fundamentals[s] = r.status === "fulfilled" ? r.value : null; });
  const constituents: Record<string, Constituent> = {};
  for (const c of uniRes?.items ?? []) constituents[c.symbol] = c;

  const input: ReviewInput = {
    holdings: v.rows.map((r) => ({ symbol: r.symbol, qty: r.qty, avgCost: r.avgCost, costBasis: r.costBasis, price: r.price, marketValue: r.marketValue, weightPct: r.weightPct, pnl: r.pnl, pnlPct: r.pnlPct, firstBuyTs: firstBuyTs(d.transactions, r.symbol) })),
    cash: v.cash, total: v.total, fxRate: fx?.rate ?? null, snapshots, fundamentals, constituents,
    theses: d.theses ?? [], rules, goal: d.goal, fxSpreadPct: d.settings.fxSpreadPct ?? null, candidates, equityHistory: d.equityHistory ?? [],
  };
  const out = reviewPortfolio(input, scanTags);

  // record today's equity point (one per day) so performance history accumulates
  try {
    await withData((dd) => {
      const date = new Date().toISOString().slice(0, 10);
      const pt = { date, totalUsd: v.total, cashUsd: v.cash, investedUsd: v.invested, fxRate: fx?.rate ?? null };
      dd.equityHistory = [...(dd.equityHistory ?? []).filter((p) => p.date !== date), pt].slice(-1500);
    });
  } catch { /* read-only storage: skip */ }
  return json({ ...out, quotes_as_of: v.rows[0]?.quote?.asOf ?? null, fx: fx ? { rate: fx.rate, asOf: fx.asOf, source: fx.source } : null, missing_bars: syms.filter((s) => !snapshots[s]) });
}
export const GET = safe(_GET);
