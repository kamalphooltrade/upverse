"use client";
// Portfolio review section — allocation vs plan · per-holding review with rule-based action · rotation with gates · techniques.
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/components/shell";
import { Card, H2, Muted, Chip, Btn, Ring, Banner, Empty, Skeleton, RefreshIcon, usd, pctf, fmtTime, cx, type Tone } from "@/components/ui";
import type { ReviewOutput, ReviewHolding, Candidate, ActionKind } from "@/lib/review";

type Review = ReviewOutput & { quotes_as_of: string | null; fx: { rate: number; asOf: string; source: string } | null; missing_bars: string[] };

const ACTION_TONE: Record<ActionKind, Tone> = { "ถือ": "neutral", "เพิ่ม": "up", "ลด": "warn", "ออก": "danger", "โยก": "warn", "ทบทวน": "warn" };
const BUCKET_LABEL: Record<ReviewHolding["bucket"], string> = { core: "แกน", satellite: "ดาวเทียม", income: "รายได้", legacy: "ตกค้าง", no_thesis: "ไม่มี thesis" };
const BUCKET_COLOR: Record<ReviewHolding["bucket"] | "cash", string> = { core: "#059669", satellite: "#7C3AED", income: "#0284C7", legacy: "#D97706", no_thesis: "#DC2626", cash: "#94A3B8" };
const sgn = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(dp)}%`);
const tone = (n: number | null | undefined): Tone => (n == null ? "neutral" : n >= 0 ? "up" : "down");

export function PortfolioReview({ account }: { account: string }) {
  const { data: r, error, isValidating, mutate } = useSWR<Review>(`/api/v1/portfolio/review?account=${account}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  const [showTech, setShowTech] = useState(false);
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-[20px] font-semibold">วิเคราะห์พอร์ต</h2>
        <div className="flex items-center gap-2">
          {r && <Muted className="text-[13px]">ราคา {fmtTime(r.quotes_as_of)} · คำนวณ {fmtTime(r.asOf)}</Muted>}
          <Btn small onClick={() => mutate()} disabled={isValidating}><RefreshIcon className={cx("w-4 h-4", isValidating && "animate-spin")} /> {isValidating ? "กำลังคำนวณ…" : "คำนวณใหม่"}</Btn>
        </div>
      </div>
      {error && <Banner tone="danger">วิเคราะห์ไม่ได้: {String(error.message)}</Banner>}
      {!r && !error && <Skeleton className="h-40" />}
      {r && <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Allocation r={r} />
          <Benchmark r={r} />
        </div>
        <Card className="mt-4">
          <H2 right={<Muted className="text-[13px]">เพดานวัดกับ {r.allocation.basis === "plan" ? `พอร์ตแผน 12 เดือน ${usd(r.allocation.caps.basisTotalUsd, 0)}` : `พอร์ตวันนี้ ${usd(r.allocation.caps.basisTotalUsd, 0)}`}</Muted>}>ทบทวนรายตัว — ควรทำอะไร</H2>
          {r.holdings.length === 0 ? <Empty>ยังไม่มีการถือครอง</Empty> : r.holdings.map((h) => <HoldingRow key={h.symbol} h={h} />)}
        </Card>
        <Rotation r={r} />
        <Card className="mt-4">
          <button className="w-full text-left flex items-center justify-between cursor-pointer" onClick={() => setShowTech((v) => !v)}><span className="text-[17px] font-semibold">หลักการที่ใช้ตัดสิน ({r.techniques.length})</span><span className="text-slate-500">{showTech ? "ซ่อน" : "ดู"}</span></button>
          {showTech && <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {r.techniques.map((t) => <div key={t.key} className="rounded-2xl p-3 bg-slate-500/5 dark:bg-white/5"><b>{t.name}</b><div className="text-[14px] mt-1">{t.use}</div><Muted className="text-[12px] mt-1">ที่มา: {t.source}</Muted></div>)}
          </div>}
        </Card>
        <Muted className="mt-3 text-[13px]">{r.caveats.join(" · ")}{r.missing_bars.length ? ` · ไม่มีราคาย้อนหลัง: ${r.missing_bars.join(", ")}` : ""}</Muted>
      </>}
    </section>
  );
}

function Allocation({ r }: { r: Review }) {
  const a = r.allocation;
  const segs: Array<[ReviewHolding["bucket"] | "cash", number]> = [["core", a.actual.core], ["satellite", a.actual.satellite], ["income", a.actual.income], ["legacy", a.actual.legacy], ["no_thesis", a.actual.no_thesis], ["cash", a.actual.cash]];
  const tgt: Array<[string, number, string]> = [["แกน", a.target.core, BUCKET_COLOR.core], ["ดาวเทียม", a.target.satellite, BUCKET_COLOR.satellite], ["รายได้", a.target.income, BUCKET_COLOR.income], ["เงินสด", a.target.cash, BUCKET_COLOR.cash]];
  return (
    <Card glow>
      <H2 right={<Chip tone={a.basis === "plan" ? "up" : "warn"}>{a.basis === "plan" ? "ฐาน = แผน 12 เดือน" : "ยังไม่มีแผน"}</Chip>}>สัดส่วนเงินทุน vs แผน</H2>
      <Muted className="text-[13px] mb-1">ตอนนี้</Muted>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 bg-slate-500/10 dark:bg-white/5">{segs.filter(([, v]) => v > 0).map(([k, v]) => <div key={k} title={`${k} ${pctf(v)}`} style={{ width: `${v}%`, background: BUCKET_COLOR[k] }} />)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[13px] text-slate-600 dark:text-slate-400">{segs.map(([k, v]) => <span key={k}><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: BUCKET_COLOR[k] }} />{k === "cash" ? "เงินสด" : BUCKET_LABEL[k]} {pctf(v)}</span>)}</div>
      <Muted className="text-[13px] mt-3 mb-1">เป้า (หน้าเป้าหมาย · ค่าเริ่มต้น 70/20/0/10)</Muted>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 bg-slate-500/10 dark:bg-white/5">{tgt.filter(([, v]) => v > 0).map(([k, v, c]) => <div key={k} title={`${k} ${v}%`} style={{ width: `${v}%`, background: c }} />)}</div>
      <div className="mt-3 divide-y divide-slate-900/10 dark:divide-white/10">
        {a.gaps.map((g) => <div key={g.bucket} className="flex items-center justify-between py-1.5 text-[14px]"><span>{g.bucket}</span><span className="num text-right">{pctf(g.actualPct)} → เป้า {g.targetPct}% <Chip tone={Math.abs(g.gapUsd) < 1 ? "neutral" : g.gapUsd > 0 ? "up" : "warn"}>{g.gapUsd > 0 ? "ขาด" : "เกิน"} {usd(Math.abs(g.gapUsd), 0)}</Chip></span></div>)}
      </div>
      <div className="mt-3 rounded-2xl p-3 bg-gradient-to-r from-emerald-600/10 to-teal-500/10"><div className="text-[13px] text-slate-600 dark:text-slate-400">เงินเติมรอบหน้าควรไป</div><div className="text-[18px] font-semibold">→ {a.nextMoney.to}</div><div className="text-[14px] mt-1">{a.nextMoney.why}</div>{a.monthlyUsd != null && <Muted className="text-[13px] mt-1">เติมเดือนละ ≈ {usd(a.monthlyUsd, 0)} · พอร์ตแผน 12 เดือน ≈ {usd(a.planTotalUsd, 0)}</Muted>}</div>
    </Card>
  );
}

function Benchmark({ r }: { r: Review }) {
  const s = r.benchmark.spy, p = r.benchmark.portfolio;
  return (
    <Card>
      <H2>เทียบตลาด (SPY)</H2>
      {s ? <div className="grid grid-cols-4 gap-2 text-center">{([["1 เดือน", s.r21], ["3 เดือน", s.r63], ["6 เดือน", s.r126], ["12 เดือน", s.r252]] as Array<[string, number | null]>).map(([l, v]) => <div key={l} className="rounded-2xl p-2 bg-slate-500/5 dark:bg-white/5"><Muted className="text-[12px]">{l}</Muted><div className={cx("num font-semibold", v == null ? "" : v >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{sgn(v)}</div></div>)}</div> : <Muted>ไม่มีราคา SPY</Muted>}
      <div className="mt-3 text-[14px]"><b>พอร์ต:</b> {p.returnPct != null ? <span className={p.returnPct >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{sgn(p.returnPct, 2)} ตั้งแต่ {p.sinceDate} ({p.days} วัน)</span> : "ยังไม่มีประวัติพอ"}</div>
      <Muted className="text-[13px] mt-1">{p.note}</Muted>
      <div className="mt-3">
        <Muted className="text-[13px] mb-1">แต่ละตัวเทียบ SPY 6 เดือน (แรงสัมพัทธ์)</Muted>
        <div className="space-y-1">{[...r.holdings].sort((a, b) => (b.rs.vs126 ?? -999) - (a.rs.vs126 ?? -999)).map((h) => <div key={h.symbol} className="grid grid-cols-[52px_1fr_64px] items-center gap-2 text-[13px]"><b>{h.symbol}</b><div className="h-2 rounded-full bg-slate-500/10 dark:bg-white/10 relative overflow-hidden"><div className="absolute top-0 bottom-0" style={{ left: h.rs.vs126 != null && h.rs.vs126 < 0 ? `${50 + Math.max(h.rs.vs126, -50)}%` : "50%", width: `${Math.min(Math.abs(h.rs.vs126 ?? 0), 50)}%`, background: (h.rs.vs126 ?? 0) >= 0 ? "#059669" : "#DC2626" }} /></div><span className={cx("num text-right", tone(h.rs.vs126) === "up" ? "text-green-700 dark:text-green-400" : tone(h.rs.vs126) === "down" ? "text-red-700 dark:text-red-400" : "")}>{sgn(h.rs.vs126)}</span></div>)}</div>
      </div>
    </Card>
  );
}

function HoldingRow({ h }: { h: ReviewHolding }) {
  const [open, setOpen] = useState(false);
  const t = h.trend, v = h.valuation, q = h.quality;
  return (
    <div className="py-3 border-t first:border-t-0 border-slate-900/10 dark:border-white/10">
      <div className="flex items-start gap-3">
        <Ring v={h.score.total} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/stock/${h.symbol}`} className="font-semibold text-[17px]">{h.symbol}</Link>
            <Chip tone={ACTION_TONE[h.action.kind]}>{h.action.kind}{h.action.pending ? " · รอต้นยืนยัน" : ""}</Chip>
            <Chip><i className="inline-block w-2 h-2 rounded-sm" style={{ background: BUCKET_COLOR[h.bucket] }} />{BUCKET_LABEL[h.bucket]}</Chip>
            {h.thesis && <Chip tone={h.thesis.stale ? "warn" : "info"}>thesis {h.thesis.verdict}{h.thesis.stale ? " · เลยวันทบทวน" : ""}</Chip>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[13px] text-slate-600 dark:text-slate-400 num">
            <span>{pctf(h.weightPct)} ของพอร์ต</span>
            <span className={cx(h.pnlPct == null ? "" : h.pnlPct >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{sgn(h.pnlPct)}{h.pnlThb != null ? ` (${h.pnlThb >= 0 ? "+" : "−"}฿${Math.abs(h.pnlThb).toFixed(0)})` : ""}</span>
            {t && <span>{t.stageLabel} · เทมเพลต {t.template.pass}/{t.template.total}</span>}
            <span>vs SPY 6ด {sgn(h.rs.vs126)}</span>
            {v.impliedGrowth != null && <span>ราคานี้ต้องการโต {v.impliedGrowth}%/ปี</span>}
            {h.daysHeld != null && <span>ถือ {h.daysHeld} วัน</span>}
          </div>
          <div className="text-[14px] mt-1">{h.action.reasons[0]}</div>
          {h.action.blockers.length > 0 && <div className="text-[13px] mt-0.5 text-amber-800 dark:text-amber-300">⛔ {h.action.blockers.join(" · ")}</div>}
          {h.avgDown && <div className={cx("text-[13px] mt-0.5", h.avgDown.allowed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>ถัวได้ไหม: {h.avgDown.allowed ? "ได้" : "ไม่ได้"} — {h.avgDown.reason}</div>}
          <button className="text-[13px] mt-1 text-emerald-700 dark:text-emerald-400 cursor-pointer" onClick={() => setOpen((o) => !o)}>{open ? "ซ่อนรายละเอียด" : "ดูรายละเอียด/ทำไม"}</button>
          {open && <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-2xl p-3 bg-slate-500/5 dark:bg-white/5"><b>คะแนน {h.score.total}/100</b>{h.score.why.map((w, i) => <div key={i} className="mt-1">{w}</div>)}</div>
            <div className="rounded-2xl p-3 bg-slate-500/5 dark:bg-white/5">
              <b>ตัวเลข</b>
              <div className="mt-1 num">มูลค่า: P/E {v.pe ?? "—"} · P/FCF {v.pfcf ?? "—"} · FCF yield {v.fcfYield != null ? v.fcfYield + "%" : "—"} · ปันผล {v.divYield != null ? v.divYield + "%" : "—"}</div>
              {v.impliedGrowth != null && <div className="mt-1">{v.impliedNote.replace("x%", v.impliedGrowth + "%")}</div>}
              <div className="mt-1 num">คุณภาพ: F-score {q.fScore ?? "—"}/9 · ROE {q.roe ?? "—"}% · FCF margin {q.fcfMargin ?? (q.isBank ? "ธนาคาร" : "—")}{q.fcfMargin != null ? "%" : ""} · รายได้โต 3 ปี {q.revCagr3y ?? "—"}%/ปี · หุ้น 3 ปี {sgn(q.shareChange3y)}</div>
              {t && <div className="mt-1 num">เทคนิค: RSI {t.rsi14 ?? "—"} · ผันผวน {t.atrPct ?? "—"}%/วัน · ห่าง high 52w {t.offHigh ?? "—"}% · SMA200 {t.sma200Slope != null ? (t.sma200Slope >= 0 ? "ขึ้น" : "ลง") + " " + t.sma200Slope + "%/เดือน" : "—"}{t.knife ? " · ⚠ มีดกำลังตก" : ""}</div>}
              <div className="mt-1 num">RS: 1ด {sgn(h.rs.r21)} · 3ด {sgn(h.rs.r63)} · 6ด {sgn(h.rs.r126)} · 12ด {sgn(h.rs.r252)} (เทียบ SPY: {sgn(h.rs.vs21)} / {sgn(h.rs.vs63)} / {sgn(h.rs.vs126)})</div>
              <div className="mt-1 num">ค่าธรรมเนียมถ้าออกหมด: {usd(h.fees.exit.total)} = {h.fees.exitPct ?? "—"}%{h.fees.exit.notes.length ? " · " + h.fees.exit.notes.join(" · ") : ""}</div>
              {t && <div className="mt-2">{t.template.items.map((it) => <span key={it.label} className={cx("inline-block mr-2", it.ok === true ? "text-green-700 dark:text-green-400" : it.ok === false ? "text-red-700 dark:text-red-400" : "text-slate-500")}>{it.ok === true ? "✓" : it.ok === false ? "✗" : "?"} {it.label}</span>)}</div>}
              {h.action.reasons.length > 1 && <div className="mt-2">{h.action.reasons.slice(1).map((x, i) => <div key={i}>• {x}</div>)}</div>}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function Rotation({ r }: { r: Review }) {
  const rot = r.rotation;
  return (
    <Card className="mt-4">
      <H2 right={<Chip tone={rot.candidates.some((c) => c.gate.pass) ? "up" : "neutral"}>{rot.note}</Chip>}>โยกเงินไปไหน — เงินใหม่ / จากตัวที่อ่อน</H2>
      <Muted className="text-[13px]">{rot.rule}</Muted>
      {rot.from.length > 0 && <div className="mt-2 text-[14px]">ตัวต้นทางที่เข้าข่ายทบทวน/โยก: <b>{rot.from.join(", ")}</b></div>}
      {rot.candidates.length === 0 ? <Empty>ยังไม่มีตัวปลายทาง — เพิ่ม watchlist หรือรันสแกน แล้วขอ thesis จาก agent</Empty> : <div className="mt-3 divide-y divide-slate-900/10 dark:divide-white/10">
        {rot.candidates.map((c) => <CandidateRow key={c.symbol} c={c} />)}
      </div>}
    </Card>
  );
}

function CandidateRow({ c }: { c: Candidate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <Ring v={c.score.total} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><Link href={`/stock/${c.symbol}`} className="font-semibold">{c.symbol}</Link>{c.name && <Muted className="inline text-[13px]">{c.name}</Muted>}<Chip tone={c.gate.pass ? "up" : "neutral"}>{c.gate.pass ? "ผ่านด่าน" : "ยังไม่ผ่าน"}</Chip><Chip>{c.source}</Chip>{c.thesis && <Chip tone="info">thesis {c.thesis.verdict}</Chip>}</div>
          <div className="text-[13px] mt-0.5 text-slate-600 dark:text-slate-400 num">{c.trend?.stageLabel ?? "—"} · เทมเพลต {c.trend?.template.pass ?? "—"}/8 · vs SPY 6ด {sgn(c.rs.vs126)} · {c.valuation.pfcf != null ? `P/FCF ${c.valuation.pfcf}` : c.valuation.pe != null ? `P/E ${c.valuation.pe}` : "ไม่มีกำไร/FCF"}{c.valuation.impliedGrowth != null ? ` · ต้องการโต ${c.valuation.impliedGrowth}%/ปี` : ""}</div>
          {!c.gate.pass && <div className="text-[13px] mt-0.5 text-amber-800 dark:text-amber-300">ติด: {c.gate.reasons.join(" · ")}</div>}
          <button className="text-[13px] mt-0.5 text-emerald-700 dark:text-emerald-400 cursor-pointer" onClick={() => setOpen((o) => !o)}>{open ? "ซ่อน" : "ทำไมได้คะแนนนี้"}</button>
          {open && <div className="mt-1 text-[13px] rounded-2xl p-3 bg-slate-500/5 dark:bg-white/5">{c.score.why.map((w, i) => <div key={i}>{w}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}
