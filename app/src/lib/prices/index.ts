// Price providers (SPEC §9.2). Every quote carries source + asOf; nothing is invented.
// Tier 1: Webull market data (needs key + subscription) — wired in ./webull when credentials exist.
// Tier 2: Yahoo Finance chart endpoint (no key; delayed ~15min for some exchanges) — research/paper use.
import type { Bar, Quote } from "../types";

export interface PriceProvider {
  id: string;
  quote(symbol: string): Promise<Quote>;
  bars(symbol: string, range: "3mo" | "6mo" | "1y" | "2y"): Promise<Bar[]>;
}

const UA = "Mozilla/5.0 (UPVerse personal portfolio tool)";

type YahooChart = {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
        currency?: string;
        exchangeTimezoneName?: string;
        currentTradingPeriod?: { pre?: { start: number; end: number }; regular?: { start: number; end: number }; post?: { start: number; end: number } };
      };
      timestamp?: number[];
      indicators: { quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }> };
    }> | null;
    error: { code: string; description: string } | null;
  };
};

async function yahooChart(symbol: string, range: string, interval: string): Promise<YahooChart["chart"]["result"]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`yahoo ${symbol} HTTP ${r.status}`);
  const j = (await r.json()) as YahooChart;
  if (j.chart.error) throw new Error(`yahoo ${symbol}: ${j.chart.error.description}`);
  return j.chart.result;
}

function marketState(meta: YahooChart["chart"]["result"] extends (infer R)[] | null ? (R extends { meta: infer M } ? M : never) : never): Quote["marketState"] {
  const p = meta.currentTradingPeriod;
  if (!p?.regular) return "UNKNOWN";
  const now = Math.floor(Date.now() / 1000);
  if (now >= p.regular.start && now < p.regular.end) return "REGULAR";
  if (p.pre && now >= p.pre.start && now < p.pre.end) return "PRE";
  if (p.post && now >= p.post.start && now < p.post.end) return "POST";
  return "CLOSED";
}

export const yahooProvider: PriceProvider = {
  id: "yahoo",
  async quote(symbol) {
    const res = await yahooChart(symbol, "5d", "1d");
    const r = res?.[0];
    if (!r || r.meta.regularMarketPrice == null) throw new Error(`yahoo ${symbol}: no price`);
    const price = r.meta.regularMarketPrice;
    const prev = r.meta.chartPreviousClose ?? r.meta.previousClose ?? null;
    const asOf = r.meta.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();
    const state = marketState(r.meta);
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose: prev,
      change: prev != null ? price - prev : null,
      changePct: prev ? ((price - prev) / prev) * 100 : null,
      currency: r.meta.currency ?? "USD",
      marketState: state,
      asOf,
      source: "yahoo (ชั้น 2 · อาจดีเลย์)",
      stale: state === "REGULAR" && ageSec > 15 * 60,
    };
  },
  async bars(symbol, range) {
    const res = await yahooChart(symbol, range, "1d");
    const r = res?.[0];
    if (!r?.timestamp) return [];
    const q = r.indicators.quote[0];
    const out: Bar[] = [];
    r.timestamp.forEach((t, i) => {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
      if (o == null || h == null || l == null || c == null) return;
      out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), o, h, l, c, v: v ?? 0 });
    });
    return out;
  },
};

// ---------- cache + fallback chain ----------
const quoteCache = new Map<string, { q: Quote; at: number }>();
const QUOTE_TTL_MS = 5000;
const barsCache = new Map<string, { b: Bar[]; at: number }>();
const BARS_TTL_MS = 10 * 60 * 1000;

export async function getQuote(symbol: string, providers: PriceProvider[] = [yahooProvider]): Promise<Quote> {
  const key = symbol.toUpperCase();
  const c = quoteCache.get(key);
  if (c && Date.now() - c.at < QUOTE_TTL_MS) return c.q;
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const q = await p.quote(key);
      quoteCache.set(key, { q, at: Date.now() });
      return q;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("no provider");
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote | { error: string }>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].slice(0, 50);
  const entries = await Promise.all(
    uniq.map(async (s) => {
      try {
        return [s, await getQuote(s)] as const;
      } catch (e) {
        return [s, { error: e instanceof Error ? e.message : String(e) }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function getBars(symbol: string, range: "3mo" | "6mo" | "1y" | "2y" = "1y"): Promise<Bar[]> {
  const key = `${symbol.toUpperCase()}:${range}`;
  const c = barsCache.get(key);
  if (c && Date.now() - c.at < BARS_TTL_MS) return c.b;
  const b = await yahooProvider.bars(symbol.toUpperCase(), range);
  barsCache.set(key, { b, at: Date.now() });
  return b;
}

// USD/THB — Yahoo symbol "THB=X" (USD→THB). Source labelled; owner can override in settings.
export async function getUsdThb(): Promise<{ rate: number; asOf: string; source: string }> {
  const q = await getQuote("THB=X");
  return { rate: q.price, asOf: q.asOf, source: "yahoo THB=X (ชั้น 2)" };
}
