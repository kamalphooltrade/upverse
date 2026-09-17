"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api } from "@/components/shell";
import { Card, H2, Muted, Chip, Btn, Tabs, Ring, Delta, Empty, Skeleton, Banner, StarIcon, RefreshIcon, fmtTime } from "@/components/ui";

type Run = { id: string; modelKey: string; modelVersion: string; runAt: string; universeSize: number; passedCount: number; excludedMissing: string[]; status: string; note: string; results: Array<{ rank: number; symbol: string; name: string; score: number; scoreParts: Record<string, number>; metrics: Record<string, number | string | null>; why: string; flags: string[]; price: number; changePct: number }> };
type Scans = { models: Array<{ key: string; name: string }>; extra: Array<{ key: string; name: string }>; runs: Run[]; available_dates: string[]; running: { done: number; total: number; phase: string } | null };

export default function ScanPage() {
  const { data, mutate } = useSWR<Scans>("/api/v1/scans", fetcher, { refreshInterval: 10_000 });
  const [model, setModel] = useState("M1");
  const [localBusy, setBusy] = useState(false);
  const busy = localBusy || !!data?.running;
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const run = data?.runs.find((r) => r.modelKey === model);
  const tabs = [...(data?.models ?? []).map((m) => ({ key: m.key, label: `${m.key} ${m.name}` })), ...(data?.extra ?? []).map((m) => ({ key: m.key, label: (m.key === "AVOID" ? "⛔ " : "✦ ") + m.name }))];
  const startScan = async (limit?: number) => {
    setBusy(true); setMsg(limit ? `กำลังรันแบบเร็ว (${limit} ตัวแรก)…` : "กำลังรันทั้งจักรวาล S&P 500 (ราคา ~2 นาที · งบ EDGAR ~5 นาที)…");
    try { const r = await api<{ seconds: number; runs: Array<{ model: string; passed: number }> }>("/api/v1/scans/run", { method: "POST", json: limit ? { limit } : {} }); setMsg(`เสร็จใน ${r.seconds} วิ · ผ่านตะแกรง: ${r.runs.map((x) => `${x.model} ${x.passed}`).join(" · ")}`); mutate(); }
    catch (e) { setMsg("ล้มเหลว: " + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  };
  const addWatch = async (symbol: string) => { await api("/api/v1/watchlist", { method: "POST", json: { symbol, reason: `จากสแกน ${model}`, fromModel: model } }); setMsg(`เพิ่ม ${symbol} ใน watchlist แล้ว`); };
  return (
    <>
      <Tabs items={tabs} active={model} onChange={setModel} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Muted>{run ? `รัน ${fmtTime(run.runAt)} · จักรวาล ${run.universeSize} · ผ่านตะแกรง ${run.passedCount} · โมเดล v${run.modelVersion}${run.status === "partial" ? " · (รันบางส่วน)" : ""}` : "ยังไม่มีผลสแกนของโมเดลนี้"}</Muted>
          <div className="flex gap-2 flex-wrap"><Btn small disabled={busy} onClick={() => startScan(60)}><RefreshIcon className="w-4 h-4" /> รันเร็ว (60 ตัว)</Btn><Btn small variant="primary" disabled={busy} onClick={() => startScan()}>รันทั้ง S&amp;P 500</Btn></div>
        </div>
        {data?.running && <Banner tone="info">กำลังรัน: {data.running.phase} {data.running.done}/{data.running.total}</Banner>}
        {msg && <Muted className="mt-2">{msg}</Muted>}
        {run && <Muted className="text-[13px] mt-1">{run.note}</Muted>}
      </Card>
      <Card>
        <H2>{tabs.find((t) => t.key === model)?.label} — Top 10</H2>
        {!data ? <Skeleton className="h-40" /> : !run ? <Empty>กด &quot;รันเร็ว&quot; เพื่อลองกับ 60 ตัวแรก หรือ &quot;รันทั้ง S&amp;P 500&quot; (ใช้เวลาหลายนาที)</Empty> : run.results.length === 0 ? <Empty>ไม่มีตัวที่ผ่านตะแกรงในรอบนี้ — เป็นเรื่องปกติของโมเดลที่เข้ม (ไม่ประมาณค่าแทน)</Empty> : run.results.map((r) => (
          <div key={r.symbol} className="grid grid-cols-[28px_minmax(0,1fr)_56px] gap-3 items-start py-3.5 border-t first:border-t-0 border-slate-900/10 dark:border-white/10">
            <div className="font-bold text-slate-600 dark:text-slate-400 pt-1">{r.rank}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Link href={`/stock/${r.symbol}`} className="font-bold">{r.symbol}</Link><Muted className="inline">{r.name}</Muted><Delta pct={r.changePct} /></div>
              <div className="flex flex-wrap gap-1.5 my-1">{Object.entries(r.metrics).slice(0, 4).map(([k, v]) => <span key={k} className="text-[13px] px-2 py-0.5 rounded-lg bg-slate-500/10 dark:bg-white/10">{k} {v ?? "—"}</span>)}</div>
              <div className="text-[15px] text-slate-600 dark:text-slate-400 mb-1 [overflow-wrap:anywhere]">{r.why}</div>
              {r.flags.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{r.flags.map((f) => <Chip key={f} tone="warn">{f}</Chip>)}</div>}
              <div className="flex flex-wrap gap-2"><Link href={`/stock/${r.symbol}`}><Btn small>ดูหุ้น</Btn></Link><Btn small onClick={() => addWatch(r.symbol)}><StarIcon className="w-4 h-4" /> Watchlist</Btn><Btn small variant="ghost" onClick={() => setOpen(open === r.symbol ? null : r.symbol)}>{open === r.symbol ? "ซ่อนคะแนน" : "องค์ประกอบคะแนน"}</Btn></div>
              {open === r.symbol && <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(r.scoreParts).map(([k, v]) => <span key={k} className="text-[13px] px-2 py-0.5 rounded-lg bg-emerald-500/10 num">{k} +{v}</span>)}</div>}
            </div>
            <Ring v={Math.min(100, r.score)} />
          </div>
        ))}
        {run && run.excludedMissing.length > 0 && <details className="mt-3 text-[13px] text-slate-600 dark:text-slate-400"><summary className="cursor-pointer">ตัดออกเพราะข้อมูลไม่ครบ/สภาพคล่องต่ำ ({run.excludedMissing.length}) — ไม่ประมาณค่าแทน</summary><div className="mt-1 [overflow-wrap:anywhere]">{run.excludedMissing.slice(0, 80).join(" · ")}{run.excludedMissing.length > 80 ? " · …" : ""}</div></details>}
      </Card>
      <Muted className="mt-4 text-[13px]">ผลสแกน = ตะแกรงเชิงกล ไม่ใช่คำแนะนำ · ก่อนตั๋วต้องมี thesis + วง persona (agent upverse-advisor)</Muted>
    </>
  );
}
