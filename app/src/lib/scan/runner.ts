// Scan runner (SPEC §10.4). Fetches bars for the universe (rate-limited), EDGAR fundamentals for what needs it,
// runs M1–M5 + avoid list, and persists ScanRuns. Progress is stored so the UI can show partial state.
import type { ScanRun } from "../types";
import { getBars } from "../prices";
import { getUniverse } from "./universe";
import { snapshot, percentile } from "./indicators";
import { getFundamentals, type Fundamentals } from "./fundamentals";
import { MODELS, MODEL_VERSION, runModel, avoidList, type Candidate, type ModelKey } from "./models";
import { withData, uid, nowIso } from "../store";
import { keepAlive } from "../webull/session";
import { syncWebull } from "../webull/sync";

export interface RunOptions {
  limit?: number; // cap universe for quick runs
  withFundamentals?: boolean;
  concurrency?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
}

let running: { startedAt: string; done: number; total: number; phase: string } | null = null;
export const scanStatus = () => running;

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

export async function runScan(opts: RunOptions = {}): Promise<ScanRun[]> {
  if (running) throw new Error("scan already running");
  const startedAt = nowIso();
  const universe = await getUniverse();
  const items = opts.limit ? universe.items.slice(0, opts.limit) : universe.items;
  running = { startedAt, done: 0, total: items.length, phase: "ราคา" };
  const excluded: string[] = [];
  try {
    // 1) bars + snapshot
    const snaps = await pool(items, opts.concurrency ?? 6, async (c) => {
      try {
        const bars = await getBars(c.symbol, "2y");
        const s = snapshot(bars);
        if (!s || s.bars < 200) { excluded.push(`${c.symbol} (แท่ง ${s?.bars ?? 0} < 200)`); return null; }
        if (s.close < 5 || (s.dollarVol50 ?? 0) < 20e6) { excluded.push(`${c.symbol} (สภาพคล่องต่ำ)`); return null; }
        return { c, s };
      } catch (e) {
        excluded.push(`${c.symbol} (ราคา: ${e instanceof Error ? e.message : "error"})`);
        return null;
      } finally {
        running!.done++;
        opts.onProgress?.(running!.done, running!.total, "ราคา");
      }
    });
    const withSnap = snaps.filter((x): x is { c: (typeof items)[number]; s: NonNullable<ReturnType<typeof snapshot>> } => !!x);

    // 2) RS rank (weighted 3/6/12m)
    const rsScore = (s: NonNullable<ReturnType<typeof snapshot>>) => 0.4 * (s.ret63 ?? 0) + 0.3 * (s.ret126 ?? 0) + 0.3 * (s.ret252 ?? 0);
    const all = withSnap.map((x) => rsScore(x.s));

    // 3) fundamentals (EDGAR) — only if requested; rate-limit ≤ 8 req/s per SEC guidance
    running = { ...running!, done: 0, total: withSnap.length, phase: "งบ EDGAR" };
    const funds: (Fundamentals | null)[] = opts.withFundamentals === false
      ? withSnap.map(() => null)
      : await pool(withSnap, 4, async (x) => {
          try { return await getFundamentals(x.c.symbol); }
          catch { return null; }
          finally { running!.done++; opts.onProgress?.(running!.done, running!.total, "งบ EDGAR"); }
        });

    const cands: Candidate[] = withSnap.map((x, i) => ({ c: x.c, s: x.s, f: funds[i], rsRank: percentile(all, rsScore(x.s)) }));
    const noFund = cands.filter((x) => !x.f).map((x) => x.c.symbol);

    // 4) models
    const runs: ScanRun[] = [];
    const runAt = nowIso();
    for (const key of Object.keys(MODELS) as ModelKey[]) {
      const m = MODELS[key];
      const { results, passed } = runModel(key, cands);
      const missing = m.needsFundamentals ? [...excluded, ...noFund.map((s) => `${s} (ไม่มีงบ EDGAR)`)] : excluded;
      runs.push({ id: uid(), modelKey: key, modelVersion: MODEL_VERSION, runAt, universeSize: items.length, passedCount: passed, excludedMissing: missing, status: opts.limit ? "partial" : "ok", results, note: `${m.name} · จักรวาล ${items.length} (${universe.source.includes("wikipedia") ? "Wikipedia" : universe.source} · ดึง ${universe.fetchedAt.slice(0, 10)}) · ราคา yahoo (ชั้น 2) · งบ SEC EDGAR` });
    }
    // multi-model overlap + avoid
    const counts = new Map<string, { n: number; models: string[]; r: (typeof runs)[0]["results"][0] }>();
    for (const r of runs) for (const x of r.results) { const c = counts.get(x.symbol) ?? { n: 0, models: [], r: x }; c.n++; c.models.push(r.modelKey); counts.set(x.symbol, c); }
    const overlap = [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 10).map((c, i) => ({ ...c.r, rank: i + 1, score: Math.round(c.n * 20 + c.r.score / 5), why: `ติด ${c.n} โมเดล: ${c.models.join(", ")}`, flags: c.models }));
    runs.push({ id: uid(), modelKey: "OVERLAP", modelVersion: MODEL_VERSION, runAt, universeSize: items.length, passedCount: overlap.length, excludedMissing: [], status: "ok", results: overlap, note: "ตัวที่ติด ≥ 2 โมเดล" });
    const avoid = avoidList(cands).slice(0, 10);
    runs.push({ id: uid(), modelKey: "AVOID", modelVersion: MODEL_VERSION, runAt, universeSize: items.length, passedCount: avoid.length, excludedMissing: [], status: "ok", results: avoid, note: "ตกตะแกรงแข็ง (F-score ≤ 3 · หนี้สุทธิ/CF > 4 · FCF ติดลบ)" });

    await keepAlive().catch(() => undefined);
    await syncWebull().catch(() => undefined); // best-effort daily portfolio sync (no-op when not connected)
    await withData((d) => {
      d.scanRuns.push(...runs);
      // keep last 90 days
      const cutoff = Date.now() - 90 * 86400e3;
      d.scanRuns = d.scanRuns.filter((r) => new Date(r.runAt).getTime() > cutoff);
      d.audit.push({ id: uid(), ts: nowIso(), actor: "system", action: "scan.run", entity: "scan", entityId: null, meta: { models: runs.length, universe: items.length, excluded: excluded.length, startedAt } });
    });
    return runs;
  } finally {
    running = null;
  }
}
