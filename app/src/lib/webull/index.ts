// Webull OpenAPI client (TypeScript port of the signing scheme in webull-openapi-python-sdk 3.0.1, region "th").
// Verified against SDK source 17 Sep 2026: hosts api.webull.co.th / data-api.webull.co.th; HMAC-SHA256 signer v1.0;
// token flow = POST /auth/tokens/create → poll POST /auth/tokens/check until status NORMAL (2FA approved in Webull app).
// FINDING: the SDK has NO separate UAT/sandbox host. "UAT" in UPVerse therefore means "paper rail — nothing is sent";
// real sends only happen when settings.environment === "prod" AND both kill switches are on.
import { createHash, createHmac, randomUUID } from "node:crypto";

export const WEBULL_HOSTS = { th: { api: "api.webull.co.th", data: "data-api.webull.co.th" } } as const;

export interface WebullCreds { appKey: string; appSecret: string; region: "th"; token?: string | null }

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

function buildStringToSign(uri: string, signParams: Record<string, string>, bodyHex: string | null) {
  const sorted = Object.keys(signParams).sort().map((k) => `${k}=${signParams[k]}`);
  let s = uri ? `${uri}&${sorted.join("&")}` : sorted.join("=");
  if (bodyHex) s += `&${bodyHex}`;
  // python quote(s, safe='') — encode everything except A-Z a-z 0-9 - . _ ~
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function signRequest(opts: { host: string; uri: string; query?: Record<string, string | number | undefined>; body?: unknown; creds: WebullCreds; version?: string }) {
  const headers: Record<string, string> = {
    "x-app-key": opts.creds.appKey,
    "x-timestamp": isoNow(),
    "x-signature-version": "1.0",
    "x-signature-algorithm": "HMAC-SHA256",
    "x-signature-nonce": randomUUID(),
    "x-version": opts.version ?? "v3",
  };
  // SDK signs only the 5 signature headers + Host (x-version is sent but NOT signed).
  const SIGNED = ["x-app-key", "x-timestamp", "x-signature-version", "x-signature-algorithm", "x-signature-nonce"];
  const signParams: Record<string, string> = { ...Object.fromEntries(SIGNED.map((k) => [k, headers[k]])), host: opts.host };
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null) query[k] = String(v);
  for (const [k, v] of Object.entries(query)) signParams[k] = signParams[k] != null ? `${signParams[k]}&${v}` : v;
  let bodyStr: string | null = null, bodyHex: string | null = null;
  if (opts.body !== undefined) {
    bodyStr = JSON.stringify(opts.body); // compact, like json.dumps(separators=(',',':'))
    bodyHex = createHash("sha256").update(bodyStr, "utf8").digest("hex").toUpperCase();
  }
  const stringToSign = buildStringToSign(opts.uri, signParams, bodyHex);
  headers["x-signature"] = createHmac("sha256", opts.creds.appSecret + "&").update(stringToSign, "utf8").digest("base64");
  headers["x-webull-client-source"] = "UPVerse";
  if (opts.creds.token) headers["x-access-token"] = opts.creds.token;
  const qs = Object.keys(query).length ? "?" + new URLSearchParams(query).toString() : "";
  return { url: `https://${opts.host}${opts.uri}${qs}`, headers, bodyStr };
}

export class WebullError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function callWebull<T = unknown>(opts: { host?: "api" | "data"; method: "GET" | "POST"; uri: string; query?: Record<string, string | number | undefined>; body?: unknown; creds: WebullCreds }): Promise<T> {
  const host = WEBULL_HOSTS[opts.creds.region][opts.host ?? "api"];
  const { url, headers, bodyStr } = signRequest({ host, uri: opts.uri, query: opts.query, body: opts.method === "POST" ? (opts.body ?? {}) : undefined, creds: opts.creds });
  const r = await fetch(url, { method: opts.method, headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" }, body: opts.method === "POST" ? bodyStr : undefined, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!r.ok) {
    const j = (json ?? {}) as { error_code?: string; message?: string; code?: string; msg?: string };
    throw new WebullError(r.status, j.error_code ?? j.code ?? String(r.status), j.message ?? j.msg ?? text.slice(0, 200));
  }
  return json as T;
}

// ---------- token (2FA) ----------
export interface AccessToken { token: string; expires: number | string; status: "NORMAL" | "PENDING" | string }
export const createToken = (creds: WebullCreds, existing?: string | null) => callWebull<AccessToken>({ method: "POST", uri: "/auth/tokens/create", body: existing ? { token: existing } : {}, creds });
export const checkToken = (creds: WebullCreds, token: string) => callWebull<AccessToken>({ method: "POST", uri: "/auth/tokens/check", body: { token }, creds });
export const refreshToken = (creds: WebullCreds, token: string) => callWebull<AccessToken>({ method: "POST", uri: "/openapi/auth/token/refresh", body: { token }, creds });

// ---------- account (v3 "trading" API — verified live on api.webull.co.th, 18 Sep 2026) ----------
export interface WebullAccount { account_id: string; account_number?: string; account_type?: string; account_label?: string; account_class?: string }
export interface WebullBalance { total_asset_currency: string; total_market_value: string; total_cash_balance: string; total_unrealized_profit_loss: string; account_currency_assets: Array<{ currency: string; market_value: string; cash_balance: string; buying_power: string; unrealized_profit_loss: string }> }
export interface WebullPosition { currency: string; quantity: string; position_id: string; symbol: string; instrument_type: string; cost_price: string; last_price: string; unrealized_profit_loss: string }
export interface WebullOrderLeg { symbol: string; side: "BUY" | "SELL"; status: string; client_order_id: string; order_id?: string; order_type: string; instrument_type: string; filled_quantity?: string; filled_price?: string; place_time?: string; filled_time?: string; time_in_force?: string; quantity?: string; limit_price?: string }
export interface WebullOrderGroup { client_order_id: string; combo_type: string; orders: WebullOrderLeg[] }
export const listAccounts = (creds: WebullCreds) => callWebull<WebullAccount[]>({ method: "GET", uri: "/trading/accounts/list", creds });
export const accountBalance = (creds: WebullCreds, accountId: string, currency = "USD") => callWebull<WebullBalance>({ method: "GET", uri: "/trading/assets/balances/get", query: { account_id: accountId, total_asset_currency: currency }, creds });
export const accountPositions = (creds: WebullCreds, accountId: string) => callWebull<WebullPosition[]>({ method: "GET", uri: "/trading/assets/positions/list", query: { account_id: accountId }, creds });
export const openOrders = (creds: WebullCreds, accountId: string) => callWebull<{ data: WebullOrderGroup[] }>({ method: "GET", uri: "/trading/orders/open-orders/list", query: { account_id: accountId, page_size: 50 }, creds });
export const orderHistory = (creds: WebullCreds, accountId: string, pageSize = 100) => callWebull<{ data: WebullOrderGroup[] }>({ method: "GET", uri: "/trading/orders/historical-orders/list", query: { account_id: accountId, page_size: pageSize }, creds });
export const orderDetail = (creds: WebullCreds, accountId: string, clientOrderId: string) => callWebull<Record<string, unknown>>({ method: "GET", uri: "/trading/orders/get", query: { account_id: accountId, client_order_id: clientOrderId }, creds });

// ---------- orders (stock) ----------
export interface StockOrder {
  client_order_id: string;
  side: "BUY" | "SELL";
  tif: "DAY" | "GTC";
  extended_hours_trading: boolean;
  instrument_id?: string;
  symbol?: string;
  market?: "US";
  instrument_type?: "EQUITY";
  order_type: "LIMIT" | "MARKET" | "STOP" | "STOP_LOSS_LIMIT";
  limit_price?: string;
  stop_price?: string;
  qty?: string;
  entrust_type?: "QTY" | "CASH";
  total_cash_amount?: string;
  trading_session?: "CORE";
}
export const previewOrder = (creds: WebullCreds, accountId: string, stock_order: StockOrder) => callWebull<Record<string, unknown>>({ method: "POST", uri: "/trading/orders/preview", body: { account_id: accountId, stock_order }, creds });
export const placeOrder = (creds: WebullCreds, accountId: string, stock_order: StockOrder) => callWebull<Record<string, unknown>>({ method: "POST", uri: "/trading/orders/place", body: { account_id: accountId, stock_order }, creds });
export const cancelOrder = (creds: WebullCreds, accountId: string, clientOrderId: string) => callWebull<Record<string, unknown>>({ method: "POST", uri: "/trading/orders/cancel", body: { account_id: accountId, client_order_id: clientOrderId }, creds });

// ---------- market data (requires market-data subscription; 403 otherwise) ----------
export const snapshot = (creds: WebullCreds, symbols: string[]) => callWebull<unknown[]>({ host: "data", method: "GET", uri: "/market-data/snapshot", query: { symbols: symbols.join(","), category: "US_STOCK" }, creds });
export const batchBars = (creds: WebullCreds, symbols: string[], count = 250) => callWebull<unknown>({ host: "data", method: "POST", uri: "/market-data/stocks/bars/list", body: { symbols: symbols.join(","), category: "US_STOCK", timespan: "D", count: String(count) }, creds });

// ---------- credential encryption at rest (AES-256-GCM, key from env) ----------
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function masterKey(): Buffer {
  const k = process.env.UPVERSE_MASTER_KEY;
  if (!k) throw new Error("UPVERSE_MASTER_KEY ยังไม่ได้ตั้ง (ต้องมี 32 ไบต์ base64/hex) — ใส่ใน .env.local ก่อนเชื่อม Webull");
  const buf = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("UPVERSE_MASTER_KEY ต้องยาว 32 ไบต์");
  return buf;
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}
export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1") throw new Error("unknown ciphertext version");
  const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
export const masterKeyConfigured = () => { try { masterKey(); return true; } catch { return false; } };
