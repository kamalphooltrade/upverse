// One place that turns a ticket into a Webull TH stock order — used by BOTH preview and place so they can never drift.
import type { Ticket } from "../types";
import type { StockOrder } from "./index";

export function buildStockOrder(t: Ticket, qty: number | null, clientOrderId: string): StockOrder {
  return {
    client_order_id: clientOrderId,
    side: t.side === "buy" ? "BUY" : "SELL",
    tif: "DAY",
    extended_hours_trading: false,
    symbol: t.symbol,
    market: "US",
    instrument_type: "EQUITY",
    order_type: t.orderType,
    limit_price: t.limitPrice != null ? String(t.limitPrice) : undefined,
    qty: qty != null ? String(qty) : undefined,
    entrust_type: "QTY",
    trading_session: "CORE",
  };
}
export const clientOrderIdFor = (ticketId: string) => `upv-${ticketId.slice(0, 8)}-${Date.now().toString(36)}`;
