import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { readData, withData, audit } from "@/lib/store";
export async function GET(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const d = await readData();
  return json({ settings: d.settings, rules: d.riskRules[d.riskRules.length - 1], rules_history: d.riskRules.map((r) => ({ version: r.version, activeFrom: r.activeFrom })), accounts: d.accounts, env: { TRADING_ENABLED: process.env.TRADING_ENABLED === "true", owner_passphrase_set: !!process.env.UPVERSE_OWNER_PASSPHRASE, master_key_set: !!process.env.UPVERSE_MASTER_KEY } });
}
const S = z.object({ tradingEnabled: z.boolean().optional(), environment: z.enum(["uat", "prod"]).optional(), confirmProdPhrase: z.string().optional(), quietHours: z.object({ start: z.string(), end: z.string() }).optional(), hideAmountsInLine: z.boolean().optional(), theme: z.enum(["auto", "dark", "light"]).optional(), fxUsdThb: z.object({ rate: z.number().positive(), asOf: z.string(), source: z.string() }).nullable().optional() });
export async function PATCH(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const b = await parseBody(req, S);
  if (!b.ok) return b.res;
  if (b.data.environment === "prod" && b.data.confirmProdPhrase !== "เปิดเงินจริง") return json({ error: { code: "confirm_required", message: "เปิด PROD ต้องพิมพ์ 'เปิดเงินจริง'" } }, { status: 422 });
  const s = await withData((d) => {
    const { confirmProdPhrase, ...rest } = b.data; void confirmProdPhrase;
    Object.assign(d.settings, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    audit(d, "owner", "settings.update", "settings", null, { keys: Object.keys(rest) });
    return d.settings;
  });
  return json({ settings: s });
}
