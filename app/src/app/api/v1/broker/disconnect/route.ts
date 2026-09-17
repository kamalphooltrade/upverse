import { gate, json, safe } from "@/lib/api";
import { withData, audit } from "@/lib/store";
async function _POST(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  if (g.p.kind !== "owner") return json({ error: { code: "owner_only", message: "เจ้าของเท่านั้น" } }, { status: 403 });
  await withData((d) => { d.brokerCredentials = null; audit(d, "owner", "broker.disconnect", "broker", null, {}); });
  return json({ ok: true, note: "ลบ ciphertext แล้ว — ควร revoke กุญแจฝั่ง Webull ด้วยถ้าไม่ใช้ต่อ" });
}
export const POST = safe(_POST);
