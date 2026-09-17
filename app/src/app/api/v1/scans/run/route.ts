// POST /api/v1/scans/run {limit?, withFundamentals?} — owner or scan:read token with x-cron-secret. Long-running (minutes).
import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { runScan, scanStatus } from "@/lib/scan/runner";
export const maxDuration = 300;
export async function POST(req: Request) {
  const cron = req.headers.get("x-cron-secret");
  const cronOk = !!process.env.CRON_SECRET && cron === process.env.CRON_SECRET;
  if (!cronOk) {
    const g = await gate(req, "scan:read");
    if ("res" in g) return g.res;
    if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "รันสแกนได้เฉพาะเจ้าของหรือ cron" } }, { status: 403 });
  }
  if (scanStatus()) return json({ running: scanStatus(), note: "กำลังรันอยู่" }, { status: 202 });
  const b = await parseBody(req, z.object({ limit: z.number().int().min(5).max(600).optional(), withFundamentals: z.boolean().optional() }).default({}));
  if (!b.ok) return b.res;
  const t0 = Date.now();
  try {
    const runs = await runScan({ limit: b.data.limit, withFundamentals: b.data.withFundamentals });
    return json({ ok: true, seconds: Math.round((Date.now() - t0) / 1000), runs: runs.map((r) => ({ model: r.modelKey, passed: r.passedCount, top: r.results.length, excluded: r.excludedMissing.length })) });
  } catch (e) {
    return json({ error: { code: "scan_failed", message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
// Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return json({ running: scanStatus() });
  if (scanStatus()) return json({ running: scanStatus() }, { status: 202 });
  const t0 = Date.now();
  try { const runs = await runScan({}); return json({ ok: true, seconds: Math.round((Date.now() - t0) / 1000), runs: runs.map((r) => ({ model: r.modelKey, passed: r.passedCount })) }); }
  catch (e) { return json({ error: { code: "scan_failed", message: e instanceof Error ? e.message : String(e) } }, { status: 500 }); }
}
