"use client";
// UI primitives — DESIGN.md v0.2 §6.1 (gradient + rounded + glass). All touch targets ≥ 44px.
import React from "react";

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

export function Card({ children, className, glow, onClick, as: Tag = "div" }: { children: React.ReactNode; className?: string; glow?: boolean; onClick?: () => void; as?: "div" | "section" }) {
  return (
    <Tag onClick={onClick} className={cx("rounded-3xl p-px bg-gradient-to-br from-white/80 via-white/40 to-white/10 dark:from-white/15 dark:via-white/[.06] dark:to-white/[.02] shadow-[var(--shadow-soft)] dark:shadow-[var(--shadow-softdark)] transition-transform duration-300 ease-out", onClick && "cursor-pointer hover:-translate-y-0.5", className)}>
      <div className="relative overflow-hidden rounded-[23px] bg-white/85 dark:bg-slate-900/70 backdrop-blur-xl p-4 h-full min-w-0">
        {glow && <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-gradient-to-br from-emerald-400/25 via-teal-400/15 to-sky-400/20 blur-3xl" />}
        <div className="relative min-w-0">{children}</div>
      </div>
    </Tag>
  );
}
export const H2 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-2"><h2 className="text-[15px] font-semibold">{children}</h2>{right}</div>
);
export const Muted = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cx("text-[14px] text-slate-600 dark:text-slate-400", className)}>{children}</div>;
export const Src = ({ children }: { children: React.ReactNode }) => <div className="mt-2 inline-flex items-center gap-1 text-[13px] text-slate-600 dark:text-slate-400"><ClockIcon className="w-3.5 h-3.5" />{children}</div>;

const tones = {
  up: "text-green-700 bg-green-600/10 dark:text-green-400 dark:bg-green-400/10",
  down: "text-red-700 bg-red-600/10 dark:text-red-400 dark:bg-red-400/10",
  warn: "text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-400/15",
  info: "text-blue-800 bg-blue-100 dark:text-sky-300 dark:bg-sky-400/15",
  neutral: "text-slate-600 bg-slate-500/10 dark:text-slate-300 dark:bg-white/10",
  danger: "text-white bg-gradient-to-r from-red-700 to-rose-700",
} as const;
export type Tone = keyof typeof tones;
export const Chip = ({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) => (
  <span className={cx("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[13px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>
);
export const Delta = ({ pct, abs }: { pct: number | null | undefined; abs?: string }) => {
  if (pct == null) return <Chip>—</Chip>;
  const up = pct >= 0;
  return <Chip tone={up ? "up" : "down"}>{up ? "▲ +" : "▼ −"}{abs ? abs + " · " : ""}{Math.abs(pct).toFixed(2)}%</Chip>;
};

export function Btn({ variant = "default", className, children, block, small, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "default" | "ghost" | "danger"; block?: boolean; small?: boolean }) {
  const v = {
    primary: "bg-gradient-to-r from-emerald-700 to-teal-700 text-white dark:from-emerald-400 dark:to-teal-300 dark:text-emerald-950 shadow-[var(--shadow-glow)] border-transparent",
    default: "bg-white/70 dark:bg-white/5 text-slate-900 dark:text-slate-100 border-slate-900/10 dark:border-white/10",
    ghost: "bg-transparent text-slate-700 dark:text-slate-200 border-transparent",
    danger: "bg-gradient-to-r from-red-700 to-rose-700 text-white border-transparent",
  }[variant];
  return <button {...rest} className={cx("inline-flex items-center justify-center gap-2 rounded-2xl border font-semibold transition-all duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer", small ? "min-h-[44px] px-3 text-[14px]" : "min-h-[44px] px-4", block && "w-full", v, className)}>{children}</button>;
}

export function Tabs({ items, active, onChange }: { items: Array<{ key: string; label: string }>; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto hidescroll max-w-full min-w-0 pb-1 mb-3" role="tablist">
      {items.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === active} onClick={() => onChange(t.key)} className={cx("flex-none min-h-[44px] px-4 rounded-full border text-[15px] font-semibold transition-all duration-300 cursor-pointer", t.key === active ? "bg-gradient-to-r from-emerald-700 to-teal-700 dark:from-emerald-400 dark:to-teal-300 text-white dark:text-emerald-950 border-transparent shadow-[var(--shadow-glow)]" : "bg-white/70 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-900/10 dark:border-white/10")}>{t.label}</button>
      ))}
    </div>
  );
}
export const Ring = ({ v }: { v: number }) => (
  <div className="w-14 h-14 rounded-full grid place-items-center flex-none" style={{ background: `conic-gradient(#059669 0%, #14B8A6 ${v}%, rgba(148,163,184,.25) ${v}%)` }}>
    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 grid place-items-center text-[14px] font-semibold num">{v}</div>
  </div>
);
export const Field = ({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) => (
  <label className="block mb-3 min-w-0"><div className="text-[14px] text-slate-600 dark:text-slate-400 mb-1">{label}</div>{children}{hint && <div className="text-[13px] text-slate-500 dark:text-slate-500 mt-1">{hint}</div>}</label>
);
export const inputCls = "w-full min-w-0 min-h-[46px] px-3 rounded-2xl border border-slate-900/10 dark:border-white/10 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 transition-shadow focus:shadow-[var(--shadow-glow)]";
export const KV = ({ rows }: { rows: Array<[React.ReactNode, React.ReactNode]> }) => (
  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[15px]">{rows.map(([k, v], i) => <React.Fragment key={i}><dt className="text-slate-600 dark:text-slate-400">{k}</dt><dd className="text-right num">{v}</dd></React.Fragment>)}</dl>
);
export function Toggle<T extends string>({ items, value, onChange }: { items: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-slate-500/10 dark:bg-white/10 max-w-full">
      {items.map(([k, label]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={cx("min-h-[44px] min-w-[44px] px-3 rounded-full text-[14px] font-semibold transition-all duration-300 cursor-pointer", value === k ? "bg-white dark:bg-slate-900 shadow-[var(--shadow-soft)] text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300")}>{label}</button>)}
    </div>
  );
}
export const Check = ({ state, children }: { state: "ok" | "warn" | "block"; children: React.ReactNode }) => {
  const m = { ok: ["✅", "text-green-700 dark:text-green-400"], warn: ["⚠", "text-amber-800 dark:text-amber-300"], block: ["⛔", "text-red-700 dark:text-red-400"] }[state];
  return <div className="flex gap-3 py-2 border-t first:border-t-0 border-slate-900/10 dark:border-white/10 text-[15px]"><b className={cx("flex-none w-7", m[1])}>{m[0]}</b><div className="min-w-0">{children}</div></div>;
};
export const Banner = ({ tone = "warn", children }: { tone?: "warn" | "info" | "danger"; children: React.ReactNode }) => (
  <div className={cx("flex gap-3 items-start p-3 mb-4 rounded-2xl text-[15px] border", tone === "warn" && "bg-amber-100 dark:bg-amber-400/15 text-amber-800 dark:text-amber-300 border-amber-400/30", tone === "info" && "bg-blue-100 dark:bg-sky-400/15 text-blue-800 dark:text-sky-300 border-sky-400/30", tone === "danger" && "bg-red-100 dark:bg-red-400/15 text-red-800 dark:text-red-300 border-red-400/30")}><AlertIcon className="w-5 h-5 flex-none mt-1" /><div className="min-w-0">{children}</div></div>
);
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="text-center py-7 text-slate-600 dark:text-slate-400"><TrendIcon className="w-10 h-10 mx-auto mb-2 opacity-70" /><div>{children}</div></div>;
export const Skeleton = ({ className }: { className?: string }) => <div className={cx("animate-pulse rounded-2xl bg-slate-500/10 dark:bg-white/10", className)} />;

export const usd = (n: number | null | undefined, dp = 2) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const thb = (n: number | null | undefined) => (n == null ? "—" : `฿${Math.round(n).toLocaleString("en-US")}`);
export const pctf = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
export const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—");

// ---- icons (Lucide-style inline) ----
type IP = React.SVGProps<SVGSVGElement>;
export const HomeIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
export const ChartIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>;
export const SearchIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
export const TicketIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /></svg>;
export const MoreIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>;
export const MoonIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>;
export const ClockIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const PlusIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
export const StarIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z" /></svg>;
export const AlertIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
export const CheckIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>;
export const XIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const TrendIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
export const ShieldIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z" /></svg>;
export const RefreshIcon = (p: IP) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>;
