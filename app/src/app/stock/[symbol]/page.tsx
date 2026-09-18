"use client";
import { use, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api } from "@/components/shell";
import { Candles } from "@/components/candles";
import { Card, H2, Muted, Src, Chip, Btn, Delta, Toggle, KV, Skeleton, Banner, StarIcon, CheckIcon, usd, fmtTime, cx } from "@/components/ui";
import { useHealth } from "@/components/shell";
import type { Bar, Thesis } from "@/lib/types";

type Inst = {
  symbol: string;
  quote: { price: number; changePct: number | null; change: number | null; marketState: string; asOf: string; source: string; stale: boolean } | { error: string };
  bars: Bar[]; indicators: { ema20: (number | null)[]; sma50: (number | null)[]; sma200: (number | null)[]; rsi14: (number | null)[] };
  snapshot: { rsi14: number | null; atr14: number | null; hi52: number; lo52: number; volRatio: number | null; ema20: number | null; sma50: number | null; sma200: number | null; ret20: number | null; ret252: number | null } | null;
  fundamentals: { fy: number | null; revenue: number | null; revenue3yAgo: number | null; netIncome: number | null; fcf: number | null; totalDebt: number | null; cash: number | null; equity: number | null; sharesOut: number | null; sharesOut3yAgo: number | null; dividendsPaid: number | null; eps: number | null; epsPrev: number | null; fScore: number | null; fScoreNote: string; fetchedAt: string } | null;
  fundamentals_error: string | null;
  scan_tags: Array<{ model: string; rank: number; runAt: string }>;
  position: { qty: number; avgCost: number } | null;
  watch: { zoneLow: number | null; zoneHigh: number | null } | null;
  thesis: Thesis | null;
  sources: { price: string; fundamentals: string };
};

const bn = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toFixed(0)}`);
const pc = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = decodeURIComponent(raw).toUpperCase();
  const [range, setRange] = useState<"3mo" | "6mo" | "1y" | "2y">("1y");
  const { data, error, mutate } = useSWR<Inst>(`/api/v1/instruments/${symbol}?range=${range}`, fetcher, { refreshInterval: 15_000 });
  const [msg, setMsg] = useState<string | null>(null);
  const { health } = useHealth();
  const [busy, setBusy] = useState(false);
  const th = data?.thesis ?? null;
  const thesisStale = !!(th && th.status === "confirmed" && data?.fundamentals?.fetchedAt && data.fundamentals.fy != null && th.reviewAfter && new Date(th.reviewAfter) < new Date());
  const act = async (action: "confirm" | "reject") => { if (!th) return; setBusy(true); try { const reason = action === "reject" ? prompt("เหตุผลที่ปฏิเสธ (จะบันทึกไว้)") ?? undefined : undefined; if (action === "reject" && !reason) return; await api(`/api/v1/theses/${th.id}`, { method: "POST", json: { action, reason } }); setMsg(action === "confirm" ? "ยืนยัน thesis แล้ว" : "ปฏิเสธ thesis แล้ว"); mutate(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const q = data && !("error" in data.quote) ? data.quote : null;
  const f = data?.fundamentals ?? null;
  const s = data?.snapshot ?? null;
  const mcap = f?.sharesOut && q ? f.sharesOut * q.price : null;
  const pe = mcap && f?.netIncome && f.netIncome > 0 ? mcap / f.netIncome : null;
  const pfcf = mcap && f?.fcf && f.fcf > 0 ? mcap / f.fcf : null;
  const revCagr = f?.revenue && f.revenue3yAgo && f.revenue3yAgo > 0 ? (Math.pow(f.revenue / f.revenue3yAgo, 1 / 3) - 1) * 100 : null;
  const addWatch = async () => { const lo = s?.ema20 ?? null; await api("/api/v1/watchlist", { method: "POST", json: { symbol, reason: "จากหน้าหุ้น", zoneLow: lo ? Math.round(lo * 0.97 * 100) / 100 : null, zoneHigh: lo ? Math.round(lo * 1.01 * 100) / 100 : null, stop: s?.atr14 && q ? Math.round((q.price - 2 * s.atr14) * 100) / 100 : null } }); setMsg("เพิ่มใน watchlist แล้ว (โซน ≈ EMA20 · ตัดขาดทุน 2×ATR — แก้ได้ในหน้า Watchlist)"); };
  return (
    <>
      {error && <Banner tone="danger">โหลดไม่ได้: {String(error.message)}</Banner>}
      <Card glow className="mb-4">
        {!data ? <Skeleton className="h-64" /> : <>
          <div className="flex flex-wrap justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap"><span className="text-[22px] font-semibold">{symbol}</span></div>
              {q ? <>
                <div className="flex items-center gap-3 flex-wrap"><span className="text-[34px] leading-tight font-semibold num">{usd(q.price)}</span><Delta pct={q.changePct} abs={q.change != null ? usd(Math.abs(q.change)) : undefined} />{q.stale && <Chip tone="warn">ค้าง</Chip>}</div>
                <Src>{q.source} · {q.marketState} · {fmtTime(q.asOf)}</Src>
              </> : <Muted>ไม่มีราคา: {(data.quote as { error: string }).error}</Muted>}
            </div>
            <div className="flex flex-wrap gap-2 content-start">
              {data.position ? <Chip tone="up">ถือ {data.position.qty} หุ้น @ {data.position.avgCost.toFixed(2)}</Chip> : <Chip>ไม่ได้ถือ</Chip>}
              {data.scan_tags.map((t) => <Chip key={t.model} tone="info">{t.model} #{t.rank}</Chip>)}
              {data.watch && <Chip tone="warn">★ watchlist</Chip>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-3"><Toggle items={[["3mo", "3M"], ["6mo", "6M"], ["1y", "1Y"], ["2y", "2Y"]]} value={range} onChange={setRange} /></div>
          <Candles bars={data.bars} ema20={data.indicators.ema20} sma50={data.indicators.sma50} sma200={data.indicators.sma200} rsi14={data.indicators.rsi14} />
        </>}
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><H2>เทคนิค {s && <Src>ปิดล่าสุด</Src>}</H2>
          {!s ? <Muted>ข้อมูลแท่งไม่พอ</Muted> : <KV rows={[["RSI14", s.rsi14?.toFixed(1) ?? "—"], ["ATR14", s.atr14?.toFixed(2) ?? "—"], ["EMA20 · SMA50 · SMA200", `${s.ema20?.toFixed(1) ?? "—"} · ${s.sma50?.toFixed(1) ?? "—"} · ${s.sma200?.toFixed(1) ?? "—"}`], ["ห่าง SMA200", q && s.sma200 ? `${(((q.price - s.sma200) / s.sma200) * 100).toFixed(1)}%` : "—"], ["52 สัปดาห์ สูง/ต่ำ", `${s.hi52.toFixed(1)} / ${s.lo52.toFixed(1)}`], ["ปริมาณ/เฉลี่ย 50 วัน", s.volRatio ? `${s.volRatio.toFixed(2)}×` : "—"], ["20 วัน · 12 เดือน", `${s.ret20?.toFixed(1) ?? "—"}% · ${s.ret252?.toFixed(1) ?? "—"}%`], ["ตัดขาดทุนอ้างอิง (2×ATR)", q && s.atr14 ? usd(q.price - 2 * s.atr14) : "—"]]} />}
        </Card>
        <Card><H2 right={f ? <Src>EDGAR FY{f.fy} · ดึง {fmtTime(f.fetchedAt)}</Src> : undefined}>พื้นฐาน</H2>
          {!data ? <Skeleton className="h-40" /> : !f ? <Muted>ไม่มีงบจาก SEC EDGAR สำหรับตัวนี้ {data.fundamentals_error ? `(${data.fundamentals_error})` : "(อาจเป็น ETF/ต่างชาติ) — ไม่ประมาณค่าแทน"}</Muted> : <KV rows={[["รายได้ (FY)", bn(f.revenue)], ["รายได้โต 3 ปี", revCagr == null ? "—" : `${revCagr.toFixed(1)}%/ปี`], ["กำไรสุทธิ", bn(f.netIncome)], ["FCF", bn(f.fcf)], ["FCF margin", f.fcf != null && f.revenue ? `${((f.fcf / f.revenue) * 100).toFixed(1)}%` : "—"], ["ROE", f.netIncome != null && f.equity && f.equity > 0 ? `${((f.netIncome / f.equity) * 100).toFixed(1)}%` : "—"], ["หนี้ · เงินสด", `${bn(f.totalDebt)} · ${bn(f.cash)}`], ["จำนวนหุ้น 3 ปี", pc(f.sharesOut, f.sharesOut3yAgo) == null ? "—" : `${pc(f.sharesOut, f.sharesOut3yAgo)!.toFixed(1)}%`], ["P/E · P/FCF (คำนวณจากราคาปัจจุบัน)", `${pe?.toFixed(1) ?? "—"} · ${pfcf?.toFixed(1) ?? "—"}`], ["EPS (FY) · ปีก่อน", `${f.eps?.toFixed(2) ?? "—"} · ${f.epsPrev?.toFixed(2) ?? "—"}`], ["ปันผลจ่าย (FY)", bn(f.dividendsPaid != null ? Math.abs(f.dividendsPaid) : null)], ["F-score", f.fScore != null ? `${f.fScore}/9 (${f.fScoreNote})` : `— (${f.fScoreNote})`]]} />}
        </Card>
        <Card className="md:col-span-2 lg:col-span-3"><H2 right={th ? <div className="flex gap-1.5 flex-wrap"><Chip tone={th.status === "confirmed" && !thesisStale ? "up" : th.status === "draft_ai" ? "info" : "warn"}>{th.status === "draft_ai" ? "🤖 draft รอต้นยืนยัน" : th.status === "confirmed" ? (thesisStale ? "⚠ ถึงกำหนดทบทวน" : "✅ ยืนยันแล้ว") : th.status === "stale" ? "⚠ เก่า" : "ปฏิเสธ"}</Chip><Chip>v{th.version} · {th.author === "agent" ? "agent" : "ต้น"} · {fmtTime(th.createdAt)}</Chip></div> : undefined}>Thesis</H2>
          {!th ? <Muted>ยังไม่มี thesis — ให้ agent <code>upverse-advisor</code> เขียนผ่าน API (scope theses:write) แล้วมายืนยันที่นี่ · ตัวเลขในหน้านี้เป็นสูตร ไม่ใช่ AI</Muted> : <>
            <div className="flex flex-wrap items-center gap-2 mb-2"><Chip tone={th.verdict === "เพิ่ม" || th.verdict === "ถือ" ? "up" : th.verdict === "ลด" || th.verdict === "ออก" ? "down" : "neutral"} className="text-[15px] px-3 py-1">คำตัดสิน: {th.verdict}</Chip><Chip>บทบาท: {th.role}</Chip>{th.buyBelow != null && <Chip tone="info">ราคาน่าซื้อ ≤ {usd(th.buyBelow)}</Chip>}{th.priceAtWrite != null && <Chip>ราคาตอนเขียน {usd(th.priceAtWrite)}</Chip>}</div>
            <p className="text-[15px] mb-3">{th.summary}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>{th.sections.map((sec) => <details key={sec.title} className="border-t first:border-t-0 border-slate-900/10 dark:border-white/10 py-2" open={sec.title.startsWith("1")}><summary className="cursor-pointer font-semibold">{sec.title}</summary><div className="text-[15px] text-slate-600 dark:text-slate-400 whitespace-pre-line mt-1">{sec.body}</div></details>)}</div>
              <div>
                <div className="font-semibold mb-1">มูลค่า 3 ฉากทัศน์</div>
                <table className="w-full text-[15px] mb-3"><thead><tr className="text-[13px] text-slate-600 dark:text-slate-400"><th className="text-left py-1">ฉากทัศน์</th><th className="text-right">มูลค่า</th><th className="text-right">เทียบราคาตอนเขียน</th></tr></thead><tbody>{th.scenarios.map((sc) => { const d = sc.value != null && th.priceAtWrite ? ((sc.value - th.priceAtWrite) / th.priceAtWrite) * 100 : null; return <tr key={sc.name} className="border-t border-slate-900/10 dark:border-white/10 align-top"><td className="py-1">{({ bear: "Bear", base: "Base", bull: "Bull" })[sc.name]}<div className="text-[13px] text-slate-600 dark:text-slate-400">{sc.assumption}</div></td><td className="text-right num">{sc.value != null ? usd(sc.value) : "—"}</td><td className={cx("text-right num", d == null ? "" : d >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`}</td></tr>; })}</tbody></table>
                <div className="text-[15px] space-y-1"><p><b>อะไรจะทำให้คิดผิด:</b> <span className="text-slate-600 dark:text-slate-400">{th.invalidation}</span></p><p><b>ทางเลือกที่ 0:</b> <span className="text-slate-600 dark:text-slate-400">{th.altZero}</span></p></div>
                {th.dissent.length > 0 && <div className="mt-3"><div className="font-semibold mb-1">เสียงค้านจากวง persona</div>{th.dissent.map((dz, i) => <div key={i} className="text-[14px] py-1 border-t border-slate-900/10 dark:border-white/10"><b>{dz.persona}:</b> <span className="text-slate-600 dark:text-slate-400">{dz.point}</span><div className="text-[13px]">↳ ตอบ: {dz.response}</div></div>)}</div>}
                <Muted className="text-[13px] mt-3">ที่มา: {th.sources.map((x) => `${x.label} (${x.asOf})`).join(" · ")}{th.reviewAfter ? ` · ทบทวนหลัง ${th.reviewAfter}` : ""}</Muted>
              </div>
            </div>
            {th.status === "draft_ai" && <div className="flex flex-wrap gap-2 mt-3"><Btn variant="primary" disabled={busy} onClick={() => act("confirm")}><CheckIcon className="w-4 h-4" /> ยืนยัน thesis (ต้น)</Btn><Btn variant="ghost" className="text-red-700 dark:text-red-400" disabled={busy} onClick={() => act("reject")}>ปฏิเสธ + เหตุผล</Btn>{health?.owner_passphrase_source === "none" && <Muted className="text-[13px]">โหมด dev</Muted>}</div>}
            <Muted className="text-[13px] mt-2">ข้อความในการ์ดนี้เขียนโดย agent (AI) จากตัวเลขที่ระบุที่มา · ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต · ตัวเลขต้อง verify ก่อนลงมือ</Muted>
          </>}
        </Card>
        <Card><H2>ทำอะไรได้</H2>
          <Btn block className="mb-2" onClick={addWatch}><StarIcon className="w-4 h-4" /> เพิ่ม Watchlist</Btn>
          <Link href={`/tickets?new=1&symbol=${symbol}&price=${q?.price ?? ""}&atr=${s?.atr14 ?? ""}`} className="block mb-2"><Btn block variant="primary">สร้างตั๋วคำสั่ง</Btn></Link>
          <Link href={`/journal?symbol=${symbol}`} className="block"><Btn block>บันทึก journal</Btn></Link>
          {msg && <Muted className="mt-2">{msg}</Muted>}
          <Muted className="text-[13px]">ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต · ตัวเลขต้อง verify ก่อนลงมือ · ที่มา: {data?.sources.price} · {data?.sources.fundamentals}</Muted>
        </Card>
      </div>
    </>
  );
}
