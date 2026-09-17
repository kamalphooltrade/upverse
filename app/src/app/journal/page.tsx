"use client";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { fetcher, api } from "@/components/shell";
import { Card, H2, Muted, Chip, Btn, Field, inputCls, Toggle, Empty, Skeleton, Banner, fmtTime, cx } from "@/components/ui";
import type { JournalEntry } from "@/lib/types";

const EMO = ["กลัว", "โลภ", "เบื่อ", "มั่นใจ", "ลังเล"] as const;
export default function JournalPage() { return <Suspense fallback={<Skeleton className="h-40" />}><Inner /></Suspense>; }
function Inner() {
  const sp = useSearchParams();
  const { data, mutate } = useSWR<{ entries: JournalEntry[]; pending_journal: Array<{ id: string; symbol: string; side: string }>; by_emotion: Record<string, number> }>("/api/v1/journal", fetcher);
  const [f, setF] = useState({ decision: "ซื้อ" as JournalEntry["decision"], emotion: "มั่นใจ" as JournalEntry["emotion"], thesisShort: "", expectation: "", reviewDays: 30 as 30 | 90, symbol: sp.get("symbol") ?? "", ticketId: sp.get("ticket") ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => { try { await api("/api/v1/journal", { method: "POST", json: { ...f, symbol: f.symbol || null, ticketId: f.ticketId || null } }); setMsg("บันทึกแล้ว"); setF({ ...f, thesisShort: "", expectation: "" }); mutate(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const entries = data?.entries ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card><H2>บันทึกการตัดสินใจ{f.symbol ? ` · ${f.symbol}` : ""}</H2>
        {data && data.pending_journal.length > 0 && <Banner>ค้าง {data.pending_journal.length} รายการ: {data.pending_journal.map((p) => `${p.side === "buy" ? "ซื้อ" : "ขาย"} ${p.symbol}`).join(" · ")}</Banner>}
        <div className="grid grid-cols-2 gap-3"><Field label="สัญลักษณ์"><input className={cx(inputCls, "uppercase")} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} /></Field><Field label="อ้างตั๋ว (id)"><input className={inputCls} value={f.ticketId} onChange={(e) => setF({ ...f, ticketId: e.target.value })} /></Field></div>
        <Field label="การตัดสินใจ"><Toggle items={[["ซื้อ", "ซื้อ"], ["ขาย", "ขาย"], ["ไม่ทำ", "ไม่ทำ"], ["รอ", "รอ"]]} value={f.decision} onChange={(v) => setF({ ...f, decision: v })} /></Field>
        <Field label="อารมณ์ตอนตัดสินใจ"><div className="flex flex-wrap gap-2">{EMO.map((e) => <button key={e} type="button" aria-pressed={f.emotion === e} onClick={() => setF({ ...f, emotion: e })} className={cx("min-h-[44px] px-4 rounded-full border transition-all duration-300 cursor-pointer", f.emotion === e ? "bg-gradient-to-r from-emerald-700 to-teal-700 dark:from-emerald-400 dark:to-teal-300 text-white dark:text-emerald-950 border-transparent shadow-[var(--shadow-glow)]" : "bg-white/70 dark:bg-white/5 border-slate-900/10 dark:border-white/10")}>{e}</button>)}</div></Field>
        <Field label="thesis ย่อ"><textarea className={cx(inputCls, "min-h-[80px] py-2")} value={f.thesisShort} onChange={(e) => setF({ ...f, thesisShort: e.target.value })} /></Field>
        <Field label="คาดหวังอะไร"><input className={inputCls} value={f.expectation} onChange={(e) => setF({ ...f, expectation: e.target.value })} /></Field>
        <Field label="ย้อนมาดูผลเมื่อ"><Toggle items={[["30", "30 วัน"], ["90", "90 วัน"]]} value={String(f.reviewDays)} onChange={(v) => setF({ ...f, reviewDays: v === "90" ? 90 : 30 })} /></Field>
        <Btn block variant="primary" onClick={save}>บันทึก</Btn>{msg && <Muted className="mt-2">{msg}</Muted>}
      </Card>
      <Card><H2>ประวัติ ({entries.length})</H2>
        {data && <div className="flex flex-wrap gap-1.5 mb-2">{Object.entries(data.by_emotion).map(([k, v]) => <Chip key={k}>{k} {v}</Chip>)}</div>}
        {!data ? <Skeleton className="h-24" /> : entries.length === 0 ? <Empty>ยังไม่มีบันทึก</Empty> : entries.map((e) => <div key={e.id} className="py-2 border-t first:border-t-0 border-slate-900/10 dark:border-white/10 text-[15px]"><div className="flex flex-wrap gap-2 items-center"><b>{e.decision}{e.symbol ? ` ${e.symbol}` : ""}</b><Chip>{e.emotion}</Chip><Muted className="inline text-[13px]">{fmtTime(e.ts)} · ย้อนดู {e.reviewDays} วัน</Muted></div>{e.thesisShort && <Muted>{e.thesisShort}</Muted>}{e.expectation && <Muted className="text-[13px]">คาดหวัง: {e.expectation}</Muted>}{e.lesson && <Muted className="text-[13px]">บทเรียน: {e.lesson}</Muted>}</div>)}
        <Muted className="mt-2 text-[13px]">สรุปผลตามอารมณ์ (ผลตอบแทนจริงหลังตัดสินใจ) จะคำนวณเมื่อมีรายการครบ 30/90 วัน</Muted>
      </Card>
    </div>
  );
}
