import { z } from "zod";
import { gate, json, parseBody, actorOf, safe } from "@/lib/api";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
const J = z.object({ ticketId: z.string().nullable().optional(), symbol: z.string().trim().toUpperCase().max(10).nullable().optional(), decision: z.enum(["ซื้อ", "ขาย", "ไม่ทำ", "รอ"]), thesisShort: z.string().max(1000).default(""), emotion: z.enum(["กลัว", "โลภ", "เบื่อ", "มั่นใจ", "ลังเล"]), expectation: z.string().max(1000).default(""), reviewDays: z.union([z.literal(30), z.literal(90)]).default(30), outcome: z.string().max(1000).nullable().optional(), lesson: z.string().max(1000).nullable().optional() });
async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  const entries = [...d.journal].sort((a, b) => b.ts.localeCompare(a.ts));
  const filledNoJournal = d.tickets.filter((t) => t.status === "filled" && !d.journal.some((j) => j.ticketId === t.id)).map((t) => ({ id: t.id, symbol: t.symbol, side: t.side, filledAt: t.fill?.ts ?? t.updatedAt }));
  const byEmotion: Record<string, number> = {};
  for (const j of entries) byEmotion[j.emotion] = (byEmotion[j.emotion] ?? 0) + 1;
  return json({ count: entries.length, entries, pending_journal: filledNoJournal, by_emotion: byEmotion });
}
async function _POST(req: Request) {
  const g = await gate(req, "journal:write");
  if ("res" in g) return g.res;
  const b = await parseBody(req, J);
  if (!b.ok) return b.res;
  const e = await withData((d) => { const j = { id: uid(), ts: nowIso(), ...b.data, ticketId: b.data.ticketId ?? null, symbol: b.data.symbol ?? null, outcome: b.data.outcome ?? null, lesson: b.data.lesson ?? null }; d.journal.push(j); audit(d, actorOf(g.p), "journal.add", "journal", j.id, {}); return j; });
  return json({ entry: e }, { status: 201 });
}
async function _PATCH(req: Request) {
  const g = await gate(req, "journal:write");
  if ("res" in g) return g.res;
  const b = await parseBody(req, z.object({ id: z.string(), outcome: z.string().max(1000).nullable().optional(), lesson: z.string().max(1000).nullable().optional() }));
  if (!b.ok) return b.res;
  const e = await withData((d) => { const j = d.journal.find((x) => x.id === b.data.id); if (!j) return null; if (b.data.outcome !== undefined) j.outcome = b.data.outcome; if (b.data.lesson !== undefined) j.lesson = b.data.lesson; return j; });
  return e ? json({ entry: e }) : json({ error: { code: "not_found", message: "ไม่พบ" } }, { status: 404 });
}
export const GET = safe(_GET);
export const POST = safe(_POST);
export const PATCH = safe(_PATCH);
