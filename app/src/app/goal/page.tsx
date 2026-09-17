"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, api } from "@/components/shell";
import { Card, H2, Muted, Btn, Field, inputCls, Empty, Skeleton, Banner, thb, cx } from "@/components/ui";

type G = { goal: { targetThb: number; targetDate: string; startAmountThb: number; monthlyContributionThb: number; dcaDay: number; allocation: { core: number; satellite: number; income: number; cash: number }; scenarioReturns: { low: number | null; mid: number | null; high: number | null } } | null; computed: { years: number; required_annual_return_pct: number | null; start_used_thb: number; paths: Record<string, number[] | null>; note: string } | null };
type P = { total_thb: number | null };

export default function GoalPage() {
  const { data: p } = useSWR<P>("/api/v1/portfolio?account=all", fetcher);
  const { data, mutate } = useSWR<G>(`/api/v1/goal${p?.total_thb ? `?current_thb=${p.total_thb}` : ""}`, fetcher);
  const defaults = { targetThb: "3000000", targetDate: "2035-12-31", startAmountThb: "", monthlyContributionThb: "3000", dcaDay: "25", core: "70", satellite: "20", income: "5", cash: "5", low: "", mid: "", high: "" };
  const fromGoal = (g: NonNullable<G["goal"]>) => ({ targetThb: String(g.targetThb), targetDate: g.targetDate, startAmountThb: String(g.startAmountThb), monthlyContributionThb: String(g.monthlyContributionThb), dcaDay: String(g.dcaDay), core: String(g.allocation.core), satellite: String(g.allocation.satellite), income: String(g.allocation.income), cash: String(g.allocation.cash), low: g.scenarioReturns.low?.toString() ?? "", mid: g.scenarioReturns.mid?.toString() ?? "", high: g.scenarioReturns.high?.toString() ?? "" });
  const [edit, setEdit] = useState<typeof defaults | null>(null);
  const f = edit ?? (data?.goal ? fromGoal(data.goal) : defaults);
  const setF = (v: typeof defaults) => setEdit(v);
  const [now] = useState(() => Date.now());
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => { setMsg(null); try { await api("/api/v1/goal", { method: "PUT", json: { targetThb: Number(f.targetThb), targetDate: f.targetDate, startAmountThb: Number(f.startAmountThb) || p?.total_thb || 0, monthlyContributionThb: Number(f.monthlyContributionThb), dcaDay: Number(f.dcaDay) || 25, allocation: { core: +f.core, satellite: +f.satellite, income: +f.income, cash: +f.cash }, scenarioReturns: { low: f.low ? +f.low : null, mid: f.mid ? +f.mid : null, high: f.high ? +f.high : null } } }); setMsg("บันทึกแล้ว"); mutate(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  // live preview of required return using local inputs
  const years = Math.max(0.1, (new Date(f.targetDate).getTime() - now) / (365.25 * 86400e3));
  const start = Number(f.startAmountThb) || p?.total_thb || 0;
  const req = (() => { const target = Number(f.targetThb), monthly = Number(f.monthlyContributionThb); if (!target) return null; const fv = (r: number) => { const m = Math.pow(1 + r, 1 / 12) - 1, n = Math.round(years * 12); return start * Math.pow(1 + r, years) + (m === 0 ? monthly * n : monthly * ((Math.pow(1 + m, n) - 1) / m)); }; if (fv(0) >= target) return 0; let lo = 0, hi = 5; if (fv(hi) < target) return null; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (fv(mid) < target) lo = mid; else hi = mid; } return (lo + hi) / 2; })();
  const c = data?.computed;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card><H2>เป้าหมาย</H2>
        <Field label="ยอดเป้า (บาท)"><input className={cx(inputCls, "num")} inputMode="numeric" value={f.targetThb} onChange={(e) => setF({ ...f, targetThb: e.target.value })} /></Field>
        <Field label="วันเป้า"><input className={inputCls} type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="เงินตั้งต้น (บาท)" hint={p?.total_thb ? `ว่าง = ใช้พอร์ตตอนนี้ ${thb(p.total_thb)}` : undefined}><input className={cx(inputCls, "num")} inputMode="numeric" value={f.startAmountThb} onChange={(e) => setF({ ...f, startAmountThb: e.target.value })} /></Field><Field label="เติมต่อเดือน (บาท)"><input className={cx(inputCls, "num")} inputMode="numeric" value={f.monthlyContributionThb} onChange={(e) => setF({ ...f, monthlyContributionThb: e.target.value })} /></Field><Field label="วัน DCA"><input className={cx(inputCls, "num")} inputMode="numeric" value={f.dcaDay} onChange={(e) => setF({ ...f, dcaDay: e.target.value })} /></Field></div>
        <div className="grid grid-cols-4 gap-2">{(["core", "satellite", "income", "cash"] as const).map((k) => <Field key={k} label={{ core: "แกน%", satellite: "ดาวเทียม%", income: "รายได้%", cash: "เงินสด%" }[k]}><input className={cx(inputCls, "num")} inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
        <Btn block variant="primary" onClick={save}>บันทึกเป้า</Btn>{msg && <Muted className="mt-2">{msg}</Muted>}
      </Card>
      <Card glow><H2>ต้องได้ผลตอบแทนเท่าไร</H2>
        <div className="text-[34px] leading-tight font-semibold num bg-gradient-to-r from-emerald-700 to-teal-700 dark:from-emerald-300 dark:to-teal-200 bg-clip-text text-transparent">{req == null ? "ไปไม่ถึง" : `≈ ${(req * 100).toFixed(1)}% / ปี`}</div>
        <Muted>เริ่ม {thb(start)} · เติม {thb(Number(f.monthlyContributionThb))}/เดือน · {years.toFixed(1)} ปี — ถ้าตัวเลขนี้สูงกว่าที่ตลาดให้ตามประวัติ (agent ดึงตัวเลขจริงมาเทียบ) คันโยกคือ &quot;เติมเพิ่ม&quot; หรือ &quot;ยืดเวลา&quot; ไม่ใช่ &quot;เสี่ยงเพิ่ม&quot;</Muted>
        <Field label={<span>ลองเติมเพิ่ม: <b className="num text-slate-900 dark:text-slate-100">{thb(Number(f.monthlyContributionThb))}</b>/เดือน</span>}><input type="range" className="w-full" min="500" max="50000" step="500" value={Number(f.monthlyContributionThb) || 0} onChange={(e) => setF({ ...f, monthlyContributionThb: e.target.value })} /></Field>
        <Field label={<span>ลองยืดเวลา: <b className="text-slate-900 dark:text-slate-100">{years.toFixed(1)}</b> ปี</span>}><input type="range" className="w-full" min="3" max="30" step="0.5" value={years} onChange={(e) => { const d = new Date(now); d.setMonth(d.getMonth() + Math.round(+e.target.value * 12)); setF({ ...f, targetDate: d.toISOString().slice(0, 10) }); }} /></Field>
        <Muted className="text-[13px]">สูตร: หาอัตรา r ที่ทำให้ FV(เงินตั้งต้น) + FV(เงินเติมรายเดือน) = เป้า</Muted>
      </Card>
      <Card><H2>เส้นทาง 3 ฉากทัศน์</H2>
        <Muted>กรอกผลตอบแทนสมมติเอง (ระบบไม่ใส่ตัวเลขประวัติศาสตร์ให้)</Muted>
        <div className="grid grid-cols-3 gap-2 mt-2">{(["low", "mid", "high"] as const).map((k) => <Field key={k} label={{ low: "ต่ำ %", mid: "กลาง %", high: "สูง %" }[k]}><input className={cx(inputCls, "num")} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={{ low: "4", mid: "8", high: "12" }[k]} /></Field>)}</div>
        {!data ? <Skeleton className="h-32" /> : !c || !c.paths.low || !c.paths.mid || !c.paths.high ? <Empty>กรอกครบ 3 ค่าแล้วกด &quot;บันทึกเป้า&quot; กราฟจะแสดง</Empty> : <PathChart paths={c.paths as Record<string, number[]>} target={Number(f.targetThb)} />}
        <Btn block className="mt-2" disabled title="เฟสถัดไป">สร้างตั๋วชุด DCA เดือนนี้ (เร็ว ๆ นี้)</Btn>
        {c && <Muted className="text-[13px] mt-2">{c.note}</Muted>}
        <Banner tone="info">ตัวเลขทั้งหมดเป็นการคำนวณจากสิ่งที่ผู้ใช้กรอก ไม่ใช่การพยากรณ์</Banner>
      </Card>
    </div>
  );
}
function PathChart({ paths, target }: { paths: Record<string, number[]>; target: number }) {
  const W = 320, H = 160, pad = 28;
  const n = Math.max(...Object.values(paths).map((p) => p.length));
  const max = Math.max(target, ...Object.values(paths).flat());
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad - 6), y = (v: number) => H - 14 - (v / max) * (H - 24);
  const col = { low: "#D97706", mid: "#16A34A", high: "#0284C7" } as Record<string, string>;
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44 block mt-2" role="img" aria-label="เส้นทางมูลค่าพอร์ต 3 ฉากทัศน์"><line x1={pad} y1={y(target)} x2={W - 6} y2={y(target)} className="stroke-slate-500" strokeDasharray="4 3" /><text x={pad} y={y(target) - 3} fontSize="10" className="fill-slate-600 dark:fill-slate-400">เป้า</text>{Object.entries(paths).map(([k, p]) => <polyline key={k} fill="none" stroke={col[k]} strokeWidth="2" points={p.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />)}<g fontSize="10" className="fill-slate-600 dark:fill-slate-400"><text x={2} y={y(max) + 8}>{(max / 1e6).toFixed(1)}M</text><text x={2} y={H - 14}>0</text></g></svg>;
}
