import { z } from "zod";
import { gate, json, parseBody, actorOf, safe } from "@/lib/api";
import { readData, withData, uid, nowIso, audit } from "@/lib/store";
import { getQuotes } from "@/lib/prices";
const W = z.object({ symbol: z.string().trim().toUpperCase().min(1).max(10), reason: z.string().max(500).default(""), zoneLow: z.number().positive().nullable().optional(), zoneHigh: z.number().positive().nullable().optional(), stop: z.number().positive().nullable().optional(), note: z.string().max(500).default(""), fromModel: z.string().max(20).nullable().optional() });
async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  const quotes = await getQuotes(d.watchlist.map((w) => w.symbol));
  const items = d.watchlist.map((w) => {
    const q = quotes[w.symbol];
    const price = q && !("error" in q) ? q.price : null;
    let zone: "ในโซน" | "ต่ำกว่าโซน" | "สูงกว่าโซน" | null = null;
    if (price != null && w.zoneLow != null && w.zoneHigh != null) zone = price < w.zoneLow ? "ต่ำกว่าโซน" : price > w.zoneHigh ? "สูงกว่าโซน" : "ในโซน";
    const dist = price != null && w.zoneHigh != null && w.zoneLow != null ? (price > w.zoneHigh ? ((price - w.zoneHigh) / w.zoneHigh) * 100 : price < w.zoneLow ? ((price - w.zoneLow) / w.zoneLow) * 100 : 0) : null;
    return { ...w, price, quote: q && !("error" in q) ? q : null, zone, distance_pct: dist != null ? Math.round(dist * 10) / 10 : null };
  });
  return json({ count: items.length, watchlist: items });
}
async function _POST(req: Request) {
  const g = await gate(req, "watchlist:write");
  if ("res" in g) return g.res;
  const b = await parseBody(req, W);
  if (!b.ok) return b.res;
  const item = await withData((d) => {
    const ex = d.watchlist.find((w) => w.symbol === b.data.symbol);
    if (ex) { Object.assign(ex, { ...b.data, zoneLow: b.data.zoneLow ?? null, zoneHigh: b.data.zoneHigh ?? null, stop: b.data.stop ?? null, fromModel: b.data.fromModel ?? null }); return ex; }
    const w = { id: uid(), createdAt: nowIso(), ...b.data, zoneLow: b.data.zoneLow ?? null, zoneHigh: b.data.zoneHigh ?? null, stop: b.data.stop ?? null, fromModel: b.data.fromModel ?? null };
    d.watchlist.push(w);
    audit(d, actorOf(g.p), "watchlist.add", "watch", w.id, { symbol: w.symbol });
    return w;
  });
  return json({ item }, { status: 201 });
}
async function _DELETE(req: Request) {
  const g = await gate(req, "watchlist:write");
  if ("res" in g) return g.res;
  const symbol = new URL(req.url).searchParams.get("symbol")?.toUpperCase();
  const ok = await withData((d) => { const i = d.watchlist.findIndex((w) => w.symbol === symbol); if (i < 0) return false; d.watchlist.splice(i, 1); return true; });
  return ok ? json({ deleted: symbol }) : json({ error: { code: "not_found", message: "ไม่พบ" } }, { status: 404 });
}
export const GET = safe(_GET);
export const POST = safe(_POST);
export const DELETE = safe(_DELETE);
