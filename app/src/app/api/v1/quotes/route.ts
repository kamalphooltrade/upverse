// GET /api/v1/quotes?symbols=AAPL,MSFT — latest quotes with source + as_of + market_state + stale flag.
import { gate, json, safe } from "@/lib/api";
import { getQuotes } from "@/lib/prices";
async function _GET(req: Request) {
  const g = await gate(req, "quotes:read");
  if ("res" in g) return g.res;
  const s = (new URL(req.url).searchParams.get("symbols") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!s.length) return json({ error: { code: "missing_symbols", message: "ต้องระบุ symbols" } }, { status: 400 });
  const quotes = await getQuotes(s);
  return json({ as_of: new Date().toISOString(), quotes });
}
export const GET = safe(_GET);
