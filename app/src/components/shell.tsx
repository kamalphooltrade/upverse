"use client";
import React, { useEffect, useState, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { cx, Chip, HomeIcon, ChartIcon, SearchIcon, TicketIcon, MoreIcon, MoonIcon } from "./ui";

export const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j?.error?.message ?? r.statusText), { status: r.status, body: j });
  return j;
};
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message ?? r.statusText), { status: r.status, body: j });
  return j as T;
}

type Health = { trading: { environment: "uat" | "prod"; api_rail_possible: boolean }; owner_auth: string; broker: { status: string }; counts: { tickets: number } };
const HealthCtx = createContext<{ health: Health | null; refresh: () => void }>({ health: null, refresh: () => {} });
export const useHealth = () => useContext(HealthCtx);

const NAV = [
  { href: "/", label: "หน้าหลัก", Icon: HomeIcon },
  { href: "/portfolio", label: "พอร์ต", Icon: ChartIcon },
  { href: "/scan", label: "สแกน", Icon: SearchIcon },
  { href: "/tickets", label: "ตั๋ว", Icon: TicketIcon },
  { href: "/settings", label: "เพิ่มเติม", Icon: MoreIcon },
];
const SIDE: Array<[string, string] | null> = [["/", "หน้าหลัก"], ["/portfolio", "พอร์ต"], ["/scan", "สแกน"], ["/watchlist", "Watchlist"], ["/tickets", "ตั๋วคำสั่ง"], null, ["/journal", "สมุดบันทึก"], ["/goal", "เป้า / DCA"], ["/settings", "ตั้งค่า"]];
const TITLES: Record<string, string> = { "/": "หน้าหลัก", "/portfolio": "พอร์ต", "/scan": "สแกน Top 10", "/watchlist": "Watchlist", "/tickets": "ตั๋วคำสั่ง", "/journal": "สมุดบันทึก", "/goal": "เป้า / DCA", "/settings": "ตั้งค่า", "/login": "เข้าสู่ระบบ" };

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: health, mutate } = useSWR<Health>("/api/v1/health", fetcher, { refreshInterval: 60_000 });
  const { data: tickets } = useSWR<{ count: number }>("/api/v1/tickets?status=proposed", fetcher, { refreshInterval: 30_000 });
  const [theme, setTheme] = useState<"auto" | "dark" | "light">(() => { try { return (localStorage.getItem("upv-theme") as "auto" | "dark" | "light") || "auto"; } catch { return "auto"; } });
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "auto" && mq.matches));
    apply(); mq.addEventListener("change", apply);
    try { localStorage.setItem("upv-theme", theme); } catch {}
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  const toggleTheme = () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  const env = health?.trading.environment ?? "uat";
  const title = TITLES[path] ?? (path.startsWith("/stock/") ? `หุ้น · ${decodeURIComponent(path.split("/")[2] ?? "")}` : path.startsWith("/tickets/") ? "ตั๋ว" : "UPVerse");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const pending = tickets?.count ?? 0;
  return (
    <HealthCtx.Provider value={{ health: health ?? null, refresh: () => mutate() }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        {env === "prod" && <div className="lg:col-span-2 bg-gradient-to-r from-red-700 to-rose-700 text-white text-center font-bold py-1.5 px-4">⚠ โหมดเงินจริง (PROD) — ตั๋วที่ยืนยันบนราง API จะถูกส่งไปที่บัญชีจริง</div>}
        {health && health.owner_auth.startsWith("OPEN") && <div className="lg:col-span-2 text-center text-[12px] font-semibold py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">โหมด dev: ยังไม่ตั้งรหัสผ่านเจ้าของ (UPVERSE_OWNER_PASSPHRASE) — ใช้ในเครื่องเท่านั้น</div>}
        <header className="lg:col-span-2 sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-b border-slate-900/10 dark:border-white/10">
          <Link href="/" className="flex items-center gap-2 font-bold"><span className="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-[var(--shadow-glow)]" />UPVerse</Link>
          <h1 className="flex-1 text-[19px] font-semibold m-0 truncate">{title}</h1>
          <Chip tone={env === "prod" ? "danger" : "info"}>{env.toUpperCase()}</Chip>
          <button aria-label="สลับธีม" onClick={toggleTheme} className="min-h-[44px] min-w-[44px] grid place-items-center rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 cursor-pointer"><MoonIcon className="w-5 h-5" /></button>
        </header>
        <nav className="hidden lg:flex flex-col gap-1 p-3 border-r border-slate-900/10 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl sticky top-[64px] h-[calc(100dvh-64px)]" aria-label="เมนูหลัก">
          {SIDE.map((it, i) => it ? (
            <Link key={it[0]} href={it[0]} aria-current={active(it[0]) ? "page" : undefined} className={cx("flex items-center justify-between px-3 py-2.5 rounded-2xl transition-all duration-300", active(it[0]) ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/10 font-semibold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 dark:hover:bg-white/5")}>{it[1]}{it[0] === "/tickets" && pending > 0 && <Chip tone="danger">{pending}</Chip>}</Link>
          ) : <div key={i} className="h-px my-2 bg-slate-900/10 dark:bg-white/10" />)}
        </nav>
        <main className="px-4 pt-4 pb-28 lg:pb-8 lg:px-6 w-full max-w-[1200px] mx-auto min-w-0">{children}</main>
        <nav className="lg:hidden fixed left-3 right-3 bottom-3 z-30 grid grid-cols-5 rounded-3xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-900/10 dark:border-white/10 shadow-[var(--shadow-soft)] dark:shadow-[var(--shadow-softdark)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="เมนูมือถือ">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cx("relative h-[60px] flex flex-col items-center justify-center gap-0.5 text-[13px] rounded-3xl transition-colors duration-300", active(href) ? "text-emerald-700 dark:text-emerald-300 font-semibold" : "text-slate-600 dark:text-slate-400")}>
              <Icon className="w-[22px] h-[22px]" />{label}
              {href === "/tickets" && pending > 0 && <span className="absolute top-2 right-[calc(50%-20px)] min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white text-[12px] leading-[18px] text-center">{pending}</span>}
            </Link>
          ))}
        </nav>
      </div>
    </HealthCtx.Provider>
  );
}
