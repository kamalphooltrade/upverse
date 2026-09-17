// Risk checks (SPEC F1.3 / F6.3). Every check carries the real numbers in Thai. One "block" = cannot confirm.
import type { DataFile, Quote, RiskCheck, RiskRules, Ticket } from "../types";
import { cashFrom, positionsFrom, r2 } from "../portfolio";

export interface RiskContext {
  d: DataFile;
  rules: RiskRules;
  ticket: Ticket;
  quote: Quote | null;
  quotes: Record<string, Quote | { error: string }>;
  portfolioTotal: number; // USD (positions at market + cash)
  now?: Date;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export function ticketNotional(t: Ticket, price: number | null): number | null {
  if (t.notionalUsd != null) return t.notionalUsd;
  const px = t.orderType === "LIMIT" && t.limitPrice != null ? t.limitPrice : price;
  if (t.qty != null && px != null) return r2(t.qty * px);
  return null;
}

export function ticketQty(t: Ticket, price: number | null): number | null {
  if (t.qty != null) return t.qty;
  const px = t.orderType === "LIMIT" && t.limitPrice != null ? t.limitPrice : price;
  if (t.notionalUsd != null && px) return Math.round((t.notionalUsd / px) * 1e6) / 1e6;
  return null;
}

export function runRiskChecks(ctx: RiskContext): RiskCheck[] {
  const { d, rules, ticket: t, quote, portfolioTotal } = ctx;
  const now = ctx.now ?? new Date();
  const out: RiskCheck[] = [];
  const price = quote?.price ?? null;
  const notional = ticketNotional(t, price);
  const qty = ticketQty(t, price);

  // 0. quote freshness
  if (!quote) {
    out.push({ code: "quote", state: "block", message: "ไม่มีราคาล่าสุดของ " + t.symbol + " — ตรวจกฎไม่ได้ (fail-closed)" });
  } else {
    const age = (now.getTime() - new Date(quote.asOf).getTime()) / 1000;
    if (quote.marketState === "REGULAR" && age > rules.quoteMaxAgeSec)
      out.push({ code: "quote", state: "block", message: `ราคาค้าง ${Math.round(age)} วิ > ${rules.quoteMaxAgeSec} วิ (ตลาดเปิดอยู่)` });
    else out.push({ code: "quote", state: "ok", message: `ราคา ${usd(quote.price)} · ${quote.source} · ${quote.marketState === "REGULAR" ? `ใหม่กว่า ${rules.quoteMaxAgeSec} วิ (${Math.round(age)} วิ)` : "ตลาดปิด ใช้ราคาปิดล่าสุด"}` });
  }

  // 1. notional cap
  if (notional == null) out.push({ code: "notional", state: "block", message: "คำนวณมูลค่าคำสั่งไม่ได้ (ไม่มีจำนวน/มูลค่า/ราคา)" });
  else if (notional > rules.maxOrderNotionalUsd) out.push({ code: "notional", state: "block", message: `มูลค่า ${usd(notional)} > เพดาน ${usd(rules.maxOrderNotionalUsd)}` });
  else out.push({ code: "notional", state: "ok", message: `มูลค่า ${usd(notional)} ≤ เพดาน ${usd(rules.maxOrderNotionalUsd)}` });

  // 2. qty cap
  if (qty != null && qty > rules.maxOrderQty) out.push({ code: "qty", state: "block", message: `จำนวน ${qty} > เพดาน ${rules.maxOrderQty} หุ้น` });
  else if (qty != null) out.push({ code: "qty", state: "ok", message: `จำนวน ${qty} หุ้น ≤ เพดาน ${rules.maxOrderQty}` });

  // 3. whitelist (API rail only)
  if (t.rail === "api") {
    if (!rules.symbolWhitelist.length) out.push({ code: "whitelist", state: "block", message: "whitelist ว่าง — ยังไม่อนุญาตส่งคำสั่งผ่าน API ตัวใดเลย (ใช้รางส่งมือได้)" });
    else if (!rules.symbolWhitelist.map((s) => s.toUpperCase()).includes(t.symbol.toUpperCase()))
      out.push({ code: "whitelist", state: "block", message: `${t.symbol} ไม่อยู่ใน whitelist (${rules.symbolWhitelist.join(", ")})` });
    else out.push({ code: "whitelist", state: "ok", message: `${t.symbol} อยู่ใน whitelist` });
  } else {
    out.push({ code: "whitelist", state: "ok", message: "รางส่งมือ — ต้นกดเองในแอป Webull (whitelist ไม่บังคับ)" });
  }

  // 4. single-position weight after trade (buys only)
  if (t.side === "buy" && notional != null && portfolioTotal > 0) {
    const positions = positionsFrom(d.transactions, t.accountId);
    const pos = positions.find((p) => p.symbol === t.symbol.toUpperCase());
    const q = ctx.quotes[t.symbol.toUpperCase()];
    const curMv = pos && q && !("error" in q) ? pos.qty * q.price : 0;
    const before = (curMv / portfolioTotal) * 100;
    const after = ((curMv + notional) / portfolioTotal) * 100; // cash→stock keeps total constant
    const isCore = (rules.coreSymbols ?? []).map((s) => s.toUpperCase()).includes(t.symbol.toUpperCase());
    const cap = isCore ? (rules.maxCorePct ?? 80) : rules.maxSinglePositionPct;
    const warnAt = isCore ? cap - 10 : rules.warnSinglePositionPct;
    const label = isCore ? "แกน (ETF ดัชนี)" : "หุ้นเดี่ยว";
    if (after > cap)
      out.push({ code: "weight", state: "block", message: `น้ำหนัก ${t.symbol} (${label}) หลังทำ ${pct(before)} → ${pct(after)} > เพดานแข็ง ${pct(cap)}` });
    else if (after > warnAt)
      out.push({ code: "weight", state: "warn", message: `น้ำหนัก ${t.symbol} (${label}) หลังทำ ${pct(after)} > เพดานเตือน ${pct(warnAt)}` });
    else out.push({ code: "weight", state: "ok", message: `น้ำหนัก ${t.symbol} (${label}) หลังทำ ${pct(before)} → ${pct(after)} ≤ ${pct(cap)}` });
  }

  // 5. cash after buy
  if (t.side === "buy" && notional != null) {
    const cash = cashFrom(d.transactions, t.accountId);
    const after = cash - notional;
    const afterPct = portfolioTotal > 0 ? (after / portfolioTotal) * 100 : 0;
    if (after < 0) out.push({ code: "cash", state: "block", message: `เงินสด ${usd(cash)} ไม่พอ (ขาด ${usd(-after)})` });
    else if (afterPct < rules.minCashPct && !t.tag?.startsWith("DCA"))
      out.push({ code: "cash", state: "warn", message: `เงินสดหลังซื้อ ${usd(after)} = ${pct(afterPct)} < ขั้นต่ำ ${pct(rules.minCashPct)}` });
    else out.push({ code: "cash", state: "ok", message: `เงินสดหลังซื้อ ${usd(after)} (${pct(afterPct)})` });
  }

  // 6. risk per trade (only when stop given and not DCA core)
  if (t.side === "buy" && t.stopPrice != null && qty != null && !t.tag?.startsWith("DCA")) {
    const entry = t.orderType === "LIMIT" && t.limitPrice != null ? t.limitPrice : price;
    if (entry != null && portfolioTotal > 0) {
      const riskUsd = Math.max(0, (entry - t.stopPrice) * qty);
      const riskPct = (riskUsd / portfolioTotal) * 100;
      if (riskPct > rules.maxRiskPerTradePct * 1.5) out.push({ code: "risk", state: "block", message: `ความเสี่ยงต่อไม้ ${usd(riskUsd)} = ${pct(riskPct)} > ${pct(rules.maxRiskPerTradePct * 1.5)} (1.5× เพดาน)` });
      else if (riskPct > rules.maxRiskPerTradePct) out.push({ code: "risk", state: "warn", message: `ความเสี่ยงต่อไม้ ${usd(riskUsd)} = ${pct(riskPct)} > เพดาน ${pct(rules.maxRiskPerTradePct)}` });
      else out.push({ code: "risk", state: "ok", message: `ความเสี่ยงต่อไม้ ${usd(riskUsd)} = ${pct(riskPct)} ≤ ${pct(rules.maxRiskPerTradePct)} (R = ${usd(riskUsd)})` });
    }
  } else if (t.side === "buy" && t.stopPrice == null && !t.tag?.startsWith("DCA")) {
    out.push({ code: "risk", state: "warn", message: "ไม่ได้ระบุจุดตัดขาดทุน — ไม้เก็งจังหวะควรมีเสมอ (ยกเว้น DCA แกน)" });
  }

  // 7. tickets per day + duplicate open ticket
  const today = now.toISOString().slice(0, 10);
  const sentToday = d.tickets.filter((x) => x.id !== t.id && ["confirmed", "sent", "filled"].includes(x.status) && (x.confirmedAt ?? "").slice(0, 10) === today).length;
  if (sentToday >= rules.maxTicketsPerDay) out.push({ code: "perday", state: "block", message: `ส่งแล้ว ${sentToday}/${rules.maxTicketsPerDay} ใบวันนี้` });
  else out.push({ code: "perday", state: "ok", message: `ตั๋วต่อวัน ${sentToday + 1}/${rules.maxTicketsPerDay}` });
  const dup = d.tickets.find((x) => x.id !== t.id && x.symbol === t.symbol && x.side === t.side && ["proposed", "confirmed", "sent"].includes(x.status));
  if (dup) out.push({ code: "dup", state: "warn", message: `มีตั๋ว ${t.side === "buy" ? "ซื้อ" : "ขาย"} ${t.symbol} ค้างอยู่แล้ว (${dup.status})` });

  // 8. expiry + env + kill switch
  if (new Date(t.expiresAt) < now) out.push({ code: "expiry", state: "block", message: "ตั๋วหมดอายุแล้ว" });
  if (t.rail === "api") {
    if (!d.settings.tradingEnabled) out.push({ code: "kill", state: "block", message: "Kill switch ปิดอยู่ (settings.tradingEnabled=false) — ส่งผ่าน API ไม่ได้" });
    if (process.env.TRADING_ENABLED !== "true") out.push({ code: "kill_env", state: "block", message: "env TRADING_ENABLED ≠ true — ส่งผ่าน API ไม่ได้" });
    if (t.environment !== d.settings.environment) out.push({ code: "env", state: "block", message: `ตั๋วเป็น ${t.environment} แต่ระบบอยู่ที่ ${d.settings.environment}` });
    if (!d.brokerCredentials || d.brokerCredentials.status !== "connected") out.push({ code: "broker", state: "block", message: "ยังไม่ได้เชื่อม Webull (ใส่กุญแจในหน้าตั้งค่า) — ใช้รางส่งมือแทนได้" });
  }

  // 9. sell must not exceed position
  if (t.side === "sell" && qty != null) {
    const pos = positionsFrom(d.transactions, t.accountId).find((p) => p.symbol === t.symbol.toUpperCase());
    if (!pos || pos.qty + 1e-9 < qty) out.push({ code: "position", state: "block", message: `ถือ ${pos?.qty ?? 0} หุ้น ขายไม่ได้ ${qty}` });
    else out.push({ code: "position", state: "ok", message: `ถือ ${pos.qty} หุ้น · ขาย ${qty}` });
  }

  return out;
}

export const hasBlock = (checks: RiskCheck[]) => checks.some((c) => c.state === "block");
export const summarize = (checks: RiskCheck[]) => ({
  ok: checks.filter((c) => c.state === "ok").length,
  warn: checks.filter((c) => c.state === "warn").length,
  block: checks.filter((c) => c.state === "block").length,
});

export function confirmPhraseFor(t: Ticket, qty: number | null): string {
  const side = t.side === "buy" ? "ซื้อ" : "ขาย";
  const amount = t.notionalUsd != null ? `$${t.notionalUsd}` : `${qty ?? t.qty}`;
  return `ยืนยัน ${side} ${t.symbol.toUpperCase()} ${amount}`;
}
