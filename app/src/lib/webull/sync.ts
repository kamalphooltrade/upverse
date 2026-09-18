// Sync Webull account → UPVerse (SPEC F2.2). Creates/updates a `webull_live` account per broker account,
// stores a holdings snapshot (qty · cost · last_price from Webull), cash from balance, and imports FILLED orders
// as transactions (source webull_fill, deduped by broker order id). Paper accounts are untouched.
import type { DataFile, Transaction } from "../types";
import { withData, nowIso, uid, audit } from "../store";
import { accountBalance, accountPositions, orderHistory, type WebullPosition, type WebullBalance } from "./index";
import { credsFrom } from "./session";

export interface LiveSnapshot {
  accountId: string; // UPVerse account id
  brokerAccountId: string;
  asOf: string;
  currency: "USD";
  cashUsd: number;
  buyingPowerUsd: number;
  marketValueUsd: number;
  unrealizedUsd: number;
  totalThbReported: number | null; // Webull reports total in THB for TH accounts
  positions: Array<{ symbol: string; qty: number; costPrice: number; lastPrice: number; unrealized: number; positionId: string }>;
}

const num = (s: string | number | null | undefined) => (s == null || s === "" ? 0 : Number(s));

export async function syncWebull(): Promise<{ snapshots: LiveSnapshot[]; importedFills: number; errors: string[] }> {
  return withData(async (d) => {
    const bc = d.brokerCredentials;
    const creds = credsFrom(d);
    const errors: string[] = [];
    if (!bc || !creds?.token || bc.tokenStatus !== "NORMAL") throw new Error("ยังไม่ได้เชื่อม Webull (token ต้องเป็น NORMAL)");
    const accounts = bc.accounts ?? [];
    if (!accounts.length) throw new Error("ไม่มีรายการบัญชี — กด \"ตรวจสถานะ\" ในหน้าตั้งค่าก่อน");
    const snapshots: LiveSnapshot[] = [];
    let importedFills = 0;
    for (const a of accounts) {
      // ensure UPVerse account
      let acc = d.accounts.find((x) => x.kind === "webull_live" && x.brokerAccountMasked === a.account_id);
      if (!acc) {
        acc = { id: `webull-${a.account_id.slice(-6)}`, kind: "webull_live", label: `Webull ${a.account_number ?? a.account_id.slice(-4)}${a.account_type ? " · " + a.account_type : ""}`, currency: "USD", environment: d.settings.environment, isActive: true, brokerAccountMasked: a.account_id, createdAt: nowIso() };
        d.accounts.push(acc);
      }
      let bal: WebullBalance | null = null, pos: WebullPosition[] = [];
      try { bal = await accountBalance(creds, a.account_id, "USD"); } catch (e) { errors.push(`balance ${a.account_number ?? a.account_id}: ${e instanceof Error ? e.message : String(e)}`); }
      try { pos = await accountPositions(creds, a.account_id); } catch (e) { errors.push(`positions ${a.account_number ?? a.account_id}: ${e instanceof Error ? e.message : String(e)}`); }
      const usd = bal?.account_currency_assets.find((x) => x.currency === "USD");
      const snap: LiveSnapshot = {
        accountId: acc.id, brokerAccountId: a.account_id, asOf: nowIso(), currency: "USD",
        cashUsd: num(usd?.cash_balance), buyingPowerUsd: num(usd?.buying_power), marketValueUsd: num(usd?.market_value), unrealizedUsd: num(usd?.unrealized_profit_loss),
        totalThbReported: bal?.total_asset_currency === "THB" ? num(bal.total_market_value) + num(bal.total_cash_balance) : null,
        positions: pos.filter((p) => p.currency === "USD").map((p) => ({ symbol: p.symbol, qty: num(p.quantity), costPrice: num(p.cost_price), lastPrice: num(p.last_price), unrealized: num(p.unrealized_profit_loss), positionId: p.position_id })),
      };
      snapshots.push(snap);
      // import filled orders as transactions (dedupe by broker order id)
      try {
        // Webull TH historical-orders: only the recent window is returned; start_time/end_time in any format → 417,
        // and rapid paging → 429. So: single page, positions snapshot remains the source of truth (verified 18 Sep 2026).
        const hist = await orderHistory(creds, a.account_id, 100);
        const groups = hist.data ?? [];
        for (const g of groups) for (const o of g.orders ?? []) {
          if (o.status !== "FILLED" || !o.filled_quantity || !o.filled_price) continue;
          const boid = o.order_id ?? o.client_order_id;
          const ids = [o.order_id, o.client_order_id, g.client_order_id].filter(Boolean) as string[];
          if (d.transactions.some((t) => t.brokerOrderId && ids.includes(t.brokerOrderId))) continue;
          const qty = num(o.filled_quantity), price = num(o.filled_price);
          const side = o.side === "BUY" ? "buy" : "sell";
          const ts = o.filled_time ?? o.place_time ?? nowIso();
          // reconcile with the app's tickets: (1) API rail → same client_order_id · (2) manual rail → confirmed ticket, same account/symbol/side/qty, not expired
          const ticket = d.tickets.find((t) => t.accountId === acc.id && t.symbol === o.symbol && t.side === side && ["confirmed", "sent"].includes(t.status) && ((t.brokerOrderId && ids.includes(t.brokerOrderId)) || (t.qty != null && Math.abs(t.qty - qty) < 1e-6)));
          // a manual-rail fill the owner already typed in (source manual_after_ticket) → link it instead of duplicating the ledger
          const dupManual = d.transactions.find((t) => t.accountId === acc.id && t.symbol === o.symbol && t.type === side && !t.brokerOrderId && t.source === "manual_after_ticket" && Math.abs(t.qty - qty) < 1e-6 && Math.abs(new Date(t.ts).getTime() - new Date(ts).getTime()) < 3 * 86400e3);
          if (dupManual) { dupManual.brokerOrderId = boid; dupManual.note += ` · จับคู่ Webull ${boid}`; continue; }
          const tx: Transaction = { id: uid(), accountId: acc.id, ts, symbol: o.symbol, type: side, qty, price, amountUsd: Math.round((side === "buy" ? -qty * price : qty * price) * 100) / 100, fxRateThb: null, fees: 0, note: `Webull ${o.order_type}${o.time_in_force ? " " + o.time_in_force : ""}${ticket ? ` · ตั๋ว ${ticket.id.slice(0, 8)}` : ""}`, source: "webull_fill", ticketId: ticket?.id ?? null, brokerOrderId: boid };
          d.transactions.push(tx); importedFills++;
          if (ticket) {
            const from = ticket.status;
            ticket.status = "filled"; ticket.fill = { price, qty, ts }; ticket.brokerOrderId = ticket.brokerOrderId ?? boid; ticket.updatedAt = nowIso();
            d.orderLog.push({ id: uid(), ticketId: ticket.id, ts: nowIso(), action: "fill", fromStatus: from, toStatus: "filled", actor: "system", detail: `จับคู่ fill จาก Webull sync: ${qty} @ ${price} (${boid})` });
            audit(d, "system", "ticket.fill_from_sync", "ticket", ticket.id, { qty, price, boid });
          }
        }
      } catch (e) { errors.push(`orders ${a.account_number ?? a.account_id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    d.liveSnapshots = snapshots;
    // equity history: one point per day from broker-reported cash + market value (nightly sync keeps it growing)
    if (snapshots.length) {
      const date = nowIso().slice(0, 10);
      const cashUsd = Math.round(snapshots.reduce((n, s) => n + s.cashUsd, 0) * 100) / 100;
      const mv = Math.round(snapshots.reduce((n, s) => n + s.marketValueUsd, 0) * 100) / 100;
      d.equityHistory = [...(d.equityHistory ?? []).filter((p) => p.date !== date), { date, totalUsd: Math.round((cashUsd + mv) * 100) / 100, cashUsd, investedUsd: mv, fxRate: d.settings.fxUsdThb?.rate ?? null }].slice(-1500);
    }
    bc.tokenLastUsedAt = nowIso(); bc.lastOkAt = nowIso();
    audit(d, "owner", "webull.sync", "broker", null, { accounts: snapshots.length, importedFills, errors: errors.length });
    return { snapshots, importedFills, errors };
  });
}
