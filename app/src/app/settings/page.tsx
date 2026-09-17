"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api, useHealth } from "@/components/shell";
import { Card, H2, Muted, Chip, Btn, Field, inputCls, Toggle, Check, Banner, Skeleton, ShieldIcon, PlusIcon, cx } from "@/components/ui";
import type { RiskRules, Settings, ApiToken } from "@/lib/types";

type S = { settings: Settings; rules: RiskRules; rules_history: Array<{ version: number; activeFrom: string }>; accounts: Array<{ id: string; kind: string; label: string }>; env: { TRADING_ENABLED: boolean; owner_passphrase_set: boolean; master_key_set: boolean } };
type B = { status: "unset" | "needs_2fa" | "connected" | "expired" | "error"; tokenStatus: string | null; keyLast4: string | null; twoFaDeadline: string | null; twoFaSecondsLeft: number | null; tokenExpires: string | null; lastOkAt: string | null; lastError: string | null; accounts: Array<{ account_id: string; account_number?: string; account_type?: string }> | null; instructions: string[] };
type T = { scopes: string[]; tokens: Array<Pick<ApiToken, "id" | "prefix" | "label" | "scopes" | "createdAt" | "lastUsedAt" | "revokedAt">> };

export default function SettingsPage() {
  const { data, error, mutate } = useSWR<S>("/api/v1/settings", fetcher);
  const { data: broker, mutate: mutB } = useSWR<B>("/api/v1/broker/status", fetcher, { refreshInterval: (d) => (d?.status === "needs_2fa" ? 5000 : 0) });
  const { data: pw, mutate: mutPw } = useSWR<{ source: "env" | "db" | "none"; note: string }>("/api/v1/auth/passphrase", fetcher);
  const [pwForm, setPwForm] = useState({ current: "", next: "", again: "" });
  const { data: tokens, mutate: mutT } = useSWR<T>("/api/v1/settings/tokens", fetcher);
  const { refresh } = useHealth();
  const [msg, setMsg] = useState<string | null>(null);
  const [rulesEdit, setRulesEdit] = useState<{ version: number; rules: RiskRules; wl: string } | null>(null);
  const rules = rulesEdit && data && rulesEdit.version === data.rules.version ? rulesEdit.rules : data?.rules ?? null;
  const wl = rulesEdit && data && rulesEdit.version === data.rules.version ? rulesEdit.wl : data?.rules.symbolWhitelist.join(", ") ?? "";
  const setRules = (r: RiskRules) => setRulesEdit({ version: data!.rules.version, rules: r, wl });
  const setWl = (w: string) => setRulesEdit({ version: data!.rules.version, rules: rules!, wl: w });
  const [keys, setKeys] = useState({ appKey: "", appSecret: "" });
  const [prodPhrase, setProdPhrase] = useState("");
  const [tok, setTok] = useState({ label: "agent-upverse-advisor", scopes: ["portfolio:read", "scan:read", "quotes:read", "theses:write", "tickets:propose", "journal:write", "watchlist:write"] as string[] });
  const [newToken, setNewToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<"auto" | "dark" | "light">(() => { try { return (localStorage.getItem("upv-theme") as "auto" | "dark" | "light") || "auto"; } catch { return "auto"; } });
  const [aurora, setAurora] = useState<"on" | "off">(() => { try { return (localStorage.getItem("upv-aurora") as "on" | "off") || "on"; } catch { return "on"; } });
  const applyTheme = (t: "auto" | "dark" | "light") => { setTheme(t); try { localStorage.setItem("upv-theme", t); } catch {} document.documentElement.classList.toggle("dark", t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches)); };
  const applyAurora = (a: "on" | "off") => { setAurora(a); try { localStorage.setItem("upv-aurora", a); } catch {} document.body.setAttribute("data-aurora", a); };
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg(ok); mutate(); mutB(); mutT(); refresh(); } catch (e) { setMsg("ผิดพลาด: " + (e instanceof Error ? e.message : String(e))); } };
  if (error) return <Banner tone="danger">{String(error.message)} — {error.status === 403 || error.status === 401 ? <Link href="/login" className="underline">เข้าสู่ระบบ</Link> : null}</Banner>;
  if (!data || !rules) return <Skeleton className="h-64" />;
  const s = data.settings;
  return (
    <>
      {msg && <Banner tone={msg.startsWith("ผิดพลาด") ? "danger" : "info"}>{msg}</Banner>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card glow><H2 right={broker && broker.status !== "unset" ? <Chip tone={broker.status === "connected" ? "up" : broker.status === "needs_2fa" ? "warn" : "danger"}>● {({ connected: "เชื่อมแล้ว", needs_2fa: "รอยืนยันในแอป Webull", expired: "หมดอายุ/ใช้ไม่ได้", error: "ผิดพลาด", unset: "" } as Record<string, string>)[broker.status]}</Chip> : undefined}>เชื่อม Webull (OpenAPI · region th)</H2>
          {!broker ? <Skeleton className="h-16" /> : broker.status === "unset" ? <>
            {!data.env.master_key_set && <Banner tone="warn">ต้องตั้ง <code>UPVERSE_MASTER_KEY</code> ใน env ก่อน (กุญแจถูกเข้ารหัสด้วยค่านี้)</Banner>}
            <Muted className="text-[14px] mb-2"><b>ขั้น 1/3</b> — ใส่ App Key/Secret จาก developer.webull.co.th (Developer Tool → API Management → API Keys Management)</Muted>
            <div className="grid grid-cols-1 gap-2"><Field label="App Key"><input className={inputCls} value={keys.appKey} onChange={(e) => setKeys({ ...keys, appKey: e.target.value })} autoComplete="off" /></Field><Field label="App Secret"><input className={inputCls} type="password" value={keys.appSecret} onChange={(e) => setKeys({ ...keys, appSecret: e.target.value })} autoComplete="off" /></Field></div>
            <Btn variant="primary" disabled={!keys.appKey || !keys.appSecret || !data.env.master_key_set} onClick={() => run(async () => { await api("/api/v1/broker/connect", { method: "POST", json: keys }); setKeys({ appKey: "", appSecret: "" }); }, "บันทึกกุญแจแล้ว · Webull ส่ง SMS ไปเบอร์ที่ผูกบัญชี — ไปยืนยันในแอป Webull")}>เชื่อม → Webull จะส่ง SMS</Btn>
          </> : broker.status === "needs_2fa" ? <>
            <Banner tone="info"><b>ขั้น 2/3 — ยืนยันในแอป Webull (ไม่ต้องกรอกรหัสที่นี่)</b>{broker.twoFaSecondsLeft != null && <div className="num mt-1">เหลือเวลา {Math.floor(broker.twoFaSecondsLeft / 60)}:{String(broker.twoFaSecondsLeft % 60).padStart(2, "0")} นาที</div>}</Banner>
            <ol className="list-decimal ml-5 text-[15px] space-y-1 mb-3">{broker.instructions.map((t) => <li key={t}>{t}</li>)}</ol>
            <div className="flex flex-wrap gap-2"><Btn variant="primary" onClick={() => run(() => api("/api/v1/broker/status?check=1"), "ตรวจสถานะแล้ว")}>ตรวจสถานะ (หลังยืนยันในแอป)</Btn><Btn onClick={() => run(() => api("/api/v1/broker/status", { method: "POST", json: { action: "resend" } }), "ขอรหัสใหม่แล้ว — ดู SMS/แอป Webull")}>ขอรหัสใหม่ (ส่ง SMS อีกครั้ง)</Btn></div>
            <Muted className="mt-2 text-[13px]">หน้านี้ตรวจสถานะให้เองทุก 5 วิ · App Key ••••{broker.keyLast4}{broker.lastError && <span className="text-red-700 dark:text-red-400"> · {broker.lastError}</span>}</Muted>
          </> : broker.status === "connected" ? <>
            <Muted className="text-[14px]"><b>ขั้น 3/3 — เชื่อมแล้ว</b> · App Key ••••{broker.keyLast4} · token {broker.tokenStatus}{broker.lastOkAt ? ` · ตรวจล่าสุด ${new Date(broker.lastOkAt).toLocaleString("th-TH")}` : ""}</Muted>
            {broker.accounts && broker.accounts.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{broker.accounts.map((a) => <Chip key={a.account_id} tone="up">บัญชี {a.account_number ?? a.account_id}{a.account_type ? ` · ${a.account_type}` : ""}</Chip>)}</div> : <Muted className="text-[13px] mt-1">ยังไม่มีรายการบัญชี — กด &quot;ตรวจสถานะ&quot; อีกครั้ง{broker.lastError ? ` (${broker.lastError})` : ""}</Muted>}
            <Muted className="text-[13px] mt-1">token จะใช้ไม่ได้ถ้าไม่มีการเรียก 15 วันติดต่อกัน — งานสแกนกลางคืนต่ออายุให้อัตโนมัติ</Muted>
            <div className="flex flex-wrap gap-2 mt-3"><Btn onClick={() => run(() => api("/api/v1/broker/status?check=1"), "ตรวจสถานะแล้ว")}>ตรวจสถานะ</Btn><Btn variant="ghost" className="text-red-700 dark:text-red-400" onClick={() => confirm("ลบกุญแจและ token ที่เข้ารหัสไว้?") && run(() => api("/api/v1/broker/disconnect", { method: "POST" }), "ตัดการเชื่อมต่อแล้ว")}>ตัดการเชื่อมต่อ</Btn></div>
          </> : <>
            <Banner tone="danger">{broker.lastError ?? "token ใช้ไม่ได้"}</Banner>
            <div className="flex flex-wrap gap-2"><Btn variant="primary" onClick={() => run(() => api("/api/v1/broker/status", { method: "POST", json: { action: "resend" } }), "ขอรหัสใหม่แล้ว — ไปยืนยันในแอป Webull")}>ขอรหัสใหม่ (ส่ง SMS)</Btn><Btn onClick={() => run(() => api("/api/v1/broker/status?check=1"), "ตรวจสถานะแล้ว")}>ตรวจสถานะ</Btn><Btn variant="ghost" className="text-red-700 dark:text-red-400" onClick={() => confirm("ลบกุญแจที่เข้ารหัสไว้?") && run(() => api("/api/v1/broker/disconnect", { method: "POST" }), "ตัดการเชื่อมต่อแล้ว")}>ตัดการเชื่อมต่อ</Btn></div>
          </>}
          <Muted className="mt-3 text-[13px]"><ShieldIcon className="w-4 h-4 inline mr-1" />กุญแจและ token ถูกเข้ารหัส (AES-256-GCM) ฝั่งเซิร์ฟเวอร์ · ไม่แสดงเต็ม · ไม่ส่งให้ AI · ไม่อยู่ใน log · <b>รหัส SMS กรอกในแอป Webull เท่านั้น — แอปนี้ไม่มีช่องกรอก</b> · ห้ามพิมพ์กุญแจในแชท</Muted>
        </Card>
        <Card><H2>สภาพแวดล้อม (Environment)</H2>
          <Toggle items={[["uat", "UAT (ไม่ส่งจริง)"], ["prod", "PROD (เงินจริง)"]]} value={s.environment} onChange={(v) => { if (v === "prod") { const p = prompt("พิมพ์ 'เปิดเงินจริง' เพื่อยืนยัน"); if (p == null) return; setProdPhrase(p); run(() => api("/api/v1/settings", { method: "PATCH", json: { environment: "prod", confirmProdPhrase: p } }), "เปิด PROD แล้ว — แถบแดงจะขึ้นทุกหน้า"); } else run(() => api("/api/v1/settings", { method: "PATCH", json: { environment: "uat" } }), "กลับเป็น UAT"); }} />
          <Muted className="mt-2 text-[13px]">ข้อค้นพบจาก SDK ทางการ: Webull TH <b>ไม่มี sandbox แยก</b> — UAT ในแอปนี้จึงหมายถึง &quot;รางส่งมือ/ไม่ส่งจริง&quot; · PROD ต้องผ่านประตูเฟส 2 (SPEC §14.3){prodPhrase ? "" : ""}</Muted>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 p-3 rounded-2xl bg-amber-100 dark:bg-amber-400/15"><div><b className="text-amber-800 dark:text-amber-300">Kill switch (ราง API)</b><Muted className="text-[13px]">setting: {s.tradingEnabled ? "เปิด" : "ปิด"} · env TRADING_ENABLED: {data.env.TRADING_ENABLED ? "true" : "false"}</Muted></div>{s.tradingEnabled ? <Btn variant="danger" onClick={() => run(() => api("/api/v1/settings", { method: "PATCH", json: { tradingEnabled: false } }), "หยุดส่งคำสั่งแล้ว")}>หยุดส่งคำสั่ง</Btn> : <Btn onClick={() => run(() => api("/api/v1/settings", { method: "PATCH", json: { tradingEnabled: true } }), "เปิดสวิตช์ในแอปแล้ว (env ต้องเป็น true ด้วย)")}>เปิดสวิตช์ในแอป</Btn>}</div>
          <Muted className="text-[13px] mt-1">ตัวใดตัวหนึ่งปิด = ส่งผ่าน API ไม่ได้ · รางส่งมือใช้ได้เสมอ</Muted>
        </Card>
        <Card><H2 right={<Chip>v{rules.version}</Chip>}>กฎความเสี่ยง</H2>
          <div className="grid grid-cols-2 gap-3">{([["maxOrderNotionalUsd", "เพดานมูลค่า/คำสั่ง (USD)"], ["maxOrderQty", "เพดานจำนวน/คำสั่ง"], ["maxSinglePositionPct", "หุ้นเดี่ยวสูงสุด %"], ["warnSinglePositionPct", "เตือนที่ %"], ["maxCorePct", "แกน (ETF) สูงสุด %"], ["minCashPct", "เงินสดขั้นต่ำ %"], ["maxRiskPerTradePct", "เสี่ยง/ไม้ %"], ["quoteMaxAgeSec", "ราคาใหม่กว่า (วิ)"], ["maxTicketsPerDay", "ตั๋ว/วัน"]] as Array<[keyof RiskRules, string]>).map(([k, l]) => <Field key={k} label={l}><input className={cx(inputCls, "num")} inputMode="decimal" value={String(rules[k])} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })} /></Field>)}</div>
          <Field label="Whitelist (คั่นด้วย , · ว่าง = ห้ามส่งผ่าน API ทุกตัว)"><input className={cx(inputCls, "uppercase")} value={wl} onChange={(e) => setWl(e.target.value)} placeholder="VOO, MSFT" /></Field>
          <Field label="สัญลักษณ์แกน (ETF ดัชนี — ยกเว้นเพดานหุ้นเดี่ยว ใช้เพดานแกนแทน)"><input className={cx(inputCls, "uppercase")} value={(rules.coreSymbols ?? []).join(", ")} onChange={(e) => setRules({ ...rules, coreSymbols: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} placeholder="VOO, SPY, QQQ, SCHD" /></Field>
          <Btn block variant="primary" onClick={() => run(() => api("/api/v1/settings/rules", { method: "PUT", json: { ...rules, symbolWhitelist: wl.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) } }), `บันทึกเป็น v${rules.version + 1}`)}>บันทึกเป็นเวอร์ชันใหม่ (v{rules.version + 1})</Btn>
          <Muted className="mt-1 text-[13px]">ตั๋วเดิมยังอ้างเวอร์ชันเก่าและจะตรวจใหม่ตอนยืนยัน · ประวัติ: {data.rules_history.map((h) => `v${h.version}`).join(" → ")}</Muted>
        </Card>
        <Card><H2>ผู้ให้ราคา</H2><Check state="warn">1 · Webull Market Data — ต้องเชื่อม + สมัคร market data (ยังไม่ต่อในเวอร์ชันนี้)</Check><Check state="ok">2 · Yahoo chart (ชั้น 2 · ไม่มีคีย์ · อาจดีเลย์) — ใช้อยู่</Check><Check state="ok">งบการเงิน · SEC EDGAR companyfacts (ทางการ)</Check><Check state="ok">จักรวาล S&amp;P 500 · Wikipedia (ระบุวันที่ดึงในผลสแกน)</Check></Card>
        <Card><H2>API token (สำหรับ agent / n8n / ChatGPT)</H2>
          {newToken && <Banner tone="info"><b>token ใหม่ (แสดงครั้งเดียว):</b><div className="num break-all mt-1">{newToken}</div></Banner>}
          {tokens?.tokens.filter((t) => !t.revokedAt).map((t) => <div key={t.id} className="flex justify-between gap-2 py-2 border-t first:border-t-0 border-slate-900/10 dark:border-white/10"><div className="min-w-0"><b>{t.label}</b><Muted className="num">{t.prefix}… · ใช้ล่าสุด {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString("th-TH") : "—"}</Muted><div className="flex flex-wrap gap-1 mt-1">{t.scopes.map((sc) => <Chip key={sc}>{sc}</Chip>)}</div></div><Btn variant="ghost" small className="text-red-700 dark:text-red-400 flex-none" onClick={() => run(() => api(`/api/v1/settings/tokens?id=${t.id}`, { method: "DELETE" }), "เพิกถอนแล้ว")}>เพิกถอน</Btn></div>)}
          <Field label="ชื่อ token ใหม่"><input className={inputCls} value={tok.label} onChange={(e) => setTok({ ...tok, label: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-1.5 mb-2">{(tokens?.scopes ?? []).map((sc) => <button key={sc} type="button" aria-pressed={tok.scopes.includes(sc)} onClick={() => setTok({ ...tok, scopes: tok.scopes.includes(sc) ? tok.scopes.filter((x) => x !== sc) : [...tok.scopes, sc] })} className={cx("min-h-[44px] px-3 rounded-full border text-[13px] font-semibold cursor-pointer", tok.scopes.includes(sc) ? "bg-emerald-600/15 border-emerald-500/40" : "bg-white/70 dark:bg-white/5 border-slate-900/10 dark:border-white/10")}>{sc}</button>)}</div>
          <Btn block onClick={() => run(async () => { const r = await api<{ token: string }>("/api/v1/settings/tokens", { method: "POST", json: tok }); setNewToken(r.token); }, "สร้าง token แล้ว — คัดลอกเก็บทันที")}><PlusIcon className="w-4 h-4" /> สร้าง token</Btn>
          <Muted className="mt-1 text-[13px]">ไม่มี scope &quot;tickets:confirm&quot; — ยืนยันตั๋วได้จากหน้าจอนี้เท่านั้น · สคีมา: <a className="underline" href="/api/v1/openapi.json" target="_blank">/api/v1/openapi.json</a></Muted>
        </Card>
        <Card><H2 right={pw && <Chip tone={pw.source === "db" ? "up" : pw.source === "env" ? "info" : "warn"}>{pw.source === "db" ? "ตั้งในแอป" : pw.source === "env" ? "จาก env" : "ยังไม่ตั้ง"}</Chip>}>รหัสผ่านเจ้าของ</H2>
          {pw && <Muted className="text-[13px] mb-2">{pw.note}</Muted>}
          {pw?.source !== "none" && <Field label="รหัสผ่านเดิม"><input className={inputCls} type="password" autoComplete="current-password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} /></Field>}
          <Field label="รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)"><input className={inputCls} type="password" autoComplete="new-password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} /></Field>
          <Field label="พิมพ์รหัสใหม่อีกครั้ง"><input className={inputCls} type="password" autoComplete="new-password" value={pwForm.again} onChange={(e) => setPwForm({ ...pwForm, again: e.target.value })} /></Field>
          <Btn block variant="primary" disabled={pwForm.next.length < 10 || pwForm.next !== pwForm.again || (pw?.source !== "none" && !pwForm.current)} onClick={() => run(async () => { await api("/api/v1/auth/passphrase", { method: "PUT", json: { current: pwForm.current, next: pwForm.next } }); setPwForm({ current: "", next: "", again: "" }); mutPw(); }, "เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่นต้องเข้าสู่ระบบใหม่")}>{pw?.source === "none" ? "ตั้งรหัสผ่าน" : "เปลี่ยนรหัสผ่าน"}</Btn>
          {pwForm.next && pwForm.again && pwForm.next !== pwForm.again && <Muted className="text-[13px] text-red-700 dark:text-red-400 mt-1">รหัสใหม่สองช่องไม่ตรงกัน</Muted>}
          <Muted className="mt-2 text-[13px]">เก็บเป็น hash (scrypt) ในฐานข้อมูล · เมื่อตั้งในแอปแล้ว ค่า UPVERSE_OWNER_PASSPHRASE ใน env จะไม่ถูกใช้อีก</Muted>
        </Card>
        <Card><H2>ธีม / ความปลอดภัย</H2>
          <div className="flex flex-col gap-3"><Toggle items={[["auto", "ตามเครื่อง"], ["dark", "มืด"], ["light", "สว่าง"]]} value={theme} onChange={applyTheme} /><Toggle items={[["on", "มืดแบบ aurora"], ["off", "มืดแบบเรียบ"]]} value={aurora} onChange={applyAurora} /></div>
          <div className="mt-3 text-[14px] space-y-1"><div>รหัสผ่านเจ้าของ: {pw?.source === "none" ? <Chip tone="warn">ยังไม่ตั้ง (โหมด dev)</Chip> : <Chip tone="up">ตั้งแล้ว ({pw?.source === "db" ? "ในแอป" : "env"})</Chip>}</div><div>กุญแจเข้ารหัส (UPVERSE_MASTER_KEY): {data.env.master_key_set ? <Chip tone="up">ตั้งแล้ว</Chip> : <Chip tone="warn">ยังไม่ตั้ง</Chip>}</div></div>
          <Btn className="mt-3" variant="ghost" onClick={() => run(() => api("/api/v1/auth/logout", { method: "POST" }), "ออกจากระบบแล้ว")}>ออกจากระบบ</Btn>
        </Card>
      </div>
    </>
  );
}
