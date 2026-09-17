// GET /api/v1/scans?model=M1&date=YYYY-MM-DD — latest run per model (or a specific date).
import { gate, json } from "@/lib/api";
import { readData } from "@/lib/store";
import { MODELS } from "@/lib/scan/models";
import { scanStatus } from "@/lib/scan/runner";
export async function GET(req: Request) {
  const g = await gate(req, "scan:read");
  if ("res" in g) return g.res;
  const url = new URL(req.url);
  const model = url.searchParams.get("model");
  const date = url.searchParams.get("date");
  const d = await readData();
  const runs = d.scanRuns.filter((r) => (!model || r.modelKey === model) && (!date || r.runAt.slice(0, 10) === date));
  const latestByModel = new Map<string, (typeof runs)[0]>();
  for (const r of runs) { const cur = latestByModel.get(r.modelKey); if (!cur || r.runAt > cur.runAt) latestByModel.set(r.modelKey, r); }
  const dates = [...new Set(d.scanRuns.map((r) => r.runAt.slice(0, 10)))].sort().reverse();
  return json({ models: Object.values(MODELS), extra: [{ key: "OVERLAP", name: "ซ้ำหลายโมเดล" }, { key: "AVOID", name: "หลีกเลี่ยง" }], runs: [...latestByModel.values()], available_dates: dates, running: scanStatus() });
}
