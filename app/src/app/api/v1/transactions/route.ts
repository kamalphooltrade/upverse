// GET/POST /api/v1/transactions — manual/paper ledger (fractional qty). Import CSV via POST {rows:[...]}.
import { z } from "zod";
import { gate, json, parseBody, actorOf, safe } from "@/lib/api";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import type { Transaction } from "@/lib/types";

const TxSchema = z.object({
  accountId: z.string().default("paper-1"),
  ts: z.string().datetime({ offset: true }).optional(),
  symbol: z.string().trim().toUpperCase().max(10).nullable().optional(),
  type: z.enum(["buy", "sell", "dividend", "fee", "deposit", "withdraw", "fx", "split"]),
  qty: z.number().nonnegative().default(0),
  price: z.number().nonnegative().default(0),
  amountUsd: z.number().optional(),
  fxRateThb: z.number().positive().nullable().optional(),
  fees: z.number().nonnegative().default(0),
  note: z.string().max(500).default(""),
});

function normalize(t: z.infer<typeof TxSchema>, source: Transaction["source"]): Transaction {
  const needsSymbol = ["buy", "sell", "dividend", "split"].includes(t.type);
  if (needsSymbol && !t.symbol) throw new Error("ต้องระบุสัญลักษณ์");
  let amount = t.amountUsd;
  if (amount == null) {
    if (t.type === "buy") amount = -(t.qty * t.price + t.fees);
    else if (t.type === "sell") amount = t.qty * t.price - t.fees;
    else if (t.type === "fee") amount = -Math.abs(t.fees || 0);
    else amount = 0;
  }
  if (t.type === "withdraw" && amount > 0) amount = -amount;
  return { id: uid(), accountId: t.accountId, ts: t.ts ?? nowIso(), symbol: needsSymbol ? (t.symbol as string) : (t.symbol ?? null), type: t.type, qty: t.qty, price: t.price, amountUsd: Math.round(amount * 100) / 100, fxRateThb: t.fxRateThb ?? null, fees: t.fees, note: t.note, source, ticketId: null, brokerOrderId: null };
}

async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  const url = new URL(req.url);
  const acc = url.searchParams.get("account");
  const rows = d.transactions.filter((t) => !acc || acc === "all" || t.accountId === acc).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 500);
  return json({ count: rows.length, transactions: rows });
}

async function _POST(req: Request) {
  const g = await gate(req, "portfolio:write");
  if ("res" in g) return g.res;
  const b = await parseBody(req, z.union([TxSchema, z.object({ rows: z.array(TxSchema).max(2000) })]));
  if (!b.ok) return b.res;
  const list = "rows" in b.data ? b.data.rows : [b.data];
  try {
    const created = await withData((d) => {
      const out: Transaction[] = [];
      for (const t of list) {
        const acc = d.accounts.find((a) => a.id === t.accountId);
        if (!acc) throw new Error(`ไม่มีบัญชี ${t.accountId}`);
        if (acc.kind !== "manual_paper") throw new Error("บันทึกมือได้เฉพาะบัญชี paper (บัญชี Webull ดึงจาก API)");
        const tx = normalize(t, "rows" in b.data ? "import" : "manual");
        d.transactions.push(tx);
        out.push(tx);
      }
      audit(d, actorOf(g.p), "transactions.create", "transaction", null, { n: out.length });
      return out;
    });
    return json({ created: created.length, transactions: created }, { status: 201 });
  } catch (e) {
    return json({ error: { code: "invalid", message: e instanceof Error ? e.message : String(e) } }, { status: 422 });
  }
}

async function _DELETE(req: Request) {
  const g = await gate(req, "portfolio:write");
  if ("res" in g) return g.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: { code: "missing_id", message: "ต้องระบุ id" } }, { status: 400 });
  const ok = await withData((d) => {
    const i = d.transactions.findIndex((t) => t.id === id);
    if (i < 0) return false;
    const [tx] = d.transactions.splice(i, 1);
    audit(d, actorOf(g.p), "transactions.delete", "transaction", id, { symbol: tx.symbol, type: tx.type });
    return true;
  });
  return ok ? json({ deleted: id }) : json({ error: { code: "not_found", message: "ไม่พบรายการ" } }, { status: 404 });
}
export const GET = safe(_GET);
export const POST = safe(_POST);
export const DELETE = safe(_DELETE);
