// POST /api/v1/tickets/:id/confirm — OWNER SESSION ONLY. Bearer tokens always get 403 (no such scope exists).
// Re-runs risk checks with a fresh quote, requires exact confirm phrase, idempotent, then:
//  - rail=manual → status confirmed (owner executes in Webull app, then POST /fill)
//  - rail=api    → sends to Webull only if prod + both kill switches + connected; otherwise blocked by checks
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { isOwnerSession } from "@/lib/auth";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import { evaluate } from "../../route";
import { hasBlock, confirmPhraseFor } from "@/lib/risk";
import { placeOrder, orderDetail } from "@/lib/webull";
import { buildStockOrder, clientOrderIdFor } from "@/lib/webull/orders";
import { credsFrom } from "@/lib/webull/session";

async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner" || !(await isOwnerSession())) {
    await withData((d) => audit(d, g.p.kind, "ticket.confirm_denied", "ticket", null, { reason: "not owner session" }));
    return json({ error: { code: "owner_session_required", message: "ยืนยันตั๋วได้จากเซสชันเจ้าของในหน้าจอเท่านั้น (API token ทำไม่ได้)" } }, { status: 403 });
  }
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ phrase: z.string(), idempotencyKey: z.string().min(8).max(64), rail: z.enum(["api", "manual"]).optional() }));
  if (!b.ok) return b.res;
  const d = await readData();
  const t = d.tickets.find((x) => x.id === id);
  if (!t) return json({ error: { code: "not_found", message: "ไม่พบตั๋ว" } }, { status: 404 });
  if (t.idempotencyKey && t.idempotencyKey === b.data.idempotencyKey) return json({ ticket: t, note: "ยืนยันไปแล้ว (idempotent)" });
  if (t.status !== "proposed") return json({ error: { code: "bad_status", message: `ตั๋วอยู่สถานะ ${t.status} ยืนยันไม่ได้` } }, { status: 409 });
  const ev = await evaluate(d, t);
  const phrase = confirmPhraseFor(t, ev.qty);
  if (b.data.phrase.trim() !== phrase) return json({ error: { code: "phrase_mismatch", message: `ประโยคไม่ตรง ต้องพิมพ์: ${phrase}` }, checks: ev.checks }, { status: 422 });
  if (hasBlock(ev.checks)) return json({ error: { code: "risk_blocked", message: "มี ⛔ ในผลตรวจกฎ — ยืนยันไม่ได้" }, checks: ev.checks }, { status: 422 });

  const now = nowIso();
  const rail = b.data.rail ?? t.rail; // owner may choose the rail at confirm time (defaults to the ticket's rail)
  if (rail === "manual") {
    const out = await withData((dd) => {
      const x = dd.tickets.find((y) => y.id === id)!;
      x.status = "confirmed"; x.confirmedAt = now; x.idempotencyKey = b.data.idempotencyKey; x.riskCheck = ev.checks; x.updatedAt = now;
      dd.orderLog.push({ id: uid(), ticketId: id, ts: now, action: "confirm", fromStatus: "proposed", toStatus: "confirmed", actor: "owner", detail: "manual rail — owner executes in Webull app" });
      audit(dd, "owner", "ticket.confirm", "ticket", id, { rail: "manual" });
      return x;
    });
    return json({ ticket: out, next: "ทำรายการในแอป Webull แล้วกลับมากด 'ทำแล้ว' (POST /fill) เพื่อบันทึกราคา/จำนวนจริง" });
  }

  // api rail — guarded again here (defense in depth)
  if (d.settings.environment !== "prod") return json({ error: { code: "uat_no_send", message: "environment=uat: ไม่มี sandbox ฝั่ง Webull TH — ใช้รางส่งมือ หรือเปิด prod ตามประตูเฟส 2" } }, { status: 422 });
  if (!d.settings.tradingEnabled || process.env.TRADING_ENABLED !== "true") return json({ error: { code: "kill_switch", message: "kill switch ปิดอยู่" } }, { status: 422 });
  if (!d.brokerCredentials || d.brokerCredentials.status !== "connected") return json({ error: { code: "broker", message: "ยังไม่ได้เชื่อม Webull" } }, { status: 422 });
  const creds = credsFrom(d);
  if (!creds?.token) return json({ error: { code: "broker", message: "token Webull ยังไม่พร้อม — ตรวจสถานะในหน้าตั้งค่า" } }, { status: 422 });
  const acc = d.accounts.find((a) => a.id === t.accountId);
  if (!acc?.brokerAccountMasked) return json({ error: { code: "account", message: "บัญชีนี้ไม่ใช่บัญชี Webull" } }, { status: 422 });
  if (d.brokerCredentials.tokenStatus !== "NORMAL") return json({ error: { code: "broker", message: `token สถานะ ${d.brokerCredentials.tokenStatus ?? "—"} (ต้อง NORMAL)` } }, { status: 422 });
  if (rules_whitelist_blocked(d, t)) return json({ error: { code: "whitelist", message: `${t.symbol} ไม่อยู่ใน whitelist ของกฎ — รางส่ง API ต้องมี whitelist` } }, { status: 422 });
  const clientOrderId = clientOrderIdFor(id);
  const order = buildStockOrder(t, ev.qty, clientOrderId);
  // a successful Webull preview of this exact body within 10 minutes is mandatory before an API-rail send (agent §0.2 / lucifer D)
  const wanted = JSON.stringify(order);
  const recentPreview = d.orderLog.filter((l) => l.ticketId === id && l.action === "preview" && Date.now() - new Date(l.ts).getTime() < 10 * 60e3).some((l) => { try { return JSON.stringify(JSON.parse(l.detail).request) === wanted; } catch { return false; } });
  if (!recentPreview) return json({ error: { code: "preview_required", message: "ต้องกด \"ดูตัวอย่างจาก Webull\" ให้ผ่านภายใน 10 นาทีก่อนส่งผ่าน API (body ต้องเหมือนกันทุกตัวอักษร)" } }, { status: 422 });
  // persist the attempt BEFORE calling the broker: if the DB is fine but the broker times out, the app still knows an order may exist
  await withData((dd) => {
    const x = dd.tickets.find((y) => y.id === id)!;
    x.brokerOrderId = clientOrderId; x.updatedAt = nowIso();
    dd.orderLog.push({ id: uid(), ticketId: id, ts: now, action: "send_attempt", fromStatus: "proposed", toStatus: "proposed", actor: "owner", detail: JSON.stringify({ request: { account_id: acc.brokerAccountMasked, new_orders: [order] } }).slice(0, 2000) });
  });
  try {
    const res = await placeOrder(creds, acc.brokerAccountMasked, order);
    const brokerId = (res && typeof res.order_id === "string" && res.order_id) || clientOrderId;
    await withData((dd) => {
      const x = dd.tickets.find((y) => y.id === id)!;
      x.status = "sent"; x.rail = "api"; x.confirmedAt = now; x.idempotencyKey = b.data.idempotencyKey; x.brokerOrderId = brokerId; x.riskCheck = ev.checks; x.updatedAt = nowIso();
      dd.orderLog.push({ id: uid(), ticketId: id, ts: now, action: "send", fromStatus: "proposed", toStatus: "sent", actor: "owner", detail: JSON.stringify({ request: { account_id: acc.brokerAccountMasked, new_orders: [order] }, response: res }).slice(0, 2000) });
      audit(dd, "owner", "ticket.send", "ticket", id, { rail: "api", clientOrderId, orderId: brokerId });
    });
    // follow the order for a short while so the app knows what happened (full reconciliation also runs on every Webull sync)
    let last: Record<string, unknown> | null = null;
    let filled: { price: number; qty: number; ts: string } | null = null;
    for (let i = 0; i < 6 && !filled; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        last = await orderDetail(creds, acc.brokerAccountMasked, clientOrderId);
        const legs = (last as { orders?: Array<Record<string, unknown>> }).orders ?? [];
        const leg = legs[0] ?? {};
        const st = String(leg.status ?? leg.order_status ?? "");
        const fq = Number(leg.filled_quantity ?? 0), fp = Number(leg.filled_price ?? 0);
        if (st === "FILLED" && fq > 0 && fp > 0) filled = { price: fp, qty: fq, ts: String(leg.filled_time ?? nowIso()) };
        if (["CANCELLED", "REJECTED", "FAILED"].includes(st)) break;
      } catch (e) { last = { error: e instanceof Error ? e.message : String(e) }; }
    }
    const out = await withData((dd) => {
      const x = dd.tickets.find((y) => y.id === id)!;
      dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "status_poll", fromStatus: "sent", toStatus: filled ? "filled" : "sent", actor: "system", detail: JSON.stringify(last ?? {}).slice(0, 2000) });
      if (filled && !dd.transactions.some((tx) => tx.brokerOrderId === brokerId || tx.brokerOrderId === clientOrderId)) {
        const amount = x.side === "buy" ? -(filled.qty * filled.price) : filled.qty * filled.price;
        dd.transactions.push({ id: uid(), accountId: x.accountId, ts: filled.ts, symbol: x.symbol, type: x.side, qty: filled.qty, price: filled.price, amountUsd: Math.round(amount * 100) / 100, fxRateThb: null, fees: 0, note: `Webull API rail · ตั๋ว ${id.slice(0, 8)} (ค่าธรรมเนียมจริงดูใบยืนยัน Webull)`, source: "webull_fill", ticketId: id, brokerOrderId: brokerId });
        x.status = "filled"; x.fill = filled; x.updatedAt = nowIso();
        dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "fill", fromStatus: "sent", toStatus: "filled", actor: "system", detail: `${filled.qty} @ ${filled.price}` });
        audit(dd, "system", "ticket.fill_from_poll", "ticket", id, { qty: filled.qty, price: filled.price });
      }
      return x;
    });
    return json({ ticket: out, broker: res, detail: last, note: filled ? "fill แล้ว → บันทึกลงพอร์ต · เขียน journal ภายใน 24 ชม." : "ส่งแล้ว ยังไม่เห็น fill — ระบบจะจับคู่เองตอน sync ครั้งถัดไป (หรือกด 'ดึงจาก Webull')" });
  } catch (e) {
    await withData((dd) => { dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "send_failed", fromStatus: "proposed", toStatus: "proposed", actor: "owner", detail: e instanceof Error ? e.message : String(e) }); });
    return json({ error: { code: "broker_error", message: `${e instanceof Error ? e.message : String(e)} — ⚠ ห้ามกดยืนยันซ้ำจนกว่าจะตรวจในแอป Webull ว่าคำสั่ง ${clientOrderId} ถูกส่งไปแล้วหรือไม่ (client_order_id คงที่ต่อตั๋ว: ส่งซ้ำจะถูก Webull ปฏิเสธ)` } }, { status: 502 });
  }
}
export const POST = safe(_POST);

// whitelist is only enforced by the risk engine when the ticket's own rail is "api"; re-check here because the owner may switch rail at confirm time
function rules_whitelist_blocked(d: Awaited<ReturnType<typeof readData>>, t: { symbol: string }) {
  const r = d.riskRules[d.riskRules.length - 1];
  return !r.symbolWhitelist.length || !r.symbolWhitelist.map((s) => s.toUpperCase()).includes(t.symbol.toUpperCase());
}
