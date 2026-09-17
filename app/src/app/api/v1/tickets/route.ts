// GET/POST /api/v1/tickets — create is always `proposed`; risk checks run immediately and are returned.
import { z } from "zod";
import { gate, json, parseBody, actorOf } from "@/lib/api";
import { readData, withData, uid, nowIso, audit, activeRules } from "@/lib/store";
import { getQuotes } from "@/lib/prices";
import { positionsFrom, cashFrom, valuePositions } from "@/lib/portfolio";
import { runRiskChecks, confirmPhraseFor, ticketQty } from "@/lib/risk";
import type { Ticket } from "@/lib/types";

const TicketSchema = z.object({
  accountId: z.string().default("paper-1"),
  side: z.enum(["buy", "sell"]),
  symbol: z.string().trim().toUpperCase().min(1).max(10),
  qty: z.number().positive().nullable().optional(),
  notionalUsd: z.number().positive().nullable().optional(),
  orderType: z.enum(["LIMIT", "MARKET"]).default("LIMIT"),
  limitPrice: z.number().positive().nullable().optional(),
  stopPrice: z.number().positive().nullable().optional(),
  targetPrice: z.number().positive().nullable().optional(),
  thesisId: z.string().nullable().optional(),
  rationale: z.string().min(1).max(2000),
  altZero: z.string().min(1).max(1000),
  invalidation: z.string().min(1).max(1000),
  tag: z.string().max(40).nullable().optional(),
  expiresInDays: z.number().min(1).max(30).default(3),
  rail: z.enum(["api", "manual"]).default("manual"),
});

export async function evaluate(d: Awaited<ReturnType<typeof readData>>, t: Ticket) {
  const positions = positionsFrom(d.transactions, t.accountId);
  const symbols = [...new Set([t.symbol, ...positions.map((p) => p.symbol)])];
  const quotes = await getQuotes(symbols);
  const q = quotes[t.symbol];
  const quote = q && !("error" in q) ? q : null;
  const cash = cashFrom(d.transactions, t.accountId);
  const v = valuePositions(positions, quotes, cash);
  const rules = activeRules(d);
  const checks = runRiskChecks({ d, rules, ticket: t, quote, quotes, portfolioTotal: v.total });
  return { checks, quote, rules, qty: ticketQty(t, quote?.price ?? null) };
}

export async function GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  const status = new URL(req.url).searchParams.get("status");
  const list = d.tickets.filter((t) => !status || t.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ count: list.length, tickets: list });
}

export async function POST(req: Request) {
  const g = await gate(req, "tickets:propose");
  if ("res" in g) return g.res;
  const b = await parseBody(req, TicketSchema);
  if (!b.ok) return b.res;
  const x = b.data;
  if (x.qty == null && x.notionalUsd == null) return json({ error: { code: "validation", message: "ต้องระบุ qty หรือ notionalUsd" } }, { status: 422 });
  if (x.orderType === "LIMIT" && x.limitPrice == null) return json({ error: { code: "validation", message: "LIMIT ต้องมี limitPrice" } }, { status: 422 });
  const d = await readData();
  const now = nowIso();
  const t: Ticket = {
    id: uid(), accountId: x.accountId, kind: "stock", side: x.side, symbol: x.symbol, qty: x.qty ?? null, notionalUsd: x.notionalUsd ?? null,
    orderType: x.orderType, limitPrice: x.limitPrice ?? null, stopPrice: x.stopPrice ?? null, targetPrice: x.targetPrice ?? null, thesisId: x.thesisId ?? null,
    rationale: x.rationale, altZero: x.altZero, invalidation: x.invalidation, tag: x.tag ?? null,
    expiresAt: new Date(Date.now() + x.expiresInDays * 86400e3).toISOString(), status: "proposed", riskCheck: [], riskRulesVersion: activeRules(d).version,
    environment: d.settings.environment, proposedBy: actorOf(g.p), confirmedAt: null, confirmPhrase: "", idempotencyKey: null, brokerOrderId: null, rail: x.rail, createdAt: now, updatedAt: now, fill: null,
  };
  const ev = await evaluate(d, t);
  t.riskCheck = ev.checks;
  t.confirmPhrase = confirmPhraseFor(t, ev.qty);
  await withData((dd) => {
    dd.tickets.push(t);
    dd.orderLog.push({ id: uid(), ticketId: t.id, ts: now, action: "propose", fromStatus: null, toStatus: "proposed", actor: actorOf(g.p), detail: `${t.side} ${t.symbol} ${t.qty ?? "$" + t.notionalUsd}` });
    audit(dd, actorOf(g.p), "ticket.propose", "ticket", t.id, { symbol: t.symbol, side: t.side });
  });
  return json({ ticket: t, quote: ev.quote, note: "สถานะ proposed — ต้นต้องเปิดตั๋วในหน้าจอและพิมพ์ประโยคยืนยันเอง" }, { status: 201 });
}
