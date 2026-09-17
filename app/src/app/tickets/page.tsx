"use client";
import { Suspense, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { fetcher, api } from "@/components/shell";
import { Card, Muted, Chip, Btn, Tabs, Field, inputCls, Toggle, Banner, Empty, Skeleton, XIcon, PlusIcon, usd, fmtTime, cx } from "@/components/ui";
import type { Ticket } from "@/lib/types";

const STATUS_TABS = [{ key: "proposed", label: "รอยืนยัน" }, { key: "confirmed", label: "ยืนยันแล้ว (รอทำ)" }, { key: "sent", label: "ส่งแล้ว" }, { key: "filled", label: "สำเร็จ" }, { key: "cancelled", label: "ปฏิเสธ/หมดอายุ" }];

export default function TicketsPage() {
  return <Suspense fallback={<Skeleton className="h-40" />}><TicketsInner /></Suspense>;
}

function TicketsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("proposed");
  const { data, mutate } = useSWR<{ tickets: Ticket[] }>("/api/v1/tickets", fetcher, { refreshInterval: 20_000 });
  const [sheet, setSheet] = useState(() => sp.get("new") === "1");
  const list = (data?.tickets ?? []).filter((t) => (status === "cancelled" ? ["cancelled", "rejected", "expired"].includes(t.status) : t.status === status));
  const counts = Object.fromEntries(STATUS_TABS.map((s) => [s.key, (data?.tickets ?? []).filter((t) => (s.key === "cancelled" ? ["cancelled", "rejected", "expired"].includes(t.status) : t.status === s.key)).length]));
  return (
    <>
      <Tabs items={STATUS_TABS.map((s) => ({ key: s.key, label: `${s.label} (${counts[s.key] ?? 0})` }))} active={status} onChange={setStatus} />
      {!data ? <Skeleton className="h-32" /> : list.length === 0 ? <Card><Empty>ไม่มีตั๋วในสถานะนี้ — สร้างจากปุ่มด้านล่าง หรือให้ agent เสนอผ่าน API (สถานะ proposed เสมอ)</Empty></Card> : list.map((t) => {
        const blocks = t.riskCheck.filter((c) => c.state === "block").length, warns = t.riskCheck.filter((c) => c.state === "warn").length, oks = t.riskCheck.filter((c) => c.state === "ok").length;
        return (
          <Link key={t.id} href={`/tickets/${t.id}`} className="block mb-3"><Card>
            <div className="flex flex-wrap justify-between gap-2"><div><b>{t.side === "buy" ? "ซื้อ" : "ขาย"} {t.symbol}</b> {t.proposedBy === "agent" && <Chip tone="info">🤖 agent</Chip>} {t.tag && <Chip>{t.tag}</Chip>} <Chip tone={t.environment === "prod" ? "danger" : "info"}>{t.environment.toUpperCase()}</Chip> <Chip>{t.rail === "manual" ? "รางส่งมือ" : "API"}</Chip></div>{t.status === "proposed" && <Chip tone={blocks ? "danger" : "warn"}>{blocks ? `⛔ ${blocks}` : `หมดอายุ ${fmtTime(t.expiresAt)}`}</Chip>}</div>
            <div className="flex flex-wrap justify-between gap-2"><Muted className="num">{t.qty != null ? `${t.qty} หุ้น` : usd(t.notionalUsd)} · {t.orderType}{t.limitPrice != null ? ` ${t.limitPrice}` : ""}{t.stopPrice != null ? ` · ตัดขาดทุน ${t.stopPrice}` : ""}</Muted><span className="text-[13px] text-slate-600 dark:text-slate-400">✅ {oks} · ⚠ {warns} · ⛔ {blocks}</span></div>
          </Card></Link>
        );
      })}
      <Btn variant="primary" onClick={() => setSheet(true)} className="fixed right-4 bottom-24 lg:bottom-6 rounded-full min-h-[52px] px-5 z-30"><PlusIcon className="w-5 h-5" /> สร้างตั๋ว</Btn>
      {sheet && <NewTicket defaults={{ symbol: sp.get("symbol") ?? "", price: sp.get("price") ?? "", atr: sp.get("atr") ?? "" }} onClose={() => { setSheet(false); router.replace("/tickets"); }} onCreated={(id) => { setSheet(false); mutate(); router.push(`/tickets/${id}`); }} />}
    </>
  );
}

function NewTicket({ defaults, onClose, onCreated }: { defaults: { symbol: string; price: string; atr: string }; onClose: () => void; onCreated: (id: string) => void }) {
  const px = Number(defaults.price) || 0, atr = Number(defaults.atr) || 0;
  const [f, setF] = useState({ side: "buy" as "buy" | "sell", symbol: defaults.symbol, mode: (defaults.symbol ? "qty" : "qty") as "qty" | "notional", qty: "", notionalUsd: "", orderType: "LIMIT" as "LIMIT" | "MARKET", limitPrice: px ? px.toFixed(2) : "", stopPrice: px && atr ? (px - 2 * atr).toFixed(2) : "", targetPrice: "", rationale: "", altZero: "", invalidation: "", tag: "", rail: "manual" as "manual" | "api", expiresInDays: "3" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ ticket: Ticket }>("/api/v1/tickets", { method: "POST", json: { side: f.side, symbol: f.symbol.trim().toUpperCase(), qty: f.mode === "qty" ? Number(f.qty) || null : null, notionalUsd: f.mode === "notional" ? Number(f.notionalUsd) || null : null, orderType: f.orderType, limitPrice: f.orderType === "LIMIT" ? Number(f.limitPrice) || null : null, stopPrice: Number(f.stopPrice) || null, targetPrice: Number(f.targetPrice) || null, rationale: f.rationale, altZero: f.altZero, invalidation: f.invalidation, tag: f.tag || null, rail: f.rail, expiresInDays: Number(f.expiresInDays) || 3 } });
      onCreated(r.ticket.id);
    } catch (e) { const b = (e as { body?: { error?: { issues?: Array<{ path: string; message: string }> } } }).body; setErr((e instanceof Error ? e.message : String(e)) + (b?.error?.issues ? ": " + b.error.issues.map((i) => `${i.path} ${i.message}`).join(", ") : "")); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/55 flex items-end md:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[600px] max-h-[92dvh] overflow-auto bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl p-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between mb-2"><h2 className="text-[17px] font-semibold m-0">สร้างตั๋วคำสั่ง (proposed)</h2><Btn variant="ghost" small onClick={onClose}><XIcon className="w-4 h-4" /> ปิด</Btn></div>
        <div className="flex flex-wrap gap-3 mb-3"><Toggle items={[["buy", "ซื้อ"], ["sell", "ขาย"]]} value={f.side} onChange={(v) => setF({ ...f, side: v })} /><Toggle items={[["manual", "รางส่งมือ (แนะนำ)"], ["api", "ราง API"]]} value={f.rail} onChange={(v) => setF({ ...f, rail: v })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="สัญลักษณ์"><input className={cx(inputCls, "uppercase")} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="VOO" /></Field>
          <Field label="ระบุเป็น"><Toggle items={[["qty", "จำนวนหุ้น"], ["notional", "มูลค่า USD"]]} value={f.mode} onChange={(v) => setF({ ...f, mode: v })} /></Field>
          {f.mode === "qty" ? <Field label="จำนวน (เศษได้)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="0.25" /></Field> : <Field label="มูลค่า (USD)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.notionalUsd} onChange={(e) => setF({ ...f, notionalUsd: e.target.value })} placeholder="100" /></Field>}
          <Field label="ชนิดคำสั่ง"><Toggle items={[["LIMIT", "LIMIT"], ["MARKET", "MARKET"]]} value={f.orderType} onChange={(v) => setF({ ...f, orderType: v })} /></Field>
          {f.orderType === "LIMIT" && <Field label="ราคา LIMIT"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.limitPrice} onChange={(e) => setF({ ...f, limitPrice: e.target.value })} /></Field>}
          <Field label="ตัดขาดทุน" hint={atr ? `พรีฟิล 2×ATR14 (${atr.toFixed(2)})` : "ไม้เก็งจังหวะควรมี · DCA แกนเว้นได้"}><input className={cx(inputCls, "num")} inputMode="decimal" value={f.stopPrice} onChange={(e) => setF({ ...f, stopPrice: e.target.value })} /></Field>
          <Field label="เป้า (ไม่บังคับ)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.targetPrice} onChange={(e) => setF({ ...f, targetPrice: e.target.value })} /></Field>
          <Field label="ป้าย (เช่น DCA)"><input className={inputCls} value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="DCA ก.ย." /></Field>
          <Field label="หมดอายุใน (วัน)"><input className={cx(inputCls, "num")} inputMode="numeric" value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })} /></Field>
        </div>
        <Field label="เหตุผล (thesis ย่อ)"><textarea className={cx(inputCls, "min-h-[80px] py-2")} value={f.rationale} onChange={(e) => setF({ ...f, rationale: e.target.value })} placeholder="ผ่านโมเดลไหน · ตัวเลขอะไร · จังหวะอะไร" /></Field>
        <Field label="ทางเลือกที่ 0 — ถ้าไม่ทำจะเป็นอย่างไร"><input className={inputCls} value={f.altZero} onChange={(e) => setF({ ...f, altZero: e.target.value })} placeholder="ถือเงินสดรอรอบ DCA · เสียโอกาสถ้า…" /></Field>
        <Field label="อะไรจะทำให้คิดผิด (invalidation)"><input className={inputCls} value={f.invalidation} onChange={(e) => setF({ ...f, invalidation: e.target.value })} placeholder="หลุด swing low · งบโตช้ากว่า x%" /></Field>
        {err && <Banner tone="danger">{err}</Banner>}
        <Btn block variant="primary" disabled={busy || !f.symbol || !f.rationale || !f.altZero || !f.invalidation} onClick={submit}>{busy ? "กำลังตรวจกฎ…" : "เสนอตั๋ว → ตรวจกฎ"}</Btn>
        <Muted className="mt-2 text-[13px]">ตั๋วจะอยู่สถานะ proposed — ต้องเปิดดูผลตรวจกฎแล้วพิมพ์ประโยคยืนยันอีกขั้น</Muted>
      </div>
    </div>
  );
}
