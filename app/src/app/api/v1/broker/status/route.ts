// GET /api/v1/broker/status            → stored view (no network)
// GET /api/v1/broker/status?check=1    → check the stored token with Webull (no SMS)
// POST /api/v1/broker/status {action:"resend"} → create a NEW token (sends a new SMS; use when EXPIRED/INVALID)
import { z } from "zod";
import { gate, json, parseBody, safe } from "@/lib/api";
import { readData } from "@/lib/store";
import { viewOf, checkVerification, beginVerification } from "@/lib/webull/session";
async function _GET(req: Request) {
  const cron = req.headers.get("x-cron-secret");
  const cronOk = !!process.env.CRON_SECRET && cron === process.env.CRON_SECRET;
  if (!cronOk) {
    const g = await gate(req, null);
    if ("res" in g) return g.res;
    if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  }
  if (new URL(req.url).searchParams.get("check") === "1") {
    const d = await readData();
    if (!d.brokerCredentials) return json(viewOf(d));
    return json(await checkVerification(true));
  }
  return json(viewOf(await readData()));
}
async function _POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const b = await parseBody(req, z.object({ action: z.literal("resend") }));
  if (!b.ok) return b.res;
  return json(await beginVerification());
}
export const GET = safe(_GET);
export const POST = safe(_POST);
