import { gate, json, safe } from "@/lib/api";
import { readData, withData, nowIso } from "@/lib/store";
import { decryptSecret, createToken, checkToken, listAccounts } from "@/lib/webull";
async function _GET(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  const d = await readData();
  const bc = d.brokerCredentials;
  if (!bc) return json({ status: "unset" });
  let live: unknown = null; let status = bc.status; let err: string | null = null;
  if (new URL(req.url).searchParams.get("check") === "1") {
    try {
      const creds = { appKey: decryptSecret(bc.appKeyEnc), appSecret: decryptSecret(bc.appSecretEnc), region: "th" as const };
      const t = await createToken(creds);
      const c = t.status === "NORMAL" ? t : await checkToken(creds, t.token);
      status = c.status === "NORMAL" ? "connected" : "needs_2fa";
      if (status === "connected") live = await listAccounts({ ...creds, token: c.token });
    } catch (e) { status = "error"; err = e instanceof Error ? e.message : String(e); }
    await withData((dd) => { if (dd.brokerCredentials) { dd.brokerCredentials.status = status; dd.brokerCredentials.lastError = err; if (status === "connected") dd.brokerCredentials.lastOkAt = nowIso(); } });
  }
  return json({ status, key_last4: bc.keyLast4, region: bc.region, last_ok_at: bc.lastOkAt, last_error: err ?? bc.lastError, accounts: live });
}
export const GET = safe(_GET);
