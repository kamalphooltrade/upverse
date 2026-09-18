// GET /api/v1/theses?symbol=NVDA — list (latest first) · POST — agent/owner writes a new version (status draft_ai for agent).
import { z } from "zod";
import { gate, json, parseBody, safe, actorOf } from "@/lib/api";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import type { Thesis } from "@/lib/types";

const Section = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(4000) });
const Scenario = z.object({ name: z.enum(["bear", "base", "bull"]), value: z.number().positive().nullable(), assumption: z.string().max(500) });
const ThesisSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(10),
  summary: z.string().min(1).max(600),
  verdict: z.enum(["ถือ", "เพิ่ม", "ลด", "ออก", "รอ", "ดูต่อ"]),
  role: z.enum(["แกน", "ดาวเทียม", "รายได้", "เก็งจังหวะ", "ไม่เข้าเกณฑ์"]),
  sections: z.array(Section).min(3).max(12),
  scenarios: z.array(Scenario).length(3),
  buyBelow: z.number().positive().nullable().optional(),
  invalidation: z.string().min(1).max(1500),
  altZero: z.string().min(1).max(1500),
  dissent: z.array(z.object({ persona: z.string().max(60), point: z.string().max(600), response: z.string().max(600) })).max(6).default([]),
  sources: z.array(z.object({ label: z.string().max(200), asOf: z.string().max(40) })).min(1).max(20),
  priceAtWrite: z.number().positive().nullable().optional(),
  reviewAfter: z.string().max(40).nullable().optional(),
});

async function _GET(req: Request) {
  const g = await gate(req, "theses:read");
  if ("res" in g) return g.res;
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase();
  const d = await readData();
  const all = (d.theses ?? []).filter((t) => !symbol || t.symbol === symbol).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ count: all.length, theses: all });
}

async function _POST(req: Request) {
  const g = await gate(req, "theses:write");
  if ("res" in g) return g.res;
  const b = await parseBody(req, ThesisSchema);
  if (!b.ok) return b.res;
  const x = b.data;
  const t = await withData((d) => {
    d.theses = d.theses ?? [];
    const prev = d.theses.filter((y) => y.symbol === x.symbol);
    const version = prev.length ? Math.max(...prev.map((y) => y.version)) + 1 : 1;
    const author = g.p.kind === "owner" ? "owner" : "agent";
    const th: Thesis = { id: uid(), symbol: x.symbol, version, status: author === "owner" ? "confirmed" : "draft_ai", author, createdAt: nowIso(), confirmedAt: author === "owner" ? nowIso() : null, staleReason: null, summary: x.summary, verdict: x.verdict, role: x.role, sections: x.sections, scenarios: x.scenarios, buyBelow: x.buyBelow ?? null, invalidation: x.invalidation, altZero: x.altZero, dissent: x.dissent, sources: x.sources, priceAtWrite: x.priceAtWrite ?? null, reviewAfter: x.reviewAfter ?? null };
    d.theses.push(th);
    audit(d, actorOf(g.p), "thesis.create", "thesis", th.id, { symbol: th.symbol, version, status: th.status });
    return th;
  });
  return json({ thesis: t, note: t.status === "draft_ai" ? "🤖 draft — ต้นต้องกดยืนยันในหน้าหุ้น" : "บันทึกเป็นฉบับยืนยันแล้ว" }, { status: 201 });
}
export const GET = safe(_GET);
export const POST = safe(_POST);
