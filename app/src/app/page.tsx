"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/components/shell";
import { Card, H2, Muted, Src, Chip, Delta, Btn, Skeleton, usd, thb, fmtTime } from "@/components/ui";

type Portfolio = { total_usd: number; total_thb: number | null; cash_usd: number; fx: { rate: number; source: string } | null; holdings: Array<{ symbol: string; weight_pct: number | null; pnl_pct: number | null; quote_as_of: string | null; stale: boolean | null }>; pnl: { unrealized_usd: number }; missing_quotes: string[] };
type Tickets = { tickets: Array<{ id: string; symbol: string; side: string; qty: number | null; notionalUsd: number | null; expiresAt: string; proposedBy: string; tag: string | null; riskCheck: Array<{ state: string }> }> };
type Scans = { runs: Array<{ modelKey: string; runAt: string; results: Array<{ symbol: string; score: number }> }>; running: unknown };
type Journal = { pending_journal: Array<{ id: string; symbol: string; side: string; filledAt: string }> };
type Goal = { goal: { targetThb: number; targetDate: string; monthlyContributionThb: number; dcaDay: number } | null; computed: { required_annual_return_pct: number | null } | null };

function marketClock() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(), h = et.getHours() + et.getMinutes() / 60;
  const open = day >= 1 && day <= 5 && h >= 9.5 && h < 16;
  const bkkOpen = new Date(et); bkkOpen.setHours(9, 30, 0, 0);
  const openIct = new Date(bkkOpen.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return { open, label: open ? "ตลาดสหรัฐเปิดอยู่" : day === 0 || day === 6 ? "ตลาดสหรัฐปิด (สุดสัปดาห์)" : `ตลาดสหรัฐเปิด ${openIct.getHours().toString().padStart(2, "0")}:${openIct.getMinutes().toString().padStart(2, "0")} ICT` };
}

export default function Home() {
  const { data: p, error: pErr } = useSWR<Portfolio>("/api/v1/portfolio?account=all", fetcher, { refreshInterval: 15_000 });
  const { data: t } = useSWR<Tickets>("/api/v1/tickets?status=proposed", fetcher, { refreshInterval: 30_000 });
  const { data: s } = useSWR<Scans>("/api/v1/scans", fetcher);
  const { data: j } = useSWR<Journal>("/api/v1/journal", fetcher);
  const { data: g } = useSWR<Goal>(p ? `/api/v1/goal?current_thb=${p.total_thb ?? ""}` : "/api/v1/goal", fetcher);
  const [clock, setClock] = useState<{ open: boolean; label: string; now: string } | null>(null);
  useEffect(() => { const tick = () => { const c = marketClock(); setClock({ ...c, now: `${new Date().toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} ICT` }); }; tick(); const id = setInterval(tick, 30_000); return () => clearInterval(id); }, []);
  const progress = g?.goal && p?.total_thb ? Math.min(100, (p.total_thb / g.goal.targetThb) * 100) : null;
  const latestRun = s?.runs?.length ? s.runs.reduce((a, b) => (a.runAt > b.runAt ? a : b)) : null;
  const newest = s?.runs?.flatMap((r) => r.results.slice(0, 1).map((x) => ({ ...x, model: r.modelKey }))).filter((x) => x.model !== "AVOID").slice(0, 3) ?? [];
  const staleAny = p?.holdings.some((h) => h.stale);
  return (
    <>
      <div className="mb-3"><Muted>{clock?.now ?? "…"}</Muted><div className="font-semibold">{clock?.label ?? ""}</div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/portfolio" className="block"><Card glow>
          <H2>พอร์ตรวม</H2>
          {pErr ? <Muted>โหลดพอร์ตไม่ได้: {String(pErr.message)}</Muted> : !p ? <Skeleton className="h-24" /> : (
            <>
              <div className="text-[34px] leading-tight font-semibold num">{usd(p.total_usd)}</div>
              <Muted className="num">≈ {thb(p.total_thb)}{p.fx ? ` · ${p.fx.rate.toFixed(2)} THB/USD` : ""}</Muted>
              <div className="my-2 flex gap-2 flex-wrap"><Delta pct={p.total_usd - p.cash_usd > 0 ? (p.pnl.unrealized_usd / Math.max(1, p.total_usd - p.cash_usd - p.pnl.unrealized_usd)) * 100 : null} abs={usd(p.pnl.unrealized_usd)} />{staleAny && <Chip tone="warn">ราคาค้าง</Chip>}{p.missing_quotes.length > 0 && <Chip tone="warn">ไม่มีราคา {p.missing_quotes.join(",")}</Chip>}</div>
              {g?.goal && <>
                <div className="flex justify-between text-[13px] text-slate-600 dark:text-slate-400"><span>เป้า {thb(g.goal.targetThb)} · {g.goal.targetDate}</span><span className="num">{progress != null ? progress.toFixed(1) + "%" : "—"}</span></div>
                <div className="h-2.5 rounded-full bg-slate-500/10 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${progress ?? 0}%` }} /></div>
                {g.computed?.required_annual_return_pct != null && <Muted className="mt-1 text-[13px]">ต้องได้ ≈ {g.computed.required_annual_return_pct}%/ปี</Muted>}
              </>}
              {p.holdings.length === 0 && <Muted className="mt-2">ยังไม่มีรายการ — ไปที่ &quot;พอร์ต&quot; แล้วบันทึกรายการแรก</Muted>}
              <Src>ราคา yahoo (ชั้น 2) · {fmtTime(p.holdings[0]?.quote_as_of)}</Src>
            </>
          )}
        </Card></Link>
        <Link href="/tickets" className="block"><Card>
          <H2>ตั๋วรอยืนยัน {t && t.tickets.length > 0 && <Chip tone="danger" className="ml-1">{t.tickets.length}</Chip>}</H2>
          {!t ? <Skeleton className="h-16" /> : t.tickets.length === 0 ? <Muted>ไม่มีตั๋วรอ — สร้างจากหน้าหุ้น หรือให้ agent เสนอผ่าน API</Muted> : t.tickets.slice(0, 3).map((x) => {
            const blocks = x.riskCheck.filter((c) => c.state === "block").length;
            return <div key={x.id} className="flex justify-between gap-2 py-1"><div className="min-w-0"><b>{x.side === "buy" ? "ซื้อ" : "ขาย"} {x.symbol}</b> {x.proposedBy === "agent" && <Chip tone="info">🤖 agent</Chip>}{x.tag && <Chip>{x.tag}</Chip>}<Muted className="num">{x.qty != null ? `${x.qty} หุ้น` : usd(x.notionalUsd)}</Muted></div>{blocks > 0 ? <Chip tone="danger">⛔ {blocks}</Chip> : <Chip tone="warn">หมดอายุ {fmtTime(x.expiresAt)}</Chip>}</div>;
          })}
        </Card></Link>
        <Link href="/scan" className="block"><Card>
          <H2>สแกนล่าสุด</H2>
          {!s ? <Skeleton className="h-16" /> : !latestRun ? <Muted>ยังไม่เคยรันสแกน — ไปหน้า &quot;สแกน&quot; แล้วกด &quot;รันตอนนี้&quot;</Muted> : (
            <>
              {newest.map((x) => <div key={x.model + x.symbol} className="flex justify-between"><span><b>{x.symbol}</b> <Muted className="inline">{x.model}</Muted></span><span className="num">{x.score}</span></div>)}
              <Src>รัน {fmtTime(latestRun.runAt)}</Src>
            </>
          )}
        </Card></Link>
        {j && j.pending_journal.length > 0 && <Card className="ring-1 ring-amber-400/40">
          <H2>สมุดบันทึกค้าง</H2>
          {j.pending_journal.slice(0, 3).map((x) => <div key={x.id} className="flex justify-between items-center gap-3 py-1"><span>{x.side === "buy" ? "ซื้อ" : "ขาย"} <b>{x.symbol}</b> สำเร็จ {fmtTime(x.filledAt)} — ยังไม่ได้บันทึก</span><Link href={`/journal?ticket=${x.id}&symbol=${x.symbol}`}><Btn small>บันทึก</Btn></Link></div>)}
        </Card>}
        {g?.goal && <Card><H2>รอบ DCA ถัดไป</H2><div className="flex justify-between"><span>💵 วันที่ {g.goal.dcaDay} ของทุกเดือน</span><span className="num">{thb(g.goal.monthlyContributionThb)}</span></div><Muted>สร้างตั๋วชุด DCA ได้จากหน้า &quot;เป้า / DCA&quot;</Muted></Card>}
      </div>
      <Muted className="mt-6 text-[13px]">ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต · ใช้ส่วนตัว · ราคาชั้น 2 อาจดีเลย์</Muted>
    </>
  );
}
