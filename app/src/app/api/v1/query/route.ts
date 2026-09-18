// POST /api/v1/query {q} — rule-based intent parser (no LLM server-side). Always returns understood_as.
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { allowed } from "@/lib/auth";
import { readData } from "@/lib/store";
import { getQuotes } from "@/lib/prices";
import { positionsFrom, cashFrom, valuePositions } from "@/lib/portfolio";
async function _POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  const b = await parseBody(req, z.object({ q: z.string().min(1).max(300) }));
  if (!b.ok) return b.res;
  const q = b.data.q.trim();
  const sym = q.match(/\b([A-Z]{1,5}(?:-[A-Z])?)\b/)?.[1];
  const d = await readData();
  if (/พอร์ต|portfolio|มูลค่า|ถืออะไร/i.test(q)) {
    if (!allowed(g.p, "portfolio:read")) return json({ understood_as: "portfolio", error: "no scope portfolio:read" }, { status: 403 });
    const pos = positionsFrom(d.transactions); const v = valuePositions(pos, await getQuotes(pos.map((p) => p.symbol)), cashFrom(d.transactions));
    return json({ understood_as: "portfolio.summary", total_usd: v.total, cash_usd: v.cash, holdings: v.rows.map((r) => ({ symbol: r.symbol, qty: r.qty, weight_pct: r.weightPct, pnl_pct: r.pnlPct })), caveats: ["ราคาชั้น 2"] });
  }
  if (/ราคา|price|quote/i.test(q) && sym) {
    if (!allowed(g.p, "quotes:read")) return json({ understood_as: "quote", error: "no scope quotes:read" }, { status: 403 });
    return json({ understood_as: `quote ${sym}`, quotes: await getQuotes([sym]) });
  }
  if (/สแกน|scan|top ?10|น่าสนใจ/i.test(q)) {
    if (!allowed(g.p, "scan:read")) return json({ understood_as: "scan", error: "no scope scan:read" }, { status: 403 });
    const model = q.match(/M[1-5]/i)?.[0].toUpperCase();
    const runs = d.scanRuns.filter((r) => !model || r.modelKey === model);
    const latest = runs.length ? runs[runs.length - 1] : null;
    return json({ understood_as: `scan.latest${model ? " " + model : ""}`, run: latest ? { model: latest.modelKey, runAt: latest.runAt, top: latest.results.slice(0, 10).map((r) => ({ rank: r.rank, symbol: r.symbol, score: r.score, why: r.why })) } : null });
  }
  if (/thesis|บทวิเคราะห์|วิเคราะห์/i.test(q) && sym) {
    if (!allowed(g.p, "theses:read")) return json({ understood_as: "thesis", error: "no scope theses:read" }, { status: 403 });
    const t = (d.theses ?? []).filter((x) => x.symbol === sym).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return json({ understood_as: `thesis ${sym}`, thesis: t && { status: t.status, version: t.version, verdict: t.verdict, summary: t.summary, buyBelow: t.buyBelow, invalidation: t.invalidation } });
  }
  if (/ตั๋ว|ticket|รอยืนยัน/i.test(q)) {
    if (!allowed(g.p, "portfolio:read")) return json({ understood_as: "tickets", error: "no scope" }, { status: 403 });
    return json({ understood_as: "tickets.open", tickets: d.tickets.filter((t) => t.status === "proposed").map((t) => ({ id: t.id, symbol: t.symbol, side: t.side, qty: t.qty, notionalUsd: t.notionalUsd, blocks: t.riskCheck.filter((c) => c.state === "block").length })) });
  }
  return json({ understood_as: null, needs_disambiguation: true, options: ["พอร์ต", "ราคา <SYMBOL>", "สแกน M1..M5", "ตั๋วรอยืนยัน"] });
}
export const POST = safe(_POST);
