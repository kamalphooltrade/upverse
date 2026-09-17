import { z } from "zod";
import { gate, json, parseBody } from "@/lib/api";
import { readData, withData, audit } from "@/lib/store";
import { requiredAnnualReturn, projectPath } from "@/lib/portfolio";
const G = z.object({ targetThb: z.number().positive(), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startAmountThb: z.number().nonnegative(), monthlyContributionThb: z.number().nonnegative(), dcaDay: z.number().int().min(1).max(28).default(25), allocation: z.object({ core: z.number(), satellite: z.number(), income: z.number(), cash: z.number() }).default({ core: 70, satellite: 20, income: 5, cash: 5 }), scenarioReturns: z.object({ low: z.number().nullable(), mid: z.number().nullable(), high: z.number().nullable() }).default({ low: null, mid: null, high: null }) });
function compute(goal: z.infer<typeof G>, currentThb: number | null) {
  const years = Math.max(0.1, (new Date(goal.targetDate).getTime() - Date.now()) / (365.25 * 86400e3));
  const start = currentThb ?? goal.startAmountThb;
  const req = requiredAnnualReturn(goal.targetThb, start, goal.monthlyContributionThb, years);
  const paths: Record<string, number[] | null> = {};
  for (const k of ["low", "mid", "high"] as const) { const r = goal.scenarioReturns[k]; paths[k] = r == null ? null : projectPath(start, goal.monthlyContributionThb, years, r / 100).filter((_, i) => i % 3 === 0); }
  return { years: Math.round(years * 10) / 10, required_annual_return_pct: req == null ? null : Math.round(req * 1000) / 10, start_used_thb: start, paths, note: "ผลตอบแทนที่ 'จำเป็น' สูง = คันโยกคือเติมเพิ่มหรือยืดเวลา ไม่ใช่เสี่ยงเพิ่ม · ฉากทัศน์ใช้ตัวเลขที่ผู้ใช้กรอกเอง" };
}
export async function GET(req: Request) {
  const g = await gate(req, "portfolio:read");
  if ("res" in g) return g.res;
  const d = await readData();
  const currentThb = new URL(req.url).searchParams.get("current_thb");
  return json({ goal: d.goal, computed: d.goal ? compute(d.goal, currentThb ? Number(currentThb) : null) : null });
}
export async function PUT(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const b = await parseBody(req, G);
  if (!b.ok) return b.res;
  await withData((d) => { d.goal = b.data; audit(d, "owner", "goal.set", "goal", null, { targetThb: b.data.targetThb }); });
  return json({ goal: b.data, computed: compute(b.data, null) });
}
