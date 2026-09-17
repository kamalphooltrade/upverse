// PUT /api/v1/settings/rules — creates a NEW version (never overwrites). Open tickets keep their version and re-check on confirm.
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { withData, audit, nowIso } from "@/lib/store";
const R = z.object({ maxOrderNotionalUsd: z.number().positive(), maxOrderQty: z.number().positive(), symbolWhitelist: z.array(z.string().trim().toUpperCase()).default([]), coreSymbols: z.array(z.string().trim().toUpperCase()).default([]), maxCorePct: z.number().positive().max(100).default(80), maxSinglePositionPct: z.number().positive().max(100), warnSinglePositionPct: z.number().positive().max(100), maxSectorPct: z.number().positive().max(100), minCashPct: z.number().nonnegative().max(100), maxRiskPerTradePct: z.number().positive().max(100), quoteMaxAgeSec: z.number().positive(), maxTicketsPerDay: z.number().int().positive(), earningsWarnDays: z.number().int().nonnegative() });
async function _PUT(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const b = await parseBody(req, R);
  if (!b.ok) return b.res;
  const rules = await withData((d) => { const v = d.riskRules[d.riskRules.length - 1].version + 1; const r = { ...b.data, version: v, activeFrom: nowIso() }; d.riskRules.push(r); audit(d, "owner", "rules.new_version", "rules", String(v), {}); return r; });
  return json({ rules });
}
export const PUT = safe(_PUT);
