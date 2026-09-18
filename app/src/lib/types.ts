// UPVerse — domain types (SPEC.md §8). Money = USD unless suffixed; qty supports fractional shares (6 dp).

export type AccountKind = "webull_live" | "manual_paper";
export type Environment = "uat" | "prod";

export interface Account {
  id: string;
  kind: AccountKind;
  label: string;
  currency: "USD";
  environment: Environment;
  isActive: boolean;
  brokerAccountMasked?: string;
  createdAt: string;
}

export type TxType = "buy" | "sell" | "dividend" | "fee" | "deposit" | "withdraw" | "fx" | "split";
export type TxSource = "manual" | "webull_fill" | "import" | "manual_after_ticket";

export interface Transaction {
  id: string;
  accountId: string;
  ts: string; // ISO
  symbol: string | null; // null for deposit/withdraw/fx
  type: TxType;
  qty: number; // shares, 6 dp; for buy/sell/split
  price: number; // USD per share (buy/sell)
  amountUsd: number; // signed cash effect in USD (+ in, − out)
  fxRateThb: number | null; // THB per USD recorded at the time (deposit/fx/buy)
  fees: number; // USD
  note: string;
  source: TxSource;
  ticketId: string | null;
  brokerOrderId: string | null;
}

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number; // USD, average cost
  costBasis: number; // USD
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  marketState: "PRE" | "REGULAR" | "POST" | "CLOSED" | "UNKNOWN";
  asOf: string; // ISO time of the quote
  source: string; // provider id
  stale: boolean; // older than freshness threshold during REGULAR hours
}

export interface Bar {
  date: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface RiskRules {
  version: number;
  activeFrom: string;
  maxOrderNotionalUsd: number;
  maxOrderQty: number;
  symbolWhitelist: string[]; // empty = block all API sends
  coreSymbols: string[]; // core sleeve (index ETFs) — exempt from single-position cap; capped by maxCorePct instead
  maxCorePct: number;
  maxSinglePositionPct: number; // hard
  warnSinglePositionPct: number;
  maxSectorPct: number;
  minCashPct: number;
  maxRiskPerTradePct: number; // qty × (entry − stop) / portfolio
  quoteMaxAgeSec: number;
  maxTicketsPerDay: number;
  earningsWarnDays: number;
}

export type TicketStatus =
  | "proposed"
  | "confirmed"
  | "sent"
  | "filled"
  | "partially_filled"
  | "cancelled"
  | "rejected"
  | "expired";

export type RiskCheckState = "ok" | "warn" | "block";
export interface RiskCheck {
  code: string;
  state: RiskCheckState;
  message: string; // Thai, with real numbers
}

export interface Ticket {
  id: string;
  accountId: string;
  kind: "stock";
  side: "buy" | "sell";
  symbol: string;
  qty: number | null; // either qty or notionalUsd
  notionalUsd: number | null;
  orderType: "LIMIT" | "MARKET";
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  thesisId: string | null;
  rationale: string;
  altZero: string; // ทางเลือกที่ 0
  invalidation: string; // อะไรจะทำให้คิดผิด
  tag: string | null; // e.g. "DCA"
  expiresAt: string;
  status: TicketStatus;
  riskCheck: RiskCheck[];
  riskRulesVersion: number;
  environment: Environment;
  proposedBy: "owner" | "agent" | "api";
  confirmedAt: string | null;
  confirmPhrase: string; // system-generated phrase the owner must type
  idempotencyKey: string | null;
  brokerOrderId: string | null;
  rail: "api" | "manual";
  createdAt: string;
  updatedAt: string;
  fill: { price: number; qty: number; ts: string } | null;
}

export interface OrderLogEntry {
  id: string;
  ticketId: string;
  ts: string;
  action: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  actor: "owner" | "agent" | "api" | "system";
  detail: string;
}

export interface WatchItem {
  id: string;
  symbol: string;
  reason: string;
  zoneLow: number | null;
  zoneHigh: number | null;
  stop: number | null;
  note: string;
  fromModel: string | null;
  createdAt: string;
}

export type Emotion = "กลัว" | "โลภ" | "เบื่อ" | "มั่นใจ" | "ลังเล";
export interface JournalEntry {
  id: string;
  ts: string;
  ticketId: string | null;
  symbol: string | null;
  decision: "ซื้อ" | "ขาย" | "ไม่ทำ" | "รอ";
  thesisShort: string;
  emotion: Emotion;
  expectation: string;
  reviewDays: 30 | 90;
  outcome: string | null;
  lesson: string | null;
}

export interface Goal {
  targetThb: number;
  targetDate: string; // YYYY-MM-DD
  startAmountThb: number;
  monthlyContributionThb: number;
  dcaDay: number; // 1..28
  allocation: { core: number; satellite: number; income: number; cash: number }; // percents, sum 100
  scenarioReturns: { low: number | null; mid: number | null; high: number | null }; // annual %, user-entered
}

export interface Settings {
  tradingEnabled: boolean;
  environment: Environment;
  priceProviderOrder: string[];
  quietHours: { start: string; end: string };
  hideAmountsInLine: boolean;
  fxUsdThb: { rate: number; asOf: string; source: string } | null;
  theme: "auto" | "dark" | "light";
  fxSpreadPct?: number | null; // THB↔USD conversion cost per leg (%). null = not published by broker → treated as 0 with a caveat
}

export interface ScanResult {
  rank: number;
  symbol: string;
  name: string;
  score: number;
  scoreParts: Record<string, number>;
  metrics: Record<string, number | string | null>;
  why: string;
  flags: string[];
  price: number;
  changePct: number;
}

export interface ScanRun {
  id: string;
  modelKey: string;
  modelVersion: string;
  runAt: string;
  universeSize: number;
  passedCount: number;
  excludedMissing: string[];
  status: "ok" | "partial" | "failed";
  results: ScanResult[];
  note: string;
}

export type ThesisStatus = "draft_ai" | "confirmed" | "stale" | "rejected";
export interface ThesisSection { title: string; body: string } // 7 หัวข้อตาม agent §2C
export interface ThesisScenario { name: "bear" | "base" | "bull"; value: number | null; assumption: string }
export interface Thesis {
  id: string;
  symbol: string;
  version: number;
  status: ThesisStatus;
  author: "agent" | "owner";
  createdAt: string;
  confirmedAt: string | null;
  staleReason: string | null;
  summary: string; // 1–2 บรรทัด
  verdict: "ถือ" | "เพิ่ม" | "ลด" | "ออก" | "รอ" | "ดูต่อ";
  role: "แกน" | "ดาวเทียม" | "รายได้" | "เก็งจังหวะ" | "ไม่เข้าเกณฑ์";
  sections: ThesisSection[];
  scenarios: ThesisScenario[];
  buyBelow: number | null; // base − margin of safety
  invalidation: string; // อะไรจะทำให้คิดผิด
  altZero: string; // ทางเลือกที่ 0
  dissent: Array<{ persona: string; point: string; response: string }>; // เสียงค้าน 3 ข้อแรก + คำตอบ
  sources: Array<{ label: string; asOf: string }>; // ที่มา + เวลา
  priceAtWrite: number | null;
  reviewAfter: string | null; // ISO date: งบถัดไป / 90 วัน
}

export interface ApiToken {
  id: string;
  prefix: string;
  hash: string; // sha256 hex
  scopes: string[];
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown>;
}

export interface DataFile {
  version: 1;
  accounts: Account[];
  transactions: Transaction[];
  tickets: Ticket[];
  orderLog: OrderLogEntry[];
  watchlist: WatchItem[];
  journal: JournalEntry[];
  goal: Goal | null;
  settings: Settings;
  riskRules: RiskRules[]; // versions, newest last
  scanRuns: ScanRun[];
  apiTokens: ApiToken[];
  audit: AuditEntry[];
  brokerCredentials: {
    appKeyEnc: string;
    appSecretEnc: string;
    keyLast4: string;
    region: string;
    environment: Environment;
    status: "connected" | "needs_2fa" | "expired" | "error" | "unset";
    lastOkAt: string | null;
    lastError: string | null;
    accessTokenEnc: string | null; // Webull access token (encrypted). PENDING until verified in Webull app.
    tokenStatus: "PENDING" | "NORMAL" | "INVALID" | "EXPIRED" | null;
    tokenCreatedAt: string | null; // 2FA window = 5 minutes from here
    tokenExpires: string | null; // as reported by Webull ("expires")
    tokenLastUsedAt: string | null; // INVALID after 15 days without calls
    accounts: Array<{ account_id: string; account_number?: string; account_type?: string }> | null;
  } | null;
  owner: { passphraseHash: string; salt: string; changedAt: string } | null; // null = use env UPVERSE_OWNER_PASSPHRASE
  theses?: Thesis[];
  liveSnapshots?: Array<{ accountId: string; brokerAccountId: string; asOf: string; currency: "USD"; cashUsd: number; buyingPowerUsd: number; marketValueUsd: number; unrealizedUsd: number; totalThbReported: number | null; positions: Array<{ symbol: string; qty: number; costPrice: number; lastPrice: number; unrealized: number; positionId: string }> }>;
  equityHistory?: Array<{ date: string; totalUsd: number; cashUsd: number; investedUsd: number; fxRate: number | null }>; // one point per day (upserted by sync / review)
}

export const API_SCOPES = [
  "portfolio:read",
  "portfolio:write",
  "quotes:read",
  "scan:read",
  "watchlist:write",
  "theses:write",
  "theses:read",
  "tickets:propose",
  "journal:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
