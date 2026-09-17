"use client";
// Candlestick chart from real daily bars. Straight segments only (no spline). Single y-axis. Crosshair tooltip.
import { useMemo, useState } from "react";
import type { Bar } from "@/lib/types";

const PAL = { ema20: "#D97706", sma50: "#0284C7", sma200: "#7C3AED", vol: "#94A3B8" };

export function Candles({ bars, ema20, sma50, sma200, rsi14, height = 300 }: { bars: Bar[]; ema20: (number | null)[]; sma50: (number | null)[]; sma200: (number | null)[]; rsi14: (number | null)[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 46, padR = 8, top = 10, priceH = Math.round(H * 0.6), volH = Math.round(H * 0.14), rsiH = Math.round(H * 0.18), gap = 6;
  const n = bars.length;
  const geo = useMemo(() => {
    if (!n) return null;
    const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h));
    const pad = (hi - lo) * 0.05;
    const yMin = lo - pad, yMax = hi + pad;
    const x = (i: number) => padL + ((i + 0.5) / n) * (W - padL - padR);
    const y = (v: number) => top + ((yMax - v) / (yMax - yMin)) * priceH;
    const vMax = Math.max(...bars.map((b) => b.v)) || 1;
    const volTop = top + priceH + gap;
    const yv = (v: number) => volTop + volH - (v / vMax) * volH;
    const rsiTop = volTop + volH + gap;
    const yr = (v: number) => rsiTop + rsiH - (v / 100) * rsiH;
    const cw = Math.max(1.5, ((W - padL - padR) / n) * 0.6);
    const ticks = [yMax, (yMax + yMin) / 2, yMin].map((v) => ({ v, y: y(v) }));
    return { x, y, yv, yr, cw, ticks, volTop, rsiTop };
  }, [bars, n, priceH, volH, rsiH, top]);
  if (!geo || !n) return <div className="text-[14px] text-slate-500 py-8 text-center">ไม่มีข้อมูลราคา</div>;
  const line = (arr: (number | null)[]) => arr.map((v, i) => (v == null ? null : `${geo.x(i).toFixed(1)},${geo.y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX == null) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * n - 0.5);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover != null ? bars[hover] : null;
  const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height }} role="img" aria-label="กราฟแท่งเทียนรายวัน พร้อม EMA20 SMA50 SMA200 ปริมาณ และ RSI14" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
        <g className="stroke-slate-900/10 dark:stroke-white/10">{geo.ticks.map((t) => <line key={t.y} x1={padL} y1={t.y} x2={W - padR} y2={t.y} />)}<line x1={padL} y1={geo.yr(70)} x2={W - padR} y2={geo.yr(70)} strokeDasharray="3 3" /><line x1={padL} y1={geo.yr(30)} x2={W - padR} y2={geo.yr(30)} strokeDasharray="3 3" /></g>
        <g className="fill-slate-600 dark:fill-slate-400 num" fontSize="11">{geo.ticks.map((t) => <text key={t.y} x={2} y={t.y + 4}>{t.v.toFixed(0)}</text>)}<text x={2} y={geo.yr(70) + 4}>70</text><text x={2} y={geo.yr(30) + 4}>30</text><text x={2} y={geo.volTop + 11}>Vol</text></g>
        {bars.map((b, i) => <rect key={"v" + i} x={geo.x(i) - geo.cw / 2} y={geo.yv(b.v)} width={geo.cw} height={geo.volTop + volH - geo.yv(b.v)} fill={PAL.vol} opacity=".5" />)}
        <polyline fill="none" stroke={PAL.sma200} strokeWidth="1.8" points={line(sma200)} />
        <polyline fill="none" stroke={PAL.sma50} strokeWidth="1.8" points={line(sma50)} />
        <polyline fill="none" stroke={PAL.ema20} strokeWidth="1.8" points={line(ema20)} />
        {bars.map((b, i) => { const up = b.c >= b.o; const cls = up ? "stroke-green-700 dark:stroke-green-400" : "stroke-red-700 dark:stroke-red-400"; return <g key={i} className={cls}><line x1={geo.x(i)} y1={geo.y(b.h)} x2={geo.x(i)} y2={geo.y(b.l)} strokeWidth="1" /><rect x={geo.x(i) - geo.cw / 2} y={Math.min(geo.y(b.o), geo.y(b.c))} width={geo.cw} height={Math.max(1, Math.abs(geo.y(b.o) - geo.y(b.c)))} strokeWidth="1" className={up ? "fill-green-700 dark:fill-green-400" : "fill-white dark:fill-slate-900"} /></g>; })}
        <polyline fill="none" className="stroke-slate-500" strokeWidth="1.5" points={rsi14.map((v, i) => (v == null ? null : `${geo.x(i).toFixed(1)},${geo.yr(v).toFixed(1)}`)).filter(Boolean).join(" ")} />
        {hover != null && <line x1={geo.x(hover)} y1={top} x2={geo.x(hover)} y2={geo.rsiTop + rsiH} className="stroke-slate-500" strokeDasharray="3 3" />}
      </svg>
      {h && <div className="absolute top-1 left-12 text-[12px] px-2 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-900/10 dark:border-white/10 num pointer-events-none">{h.date} · O {fmt(h.o)} H {fmt(h.h)} L {fmt(h.l)} C {fmt(h.c)} · Vol {(h.v / 1e6).toFixed(2)}M · RSI {fmt(rsi14[hover!])}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px] text-slate-600 dark:text-slate-400"><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: PAL.ema20 }} />EMA20</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: PAL.sma50 }} />SMA50</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: PAL.sma200 }} />SMA200</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: PAL.vol }} />ปริมาณ</span><span>เส้นล่าง = RSI14</span></div>
    </div>
  );
}
