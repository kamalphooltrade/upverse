// Scan models M1–M5 (SPEC §7). Deterministic scoring + templated Thai "why". Missing data ⇒ excluded, never estimated.
import type { ScanResult } from "../types";
import type { Snapshot } from "./indicators";
import type { Fundamentals } from "./fundamentals";
import type { Constituent } from "./universe";

export const MODEL_VERSION = "1.0";
export const MODELS = {
  M1: { key: "M1", name: "กลับตัว + วอลุ่มผิดปกติ", needsFundamentals: false },
  M2: { key: "M2", name: "ดาวรุ่ง VI", needsFundamentals: true },
  M3: { key: "M3", name: "ของถูกมีเหตุผล", needsFundamentals: true },
  M4: { key: "M4", name: "ผู้นำแนวโน้ม", needsFundamentals: false },
  M5: { key: "M5", name: "เครื่องจ่ายเงิน", needsFundamentals: true },
} as const;
export type ModelKey = keyof typeof MODELS;

export interface Candidate {
  c: Constituent;
  s: Snapshot;
  f: Fundamentals | null;
  rsRank: number; // 0-100 percentile of weighted 3/6/12m return within universe
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const marketCap = (x: Candidate) => (x.f?.sharesOut ? x.f.sharesOut * x.s.close : null);

function base(x: Candidate): Pick<ScanResult, "symbol" | "name" | "price" | "changePct"> {
  return { symbol: x.c.symbol, name: x.c.name, price: x.s.close, changePct: pct(x.s.close, x.s.prevClose) };
}

type Scorer = (x: Candidate) => { score: number; parts: Record<string, number>; metrics: Record<string, number | string | null>; why: string; flags: string[] } | null;

// ---------- M1 กลับตัว + วอลุ่ม ----------
const m1: Scorer = (x) => {
  const s = x.s;
  if (s.ema20 == null || s.volRatio == null || s.sma50 == null || s.sma200 == null) return null;
  const pulledBack = s.daysBelowEma20Last15 >= 10 || pct(s.close, s.hi52) <= -15;
  const signal = s.close > s.prevHigh && s.close > s.ema20 && s.volRatio >= 2.0 && s.dayRangePos >= 0.6;
  if (!pulledBack || !signal) return null;
  const parts: Record<string, number> = {};
  parts.volume = s.volRatio >= 4 ? 30 : s.volRatio >= 3 ? 25 : 15 + ((s.volRatio - 2) / 1) * 10;
  parts.reclaim = 10 + (s.close > s.sma50 ? 5 : 0) + (s.close > s.sma200 ? 5 : 0);
  parts.bar = clamp((s.dayRangePos - 0.6) / 0.4, 0, 1) * 15;
  const rs20 = s.ret20 ?? 0;
  parts.rs = clamp(rs20 / 10, 0, 1) * 15; // vs absolute; SPY-relative when SPY snapshot available (handled in runner)
  parts.fund = (x.f?.fScore != null && x.f.fScore >= 5 ? 10 : 0) + (x.f?.fcf != null && x.f.fcf > 0 ? 10 : 0);
  const dayPct = pct(s.close, s.prevClose);
  let penalty = 0;
  const flags: string[] = [];
  if (dayPct > 15) { penalty += 10; flags.push("ขึ้นวันเดียว > 15% (เสี่ยง blow-off)"); }
  if (x.f == null) flags.push("ไม่มีงบ EDGAR — คะแนนพื้นฐาน 0/20");
  const score = clamp(Object.values(parts).reduce((a, b) => a + b, 0) - penalty, 0, 100);
  const firstDays = s.daysBelowEma20Last15;
  const why = `ปิดเหนือ EMA20 ${firstDays >= 10 ? `ครั้งแรกหลังอยู่ใต้เส้น ${firstDays} ใน 15 วัน` : `หลังลงจากจุดสูง 52 สัปดาห์ ${f1(-pct(s.close, s.hi52))}%`} ด้วยปริมาณ ${f1(s.volRatio)}× ค่าเฉลี่ย 50 วัน · ปิดที่ ${Math.round(s.dayRangePos * 100)}% ของช่วงวัน · ${s.close > s.sma200 ? "เหนือ" : "⚠ ยังต่ำกว่า"} SMA200 · 20 วัน ${rs20 >= 0 ? "+" : ""}${f1(rs20)}%${x.f?.fScore != null ? ` · F-score ${x.f.fScore}` : ""}`;
  return { score, parts, why, flags, metrics: { "วอลุ่ม×": +f1(s.volRatio), "ปิด%ช่วง": Math.round(s.dayRangePos * 100), "RSI14": s.rsi14 != null ? +f1(s.rsi14) : null, "ห่าง SMA200%": +f1(pct(s.close, s.sma200)), "ต่ำกว่า52wHigh%": +f1(pct(s.close, s.hi52)) } };
};

// ---------- M2 ดาวรุ่ง VI ----------
const m2: Scorer = (x) => {
  const f = x.f, s = x.s;
  if (!f || f.revenue == null || f.revenue3yAgo == null || f.fcf == null || f.equity == null || f.netIncome == null || f.sharesOut == null) return null;
  if (f.revenue3yAgo <= 0 || f.equity <= 0) return null;
  const revCagr = (Math.pow(f.revenue / f.revenue3yAgo, 1 / 3) - 1) * 100;
  const fcfMargin = (f.fcf / f.revenue) * 100;
  const roe = (f.netIncome / f.equity) * 100;
  const netDebt = (f.totalDebt ?? 0) - (f.cash ?? 0);
  const ebitdaProxy = f.ocf != null ? f.ocf : f.netIncome; // conservative proxy when EBITDA not in facts
  const ndToCf = ebitdaProxy > 0 ? netDebt / ebitdaProxy : null;
  const dilution = f.sharesOut3yAgo ? (Math.pow(f.sharesOut / f.sharesOut3yAgo, 1 / 3) - 1) * 100 : null;
  const mcap = marketCap(x);
  const pFcf = mcap && f.fcf > 0 ? mcap / f.fcf : null;
  // screens
  if (revCagr < 10 || roe < 15 || fcfMargin < 10) return null;
  if (ndToCf != null && ndToCf > 2) return null;
  if (dilution != null && dilution > 2) return null;
  if (pFcf == null || pFcf > 35) return null; // reasonable-price gate (P/FCF proxy for PEG/EV-EBITDA)
  const parts: Record<string, number> = {
    growth: clamp((revCagr - 10) / 20, 0, 1) * 25,
    quality: clamp((roe - 15) / 25, 0, 1) * 12.5 + clamp((fcfMargin - 10) / 20, 0, 1) * 12.5,
    balance: ndToCf == null ? 7 : clamp(1 - ndToCf / 2, 0, 1) * 15,
    value: clamp((35 - pFcf) / 25, 0, 1) * 25,
    trend: s.sma200 != null && s.close > s.sma200 ? 10 : 0,
  };
  const flags: string[] = [];
  if (f.fScoreNote.startsWith("ข้อมูลไม่พอ")) flags.push("F-score คำนวณไม่ครบ");
  const why = `รายได้โต ${f1(revCagr)}%/ปี (3 ปี) · ROE ${f1(roe)}% · FCF margin ${f1(fcfMargin)}% · P/FCF ${f1(pFcf)} · ${ndToCf == null ? "หนี้สุทธิ/กระแสเงินสด —" : `หนี้สุทธิ/กระแสเงินสด ${f2(ndToCf)}`} · ${s.sma200 != null && s.close > s.sma200 ? "เหนือ SMA200" : "ต่ำกว่า SMA200"} (งบ FY${f.fy} · EDGAR)`;
  return { score: clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), parts, why, flags, metrics: { "รายได้โต%/ปี": +f1(revCagr), "ROE%": +f1(roe), "FCF margin%": +f1(fcfMargin), "P/FCF": +f1(pFcf), "หนี้สุทธิ/CF": ndToCf != null ? +f2(ndToCf) : null, "หุ้นเพิ่ม%/ปี": dilution != null ? +f1(dilution) : null } };
};

// ---------- M3 ของถูกมีเหตุผล ----------
const m3: Scorer = (x) => {
  const f = x.f, s = x.s;
  if (!f || f.fcf == null || f.sharesOut == null || f.fScore == null || s.sma50 == null) return null;
  const mcap = marketCap(x);
  if (!mcap) return null;
  const pFcf = f.fcf > 0 ? mcap / f.fcf : null;
  const pb = f.equity && f.equity > 0 ? mcap / f.equity : null;
  const roe = f.equity && f.equity > 0 && f.netIncome != null ? (f.netIncome / f.equity) * 100 : null;
  const cheap = (pFcf != null && pFcf <= 12) || (pb != null && pb <= 1.5 && roe != null && roe >= 8);
  const off52 = pct(s.close, s.hi52);
  const netDebt = (f.totalDebt ?? 0) - (f.cash ?? 0);
  const cfProxy = f.ocf ?? f.netIncome ?? 0;
  const ndToCf = cfProxy > 0 ? netDebt / cfProxy : null;
  if (!cheap || f.fScore < 7 || off52 > -20) return null;
  if (ndToCf != null && ndToCf > 3) return null;
  const stabilizing = s.close > s.sma50 || ((s.ret63 ?? -99) > (s.ret126 ?? -99) / 2 && (s.ret20 ?? -99) > 0);
  if (!stabilizing) return null;
  const payout = f.dividendsPaid != null && f.fcf > 0 ? (Math.abs(f.dividendsPaid) / f.fcf) * 100 : null;
  const parts: Record<string, number> = {
    cheap: pFcf != null ? clamp((12 - pFcf) / 8, 0.3, 1) * 35 : 20,
    quality: ((f.fScore - 6) / 3) * 25,
    balance: ndToCf == null ? 8 : clamp(1 - ndToCf / 3, 0, 1) * 15,
    stabilize: (s.close > s.sma50 ? 10 : 5) + ((s.ret20 ?? 0) > 0 ? 5 : 0),
    support: payout != null && payout <= 70 ? 10 : 5,
  };
  const why = `${pFcf != null ? `P/FCF ${f1(pFcf)}` : `P/B ${f1(pb as number)} · ROE ${f1(roe as number)}%`} · F-score ${f.fScore}/9 · ต่ำกว่าจุดสูง 52 สัปดาห์ ${f1(-off52)}% แต่${s.close > s.sma50 ? "ยืนเหนือ SMA50" : "โมเมนตัมเริ่มนิ่ง"} · ${ndToCf == null ? "หนี้สุทธิ —" : `หนี้สุทธิ/กระแสเงินสด ${f2(ndToCf)}`}${payout != null ? ` · จ่ายปันผล ${Math.round(payout)}% ของ FCF` : ""} (FY${f.fy})`;
  return { score: clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), parts, why, flags: [], metrics: { "P/FCF": pFcf != null ? +f1(pFcf) : null, "P/B": pb != null ? +f2(pb) : null, "F-score": f.fScore, "ต่ำกว่า52wHigh%": +f1(off52), "หนี้สุทธิ/CF": ndToCf != null ? +f2(ndToCf) : null } };
};

// ---------- M4 ผู้นำแนวโน้ม ----------
const m4: Scorer = (x) => {
  const s = x.s;
  if (s.sma50 == null || s.sma150 == null || s.sma200 == null || s.sma200_22ago == null || s.ema21 == null) return null;
  const trend = s.close > s.sma50 && s.sma50 > s.sma150 && s.sma150 > s.sma200 && s.sma200 > s.sma200_22ago;
  const range = s.close >= 1.3 * s.lo52 && s.close >= 0.75 * s.hi52;
  if (!trend || !range || x.rsRank < 70) return null;
  const distEma21 = pct(s.close, s.ema21);
  const quietVol = s.volRatio != null && s.volRatio < 1;
  const entry = distEma21 <= 5 && quietVol ? "ใกล้จุดเข้า" : distEma21 <= 10 ? "รอ" : "ไล่ราคาแล้ว";
  const epsGrowth = x.f?.eps != null && x.f?.epsPrev != null && x.f.epsPrev > 0 ? pct(x.f.eps, x.f.epsPrev) : null;
  const parts: Record<string, number> = {
    rs: ((x.rsRank - 70) / 30) * 35,
    structure: 25,
    entry: entry === "ใกล้จุดเข้า" ? 20 : entry === "รอ" ? 10 : 0,
    fund: epsGrowth == null ? 8 : clamp(epsGrowth / 30, 0, 1) * 20,
  };
  const flags = entry === "ไล่ราคาแล้ว" ? ["ไล่ราคาแล้ว — รอกลับมาใกล้ EMA21"] : [];
  const why = `RS rank ${Math.round(x.rsRank)} · ปิด > SMA50 > SMA150 > SMA200 และ SMA200 ยกตัว · ห่าง EMA21 ${distEma21 >= 0 ? "+" : ""}${f1(distEma21)}% (${entry}) · ${epsGrowth != null ? `EPS ปีล่าสุด ${epsGrowth >= 0 ? "+" : ""}${f1(epsGrowth)}%` : "EPS —"}`;
  return { score: clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), parts, why, flags, metrics: { "RS rank": Math.round(x.rsRank), "ห่าง EMA21%": +f1(distEma21), "สถานะเข้า": entry, "12 เดือน%": s.ret252 != null ? +f1(s.ret252) : null, "EPS โต%": epsGrowth != null ? +f1(epsGrowth) : null } };
};

// ---------- M5 เครื่องจ่ายเงิน ----------
const m5: Scorer = (x) => {
  const f = x.f, s = x.s;
  if (!f || f.dividendsPaid == null || f.fcf == null || f.sharesOut == null || f.netIncome == null) return null;
  const divPaid = Math.abs(f.dividendsPaid);
  if (divPaid <= 0 || f.fcf <= 0) return null;
  const mcap = marketCap(x);
  if (!mcap) return null;
  const divYield = (divPaid / mcap) * 100;
  const fcfYield = (f.fcf / mcap) * 100;
  const payoutNi = f.netIncome > 0 ? (divPaid / f.netIncome) * 100 : 999;
  const payoutFcf = (divPaid / f.fcf) * 100;
  const netDebt = (f.totalDebt ?? 0) - (f.cash ?? 0);
  const cfProxy = f.ocf ?? f.netIncome;
  const ndToCf = cfProxy > 0 ? netDebt / cfProxy : null;
  const MAX_LOT_PRICE = 150;
  if (payoutNi > 60 || payoutFcf > 70) return null;
  if (!(fcfYield >= 4 || divYield >= 2.5)) return null;
  if (ndToCf != null && ndToCf > 2.5) return null;
  if (s.close > MAX_LOT_PRICE) return null;
  const parts: Record<string, number> = {
    safety: clamp((70 - payoutFcf) / 50, 0, 1) * 30,
    growth: f.epsYears.length >= 3 && f.epsYears[f.epsYears.length - 1] > f.epsYears[0] ? 20 : 8,
    value: clamp((divYield - 2) / 3, 0, 1) * 20,
    premium: 7, // IV rank unavailable without options data (SPEC: skip, don't penalize)
    lot: clamp((MAX_LOT_PRICE - s.close) / MAX_LOT_PRICE, 0, 1) * 15,
  };
  const lot = s.close * 100;
  const why = `อัตราปันผล ${f1(divYield)}% · payout ${Math.round(payoutFcf)}% ของ FCF · FCF yield ${f1(fcfYield)}% · ล็อต 100 หุ้น ≈ $${Math.round(lot).toLocaleString("en-US")} (กันเงินสดสำหรับ CSP ที่ strike ≈ ราคา) · ${ndToCf == null ? "หนี้สุทธิ —" : `หนี้สุทธิ/กระแสเงินสด ${f2(ndToCf)}`} (FY${f.fy})`;
  return { score: clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), parts, why, flags: ["IV rank ไม่มีข้อมูล (ยังไม่มี options data)"], metrics: { "ปันผล%": +f1(divYield), "payout FCF%": Math.round(payoutFcf), "FCF yield%": +f1(fcfYield), "ล็อต100 $": Math.round(lot), "หนี้สุทธิ/CF": ndToCf != null ? +f2(ndToCf) : null } };
};

export const SCORERS: Record<ModelKey, Scorer> = { M1: m1, M2: m2, M3: m3, M4: m4, M5: m5 };

export function runModel(key: ModelKey, cands: Candidate[]): { results: ScanResult[]; passed: number } {
  const scorer = SCORERS[key];
  const scored: ScanResult[] = [];
  for (const x of cands) {
    const r = scorer(x);
    if (!r) continue;
    scored.push({ rank: 0, ...base(x), score: Math.round(r.score), scoreParts: Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, Math.round(v * 10) / 10])), metrics: r.metrics, why: r.why, flags: r.flags });
  }
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((r, i) => (r.rank = i + 1));
  return { results: scored.slice(0, 10), passed: scored.length };
}

/** Hard-avoid list (SPEC §7.0): F-score ≤ 3 · net debt/CF > 4 · FCF negative. */
export function avoidList(cands: Candidate[]): ScanResult[] {
  const out: ScanResult[] = [];
  for (const x of cands) {
    const f = x.f;
    if (!f) continue;
    const reasons: string[] = [];
    if (f.fScore != null && f.fScore <= 3) reasons.push(`F-score ${f.fScore}/9`);
    const cf = f.ocf ?? f.netIncome ?? 0;
    const nd = (f.totalDebt ?? 0) - (f.cash ?? 0);
    if (cf > 0 && nd / cf > 4) reasons.push(`หนี้สุทธิ/กระแสเงินสด ${(nd / cf).toFixed(1)}`);
    if (f.fcf != null && f.fcf < 0) reasons.push("FCF ติดลบ");
    if (reasons.length) out.push({ rank: 0, ...base(x), score: 0, scoreParts: {}, metrics: {}, why: "ตกตะแกรงแข็ง: " + reasons.join(" · "), flags: reasons });
  }
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}
