// Portfolio review engine — deterministic rules, no LLM. Every number carries a "why".
// Techniques embedded (see docs/TECHNIQUES.md): Weinstein stage · Minervini trend template · relative strength vs SPY ·
// reverse valuation (implied growth) · Piotroski/quality · scorecard §2B · risk rules §3 (caps, cost ≤1%, no averaging down on broken thesis).
import type { Thesis, RiskRules, Goal } from "../types";
import type { Snapshot } from "../scan/indicators";
import type { Fundamentals } from "../scan/fundamentals";
import type { Constituent } from "../scan/universe";
import { estimateFees, rotationCostPct, type FeeEstimate } from "../fees";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const TODAY = () => new Date().toISOString().slice(0, 10);

export type Bucket = "core" | "satellite" | "income" | "legacy" | "no_thesis";
export type ActionKind = "ถือ" | "เพิ่ม" | "ลด" | "ออก" | "โยก" | "ทบทวน";

export interface HoldingInput { symbol: string; qty: number; avgCost: number; costBasis: number; price: number | null; marketValue: number | null; weightPct: number | null; pnl: number | null; pnlPct: number | null; firstBuyTs: string | null }
export interface ReviewInput {
  holdings: HoldingInput[];
  cash: number;
  total: number;
  fxRate: number | null;
  snapshots: Record<string, Snapshot | null>; // holdings + candidates + SPY
  fundamentals: Record<string, Fundamentals | null>;
  constituents: Record<string, Constituent>;
  theses: Thesis[];
  rules: RiskRules;
  goal: Goal | null;
  fxSpreadPct: number | null;
  candidates: Array<{ symbol: string; source: string }>; // watchlist + scan top + thesis "เพิ่ม", excluding holdings
  equityHistory: Array<{ date: string; totalUsd: number; cashUsd: number }>;
}

export interface Trend { stage: 1 | 2 | 3 | 4 | null; stageLabel: string; template: { pass: number; total: number; items: Array<{ label: string; ok: boolean | null }> }; aboveSma200: boolean | null; sma200Slope: number | null; rsi14: number | null; atrPct: number | null; offHigh: number | null; knife: boolean }
export interface RS { r21: number | null; r63: number | null; r126: number | null; r252: number | null; vs21: number | null; vs63: number | null; vs126: number | null }
export interface Valuation { pe: number | null; pfcf: number | null; fcfYield: number | null; divYield: number | null; impliedGrowth: number | null; impliedNote: string }
export interface Quality { fScore: number | null; roe: number | null; fcfMargin: number | null; revCagr3y: number | null; shareChange3y: number | null; isBank: boolean }
export interface ThesisView { id: string; version: number; status: Thesis["status"]; verdict: Thesis["verdict"]; role: Thesis["role"]; buyBelow: number | null; reviewAfter: string | null; stale: boolean; summary: string }
export interface Score { total: number; parts: { quality: number; value: number; timing: number; catalyst: number; risk: number }; why: string[] }
export interface Action { kind: ActionKind; pending: boolean; reasons: string[]; blockers: string[] }

export interface ReviewHolding {
  symbol: string; name: string | null; sector: string | null; industry: string | null;
  qty: number; avgCost: number; price: number | null; marketValue: number | null; weightPct: number | null; pnl: number | null; pnlPct: number | null; pnlThb: number | null;
  bucket: Bucket; daysHeld: number | null;
  rs: RS; trend: Trend | null; valuation: Valuation; quality: Quality; thesis: ThesisView | null;
  fees: { exit: FeeEstimate; exitPct: number | null };
  score: Score; action: Action; avgDown: { allowed: boolean; reason: string } | null;
}
export interface Candidate {
  symbol: string; name: string | null; sector: string | null; source: string; price: number | null;
  rs: RS; trend: Trend | null; valuation: Valuation; quality: Quality; thesis: ThesisView | null; score: Score;
  gate: { pass: boolean; reasons: string[] };
}
export interface ReviewOutput {
  asOf: string;
  allocation: {
    basis: "plan" | "current"; planTotalUsd: number; currentTotalUsd: number; monthlyUsd: number | null;
    target: Record<"core" | "satellite" | "income" | "cash", number>;
    actual: Record<Bucket | "cash", number>; // % of current total
    gaps: Array<{ bucket: string; targetPct: number; actualPct: number; gapUsd: number }>;
    nextMoney: { to: string; why: string };
    caps: { singleMaxPct: number; singleWarnPct: number; coreMaxPct: number; basisTotalUsd: number };
  };
  benchmark: { spy: RS | null; portfolio: { sinceDate: string | null; days: number; returnPct: number | null; note: string } };
  holdings: ReviewHolding[];
  rotation: { rule: string; from: string[]; candidates: Candidate[]; note: string };
  techniques: Array<{ key: string; name: string; use: string; source: string }>;
  caveats: string[];
}

// ---------- technical ----------
export function trendOf(s: Snapshot | null, vs126: number | null): Trend | null {
  if (!s) return null;
  const slope = s.sma200 != null && s.sma200_22ago ? pct(s.sma200, s.sma200_22ago) : null;
  const above150 = s.sma150 != null ? s.close > s.sma150 : null;
  let stage: Trend["stage"] = null, stageLabel = "ข้อมูลไม่พอ";
  if (slope != null && above150 != null) {
    if (slope > 1 && above150) { stage = 2; stageLabel = "ขั้น 2 ขาขึ้น"; }
    else if (slope < -1 && !above150) { stage = 4; stageLabel = "ขั้น 4 ขาลง"; }
    else if (above150) { stage = 3; stageLabel = "ขั้น 3 แถวยอด/แกว่ง"; }
    else { stage = 1; stageLabel = "ขั้น 1 สร้างฐาน"; }
  }
  const items: Trend["template"]["items"] = [
    { label: "ราคา > SMA150 และ > SMA200", ok: s.sma150 != null && s.sma200 != null ? s.close > s.sma150 && s.close > s.sma200 : null },
    { label: "SMA150 > SMA200", ok: s.sma150 != null && s.sma200 != null ? s.sma150 > s.sma200 : null },
    { label: "SMA200 ขาขึ้น ≥ 1 เดือน", ok: slope != null ? slope > 0 : null },
    { label: "SMA50 > SMA150 > SMA200", ok: s.sma50 != null && s.sma150 != null && s.sma200 != null ? s.sma50 > s.sma150 && s.sma150 > s.sma200 : null },
    { label: "ราคา > SMA50", ok: s.sma50 != null ? s.close > s.sma50 : null },
    { label: "สูงกว่า low 52 สัปดาห์ ≥ 30%", ok: pct(s.close, s.lo52) >= 30 },
    { label: "ห่าง high 52 สัปดาห์ ≤ 25%", ok: pct(s.close, s.hi52) >= -25 },
    { label: "แข็งกว่า SPY 6 เดือน (แทน RS rank ≥ 70)", ok: vs126 != null ? vs126 > 0 : null },
  ];
  const pass = items.filter((i) => i.ok === true).length;
  const knife = stage === 4 && (s.ret20 ?? 0) <= -15;
  return { stage, stageLabel, template: { pass, total: items.length, items }, aboveSma200: s.sma200 != null ? s.close > s.sma200 : null, sma200Slope: slope != null ? r2(slope) : null, rsi14: s.rsi14 != null ? r1(s.rsi14) : null, atrPct: s.atr14 != null ? r2((s.atr14 / s.close) * 100) : null, offHigh: r1(pct(s.close, s.hi52)), knife };
}

export function rsOf(s: Snapshot | null, spy: Snapshot | null): RS {
  const d = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null ? r1(a - b) : null);
  return { r21: s?.ret20 != null ? r1(s.ret20) : null, r63: s?.ret63 != null ? r1(s.ret63) : null, r126: s?.ret126 != null ? r1(s.ret126) : null, r252: s?.ret252 != null ? r1(s.ret252) : null, vs21: d(s?.ret20, spy?.ret20), vs63: d(s?.ret63, spy?.ret63), vs126: d(s?.ret126, spy?.ret126) };
}

// ---------- fundamental ----------
export function qualityOf(f: Fundamentals | null): Quality {
  const isBank = !!f && f.capex == null && f.fcf == null && f.ocf != null; // pipeline leaves capex/FCF null for banks
  const roe = f?.netIncome != null && f.equity ? r1((f.netIncome / f.equity) * 100) : null;
  const fcfMargin = f?.fcf != null && f.revenue ? r1((f.fcf / f.revenue) * 100) : null;
  const revCagr3y = f?.revenue && f.revenue3yAgo && f.revenue3yAgo > 0 ? r1((Math.pow(f.revenue / f.revenue3yAgo, 1 / 3) - 1) * 100) : null;
  const shareChange3y = f?.sharesOut && f.sharesOut3yAgo ? r1(pct(f.sharesOut, f.sharesOut3yAgo)) : null;
  return { fScore: f?.fScore ?? null, roe, fcfMargin, revCagr3y, shareChange3y, isBank };
}

/** Reverse valuation: growth the price already assumes (3y · terminal multiple · 10% discount). */
export function valuationOf(f: Fundamentals | null, price: number | null): Valuation {
  if (!f || price == null) return { pe: null, pfcf: null, fcfYield: null, divYield: null, impliedGrowth: null, impliedNote: "ไม่มีงบ EDGAR" };
  const mcap = f.sharesOut ? f.sharesOut * price : null;
  const pe = f.eps && f.eps > 0 ? r1(price / f.eps) : null;
  const pfcf = mcap && f.fcf && f.fcf > 0 ? r1(mcap / f.fcf) : null;
  const fcfYield = pfcf ? r2(100 / pfcf) : null;
  const divYield = mcap && f.dividendsPaid ? r2((f.dividendsPaid / mcap) * 100) : null;
  const R = 1.1 ** 3;
  let impliedGrowth: number | null = null, impliedNote = "";
  if (f.sharesOut && f.fcf && f.fcf > 0) {
    const fps = f.fcf / f.sharesOut;
    impliedGrowth = r1((Math.pow((price * R) / (30 * fps), 1 / 3) - 1) * 100);
    impliedNote = "FCF/หุ้น ต้องโต x%/ปี 3 ปี ที่ multiple 30× คิดลด 10% จึงคุ้มราคานี้";
  } else if (f.eps && f.eps > 0) {
    impliedGrowth = r1((Math.pow((price * R) / (12 * f.eps), 1 / 3) - 1) * 100);
    impliedNote = "EPS ต้องโต x%/ปี 3 ปี ที่ P/E 12× คิดลด 10% (ไม่มี FCF → ใช้กำไร)";
  } else impliedNote = "กำไร/FCF ติดลบ — คำนวณไม่ได้";
  return { pe, pfcf, fcfYield, divYield, impliedGrowth, impliedNote };
}

export function thesisView(theses: Thesis[], symbol: string): ThesisView | null {
  const t = theses.filter((x) => x.symbol === symbol && x.status !== "rejected").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!t) return null;
  const stale = t.status === "stale" || (!!t.reviewAfter && t.reviewAfter < TODAY());
  return { id: t.id, version: t.version, status: t.status, verdict: t.verdict, role: t.role, buyBelow: t.buyBelow, reviewAfter: t.reviewAfter, stale, summary: t.summary };
}

export function bucketOf(symbol: string, t: ThesisView | null, rules: RiskRules): Bucket {
  if (rules.coreSymbols.includes(symbol) || t?.role === "แกน") return "core";
  if (!t) return "no_thesis";
  if (t.role === "รายได้") return "income";
  if (t.role === "ไม่เข้าเกณฑ์") return "legacy";
  return "satellite";
}

// ---------- scorecard (agent §2B: quality 25 · value 25 · timing 30 · catalyst 10 · risk −10) ----------
export function scoreOf(q: Quality, v: Valuation, tr: Trend | null, rs: RS, t: ThesisView | null, scanTag: string | null, price: number | null): Score {
  const why: string[] = [];
  let quality = 0;
  if (q.fScore == null && q.roe == null) why.push("คุณภาพ 0/25 — ไม่มีงบ EDGAR");
  else {
    quality += q.fScore != null ? (q.fScore / 9) * 10 : 0;
    quality += q.roe != null ? (q.roe >= 15 ? 5 : q.roe >= 8 ? 3 : 0) : 0;
    quality += q.fcfMargin != null ? (q.fcfMargin >= 15 ? 5 : q.fcfMargin > 5 ? 3 : q.fcfMargin > 0 ? 1 : 0) : q.isBank ? 3 : 0;
    quality += q.revCagr3y != null ? (q.revCagr3y >= 15 ? 5 : q.revCagr3y >= 8 ? 3 : q.revCagr3y > 0 ? 1 : 0) : 0;
    why.push(`คุณภาพ ${r1(quality)}/25 — F-score ${q.fScore ?? "—"} · ROE ${q.roe ?? "—"}% · FCF margin ${q.fcfMargin ?? (q.isBank ? "ธนาคาร" : "—")}${q.fcfMargin != null ? "%" : ""} · รายได้โต 3 ปี ${q.revCagr3y ?? "—"}%/ปี`);
  }
  let value = 0;
  if (v.pfcf != null) value = v.pfcf <= 15 ? 22 : v.pfcf <= 25 ? 16 : v.pfcf <= 35 ? 11 : v.pfcf <= 50 ? 6 : 2;
  else if (v.pe != null) value = v.pe <= 10 ? 20 : v.pe <= 15 ? 15 : v.pe <= 25 ? 9 : 3;
  if (t?.buyBelow && price != null && price <= t.buyBelow) value += 5;
  value = clamp(value, 0, 25);
  why.push(`มูลค่า ${r1(value)}/25 — ${v.pfcf != null ? `P/FCF ${v.pfcf}×` : v.pe != null ? `P/E ${v.pe}×` : "ไม่มีกำไร/FCF"}${t?.buyBelow ? ` · ราคาน่าซื้อ thesis ≤ $${t.buyBelow}${price != null && price <= t.buyBelow ? " ✓" : ""}` : ""}${v.impliedGrowth != null ? ` · ราคานี้ต้องการโต ${v.impliedGrowth}%/ปี` : ""}`);
  let timing = 0;
  if (tr) {
    timing += (tr.template.pass / tr.template.total) * 20;
    timing += rs.vs126 != null ? (rs.vs126 > 10 ? 10 : rs.vs126 > 0 ? 6 : rs.vs126 > -10 ? 3 : 0) : 0;
    why.push(`จังหวะ ${r1(timing)}/30 — ${tr.stageLabel} · trend template ${tr.template.pass}/8 · แข็งกว่า SPY 6 เดือน ${rs.vs126 != null ? (rs.vs126 >= 0 ? "+" : "") + rs.vs126 + "%" : "—"}`);
  } else why.push("จังหวะ 0/30 — ไม่มีราคาย้อนหลังพอ");
  let catalyst = 0;
  if (t?.verdict === "เพิ่ม") catalyst += t.status === "confirmed" ? 10 : 6;
  if (scanTag) catalyst += 4;
  catalyst = clamp(catalyst, 0, 10);
  why.push(`ปัจจัยกระตุ้น ${catalyst}/10 — ${t ? `thesis ${t.verdict} (${t.status === "confirmed" ? "ต้นยืนยัน" : t.status})` : "ไม่มี thesis"}${scanTag ? ` · ติดสแกน ${scanTag}` : ""}`);
  let risk = 0;
  const rwhy: string[] = [];
  if (tr?.atrPct != null && tr.atrPct > 5) { risk -= 4; rwhy.push(`ผันผวน ${tr.atrPct}%/วัน`); }
  if (tr?.offHigh != null && tr.offHigh < -40) { risk -= 3; rwhy.push(`ต่ำกว่า high 52w ${tr.offHigh}%`); }
  if (!t) { risk -= 3; rwhy.push("ไม่มี thesis"); }
  if (tr?.stage === 4) { risk -= 3; rwhy.push("ขาลง"); }
  risk = clamp(risk, -10, 0);
  if (rwhy.length) why.push(`หักความเสี่ยง ${risk} — ${rwhy.join(" · ")}`);
  const total = clamp(Math.round(quality + value + timing + catalyst + risk), 0, 100);
  return { total, parts: { quality: r1(quality), value: r1(value), timing: r1(timing), catalyst, risk }, why };
}

// ---------- action rules ----------
function actionOf(h: HoldingInput, bucket: Bucket, t: ThesisView | null, tr: Trend | null, rs: RS, rules: RiskRules, capBasisTotal: number, fees: FeeEstimate, daysHeld: number | null, hasDestination: boolean): { action: Action; avgDown: ReviewHolding["avgDown"] } {
  const reasons: string[] = [], blockers: string[] = [];
  const mv = h.marketValue ?? 0;
  const w = capBasisTotal > 0 ? (mv / capBasisTotal) * 100 : 0;
  const isCore = bucket === "core";
  const cap = isCore ? rules.maxCorePct : rules.maxSinglePositionPct;
  const warn = isCore ? rules.maxCorePct : rules.warnSinglePositionPct;
  const pending = !!t && t.status !== "confirmed";
  const loser = (h.pnlPct ?? 0) < 0;
  // averaging-down permission (§2D: never average down a single stock whose thesis is breaking)
  let avgDown: ReviewHolding["avgDown"] = null;
  if (loser && !isCore) {
    if (!t) avgDown = { allowed: false, reason: "ไม่มี thesis → ห้ามถัว (เขียน thesis ก่อน)" };
    else if (t.verdict !== "เพิ่ม") avgDown = { allowed: false, reason: `thesis บอก "${t.verdict}" ไม่ใช่ "เพิ่ม" → ห้ามถัว` };
    else if (t.stale) avgDown = { allowed: false, reason: "thesis เลยวันทบทวน → ทบทวนก่อนถัว" };
    else if (t.buyBelow != null && h.price != null && h.price > t.buyBelow) avgDown = { allowed: false, reason: `ราคา $${h.price} ยังสูงกว่าราคาน่าซื้อ $${t.buyBelow}` };
    else if (tr?.knife) avgDown = { allowed: false, reason: "มีดกำลังตก (ขั้น 4 + ร่วง > 15% ใน 20 วัน) → รอฐาน ≥ 4 สัปดาห์" };
    else if (w >= warn) avgDown = { allowed: false, reason: `น้ำหนัก ${r1(w)}% ≥ ระดับเตือน ${warn}%` };
    else avgDown = { allowed: true, reason: "thesis 'เพิ่ม' ที่ยืนยัน + ราคา ≤ น่าซื้อ + ไม่ใช่มีดตก + ไม่เกินเพดาน" };
  } else if (loser && isCore) avgDown = { allowed: true, reason: "แกนดัชนี: ซื้อตามรอบ DCA ไม่มีจุดตัดขาดทุน (§2D)" };

  // 1) thesis says exit
  if (t?.verdict === "ออก") {
    reasons.push(`thesis v${t.version} ให้ "ออก"${pending ? " (ร่าง — รอต้นยืนยัน)" : " (ต้นยืนยันแล้ว)"}`);
    if (fees.pct != null && fees.pct > 1) blockers.push(`ค่าธรรมเนียมขาย ${fees.pct}% > 1% (ไม้ < $3) — รวมกับไม้อื่นหรือรอ`);
    return { action: { kind: "ออก", pending, reasons, blockers }, avgDown };
  }
  // 2) over cap
  if (w > cap) {
    const trimUsd = r2(mv - (cap / 100) * capBasisTotal);
    const trimFee = estimateFees("sell", trimUsd, h.price ? trimUsd / h.price : 0);
    if (trimUsd < 3 || (trimFee.pct != null && trimFee.pct > 1)) {
      reasons.push(`เกินเพดาน ${cap}% (${r1(w)}% ของฐาน $${Math.round(capBasisTotal)}) แต่ไม้ลด $${trimUsd} เล็กเกิน (ค่าธรรมเนียม ${trimFee.pct ?? "—"}%) → de minimis: ไม่บังคับขาย ใช้เงินใหม่เจือจาง`);
      return { action: { kind: "ถือ", pending: false, reasons, blockers }, avgDown };
    }
    reasons.push(`น้ำหนัก ${r1(w)}% > เพดาน ${cap}% (ฐาน $${Math.round(capBasisTotal)}) → ลด ≈ $${trimUsd} ให้กลับใต้เพดาน (ค่าธรรมเนียม ${trimFee.pct}%)`);
    return { action: { kind: "ลด", pending: false, reasons, blockers }, avgDown };
  }
  // 3) no thesis → hold, forbid adding
  if (!t && !isCore) {
    reasons.push("ไม่มี thesis — ห้ามเพิ่ม/ถัว (กฎ: ไม่มี thesis เขียนไว้ = ไม่มีตำแหน่งใหม่) · ขอ thesis จาก agent ก่อน");
    if (tr?.stage === 4 && (rs.vs126 ?? 0) < -20) { reasons.push(`ขาลง + อ่อนกว่า SPY 6 เดือน ${rs.vs126}% → ทบทวนว่าจะถือทำไม`); return { action: { kind: "ทบทวน", pending: false, reasons, blockers }, avgDown }; }
    return { action: { kind: "ถือ", pending: false, reasons, blockers }, avgDown };
  }
  // 4) thesis says add
  if (t?.verdict === "เพิ่ม") {
    const ok = !t.stale && (t.buyBelow == null || (h.price != null && h.price <= t.buyBelow)) && !tr?.knife && w < warn;
    if (ok) { reasons.push(`thesis "เพิ่ม"${pending ? " (ร่าง)" : ""} + ราคาอยู่ในโซน + ไม่ใช่มีดตก + น้ำหนักหลังซื้อ ≤ ${warn}%`); return { action: { kind: "เพิ่ม", pending, reasons, blockers }, avgDown }; }
    reasons.push(`thesis "เพิ่ม" แต่${t.stale ? " เลยวันทบทวน" : ""}${t.buyBelow != null && h.price != null && h.price > t.buyBelow ? ` ราคา $${h.price} > น่าซื้อ $${t.buyBelow}` : ""}${tr?.knife ? " มีดกำลังตก" : ""}${w >= warn ? ` น้ำหนัก ${r1(w)}% ≥ เตือน` : ""} → รอ`);
    return { action: { kind: "ถือ", pending, reasons, blockers }, avgDown };
  }
  // 5) weak + downtrend + not a conviction hold → rotate if a destination passes the gate, else review
  if (!isCore && tr?.stage === 4 && (rs.vs126 ?? 0) < -20 && (t?.verdict === "ดูต่อ" || t?.verdict === "รอ" || t?.verdict === "ลด")) {
    reasons.push(`ขาลง (ขั้น 4) + อ่อนกว่า SPY 6 เดือน ${rs.vs126}% + thesis "${t?.verdict}"`);
    if (daysHeld != null && daysHeld < 30) blockers.push(`ถือมาแค่ ${daysHeld} วัน — ห้ามโยกก่อน 30 วัน (กัน churn) เว้นแต่ thesis พัง`);
    if (!hasDestination) blockers.push("ไม่มีตัวปลายทางที่ผ่านด่าน (thesis 'เพิ่ม' ยืนยัน + คะแนนสูงกว่า ≥ 20 + ต้นทุนโยก ≤ 1%)");
    return { action: { kind: blockers.length ? "ทบทวน" : "โยก", pending: false, reasons, blockers }, avgDown };
  }
  if (t?.verdict === "ลด") { reasons.push(`thesis ให้ "ลด"${pending ? " (ร่าง)" : ""}`); return { action: { kind: "ลด", pending, reasons, blockers }, avgDown }; }
  reasons.push(t ? `thesis "${t.verdict}"${pending ? " (ร่าง)" : ""}${t.stale ? " · เลยวันทบทวน → ขอ thesis ใหม่" : ""}` : "แกนดัชนี: ถือ/DCA ตามรอบ");
  if (t?.stale) return { action: { kind: "ทบทวน", pending, reasons, blockers }, avgDown };
  return { action: { kind: "ถือ", pending, reasons, blockers }, avgDown };
}

// ---------- main ----------
export function reviewPortfolio(inp: ReviewInput, scanTags: Record<string, string | null>): ReviewOutput {
  const caveats: string[] = [];
  const spy = inp.snapshots.SPY ?? null;
  if (!spy) caveats.push("ไม่มีราคา SPY → แรงสัมพัทธ์เทียบตลาดคำนวณไม่ได้");
  const monthlyUsd = inp.goal?.monthlyContributionThb && inp.fxRate ? r2(inp.goal.monthlyContributionThb / inp.fxRate) : null;
  const planTotal = r2(inp.total + (monthlyUsd ?? 0) * 12);
  const basis: "plan" | "current" = monthlyUsd ? "plan" : "current";
  if (basis === "current") caveats.push("ยังไม่ตั้งเงินเติมต่อเดือนในหน้าเป้าหมาย → เพดานวัดกับพอร์ตวันนี้ (เล็กมาก) ไม่ใช่พอร์ตแผน 12 เดือน");
  const capBasis = basis === "plan" ? planTotal : inp.total;

  // candidates first (needed for rotation gate)
  const candidates: Candidate[] = inp.candidates.map((c) => {
    const s = inp.snapshots[c.symbol] ?? null, f = inp.fundamentals[c.symbol] ?? null, t = thesisView(inp.theses, c.symbol);
    const rs = rsOf(s, spy), tr = trendOf(s, rs.vs126), q = qualityOf(f), v = valuationOf(f, s?.close ?? null);
    const score = scoreOf(q, v, tr, rs, t, scanTags[c.symbol] ?? null, s?.close ?? null);
    const reasons: string[] = [];
    if (!t) reasons.push("ไม่มี thesis");
    else if (t.verdict !== "เพิ่ม") reasons.push(`thesis "${t.verdict}" ไม่ใช่ "เพิ่ม"`);
    else if (t.status !== "confirmed") reasons.push("thesis 'เพิ่ม' ยังเป็นร่าง — ต้นยังไม่ยืนยัน");
    if (tr?.stage === 4) reasons.push("ขาลง (ขั้น 4)");
    if (tr?.knife) reasons.push("มีดกำลังตก");
    if (t?.buyBelow != null && s && s.close > t.buyBelow) reasons.push(`ราคา $${s.close} > น่าซื้อ $${t.buyBelow}`);
    const con = inp.constituents[c.symbol];
    return { symbol: c.symbol, name: con?.name ?? null, sector: con?.sector ?? null, source: c.source, price: s?.close ?? null, rs, trend: tr, valuation: v, quality: q, thesis: t, score, gate: { pass: reasons.length === 0, reasons } };
  }).sort((a, b) => b.score.total - a.score.total);
  const passing = candidates.filter((c) => c.gate.pass);

  const holdings: ReviewHolding[] = inp.holdings.map((h) => {
    const s = inp.snapshots[h.symbol] ?? null, f = inp.fundamentals[h.symbol] ?? null, t = thesisView(inp.theses, h.symbol);
    const rs = rsOf(s, spy), tr = trendOf(s, rs.vs126), q = qualityOf(f), v = valuationOf(f, h.price);
    const bucket = bucketOf(h.symbol, t, inp.rules);
    const exit = estimateFees("sell", h.marketValue ?? 0, h.qty, inp.fxSpreadPct);
    const daysHeld = h.firstBuyTs ? Math.floor((Date.now() - new Date(h.firstBuyTs).getTime()) / 86400e3) : null;
    const score = scoreOf(q, v, tr, rs, t, scanTags[h.symbol] ?? null, h.price);
    const dest = passing.find((c) => c.score.total >= score.total + 20 && h.marketValue != null && (rotationCostPct(h.marketValue, h.qty, inp.fxSpreadPct).pct ?? 99) <= 1);
    const { action, avgDown } = actionOf(h, bucket, t, tr, rs, inp.rules, capBasis, exit, daysHeld, !!dest);
    if (dest && action.kind === "โยก") action.reasons.push(`ปลายทางที่ผ่านด่าน: ${dest.symbol} (คะแนน ${dest.score.total} vs ${score.total})`);
    const con = inp.constituents[h.symbol];
    return {
      symbol: h.symbol, name: con?.name ?? null, sector: con?.sector ?? null, industry: con?.industry ?? null,
      qty: h.qty, avgCost: h.avgCost, price: h.price, marketValue: h.marketValue, weightPct: h.weightPct, pnl: h.pnl, pnlPct: h.pnlPct, pnlThb: h.pnl != null && inp.fxRate ? r1(h.pnl * inp.fxRate) : null,
      bucket, daysHeld, rs, trend: tr, valuation: v, quality: q, thesis: t, fees: { exit, exitPct: exit.pct }, score, action, avgDown,
    };
  });

  // allocation
  const target = { core: inp.goal?.allocation.core ?? 70, satellite: inp.goal?.allocation.satellite ?? 20, income: inp.goal?.allocation.income ?? 0, cash: inp.goal?.allocation.cash ?? 10 };
  const sumBucket = (b: Bucket) => holdings.filter((h) => h.bucket === b).reduce((a, h) => a + (h.marketValue ?? 0), 0);
  const tot = inp.total || 1;
  const actual: ReviewOutput["allocation"]["actual"] = { core: r1((sumBucket("core") / tot) * 100), satellite: r1((sumBucket("satellite") / tot) * 100), income: r1((sumBucket("income") / tot) * 100), legacy: r1((sumBucket("legacy") / tot) * 100), no_thesis: r1((sumBucket("no_thesis") / tot) * 100), cash: r1((inp.cash / tot) * 100) };
  const singlesPct = actual.satellite + actual.income + actual.legacy + actual.no_thesis;
  const gaps = [
    { bucket: "แกน (ETF ดัชนี)", targetPct: target.core, actualPct: actual.core, gapUsd: r2(((target.core - actual.core) / 100) * inp.total) },
    { bucket: "ดาวเทียม + รายได้ + ตกค้าง (หุ้นเดี่ยว)", targetPct: target.satellite + target.income, actualPct: r1(singlesPct), gapUsd: r2(((target.satellite + target.income - singlesPct) / 100) * inp.total) },
    { bucket: "เงินสด", targetPct: target.cash, actualPct: actual.cash, gapUsd: r2(((target.cash - actual.cash) / 100) * inp.total) },
  ];
  const coreGap = gaps[0];
  const nextMoney = coreGap.gapUsd > 0
    ? { to: "แกน (ETF ดัชนี)", why: `แกนอยู่ที่ ${actual.core}% ของเป้า ${target.core}% — ขาด ≈ $${Math.round(coreGap.gapUsd)} · เงินเติมทุกรอบไปแกนก่อนจนกว่าจะถึงเป้า (หุ้นเดี่ยวเพิ่มได้เฉพาะตัวที่ thesis "เพิ่ม" ผ่านด่าน)${!inp.rules.coreSymbols.length ? " · ยังไม่ตั้งรายชื่อ ETF แกนในกฎ" : ""}` }
    : passing.length
      ? { to: passing[0].symbol, why: `แกนถึงเป้าแล้ว · ตัวที่ผ่านด่าน "เพิ่ม" คะแนนสูงสุด: ${passing[0].symbol} (${passing[0].score.total})` }
      : { to: "เงินสด/แกน", why: "แกนถึงเป้าแล้ว และไม่มีหุ้นเดี่ยวที่ผ่านด่าน (thesis 'เพิ่ม' ยืนยัน + ราคาในโซน + ไม่ใช่ขาลง) → พักในแกน" };

  // benchmark / portfolio history
  const eh = [...inp.equityHistory].sort((a, b) => a.date.localeCompare(b.date));
  const first = eh[0], last = eh[eh.length - 1];
  const days = first && last ? Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400e3) : 0;
  const portfolio = {
    sinceDate: first?.date ?? null, days,
    returnPct: first && last && first.totalUsd > 0 && days > 0 ? r2(pct(last.totalUsd, first.totalUsd)) : null,
    note: days < 60 ? `ประวัติมูลค่าพอร์ต ${days} วัน — ต้องมี ≥ 60 วันจึงเทียบกับ SPY ได้อย่างมีความหมาย (เงินเติมทำให้ตัวเลขนี้ไม่ใช่ผลตอบแทนแท้ — TWR มาทีหลัง)` : "ผลตอบแทนแบบง่าย (ยังไม่หักเงินเติม)",
  };

  const from = holdings.filter((h) => h.action.kind === "โยก" || h.action.kind === "ทบทวน").map((h) => h.symbol);
  return {
    asOf: new Date().toISOString(),
    allocation: { basis, planTotalUsd: planTotal, currentTotalUsd: inp.total, monthlyUsd, target, actual, gaps, nextMoney, caps: { singleMaxPct: inp.rules.maxSinglePositionPct, singleWarnPct: inp.rules.warnSinglePositionPct, coreMaxPct: inp.rules.maxCorePct, basisTotalUsd: capBasis } },
    benchmark: { spy: spy ? rsOf(spy, null) : null, portfolio },
    holdings,
    rotation: {
      rule: "โยกเงินได้ก็ต่อเมื่อครบ 4 ข้อ: (1) ตัวต้นทางอยู่ขาลงและอ่อนกว่า SPY 6 เดือน > 20% โดย thesis ไม่ได้บอก 'ถือ/เพิ่ม' (2) ตัวปลายทางมี thesis 'เพิ่ม' ที่ต้นยืนยัน ราคาในโซน ไม่ใช่ขาลง (3) คะแนนปลายทางสูงกว่าต้นทาง ≥ 20 (4) ต้นทุนโยก (ขาย+ซื้อ) ≤ 1% และถือต้นทางมา ≥ 30 วัน — ผลตอบแทนย้อนหลังอย่างเดียวไม่ใช่เหตุผลโยก",
      from, candidates: candidates.slice(0, 8),
      note: passing.length ? `ผ่านด่าน ${passing.length} ตัว` : "ยังไม่มีตัวปลายทางที่ผ่านด่าน — ปกติสำหรับพอร์ตที่ยังไม่มี thesis 'เพิ่ม' ที่ยืนยัน · เงินใหม่ไปแกน",
    },
    techniques: TECHNIQUES,
    caveats: [...caveats, "ทุกป้าย 'ควรทำอะไร' เป็นข้อเสนอจากกฎ ไม่ใช่คำสั่ง · ต้นตัดสินใจเองผ่านตั๋ว · ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต", "ราคา Yahoo ชั้น 2 (ดีเลย์ได้) · งบ EDGAR รายปี (งบรายไตรมาสยังไม่ดึง) · ค่าธรรมเนียมเป็นค่าประมาณจากหน้าราคา Webull TH"],
  };
}

export const TECHNIQUES: ReviewOutput["techniques"] = [
  { key: "stage", name: "Stage Analysis (Weinstein)", use: "แบ่งหุ้นเป็น 4 ขั้นจากราคาเทียบ SMA150 + ความชัน SMA200: ซื้อ/ถือเฉพาะขั้น 1–2 · ขั้น 4 ห้ามถัว", source: "Stan Weinstein, Secrets for Profiting in Bull and Bear Markets (1988)" },
  { key: "template", name: "Trend Template (Minervini)", use: "8 เงื่อนไขแนวโน้มขึ้น — ใช้เป็นคะแนนจังหวะ 20/30 · ผ่าน ≥ 6/8 = แนวโน้มแข็ง", source: "Mark Minervini, Trade Like a Stock Market Wizard (2013) — ข้อ 8 ใช้ RS เทียบ SPY แทน RS rating" },
  { key: "rs", name: "Relative Strength vs SPY", use: "ผลตอบแทน 1/3/6 เดือนลบด้วย SPY — โมเมนตัม 3–12 เดือนมีหลักฐานเชิงวิชาการ แต่ 1 เดือนมักกลับทิศ จึงใช้ 6 เดือนเป็นหลัก", source: "Jegadeesh & Titman (1993) · Antonacci, Dual Momentum (2014)" },
  { key: "implied", name: "Reverse valuation / Expectations Investing", use: "แทนที่จะทายมูลค่า ถามว่า 'ราคานี้ต้องการให้โตกี่ %/ปี' แล้วตัดสินว่าเชื่อไหม", source: "Mauboussin & Rappaport, Expectations Investing (2001/2021)" },
  { key: "fscore", name: "Piotroski F-score + คุณภาพ", use: "9 สัญญาณคุณภาพงบ + ROE · FCF margin · รายได้โต 3 ปี · หุ้นเพิ่ม/ลด (เจือจาง)", source: "Piotroski (2000) · Novy-Marx (2013) gross profitability" },
  { key: "scorecard", name: "Scorecard 0–100 (agent §2B)", use: "คุณภาพ 25 · มูลค่า 25 · จังหวะ 30 · ปัจจัยกระตุ้น 10 · หักความเสี่ยง ≤ 10 — ทุกคะแนนมี 'ทำไม'", source: "UPVerse upverse-advisor §2B (ต้นปรับน้ำหนักได้)" },
  { key: "caps", name: "เพดานสัดส่วน + de minimis + ต้นทุน ≤ 1%", use: "หุ้นเดี่ยว ≤ 10% (เตือน 8%) วัดกับพอร์ตแผน 12 เดือน · ไม้ < $3 ไม่บังคับขาย · ค่าธรรมเนียม+FX ≤ 1% ต่อไม้", source: "UPVerse §3 + Swedroe 5/25 rebalancing bands (แนวคิด)" },
  { key: "noavg", name: "ห้ามถัวเฉลี่ยขาลงเมื่อ thesis พัง", use: "ถัวได้เฉพาะ thesis 'เพิ่ม' ที่ยืนยัน + ราคา ≤ น่าซื้อ + ไม่ใช่มีดตก · แกนดัชนี DCA ตามรอบ", source: "UPVerse §2D · O'Neil: ตัดขาดทุน 7–8% สำหรับไม้เก็งจังหวะ" },
  { key: "rotation", name: "โยกเงินแบบมีด่าน", use: "ไม่ไล่ performance: ต้องผ่าน 4 ด่าน (ต้นทางอ่อน · ปลายทางมี thesis เพิ่ม · คะแนนต่าง ≥ 20 · ต้นทุน ≤ 1% + ถือ ≥ 30 วัน)", source: "Barber & Odean (2000): นักลงทุนที่ซื้อขายบ่อยได้ผลตอบแทนต่ำกว่า" },
  { key: "core", name: "Core-Satellite", use: "แกน ETF ดัชนี 70% · ดาวเทียมหุ้นเดี่ยว 20% · เงินสด 10% (แก้ในหน้าเป้าหมาย) — เงินใหม่ไปแกนก่อนจนถึงเป้า", source: "Bogle · Swensen, Unconventional Success (2005)" },
];
