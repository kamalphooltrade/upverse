// GET /api/v1/instruments/:symbol?range=1y — quote + bars + indicators + EDGAR fundamentals + scan tags + position.
import { gate, json, safe } from "@/lib/api";
import { readData } from "@/lib/store";
import { getQuote, getBars } from "@/lib/prices";
import { snapshot, ema, sma, rsi } from "@/lib/scan/indicators";
import { getFundamentals } from "@/lib/scan/fundamentals";
import { positionsFrom } from "@/lib/portfolio";

async function _GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const g = await gate(req, "quotes:read");
  if ("res" in g) return g.res;
  const { symbol: raw } = await ctx.params;
  const symbol = raw.toUpperCase();
  const range = (new URL(req.url).searchParams.get("range") ?? "1y") as "3mo" | "6mo" | "1y" | "2y";
  const d = await readData();
  const [quoteR, barsR, fundR] = await Promise.allSettled([getQuote(symbol), getBars(symbol, range === "3mo" || range === "6mo" ? "1y" : range), getFundamentals(symbol)]);
  const bars = barsR.status === "fulfilled" ? barsR.value : [];
  const closes = bars.map((b) => b.c);
  const snap = snapshot(bars);
  const series = { ema20: ema(closes, 20), sma50: sma(closes, 50), sma200: sma(closes, 200), rsi14: rsi(closes, 14) };
  const cut = range === "3mo" ? 66 : range === "6mo" ? 130 : bars.length;
  const tags = d.scanRuns.filter((r) => r.results.some((x) => x.symbol === symbol)).map((r) => ({ model: r.modelKey, rank: r.results.find((x) => x.symbol === symbol)!.rank, runAt: r.runAt }));
  const latestTags = Object.values(tags.reduce((m, t) => { if (!m[t.model] || m[t.model].runAt < t.runAt) m[t.model] = t; return m; }, {} as Record<string, (typeof tags)[0]>));
  // position: live Webull accounts use the broker snapshot (fills history is a recent window only), paper accounts use the ledger
  const posRows = d.accounts.flatMap((a) => {
    if (a.kind === "webull_live") {
      const snap = (d.liveSnapshots ?? []).find((s) => s.accountId === a.id);
      return (snap?.positions ?? []).filter((p) => p.symbol === symbol).map((p) => ({ qty: p.qty, costBasis: p.costPrice * p.qty })); // unrounded: fractional lots are cents-sized
    }
    return positionsFrom(d.transactions, a.id).filter((p) => p.symbol === symbol).map((p) => ({ qty: p.qty, costBasis: p.costBasis }));
  });
  const posQty = Math.round(posRows.reduce((s, r) => s + r.qty, 0) * 1e6) / 1e6;
  const posCost = posRows.reduce((s, r) => s + r.costBasis, 0);
  const pos = posQty > 0 ? { symbol, qty: posQty, avgCost: Math.round((posCost / posQty) * 100) / 100, costBasis: Math.round(posCost * 100) / 100 } : null;
  return json({
    symbol,
    quote: quoteR.status === "fulfilled" ? quoteR.value : { error: String(quoteR.reason) },
    bars: bars.slice(-cut),
    indicators: { ema20: series.ema20.slice(-cut), sma50: series.sma50.slice(-cut), sma200: series.sma200.slice(-cut), rsi14: series.rsi14.slice(-cut) },
    snapshot: snap,
    fundamentals: fundR.status === "fulfilled" ? fundR.value : null,
    fundamentals_error: fundR.status === "rejected" ? String(fundR.reason) : null,
    scan_tags: latestTags,
    position: pos,
    watch: d.watchlist.find((w) => w.symbol === symbol) ?? null,
    thesis: (d.theses ?? []).filter((t) => t.symbol === symbol && t.status !== "rejected").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    sources: { price: "yahoo (ชั้น 2)", fundamentals: "SEC EDGAR companyfacts (ทางการ)" },
  });
}
export const GET = safe(_GET);
