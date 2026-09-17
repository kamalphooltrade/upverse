// S&P 500 universe (SPEC §7.0 / §9.6). Source: Wikipedia constituents table (public), cached on disk with fetch date.
import { promises as fs } from "node:fs";
import path from "node:path";
import { cacheDir } from "../cachedir";

export interface Constituent { symbol: string; name: string; sector: string; industry: string }
export interface Universe { source: string; fetchedAt: string; count: number; items: Constituent[] }

const CACHE = path.join(cacheDir(), "sp500.json");
const URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";

function strip(c: string) {
  return c.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export async function fetchUniverse(): Promise<Universe> {
  const r = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0 UPVerse personal tool" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`wikipedia HTTP ${r.status}`);
  const html = await r.text();
  const tbl = html.match(/id="constituents"[\s\S]*?<\/table>/);
  if (!tbl) throw new Error("constituents table not found");
  const rows = tbl[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const items: Constituent[] = [];
  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));
    if (cells.length >= 4 && /^[A-Z.\-]{1,6}$/.test(cells[0])) {
      // Yahoo uses "-" for share classes (BRK-B), Wikipedia uses "." (BRK.B)
      items.push({ symbol: cells[0].replace(".", "-"), name: cells[1], sector: cells[2], industry: cells[3] });
    }
  }
  if (items.length < 450 || items.length > 520) throw new Error(`unexpected constituent count ${items.length}`);
  const u: Universe = { source: URL, fetchedAt: new Date().toISOString(), count: items.length, items };
  try { await fs.mkdir(path.dirname(CACHE), { recursive: true }); await fs.writeFile(CACHE, JSON.stringify(u, null, 1), "utf8"); } catch { /* cache is best-effort */ }
  return u;
}

export async function getUniverse(maxAgeDays = 30): Promise<Universe> {
  try {
    const raw = await fs.readFile(CACHE, "utf8");
    const u = JSON.parse(raw) as Universe;
    if (Date.now() - new Date(u.fetchedAt).getTime() < maxAgeDays * 86400e3) return u;
  } catch {
    /* no cache */
  }
  return fetchUniverse();
}
