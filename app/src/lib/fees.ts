// Fee model — Webull Thailand, US stocks (webull.co.th/pricing, read 2026-09-18):
//   commission 0.10% of trade value, no minimum (buy and sell)
//   sell only: SEC 0.0000206 × value (min $0.01) · FINRA TAF 0.000195 × qty (min $0.01, max $9.79)
//   FX (THB↔USD) spread is not published → `fxSpreadPct` from settings (null = unknown → 0 + caveat)
// Imported Webull fills carry fees: 0 because the orders API does not return fees — this model is the estimate the app uses.
export interface FeeEstimate { commission: number; sec: number; finra: number; fx: number; total: number; pct: number | null; notes: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function estimateFees(side: "buy" | "sell", notionalUsd: number, qty: number, fxSpreadPct: number | null = null, includeFx = false): FeeEstimate {
  const notes: string[] = [];
  const commission = r4(notionalUsd * 0.001);
  const sec = side === "sell" ? r4(Math.max(notionalUsd * 0.0000206, 0.01)) : 0;
  const finra = side === "sell" ? r4(Math.min(Math.max(qty * 0.000195, 0.01), 9.79)) : 0;
  let fx = 0;
  if (includeFx) {
    if (fxSpreadPct == null) notes.push("ค่าแลกเงินไม่ระบุในหน้าราคา Webull — ตั้งค่า fxSpreadPct ในหน้าตั้งค่า");
    else fx = r4(notionalUsd * (fxSpreadPct / 100));
  }
  const total = r4(commission + sec + finra + fx);
  if (side === "sell" && notionalUsd > 0 && notionalUsd < 3) notes.push("ไม้ขาย < $3: ค่าธรรมเนียมขั้นต่ำ SEC+FINRA $0.02 ทำให้เกิน 1%");
  return { commission: r2(commission), sec: r2(sec), finra: r2(finra), fx: r2(fx), total: r2(total), pct: notionalUsd > 0 ? r2((total / notionalUsd) * 100) : null, notes };
}

/** Round-trip cost of moving money from one stock to another (sell A, buy B) as % of the amount moved. */
export function rotationCostPct(amountUsd: number, sellQty: number, fxSpreadPct: number | null = null): { total: number; pct: number | null; notes: string[] } {
  const a = estimateFees("sell", amountUsd, sellQty, fxSpreadPct);
  const b = estimateFees("buy", amountUsd, 0, fxSpreadPct);
  const total = r2(a.total + b.total);
  return { total, pct: amountUsd > 0 ? r2((total / amountUsd) * 100) : null, notes: [...a.notes, ...b.notes] };
}
