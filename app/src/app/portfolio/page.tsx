"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher, api } from "@/components/shell";
import { Card, H2, Muted, Src, Chip, Btn, Tabs, Field, inputCls, KV, Banner, Empty, Skeleton, PlusIcon, XIcon, usd, thb, pctf, fmtTime, cx } from "@/components/ui";

type Portfolio = {
  account: string; as_of: string; total_usd: number; invested_usd: number; cash_usd: number; cash_pct: number; total_thb: number | null;
  fx: { rate: number; asOf: string; source: string } | null;
  pnl: { unrealized_usd: number; realized_usd: number; dividends_usd: number; fees_usd: number; fx_pnl_thb: number | null; thb_invested: number; avg_rate_paid: number | null };
  holdings: Array<{ symbol: string; qty: number; avg_cost: number; cost_basis: number; price: number | null; market_value: number | null; weight_pct: number | null; pnl: number | null; pnl_pct: number | null; quote_source: string | null; quote_as_of: string | null; market_state: string | null; stale: boolean | null }>;
  missing_quotes: string[]; accounts: Array<{ id: string; kind: string; label: string; environment: string }>; caveats: string[];
};
type Tx = { id: string; ts: string; symbol: string | null; type: string; qty: number; price: number; amountUsd: number; fees: number; note: string; source: string };

const TYPES: Array<[string, string]> = [["buy", "ซื้อ"], ["sell", "ขาย"], ["dividend", "ปันผล"], ["fee", "ค่าธรรมเนียม"], ["deposit", "ฝากเงิน (USD)"], ["withdraw", "ถอนเงิน"], ["fx", "แลกเงิน THB→USD"]];

export default function PortfolioPage() {
  const [acct, setAcct] = useState("all");
  const { data: p, error, mutate } = useSWR<Portfolio>(`/api/v1/portfolio?account=${acct}`, fetcher, { refreshInterval: 15_000 });
  const { data: txs, mutate: mutTx } = useSWR<{ transactions: Tx[] }>(`/api/v1/transactions?account=${acct}`, fetcher);
  const [sheet, setSheet] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const staleAny = p?.holdings.some((h) => h.stale);
  const tabs = [{ key: "all", label: "รวมทุกบัญชี" }, ...(p?.accounts ?? []).map((a) => ({ key: a.id, label: `${a.label}${a.kind === "webull_live" ? " · " + a.environment.toUpperCase() : ""}` }))];
  return (
    <>
      <Tabs items={tabs} active={acct} onChange={setAcct} />
      {staleAny && <Banner>ราคาบางตัวค้าง (ผู้ให้ราคาชั้น 2 ดีเลย์) — ห้ามใช้ตัดสินตั๋วเงินจริงโดยไม่ verify</Banner>}
      {error && <Banner tone="danger">โหลดพอร์ตไม่ได้: {String(error.message)}</Banner>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card glow>
          <H2>มูลค่าพอร์ต</H2>
          {!p ? <Skeleton className="h-40" /> : <>
            <div className="text-[34px] leading-tight font-semibold num">{usd(p.total_usd)}</div>
            <Muted className="num">≈ {thb(p.total_thb)}</Muted>
            <div className="mt-2"><KV rows={[
              ["กำไร/ขาดทุนจากหุ้น (ยังไม่ขาย)", <span key="u" className={p.pnl.unrealized_usd >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{p.pnl.unrealized_usd >= 0 ? "▲ +" : "▼ −"}{usd(Math.abs(p.pnl.unrealized_usd))}</span>],
              ["ขายแล้ว + ปันผล", `${usd(p.pnl.realized_usd + p.pnl.dividends_usd)}`],
              ["กำไร/ขาดทุนจากค่าเงิน", p.pnl.fx_pnl_thb == null ? <span key="f" className="text-slate-500">— (ยังไม่มีรายการฝาก/แลกเงินที่ระบุ rate)</span> : <span key="f" className={p.pnl.fx_pnl_thb >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{p.pnl.fx_pnl_thb >= 0 ? "▲ +" : "▼ −"}{thb(Math.abs(p.pnl.fx_pnl_thb))}</span>],
              ["เงินสด", `${usd(p.cash_usd)} (${pctf(p.cash_pct)})`],
              ["ค่าธรรมเนียมสะสม", usd(p.pnl.fees_usd)],
              ["เงินบาทที่ใส่", p.pnl.thb_invested ? `${thb(p.pnl.thb_invested)} @ ${p.pnl.avg_rate_paid}` : "—"],
            ]} /></div>
            <Src>{p.fx ? `FX ${p.fx.rate.toFixed(2)} · ${p.fx.source} · ${fmtTime(p.fx.asOf)}` : "FX —"}</Src>
          </>}
        </Card>
        <Card>
          <H2>สัดส่วน</H2>
          {!p ? <Skeleton className="h-32" /> : p.holdings.length === 0 ? <Empty>ยังไม่มีการถือครอง</Empty> : <>
            <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5 bg-slate-500/10 dark:bg-white/5">
              {p.holdings.map((h, i) => <div key={h.symbol} title={`${h.symbol} ${pctf(h.weight_pct)}`} style={{ width: `${h.weight_pct ?? 0}%`, background: ["#16A34A", "#7C3AED", "#D97706", "#0284C7"][i % 4] }} />)}
              <div style={{ width: `${p.cash_pct}%`, background: "#94A3B8" }} title={`เงินสด ${pctf(p.cash_pct)}`} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px] text-slate-600 dark:text-slate-400">
              {p.holdings.map((h, i) => <span key={h.symbol}><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: ["#16A34A", "#7C3AED", "#D97706", "#0284C7"][i % 4] }} />{h.symbol} {pctf(h.weight_pct)}</span>)}
              <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: "#94A3B8" }} />เงินสด {pctf(p.cash_pct)}</span>
            </div>
            {p.holdings.some((h) => (h.weight_pct ?? 0) > 8) && <div className="mt-2"><Chip tone="warn">⚠ มีตัวที่น้ำหนัก &gt; 8% (เพดานเตือน)</Chip></div>}
          </>}
        </Card>
        <Card>
          <H2>ทำอะไรได้</H2>
          <Btn block variant="primary" className="mb-2" onClick={() => setSheet(true)}><PlusIcon className="w-4 h-4" /> บันทึกรายการ (paper)</Btn>
          <Btn block className="mb-2" onClick={() => setShowTx((v) => !v)}>{showTx ? "ซ่อน" : "ดู"}รายการทั้งหมด ({txs?.transactions.length ?? 0})</Btn>
          <Muted className="text-[13px]">บัญชี Webull จะดึงจาก API เมื่อเชื่อมในหน้าตั้งค่า (ตอนนี้: สมุดบันทึกมือ)</Muted>
        </Card>
      </div>
      <Card className="mt-4">
        <H2 right={p && <Src>{p.holdings[0]?.quote_source ?? "—"} · {fmtTime(p.holdings[0]?.quote_as_of)}</Src>}>ถือครอง ({p?.holdings.length ?? 0})</H2>
        {!p ? <Skeleton className="h-24" /> : p.holdings.length === 0 ? <Empty>ยังไม่มีการถือครอง — กด &quot;บันทึกรายการ&quot; เพื่อใส่ซื้อครั้งแรก (เศษหุ้นได้)</Empty> : p.holdings.map((h) => (
          <Link key={h.symbol} href={`/stock/${h.symbol}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center py-3 border-t first:border-t-0 border-slate-900/10 dark:border-white/10">
            <div className="w-11 h-11 rounded-2xl grid place-items-center text-[12px] font-bold bg-gradient-to-br from-slate-500/15 to-slate-500/5 dark:from-white/15 dark:to-white/5">{h.symbol.slice(0, 4)}</div>
            <div className="min-w-0"><b>{h.symbol}</b> {h.stale && <Chip tone="warn">ค้าง</Chip>}<Muted className="num">{h.qty} หุ้น · ต้นทุน {h.avg_cost.toFixed(2)}</Muted></div>
            <div className="text-right"><div className="num">{usd(h.market_value)}</div><div className={cx("text-[13px] num", h.pnl_pct == null ? "text-slate-500" : h.pnl_pct >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{pctf(h.weight_pct)} · {h.pnl_pct == null ? "—" : `${h.pnl_pct >= 0 ? "▲ +" : "▼ −"}${Math.abs(h.pnl_pct).toFixed(1)}%`}</div></div>
          </Link>
        ))}
        {p && <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center py-3 border-t border-slate-900/10 dark:border-white/10"><div className="w-11 h-11 rounded-2xl grid place-items-center text-[12px] font-bold bg-slate-500/10 dark:bg-white/10">USD</div><div><b>เงินสด</b></div><div className="text-right num">{usd(p.cash_usd)}<div className="text-[13px] text-slate-600 dark:text-slate-400">{pctf(p.cash_pct)}</div></div></div>}
      </Card>
      {showTx && <Card className="mt-4"><H2>รายการ ({txs?.transactions.length ?? 0})</H2>
        {txs?.transactions.length === 0 && <Empty>ยังไม่มีรายการ</Empty>}
        {txs?.transactions.map((t) => <div key={t.id} className="flex justify-between gap-2 py-2 border-t first:border-t-0 border-slate-900/10 dark:border-white/10 text-[15px]"><div className="min-w-0"><b>{TYPES.find(([k]) => k === t.type)?.[1] ?? t.type}</b> {t.symbol && <span>{t.symbol}</span>} <Muted className="inline num">{t.qty ? `${t.qty} @ ${t.price}` : ""} {t.note}</Muted><Muted className="text-[13px]">{fmtTime(t.ts)} · {t.source}</Muted></div><div className="text-right flex items-center gap-2"><span className={cx("num", t.amountUsd >= 0 ? "text-green-700 dark:text-green-400" : "")}>{usd(t.amountUsd)}</span><button aria-label="ลบ" className="min-h-[44px] min-w-[44px] grid place-items-center rounded-2xl text-red-700 dark:text-red-400 cursor-pointer" onClick={async () => { if (!confirm("ลบรายการนี้?")) return; await api(`/api/v1/transactions?id=${t.id}`, { method: "DELETE" }); mutTx(); mutate(); }}><XIcon className="w-4 h-4" /></button></div></div>)}
      </Card>}
      {p?.caveats && <Muted className="mt-4 text-[13px]">{p.caveats.join(" · ")}</Muted>}
      {sheet && <TxSheet accounts={p?.accounts ?? []} onClose={() => setSheet(false)} onSaved={() => { setSheet(false); mutate(); mutTx(); }} />}
    </>
  );
}

function TxSheet({ accounts, onClose, onSaved }: { accounts: Portfolio["accounts"]; onClose: () => void; onSaved: () => void }) {
  const paper = accounts.filter((a) => a.kind === "manual_paper");
  const [f, setF] = useState({ accountId: paper[0]?.id ?? "paper-1", type: "buy", symbol: "", qty: "", price: "", fees: "0", fxRateThb: "", amountUsd: "", note: "", ts: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsSym = ["buy", "sell", "dividend"].includes(f.type);
  const isCash = ["deposit", "withdraw", "fx"].includes(f.type);
  const value = f.type === "buy" || f.type === "sell" ? (Number(f.qty) || 0) * (Number(f.price) || 0) : Number(f.amountUsd) || 0;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { accountId: f.accountId, type: f.type, symbol: needsSym ? f.symbol.trim().toUpperCase() : null, qty: Number(f.qty) || 0, price: Number(f.price) || 0, fees: Number(f.fees) || 0, note: f.note, fxRateThb: f.fxRateThb ? Number(f.fxRateThb) : null };
      if (isCash || f.type === "dividend") body.amountUsd = f.type === "withdraw" ? -Math.abs(Number(f.amountUsd) || 0) : Number(f.amountUsd) || 0;
      if (f.ts) body.ts = new Date(f.ts).toISOString();
      await api("/api/v1/transactions", { method: "POST", json: body });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/55 flex items-end md:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[560px] max-h-[90dvh] overflow-auto bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl p-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between mb-2"><h2 className="text-[17px] font-semibold m-0">บันทึกรายการ (Paper)</h2><Btn variant="ghost" small onClick={onClose}><XIcon className="w-4 h-4" /> ปิด</Btn></div>
        <Field label="ชนิด"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {paper.length > 1 && <Field label="บัญชี"><select className={inputCls} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{paper.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>}
        <div className="grid grid-cols-2 gap-3">
          {needsSym && <Field label="สัญลักษณ์"><input className={cx(inputCls, "uppercase")} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="VOO" /></Field>}
          {(f.type === "buy" || f.type === "sell") && <><Field label="จำนวน (เศษได้ 6 ทศนิยม)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="0.123456" /></Field><Field label="ราคา (USD/หุ้น)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="527.40" /></Field></>}
          {(isCash || f.type === "dividend") && <Field label={f.type === "dividend" ? "ปันผลรับ (USD)" : "จำนวนเงิน (USD)"}><input className={cx(inputCls, "num")} inputMode="decimal" value={f.amountUsd} onChange={(e) => setF({ ...f, amountUsd: e.target.value })} placeholder="100.00" /></Field>}
          <Field label="ค่าธรรมเนียม (USD)"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.fees} onChange={(e) => setF({ ...f, fees: e.target.value })} /></Field>
          {(isCash || f.type === "buy") && <Field label="FX rate THB/USD ที่ใช้" hint="ใส่เมื่อแลกเงิน — ใช้แยกกำไรค่าเงิน"><input className={cx(inputCls, "num")} inputMode="decimal" value={f.fxRateThb} onChange={(e) => setF({ ...f, fxRateThb: e.target.value })} placeholder="33.27" /></Field>}
          <Field label="วันเวลา (ว่าง = ตอนนี้)"><input className={inputCls} type="datetime-local" value={f.ts} onChange={(e) => setF({ ...f, ts: e.target.value })} /></Field>
        </div>
        <Field label="โน้ต"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เช่น รอบ DCA ก.ย." /></Field>
        {err && <Banner tone="danger">{err}</Banner>}
        <div className="flex items-center justify-between gap-2"><Muted className="num">มูลค่า ≈ {usd(value)}{f.fxRateThb ? ` · ${thb(value * Number(f.fxRateThb))}` : ""}</Muted><Btn variant="primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Btn></div>
      </div>
    </div>
  );
}
