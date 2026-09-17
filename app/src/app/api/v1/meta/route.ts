import { gate, json } from "@/lib/api";
import { API_SCOPES } from "@/lib/types";
export async function GET(req: Request) {
  const g = await gate(req, null);
  if ("res" in g) return g.res;
  const p = g.p;
  return json({ principal: p.kind, label: p.kind === "token" ? p.label : null, scopes: p.kind === "owner" ? [...API_SCOPES, "tickets:confirm (session only)"] : p.kind === "token" ? p.scopes : [], note: "tickets:confirm ไม่มีเป็น scope — ยืนยันได้จากเซสชันคนในหน้าจอเท่านั้น" });
}
