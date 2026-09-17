// GET /api/v1/health — proves what is ACTUALLY enforced (SPEC F12). No auth.
import { readData, backend } from "@/lib/store";
import { masterKeyConfigured } from "@/lib/webull";
import { ownerConfigured } from "@/lib/auth";
import { scanStatus } from "@/lib/scan/runner";
import { json } from "@/lib/api";

export async function GET() {
  const d = await readData();
  const lastScan = d.scanRuns.length ? d.scanRuns[d.scanRuns.length - 1].runAt : null;
  const rules = d.riskRules[d.riskRules.length - 1];
  return json({
    ok: true,
    app: "UPVerse",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    time: new Date().toISOString(),
    storage: backend().name,
    owner_auth: ownerConfigured() ? "passphrase" : "OPEN (dev only — set UPVERSE_OWNER_PASSPHRASE)",
    trading: {
      environment: d.settings.environment,
      trading_enabled_setting: d.settings.tradingEnabled,
      trading_enabled_env: process.env.TRADING_ENABLED === "true",
      api_rail_possible: d.settings.tradingEnabled && process.env.TRADING_ENABLED === "true" && d.brokerCredentials?.status === "connected",
    },
    broker: { configured: !!d.brokerCredentials, status: d.brokerCredentials?.status ?? "unset", region: d.brokerCredentials?.region ?? null, key_last4: d.brokerCredentials?.keyLast4 ?? null, master_key: masterKeyConfigured() },
    risk_rules: { version: rules.version, max_order_notional_usd: rules.maxOrderNotionalUsd, max_order_qty: rules.maxOrderQty, whitelist: rules.symbolWhitelist, max_single_position_pct: rules.maxSinglePositionPct },
    price_provider_order: d.settings.priceProviderOrder,
    last_scan_at: lastScan,
    scan_running: scanStatus(),
    counts: { accounts: d.accounts.length, transactions: d.transactions.length, tickets: d.tickets.length, journal: d.journal.length, watchlist: d.watchlist.length, api_tokens: d.apiTokens.filter((t) => !t.revokedAt).length },
    disclaimer: "ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต · ใช้ส่วนตัว",
  });
}
