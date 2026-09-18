// Storage layer. Default = local JSON file (paper mode, zero setup).
// When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present, the same DataFile is persisted
// as a single row in table `upverse_state` (see supabase/migrations) — simplest durable option
// for a single-owner app; per-table schema (SPEC §8) is the Phase-2 migration path.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DataFile, RiskRules, Settings } from "../types";

const DATA_DIR = process.env.UPVERSE_DATA_DIR || path.join(process.cwd(), "data");
const DATA_PATH = path.join(DATA_DIR, "upverse.json");

export const DEFAULT_RULES: RiskRules = {
  version: 1,
  activeFrom: new Date().toISOString(),
  maxOrderNotionalUsd: 500,
  maxOrderQty: 100,
  symbolWhitelist: [],
  coreSymbols: ["VOO", "SPY", "IVV", "VTI", "QQQ", "SCHD"],
  maxCorePct: 80,
  maxSinglePositionPct: 10,
  warnSinglePositionPct: 8,
  maxSectorPct: 25,
  minCashPct: 5,
  maxRiskPerTradePct: 1,
  quoteMaxAgeSec: 60,
  maxTicketsPerDay: 5,
  earningsWarnDays: 5,
};

export const DEFAULT_SETTINGS: Settings = {
  tradingEnabled: false,
  environment: "uat",
  priceProviderOrder: ["webull", "yahoo"],
  quietHours: { start: "23:30", end: "06:30" },
  hideAmountsInLine: false,
  fxUsdThb: null,
  theme: "auto",
  fxSpreadPct: null,
};

export function emptyData(): DataFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    accounts: [
      {
        id: "paper-1",
        kind: "manual_paper",
        label: "Paper (บันทึกมือ)",
        currency: "USD",
        environment: "uat",
        isActive: true,
        createdAt: now,
      },
    ],
    transactions: [],
    tickets: [],
    orderLog: [],
    watchlist: [],
    journal: [],
    goal: null,
    settings: DEFAULT_SETTINGS,
    riskRules: [DEFAULT_RULES],
    scanRuns: [],
    apiTokens: [],
    audit: [],
    brokerCredentials: null,
    owner: null,
  };
}

// ---------- backends ----------
interface Backend {
  load(): Promise<DataFile>;
  save(d: DataFile): Promise<void>;
  name: string;
}

const fileBackend: Backend = {
  name: "file",
  async load() {
    try {
      const raw = await fs.readFile(DATA_PATH, "utf8");
      return JSON.parse(raw) as DataFile;
    } catch {
      const d = emptyData();
      await this.save(d);
      return d;
    }
  },
  async save(d) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DATA_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(d, null, 2), "utf8");
    await fs.rename(tmp, DATA_PATH);
  },
};

function supabaseBackend(): Backend | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Outside Vercel, never touch the shared database unless explicitly opted in (protects prod data from local dev/tests).
  if (!process.env.VERCEL && process.env.UPVERSE_USE_SUPABASE !== "1") return null;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  const OWNER = process.env.UPVERSE_OWNER_ID || "owner";
  return {
    name: "supabase",
    async load() {
      const r = await fetch(`${url}/rest/v1/upverse_state?owner_id=eq.${OWNER}&select=data`, {
        headers,
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`supabase load ${r.status}: ${await r.text()}`);
      const rows = (await r.json()) as { data: DataFile }[];
      if (rows.length && rows[0].data) return rows[0].data;
      const d = emptyData();
      await this.save(d);
      return d;
    },
    async save(d) {
      const r = await fetch(`${url}/rest/v1/upverse_state`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({ owner_id: OWNER, data: d, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`supabase save ${r.status}: ${await r.text()}`);
    },
  };
}

export class StorageUnavailable extends Error { code = "storage_unavailable"; }
export function backend(): Backend {
  const sb = supabaseBackend();
  if (sb) return sb;
  // On Vercel the filesystem is read-only: refuse loudly instead of failing deep inside a write.
  if (process.env.VERCEL) {
    return {
      name: "none",
      async load() { throw new StorageUnavailable("ยังไม่ได้ต่อฐานข้อมูล: ตั้ง SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน Vercel env (บน Vercel ระบบไฟล์อ่านอย่างเดียว)"); },
      async save() { throw new StorageUnavailable("storage unavailable"); },
    };
  }
  return fileBackend;
}

// Simple in-process mutex so concurrent API calls don't clobber the file.
let chain: Promise<unknown> = Promise.resolve();
export function withData<T>(fn: (d: DataFile) => Promise<T> | T, opts: { save?: boolean } = { save: true }): Promise<T> {
  const run = async () => {
    const b = backend();
    const d = await b.load();
    const out = await fn(d);
    if (opts.save !== false) await b.save(d);
    return out;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export const readData = () => withData((d) => d, { save: false });
export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function audit(d: DataFile, actor: string, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) {
  d.audit.push({ id: uid(), ts: nowIso(), actor, action, entity, entityId, meta });
  if (d.audit.length > 5000) d.audit.splice(0, d.audit.length - 5000);
}

export function activeRules(d: DataFile): RiskRules {
  const r = d.riskRules[d.riskRules.length - 1];
  if (!r.coreSymbols) { r.coreSymbols = DEFAULT_RULES.coreSymbols; r.maxCorePct = DEFAULT_RULES.maxCorePct; }
  return r;
}
