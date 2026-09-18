// POST /api/v1/tickets/:id/preview — asks Webull to PREVIEW the exact order the API rail would send (no order is placed).
// Owner session, or the operator with CRON_SECRET (testing the rail before the owner opens the gates).
// Returns the request body we would send + Webull's raw response (fees / rejects / fractional support) and logs both.
import { gate, json, safe } from "@/lib/api";
import { isOwnerSession } from "@/lib/auth";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import { evaluate } from "../../route";
import { previewOrder } from "@/lib/webull";
import { credsFrom } from "@/lib/webull/session";
import { buildStockOrder, clientOrderIdFor } from "@/lib/webull/orders";

async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cron = req.headers.get("x-cron-secret");
  const cronOk = !!process.env.CRON_SECRET && cron === process.env.CRON_SECRET;
  let actor: "owner" | "system" = "system";
  if (!cronOk) {
    const g = await gate(req, null);
    if ("res" in g) return g.res;
    if (g.p.kind !== "owner" || !(await isOwnerSession())) return json({ error: { code: "owner_session_required", message: "preview ได้จากเซสชันเจ้าของเท่านั้น" } }, { status: 403 });
    actor = "owner";
  }
  const { id } = await ctx.params;
  const d = await readData();
  const t = d.tickets.find((x) => x.id === id);
  if (!t) return json({ error: { code: "not_found", message: "ไม่พบตั๋ว" } }, { status: 404 });
  if (!d.brokerCredentials || d.brokerCredentials.status !== "connected") return json({ error: { code: "broker", message: "ยังไม่ได้เชื่อม Webull" } }, { status: 422 });
  const creds = credsFrom(d);
  if (!creds?.token || d.brokerCredentials.tokenStatus !== "NORMAL") return json({ error: { code: "broker", message: `token Webull สถานะ ${d.brokerCredentials.tokenStatus ?? "—"} (ต้อง NORMAL)` } }, { status: 422 });
  const acc = d.accounts.find((a) => a.id === t.accountId);
  if (!acc?.brokerAccountMasked) return json({ error: { code: "account", message: "ตั๋วนี้ไม่ได้ผูกบัญชี Webull" } }, { status: 422 });
  const ev = await evaluate(d, t);
  const order = buildStockOrder(t, ev.qty, clientOrderIdFor(id));
  const started = Date.now();
  try {
    const res = await previewOrder(creds, acc.brokerAccountMasked, order);
    await withData((dd) => {
      dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "preview", fromStatus: t.status, toStatus: t.status, actor, detail: JSON.stringify({ request: order, response: res }).slice(0, 2000) });
      if (dd.brokerCredentials) dd.brokerCredentials.tokenLastUsedAt = nowIso();
      audit(dd, actor, "ticket.preview", "ticket", id, { symbol: t.symbol, side: t.side, ms: Date.now() - started });
    });
    return json({ ok: true, request: { account_id: acc.brokerAccountMasked, stock_order: order }, broker: res, checks: ev.checks, note: "preview เท่านั้น — ยังไม่มีคำสั่งถูกส่ง" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await withData((dd) => { dd.orderLog.push({ id: uid(), ticketId: id, ts: nowIso(), action: "preview_failed", fromStatus: t.status, toStatus: t.status, actor, detail: JSON.stringify({ request: order, error: msg }).slice(0, 2000) }); });
    return json({ ok: false, request: { account_id: acc.brokerAccountMasked, stock_order: order }, error: { code: "broker_error", message: msg }, checks: ev.checks }, { status: 502 });
  }
}
export const POST = safe(_POST);
