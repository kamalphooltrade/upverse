// POST /api/v1/broker/sync — owner: pull balance/positions/fills from Webull into UPVerse. GET → last snapshot.
import { gate, json, safe } from "@/lib/api";
import { readData } from "@/lib/store";
import { syncWebull } from "@/lib/webull/sync";
async function _POST(req: Request) {
  // owner session, or the nightly job with CRON_SECRET (daily sync keeps positions + fills current)
  const cron = req.headers.get("x-cron-secret");
  const cronOk = !!process.env.CRON_SECRET && cron === process.env.CRON_SECRET;
  if (!cronOk) {
    const g = await gate(req, null);
    if ("res" in g) return g.res;
    if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  }
  try { const r = await syncWebull(); return json({ ok: true, ...r }); }
  catch (e) { return json({ error: { code: "sync_failed", message: e instanceof Error ? e.message : String(e) } }, { status: 422 }); }
}
async function _GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  return json({ snapshots: d.liveSnapshots ?? [] });
}
export const POST = safe(_POST);
export const GET = safe(_GET);
