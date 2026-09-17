"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api } from "@/components/shell";
import { Card, H2, Muted, Chip, Btn, Field, inputCls, Empty, Skeleton, Banner, XIcon, PlusIcon, usd, cx } from "@/components/ui";

type W = { id: string; symbol: string; reason: string; zoneLow: number | null; zoneHigh: number | null; stop: number | null; note: string; fromModel: string | null; price: number | null; zone: string | null; distance_pct: number | null };

export default function WatchlistPage() {
  const { data, mutate } = useSWR<{ watchlist: W[] }>("/api/v1/watchlist", fetcher, { refreshInterval: 15_000 });
  const [f, setF] = useState({ symbol: "", zoneLow: "", zoneHigh: "", stop: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const add = async () => { setErr(null); try { await api("/api/v1/watchlist", { method: "POST", json: { symbol: f.symbol.trim().toUpperCase(), zoneLow: Number(f.zoneLow) || null, zoneHigh: Number(f.zoneHigh) || null, stop: Number(f.stop) || null, reason: f.reason } }); setF({ symbol: "", zoneLow: "", zoneHigh: "", stop: "", reason: "" }); mutate(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  return (
    <>
      <Card className="mb-4"><H2>Watchlist ({data?.watchlist.length ?? 0})</H2>
        {!data ? <Skeleton className="h-24" /> : data.watchlist.length === 0 ? <Empty>ยังไม่มี — เพิ่มจากหน้าสแกน/หุ้น หรือฟอร์มด้านล่าง</Empty> : data.watchlist.map((w) => (
          <div key={w.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center py-3 border-t first:border-t-0 border-slate-900/10 dark:border-white/10">
            <div className="w-11 h-11 rounded-2xl grid place-items-center text-[12px] font-bold bg-gradient-to-br from-slate-500/15 to-slate-500/5 dark:from-white/15 dark:to-white/5">{w.symbol.slice(0, 4)}</div>
            <div className="min-w-0"><Link href={`/stock/${w.symbol}`} className="font-bold">{w.symbol}</Link> {w.zone && <Chip tone={w.zone === "ในโซน" ? "up" : w.zone === "สูงกว่าโซน" ? "warn" : "neutral"}>{w.zone}{w.distance_pct ? ` ${w.distance_pct > 0 ? "+" : ""}${w.distance_pct}%` : ""}</Chip>}<Muted>{w.fromModel ? `จาก ${w.fromModel} · ` : ""}{w.zoneLow != null ? `โซน ${w.zoneLow}–${w.zoneHigh}` : "ไม่ได้ตั้งโซน"}{w.stop != null ? ` · ตัดขาดทุน ${w.stop}` : ""} {w.reason}</Muted></div>
            <div className="text-right flex items-center gap-2"><span className="num">{usd(w.price)}</span><button aria-label="ลบ" className="min-h-[44px] min-w-[44px] grid place-items-center rounded-2xl text-red-700 dark:text-red-400 cursor-pointer" onClick={async () => { await api(`/api/v1/watchlist?symbol=${w.symbol}`, { method: "DELETE" }); mutate(); }}><XIcon className="w-4 h-4" /></button></div>
          </div>
        ))}
      </Card>
      <Card><H2>เพิ่ม / แก้โซน</H2>
        <div className="grid grid-cols-2 gap-3"><Field label="สัญลักษณ์"><input className={cx(inputCls, "uppercase")} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} /></Field><Field label="เหตุผล"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field><Field label="โซนเข้า ต่ำ"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.zoneLow} onChange={(e) => setF({ ...f, zoneLow: e.target.value })} /></Field><Field label="โซนเข้า สูง"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.zoneHigh} onChange={(e) => setF({ ...f, zoneHigh: e.target.value })} /></Field><Field label="ตัดขาดทุน"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.stop} onChange={(e) => setF({ ...f, stop: e.target.value })} /></Field></div>
        {err && <Banner tone="danger">{err}</Banner>}
        <Btn variant="primary" disabled={!f.symbol} onClick={add}><PlusIcon className="w-4 h-4" /> บันทึก</Btn>
        <Muted className="mt-2 text-[13px]">แจ้งเตือน LINE (เข้าโซน/หลุดระดับ/วันงบ) = งานเฟส 1.5 — ตอนนี้ดูสถานะโซนในหน้านี้และหน้าหลัก</Muted>
      </Card>
    </>
  );
}
