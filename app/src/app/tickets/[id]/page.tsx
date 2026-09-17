"use client";
import { use, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api, useHealth } from "@/components/shell";
import { Card, H2, Muted, Src, Chip, Btn, Field, inputCls, KV, Check, Banner, Skeleton, usd, fmtTime, cx } from "@/components/ui";
import type { Ticket, OrderLogEntry, Quote } from "@/lib/types";

type Resp = { ticket: Ticket; quote: Quote | null; log: OrderLogEntry[] };

export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, mutate } = useSWR<Resp>(`/api/v1/tickets/${id}`, fetcher, { refreshInterval: 10_000 });
  const { health, refresh } = useHealth();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "danger" | "warn"; text: string } | null>(null);
  const [fill, setFill] = useState({ price: "", qty: "", fees: "0", fxRateThb: "" });
  const [reason, setReason] = useState("");
  const [idem] = useState(() => `${id}-${Math.random().toString(36).slice(2, 10)}`);
  const t = data?.ticket;
  const q = data?.quote ?? null;
  const blocks = t?.riskCheck.filter((c) => c.state === "block") ?? [];
  const phraseOk = !!t && phrase.trim() === t.confirmPhrase;
  const canConfirm = !!t && t.status === "proposed" && phraseOk && blocks.length === 0;
  const notional = t ? (t.notionalUsd ?? (t.qty != null ? t.qty * (t.orderType === "LIMIT" && t.limitPrice != null ? t.limitPrice : q?.price ?? 0) : null)) : null;
  const rr = t?.stopPrice != null && t?.targetPrice != null && t.limitPrice != null && t.limitPrice > t.stopPrice ? (t.targetPrice - t.limitPrice) / (t.limitPrice - t.stopPrice) : null;
  const act = async (fn: () => Promise<unknown>, okText: string) => { setBusy(true); setMsg(null); try { await fn(); setMsg({ tone: "info", text: okText }); await mutate(); refresh(); } catch (e) { const b = (e as { body?: { error?: { message?: string }; checks?: unknown } }).body; setMsg({ tone: "danger", text: b?.error?.message ?? (e instanceof Error ? e.message : String(e)) }); await mutate(); } finally { setBusy(false); } };
  if (error) return <Banner tone="danger">โหลดตั๋วไม่ได้: {String(error.message)}</Banner>;
  if (!t) return <Skeleton className="h-64" />;
  const sideTh = t.side === "buy" ? "ซื้อ" : "ขาย";
  const steps: Array<[string, boolean]> = [["เสนอ", true], ["ยืนยัน", ["confirmed", "sent", "filled"].includes(t.status)], [t.rail === "api" ? "ส่ง" : "ทำในแอป Webull", ["sent", "filled"].includes(t.status)], ["สำเร็จ", t.status === "filled"]];
  return (
    <>
      <Card glow className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[22px] font-semibold">{sideTh} {t.symbol}</span><Chip tone={t.environment === "prod" ? "danger" : "info"} className="text-[15px] px-3 py-1">{t.environment === "prod" ? "PROD — เงินจริง" : "UAT — ไม่ส่งเงินจริง"}</Chip></div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[13px] text-slate-600 dark:text-slate-400">{steps.map(([s, done], i) => <span key={s} className="flex items-center gap-1.5"><Chip tone={done ? "up" : "neutral"}>{s}</Chip>{i < steps.length - 1 && "›"}</span>)}<Chip tone={t.status === "cancelled" || t.status === "rejected" || t.status === "expired" ? "danger" : "neutral"}>{t.status}</Chip><Chip>{t.rail === "api" ? "ราง API" : "รางส่งมือ"}</Chip>{t.proposedBy === "agent" && <Chip tone="info">🤖 agent</Chip>}</div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><H2>คำสั่ง</H2><KV rows={[["จำนวน / มูลค่า", t.qty != null ? `${t.qty} หุ้น` : usd(t.notionalUsd)], ["ชนิด · ราคา", `${t.orderType}${t.limitPrice != null ? ` · ${t.limitPrice}` : ""}`], ["ราคาตลาดตอนนี้", q ? <span key="q">{usd(q.price)} <span className="text-[13px] text-slate-600 dark:text-slate-400">{q.source} · {fmtTime(q.asOf)}{q.stale ? " · ค้าง" : ""}</span></span> : "—"], ["มูลค่าประมาณ", usd(notional)], ["ตัดขาดทุน · เป้า", `${t.stopPrice ?? "—"} · ${t.targetPrice ?? "—"}`], ["R : R", rr != null ? `1 : ${rr.toFixed(1)}` : "—"], ["หมดอายุ", fmtTime(t.expiresAt)], ["กฎที่ใช้ตรวจ", `v${t.riskRulesVersion}`], ["ป้าย", t.tag ?? "—"]]} /></Card>
        <Card><H2 right={t.status === "proposed" ? <Src>ตรวจสดทุก 10 วิ</Src> : undefined}>ผลตรวจกฎ ({t.riskCheck.filter((c) => c.state === "ok").length} ✅ · {t.riskCheck.filter((c) => c.state === "warn").length} ⚠ · {blocks.length} ⛔)</H2>{t.riskCheck.map((c) => <Check key={c.code} state={c.state}>{c.message}</Check>)}</Card>
        <Card className="lg:col-span-2"><H2>เหตุผล · ทางเลือกที่ 0 · อะไรจะทำให้คิดผิด</H2>
          <div className="text-[15px] text-slate-600 dark:text-slate-400 space-y-1"><p><b className="text-slate-900 dark:text-slate-100">เหตุผล:</b> {t.rationale}</p><p><b className="text-slate-900 dark:text-slate-100">ทางเลือกที่ 0 (ไม่ทำ):</b> {t.altZero}</p><p><b className="text-slate-900 dark:text-slate-100">อะไรจะทำให้คิดผิด:</b> {t.invalidation}</p></div></Card>
        {t.status === "proposed" && <Card><H2>ยืนยัน (เจ้าของเท่านั้น)</H2>
          {health?.owner_auth.startsWith("OPEN") && <Banner tone="warn">โหมด dev ไม่มีรหัสผ่าน — ตั้ง UPVERSE_OWNER_PASSPHRASE ก่อนใช้จริง</Banner>}
          <Field label={<span>พิมพ์ประโยคนี้ให้ตรงทุกตัวอักษร: <b className="num text-slate-900 dark:text-slate-100">{t.confirmPhrase}</b></span>}><input className={inputCls} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="พิมพ์ที่นี่" autoComplete="off" /></Field>
          <Btn block variant="primary" disabled={!canConfirm || busy} onClick={() => act(() => api(`/api/v1/tickets/${id}/confirm`, { method: "POST", json: { phrase, idempotencyKey: idem } }), t.rail === "manual" ? "ยืนยันแล้ว — ไปทำรายการในแอป Webull แล้วกลับมากด 'ทำแล้ว'" : "ส่งคำสั่งแล้ว")}>{phraseOk && blocks.length > 0 ? "ประโยคตรงแล้ว แต่ยังมี ⛔ — ยืนยันไม่ได้" : t.rail === "api" ? `ยืนยันและส่ง ${t.environment.toUpperCase()}` : "ยืนยัน (แล้วไปทำในแอป Webull)"}</Btn>
          <Muted className="mt-2 text-[13px]">ปุ่มเปิดเมื่อประโยคตรงและไม่มี ⛔ · ใช้กับตั๋วใบนี้ใบเดียว · API token ยืนยันแทนไม่ได้</Muted>
          <div className="mt-3"><Field label="หรือปฏิเสธ (บันทึกเหตุผลลง journal)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ไม่ทำ" /></Field><Btn variant="ghost" className="text-red-700 dark:text-red-400" disabled={!reason || busy} onClick={() => act(() => api(`/api/v1/tickets/${id}/reject`, { method: "POST", json: { reason } }), "ปฏิเสธแล้ว · บันทึก journal")}>ปฏิเสธตั๋ว</Btn></div>
        </Card>}
        {(t.status === "confirmed" || t.status === "sent") && <Card><H2>{t.rail === "manual" ? "ทำในแอป Webull แล้วกรอกผลจริง" : "รอผลจากโบรกเกอร์ — กรอก fill เองได้ถ้าเห็นในแอป"}</H2>
          <KV rows={[["สัญลักษณ์", t.symbol], [sideTh, t.qty != null ? `${t.qty} หุ้น` : usd(t.notionalUsd)], ["ชนิด", `${t.orderType}${t.limitPrice != null ? ` @ ${t.limitPrice}` : ""}`]]} />
          <div className="grid grid-cols-2 gap-3 mt-3"><Field label="ราคาที่ได้จริง"><input className={cx(inputCls, "num")} inputMode="decimal" value={fill.price} onChange={(e) => setFill({ ...fill, price: e.target.value })} /></Field><Field label="จำนวนที่ได้จริง"><input className={cx(inputCls, "num")} inputMode="decimal" value={fill.qty} onChange={(e) => setFill({ ...fill, qty: e.target.value })} placeholder={t.qty != null ? String(t.qty) : ""} /></Field><Field label="ค่าธรรมเนียม"><input className={cx(inputCls, "num")} inputMode="decimal" value={fill.fees} onChange={(e) => setFill({ ...fill, fees: e.target.value })} /></Field><Field label="FX rate (ถ้าแลกเงินรอบนี้)"><input className={cx(inputCls, "num")} inputMode="decimal" value={fill.fxRateThb} onChange={(e) => setFill({ ...fill, fxRateThb: e.target.value })} /></Field></div>
          <Btn block variant="primary" disabled={busy || !fill.price || !fill.qty} onClick={() => act(() => api(`/api/v1/tickets/${id}/fill`, { method: "POST", json: { price: Number(fill.price), qty: Number(fill.qty), fees: Number(fill.fees) || 0, fxRateThb: fill.fxRateThb ? Number(fill.fxRateThb) : null } }), "บันทึกผลแล้ว → ลงสมุดบันทึกใน 24 ชม.")}>ทำแล้ว → บันทึกลงพอร์ต</Btn>
        </Card>}
        {t.status === "filled" && t.fill && <Card><H2>สำเร็จ</H2><KV rows={[["ได้ราคา", usd(t.fill.price)], ["จำนวน", `${t.fill.qty} หุ้น`], ["เมื่อ", fmtTime(t.fill.ts)]]} /><Link href={`/journal?ticket=${t.id}&symbol=${t.symbol}`} className="block mt-3"><Btn block>บันทึก journal</Btn></Link></Card>}
        {msg && <div className="lg:col-span-2"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
        <Card className="lg:col-span-2"><H2>บันทึกเหตุการณ์ (order log)</H2>{data.log.length === 0 ? <Muted>—</Muted> : data.log.map((l) => <div key={l.id} className="text-[14px] py-1 border-t first:border-t-0 border-slate-900/10 dark:border-white/10"><span className="text-slate-600 dark:text-slate-400">{fmtTime(l.ts)}</span> · <b>{l.action}</b> {l.fromStatus ?? "—"} → {l.toStatus ?? "—"} · {l.actor} <Muted className="inline">{l.detail.slice(0, 160)}</Muted></div>)}</Card>
      </div>
    </>
  );
}
