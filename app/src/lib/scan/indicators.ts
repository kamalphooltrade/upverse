// Technical indicators on daily bars. Pure functions, no smoothing tricks (SPEC: no spline, no invented values).
import type { Bar } from "../types";

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i];
  let prev = seed / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / n, avgL = loss / n;
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function atr(bars: Bar[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= n) return out;
  const tr: number[] = bars.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c))));
  let prev = tr.slice(1, n + 1).reduce((a, b) => a + b, 0) / n;
  out[n] = prev;
  for (let i = n + 1; i < bars.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

export function pctChange(closes: number[], lookback: number, at = closes.length - 1): number | null {
  const i = at - lookback;
  if (i < 0 || at >= closes.length) return null;
  return ((closes[at] - closes[i]) / closes[i]) * 100;
}

export interface Snapshot {
  close: number;
  prevClose: number;
  prevHigh: number;
  dayRangePos: number; // 0..1 where close sits in day range
  volume: number;
  volSma50: number | null;
  volRatio: number | null;
  ema20: number | null;
  ema21: number | null;
  sma50: number | null;
  sma150: number | null;
  sma200: number | null;
  sma200_22ago: number | null;
  rsi14: number | null;
  atr14: number | null;
  hi52: number;
  lo52: number;
  daysBelowEma20Last15: number;
  ret20: number | null;
  ret63: number | null;
  ret126: number | null;
  ret252: number | null;
  dollarVol50: number | null;
  lastDate: string;
  bars: number;
}

export function snapshot(bars: Bar[]): Snapshot | null {
  const n = bars.length;
  if (n < 30) return null;
  const closes = bars.map((b) => b.c);
  const vols = bars.map((b) => b.v);
  const e20 = ema(closes, 20), e21 = ema(closes, 21), s50 = sma(closes, 50), s150 = sma(closes, 150), s200 = sma(closes, 200);
  const r = rsi(closes, 14), a = atr(bars, 14), v50 = sma(vols, 50);
  const last = bars[n - 1], prev = bars[n - 2];
  const win = bars.slice(-252);
  const hi52 = Math.max(...win.map((b) => b.h)), lo52 = Math.min(...win.map((b) => b.l));
  let below = 0;
  for (let i = n - 16; i < n - 1; i++) if (i >= 0 && e20[i] != null && bars[i].c < (e20[i] as number)) below++;
  const dollarVol = (() => {
    const w = bars.slice(-50);
    if (w.length < 20) return null;
    return w.reduce((s, b) => s + b.c * b.v, 0) / w.length;
  })();
  return {
    close: last.c,
    prevClose: prev.c,
    prevHigh: prev.h,
    dayRangePos: last.h > last.l ? (last.c - last.l) / (last.h - last.l) : 0.5,
    volume: last.v,
    volSma50: v50[n - 1],
    volRatio: v50[n - 1] ? last.v / (v50[n - 1] as number) : null,
    ema20: e20[n - 1], ema21: e21[n - 1], sma50: s50[n - 1], sma150: s150[n - 1], sma200: s200[n - 1],
    sma200_22ago: n - 23 >= 0 ? s200[n - 23] : null,
    rsi14: r[n - 1], atr14: a[n - 1], hi52, lo52,
    daysBelowEma20Last15: below,
    ret20: pctChange(closes, 20), ret63: pctChange(closes, 63), ret126: pctChange(closes, 126), ret252: pctChange(closes, 252),
    dollarVol50: dollarVol,
    lastDate: last.date,
    bars: n,
  };
}

/** Percentile rank (0-100) of x within arr. */
export function percentile(arr: number[], x: number): number {
  if (!arr.length) return 0;
  const below = arr.filter((v) => v < x).length;
  return (below / arr.length) * 100;
}
