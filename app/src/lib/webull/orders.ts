// One place that turns a ticket into a Webull TH stock order — used by BOTH preview and place so they can never drift.
// Schema: docs reference/trade-api/common-order-place.md (TH v3): new_orders[] · quantity (decimals ok) · support_trading_session · time_in_force.
import type { Ticket } from "../types";
import type { NewOrder } from "./index";

export function buildStockOrder(t: Ticket, qty: number | null, clientOrderId: string): NewOrder {
  const o: NewOrder = {
    combo_type: "NORMAL",
    client_order_id: clientOrderId,
    instrument_type: "EQUITY",
    market: "US",
    symbol: t.symbol,
    order_type: t.orderType,
    entrust_type: "QTY",
    support_trading_session: "CORE",
    time_in_force: "DAY",
    side: t.side === "buy" ? "BUY" : "SELL",
  };
  if (qty != null) o.quantity = String(qty);
  if (t.limitPrice != null) o.limit_price = String(t.limitPrice);
  return o;
}
/** ≤ 32 chars · letters/digits/-/_ · unique per account: upv-<8 of ticket id>-<base36 time> = 22 chars */
export const clientOrderIdFor = (ticketId: string) => `upv-${ticketId.slice(0, 8)}-${Date.now().toString(36)}`;
