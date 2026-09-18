import { json, safe } from "@/lib/api";
async function _GET(req: Request) {
  const base = new URL(req.url).origin + "/api/v1";
  const bearer = { type: "http", scheme: "bearer" };
  const R = (desc: string, scope?: string) => ({ summary: desc, description: scope ? `scope: ${scope}` : "owner session only", responses: { "200": { description: "OK" } } });
  return json({
    openapi: "3.1.0",
    info: { title: "UPVerse API", version: "1.0.0", description: "ระบบบันทึกพอร์ต + สแกน + ตั๋วคำสั่ง 2 ขั้น · การยืนยันตั๋วทำได้จากเซสชันเจ้าของเท่านั้น (ไม่มี scope) · ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต" },
    servers: [{ url: base }],
    components: { securitySchemes: { bearerAuth: bearer } },
    security: [{ bearerAuth: [] }],
    paths: {
      "/health": { get: R("สถานะระบบ + ค่าที่บังคับใช้จริง") },
      "/meta": { get: R("scope ของ token นี้", "any") },
      "/portfolio": { get: R("พอร์ต (positions · cash · P&L แยกหุ้น/ค่าเงิน)", "portfolio:read") },
      "/transactions": { get: R("รายการสมุดบันทึก", "portfolio:read"), post: R("บันทึกรายการ (paper) หรือ {rows:[...]} นำเข้า", "portfolio:write") },
      "/quotes": { get: R("ราคาล่าสุด ?symbols=A,B (source + as_of)", "quotes:read") },
      "/scans": { get: R("ผลสแกนล่าสุดต่อโมเดล ?model=M1&date=", "scan:read") },
      "/scans/run": { post: R("รันสแกน (เจ้าของ/cron)") },
      "/instruments/{symbol}": { get: R("หุ้น: quote · bars · indicators · EDGAR · ป้ายสแกน", "quotes:read") },
      "/watchlist": { get: R("watchlist + ระยะจากโซน", "portfolio:read"), post: R("เพิ่ม/แก้", "watchlist:write") },
      "/tickets": { get: R("รายการตั๋ว", "portfolio:read"), post: R("เสนอตั๋ว (proposed เท่านั้น · คืนผลตรวจกฎ)", "tickets:propose") },
      "/tickets/{id}": { get: R("ตั๋ว + ตรวจกฎสด", "portfolio:read") },
      "/tickets/{id}/confirm": { post: R("ยืนยัน — 403 สำหรับ token ทุกชนิด") },
      "/tickets/{id}/fill": { post: R("บันทึกผลจริงหลังทำในแอป Webull") },
      "/theses": { get: R("thesis ล่าสุดต่อหุ้น ?symbol=", "theses:read"), post: R("agent เขียน thesis (draft_ai · 7 หัวข้อ · 3 ฉากทัศน์ · เสียงค้าน · ที่มา)", "theses:write") },
      "/theses/{id}": { post: R("ยืนยัน/ปฏิเสธ/ทำเก่า — เจ้าของเท่านั้น") },
      "/journal": { get: R("สมุดบันทึก + ค้าง", "portfolio:read"), post: R("บันทึกการตัดสินใจ", "journal:write") },
      "/goal": { get: R("เป้า + อัตราที่จำเป็น + ฉากทัศน์", "portfolio:read"), put: R("ตั้งเป้า") },
      "/query": { post: R("ภาษาคน → เจตนา (rule-based) คืน understood_as", "any") },
    },
  });
}
export const GET = safe(_GET);
