// Fundamentals from SEC EDGAR XBRL companyfacts (official, free). Cached on disk per CIK.
// Only what M2/M3/M5 need. Missing data stays null — never estimated (SPEC §7.0).
import { promises as fs } from "node:fs";
import path from "node:path";

const UA = process.env.SEC_USER_AGENT || "UPVerse personal portfolio tool (contact: owner)";
const DIR = path.join(process.env.UPVERSE_DATA_DIR || path.join(process.cwd(), "data"), "edgar");

export interface Fundamentals {
  symbol: string;
  cik: string;
  fetchedAt: string;
  source: "SEC EDGAR companyfacts";
  fy: number | null; // latest fiscal year used
  revenue: number | null; // latest FY
  revenue3yAgo: number | null;
  netIncome: number | null;
  ocf: number | null; // operating cash flow
  capex: number | null;
  fcf: number | null;
  totalDebt: number | null;
  cash: number | null;
  equity: number | null;
  sharesOut: number | null;
  sharesOut3yAgo: number | null;
  dividendsPaid: number | null; // absolute USD paid in FY
  eps: number | null;
  epsPrev: number | null;
  epsYears: number[]; // consecutive FY EPS (oldest→newest, up to 5)
  fScore: number | null; // Piotroski (partial: 6 of 9 signals computable from annual facts)
  fScoreNote: string;
}

type Facts = Record<string, { units: Record<string, Array<{ fy: number; fp: string; form: string; val: number; end: string; start?: string; filed?: string }>> }>;

let tickerMap: Record<string, string> | null = null;
export async function cikFor(symbol: string): Promise<string | null> {
  if (!tickerMap) {
    const p = path.join(DIR, "tickers.json");
    try {
      const raw = await fs.readFile(p, "utf8");
      const j = JSON.parse(raw) as { fetchedAt: string; map: Record<string, string> };
      if (Date.now() - new Date(j.fetchedAt).getTime() < 30 * 86400e3) tickerMap = j.map;
    } catch { /* fetch below */ }
    if (!tickerMap) {
      const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`SEC tickers HTTP ${r.status}`);
      const j = (await r.json()) as Record<string, { cik_str: number; ticker: string }>;
      tickerMap = {};
      for (const v of Object.values(j)) tickerMap[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
      await fs.mkdir(DIR, { recursive: true });
      await fs.writeFile(p, JSON.stringify({ fetchedAt: new Date().toISOString(), map: tickerMap }), "utf8");
    }
  }
  return tickerMap[symbol.toUpperCase().replace("-", ".")] ?? tickerMap[symbol.toUpperCase()] ?? null;
}

function annual(facts: Facts, tags: string[], unit = "USD"): Array<{ fy: number; val: number; end: string }> {
  // Merge ALL alternative tags (companies switch tags over time, e.g. Apple Revenues→RevenueFromContract… in 2018).
  // NOTE: companyfacts `fy` = fiscal year of the FILING (a 10-K restates prior years under the same fy),
  // so key by the period END year of the fact itself, and prefer the most recently filed value per period.
  const byFy = new Map<number, { fy: number; val: number; end: string; filed: string; tagIdx: number }>();
  tags.forEach((tag, tagIdx) => {
    const u = facts[tag]?.units?.[unit];
    if (!u) return;
    for (const x of u) {
      if (x.fp !== "FY" || !/10-K/.test(x.form)) continue;
      if (x.start) {
        const days = (new Date(x.end).getTime() - new Date(x.start).getTime()) / 86400e3;
        if (days < 300 || days > 380) continue; // annual duration only
      }
      const periodYear = Number(x.end.slice(0, 4));
      const filed = x.filed ?? "";
      const cur = byFy.get(periodYear);
      // prefer newer filing; on tie prefer earlier tag in the preference list
      if (!cur || filed > cur.filed || (filed === cur.filed && tagIdx < cur.tagIdx)) byFy.set(periodYear, { fy: periodYear, val: x.val, end: x.end, filed, tagIdx });
    }
  });
  return [...byFy.values()].sort((a, b) => a.fy - b.fy).map(({ fy, val, end }) => ({ fy, val, end }));
}

const at = (arr: Array<{ fy: number; val: number }>, fy: number | null) => (fy == null ? null : arr.find((x) => x.fy === fy)?.val ?? null);

export async function getFundamentals(symbol: string, maxAgeDays = 7): Promise<Fundamentals | null> {
  const cik = await cikFor(symbol);
  if (!cik) return null;
  const p = path.join(DIR, `${cik}.json`);
  try {
    const raw = await fs.readFile(p, "utf8");
    const f = JSON.parse(raw) as Fundamentals;
    if (Date.now() - new Date(f.fetchedAt).getTime() < maxAgeDays * 86400e3) return { ...f, symbol };
  } catch { /* fetch */ }
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`EDGAR ${symbol} HTTP ${r.status}`);
  const j = (await r.json()) as { facts: { "us-gaap"?: Facts } };
  const facts = j.facts["us-gaap"] ?? {};

  const rev = annual(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"]);
  const ni = annual(facts, ["NetIncomeLoss", "ProfitLoss"]);
  const ocf = annual(facts, ["NetCashProvidedByUsedInOperatingActivities"]);
  const capex = annual(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]);
  const debtLt = annual(facts, ["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"]);
  const debtSt = annual(facts, ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"]);
  const cash = annual(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]);
  const equity = annual(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]);
  const shares = annual(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"], "shares");
  const divs = annual(facts, ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"]);
  const eps = annual(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares");
  const assets = annual(facts, ["Assets"]);
  const curA = annual(facts, ["AssetsCurrent"]);
  const curL = annual(facts, ["LiabilitiesCurrent"]);
  const gp = annual(facts, ["GrossProfit"]);

  const fy = rev.length ? rev[rev.length - 1].fy : ni.length ? ni[ni.length - 1].fy : null;
  const prevFy = fy != null ? fy - 1 : null;
  const v = (arr: Array<{ fy: number; val: number }>, y: number | null) => at(arr, y);
  const ocfV = v(ocf, fy), capexV = v(capex, fy);
  const fcf = ocfV != null && capexV != null ? ocfV - Math.abs(capexV) : null;
  const totalDebt = (v(debtLt, fy) ?? 0) + (v(debtSt, fy) ?? 0);
  const hasDebt = v(debtLt, fy) != null || v(debtSt, fy) != null;

  // Piotroski (annual-computable subset): ROA>0, OCF>0, ΔROA>0, OCF>NI (accrual), Δleverage<0, Δcurrent ratio>0, no dilution, Δgross margin>0, Δasset turnover>0
  let f = 0, computed = 0;
  const roa = (y: number | null) => { const n = v(ni, y), a = v(assets, y); return n != null && a ? n / a : null; };
  const roaNow = roa(fy), roaPrev = roa(prevFy);
  if (roaNow != null) { computed++; if (roaNow > 0) f++; }
  if (ocfV != null) { computed++; if (ocfV > 0) f++; }
  if (roaNow != null && roaPrev != null) { computed++; if (roaNow > roaPrev) f++; }
  if (ocfV != null && v(ni, fy) != null) { computed++; if (ocfV > (v(ni, fy) as number)) f++; }
  const lev = (y: number | null) => { const d = (v(debtLt, y) ?? null), a = v(assets, y); return d != null && a ? d / a : null; };
  if (lev(fy) != null && lev(prevFy) != null) { computed++; if ((lev(fy) as number) <= (lev(prevFy) as number)) f++; }
  const cr = (y: number | null) => { const a = v(curA, y), l = v(curL, y); return a != null && l ? a / l : null; };
  if (cr(fy) != null && cr(prevFy) != null) { computed++; if ((cr(fy) as number) > (cr(prevFy) as number)) f++; }
  if (v(shares, fy) != null && v(shares, prevFy) != null) { computed++; if ((v(shares, fy) as number) <= (v(shares, prevFy) as number)) f++; }
  const gm = (y: number | null) => { const g = v(gp, y), r0 = v(rev, y); return g != null && r0 ? g / r0 : null; };
  if (gm(fy) != null && gm(prevFy) != null) { computed++; if ((gm(fy) as number) > (gm(prevFy) as number)) f++; }
  const to = (y: number | null) => { const r0 = v(rev, y), a = v(assets, y); return r0 != null && a ? r0 / a : null; };
  if (to(fy) != null && to(prevFy) != null) { computed++; if ((to(fy) as number) > (to(prevFy) as number)) f++; }

  const epsYears = eps.slice(-5).map((x) => x.val);
  const out: Fundamentals = {
    symbol, cik, fetchedAt: new Date().toISOString(), source: "SEC EDGAR companyfacts", fy,
    revenue: v(rev, fy), revenue3yAgo: fy != null ? v(rev, fy - 3) : null,
    netIncome: v(ni, fy), ocf: ocfV, capex: capexV, fcf,
    totalDebt: hasDebt ? totalDebt : null, cash: v(cash, fy), equity: v(equity, fy),
    sharesOut: v(shares, fy), sharesOut3yAgo: fy != null ? v(shares, fy - 3) : null,
    dividendsPaid: v(divs, fy), eps: v(eps, fy), epsPrev: v(eps, prevFy), epsYears,
    fScore: computed >= 6 ? f : null,
    fScoreNote: computed >= 6 ? `คำนวณได้ ${computed}/9 สัญญาณ` : fy == null ? "ไม่มีงบปี (10-K) ใต้ CIK นี้ — เช่น บริษัทเพิ่งจดนิติบุคคลใหม่ · ไม่ประมาณจาก 10-Q" : `ข้อมูลไม่พอ (${computed}/9)`,
  };
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(p, JSON.stringify(out), "utf8");
  return out;
}
