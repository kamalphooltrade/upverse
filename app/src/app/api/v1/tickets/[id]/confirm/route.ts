// POST /api/v1/tickets/:id/confirm — OWNER SESSION ONLY. Bearer tokens always get 403 (no such scope exists).
// Re-runs risk checks with a fresh quote, requires exact confirm phrase, idempotent, then:
//  - rail=manual → status confirmed (owner executes in Webull app, then POST /fill)
//  - rail=api    → sends to Webull only if prod + both kill switches + connected; otherwise blocked by checks
import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { isOwnerSession } from "@/lib/auth";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import { evaluate } from "../../route";
import { hasBlock, confirmPhraseFor } from "@/lib/risk";
import { decryptSecret, placeOrder } from "@/lib/webull";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner" || !(await isOwnerSession())) {
    await withData((d) => audit(d, g.p.kind, "ticket.confirm_denied", "ticket", null, { reason: "not owner session" }));
    return json({ error: { code: "owner_session_required", message: "ยืนยันตั๋วได้จากเซสชันเจ้าของในหน้าจอเท่านั้น (API token ทำไม่ได้)" } }, { status: 403 });
  }
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ phrase: z.string(), idempotencyKey: z.string().min(8).max(64) }));
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
  if (t.rail === "manual") {
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
  const creds = { appKey: decryptSecret(d.brokerCredentials.appKeyEnc), appSecret: decryptSecret(d.brokerCredentials.appSecretEnc), region: "th" as const, token: null };
  const acc = d.accounts.find((a) => a.id === t.accountId);
  if (!acc?.brokerAccountMasked) return json({ error: { code: "account", message: "บัญชีนี้ไม่ใช่บัญชี Webull" } }, { status: 422 });
  const clientOrderId = `upv-${id.slice(0, 8)}-${Date.now().toString(36)}`;
  const order = { client_order_id: clientOrderId, side: (t.side === "buy" ? "BUY" : "SELL") as "BUY" | "SELL", tif: "DAY" as const, extended_hours_trading: false, symbol: t.symbol, market: "US" as const, instrument_type: "EQUITY" as const, order_type: t.orderType, limit_price: t.limitPrice != null ? String(t.limitPrice) : undefined, qty: ev.qty != null ? String(ev.qty) : undefined, entrust_type: "QTY" as const, trading_session: "CORE" as const };
  try {
    const res = await placeOrder(creds, acc.brokerAccountMasked, order);
    const out = await withData((dd) => {
      const x = dd.tickets.find((y) => y.id === id)!;
      x.status = "sent"; x.confirmedAt = now; x.idempotencyKey = b.data.idempotencyKey; x.brokerOrderId = clientOrderId; x.riskCheck = ev.checks; x.updatedAt = nowIso();
      dd.orderLog.push({ id: uid(), ticketId: id, ts: now, action: "send", fromStatus: "proposed", toStatus: "sent", actor: "owner", detail: JSON.stringify({ request: { ...order }, response: res }).slice(0, 2000) });
      audit(dd, "owner", "ticket.send", "ticket", id, { rail: "api", clientOrderId });
      return x;
    });
    return json({ ticket: out, broker: res });
  } catch (e) {
    await withData((dd) => { dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "send_failed", fromStatus: "proposed", toStatus: "proposed", actor: "owner", detail: e instanceof Error ? e.message : String(e) }); });
    return json({ error: { code: "broker_error", message: e instanceof Error ? e.message : String(e) } }, { status: 502 });
  }
}
