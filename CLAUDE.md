# UPVerse — แอป/ที่ปรึกษาการลงทุนส่วนตัวของต้น (Personal Financial Advisor)

> **agent เจ้าของงาน: `upverse-advisor`** (`~/.claude/agents/upverse-advisor.md`) — อ่านไฟล์นั้นก่อนทำงานทุกครั้ง (กฎเหล็ก §0 · หน้าที่ §2 · ค่าเสี่ยง §3 · แบบฟอร์มส่งงาน §4 · สถาปัตยกรรมแอป §7 · คำถามเปิด §14)
> **pickup = `PROGRESS.md`** (สถานะ · คำถามที่รอต้นเคาะ · กับดักที่เจอแล้ว) · memory `project_upverse`

## กฎเหล็กย่อ (ฉบับเต็มอยู่ในไฟล์ agent)
1. ไม่ใช่ผู้แนะนำการลงทุนที่มีใบอนุญาต — ให้ข้อมูล+เหตุผล+ทางเลือก ต้นตัดสินใจเอง · ไม่การันตีผลตอบแทน
2. **ไม่ส่งคำสั่งซื้อขายเอง** — ผลิต "ตั๋วคำสั่ง" ให้ต้นยืนยันทีละใบ · ระบบเริ่มที่ UAT (sandbox) เสมอ
3. **กุญแจ (Webull App Key/Secret · Supabase service role) อยู่ใน env เท่านั้น** — ห้ามอยู่ในแชท/log/repo (repo นี้เป็น public)
4. ตัวเลขทุกตัวมีที่มา+เวลา · ไม่มีข้อมูล = ถาม ห้ามเดา · ภาพหน้าจอ = สมมติฐาน
5. ออปชัน = จำกัดความเสี่ยงเท่านั้น (CSP · covered call · spread ที่รู้ max loss) · ⛔ naked · ⛔ มาร์จิน
6. ทุกข้อเสนอมี "ทางเลือกที่ 0 = ไม่ทำ" + "อะไรจะทำให้ผมคิดผิด" · วง persona 5×3 ก่อนส่ง · lucifer ก่อนไม้ใหญ่/ออปชันครั้งแรก
7. ห้ามเอาข้อมูลพอร์ตจริงของต้นไปใส่คอนเทนต์/ตัวอย่างสาธารณะ

## Stack + บัญชี (ตรวจแล้ว 17 ก.ย. 2569)
| ของ | ค่า | ก่อนใช้ต้อง |
|---|---|---|
| GitHub | `kamalphooltrade/upverse` (public · main · ว่าง) — remote `origin` ตั้งแล้ว | `gh auth switch -u kamalphooltrade` ก่อน push · commit author ให้ตรงบัญชีที่ผูก Vercel |
| Vercel | บัญชี `upwellness` (ต้นระบุ) | CLI ตอนนี้เป็น `kimprojecttpl` → `vercel login`/switch · ยืนยันชื่อ team |
| Supabase | `https://aqklpnjzgtpqotxebthn.supabase.co` | ไม่อยู่ใน MCP ปัจจุบัน → กุญแจใน `app/.env.local` (ดู `.env.example`) |
| Webull OpenAPI | region `th` · SDK Python/Java · https://developer.webull.co.th | ขอ App Key/Secret (รีวิว 1–2 วันทำการ) · `WEBULL_ENVIRONMENT=uat` ก่อน |
| Web | Next.js 16.3 App Router + Tailwind v4 · เก็บข้อมูลไฟล์ JSON หรือ Supabase (`upverse_state`) สลับด้วย env | ก่อนแก้โค้ดอ่าน `app/AGENTS.md` (Next 16 ต่างจากที่รู้) · `docs/API-UPVerse.md` มี curl จริง |

## โครงโฟลเดอร์
```
UPVerse/
├── CLAUDE.md · PROGRESS.md · README.md · .env.example
├── app/          ← Next.js 16 แอปจริง 🟢 (รัน `cd app && npm run dev -- -p 3777` · README.md ในนั้น · data/ = ไฟล์ paper git-ignored)
├── docs/         ← SPEC.md (v0.1 ✅) · DESIGN.md (v0.1 ✅) · design/mockup.html (ต้นแบบคลิกได้) · API-UPVerse.md · DECISIONS.md
├── design-system/ ← ผลดิบจาก ui-ux-pro-max (MASTER.md) — DESIGN.md ชนะเมื่อขัดกัน
├── research/     ← ข้อมูลดิบที่ดึงมา (EDGAR · ราคา) + ที่มา/เวลา
├── output/       ← รายงานส่งงาน `YYYY-MM-DD_<slug>/` (Portfolio Review · Scan · Thesis · Ticket)
└── journal/      ← สมุดบันทึกการตัดสินใจ (Journal Entry)
```

## ของเดิมที่เกี่ยว
- `~/Desktop/Claude/InvestorAdvisor/` — แผน ETF passive 10 ล้านบาท (ก.ค. 2569) · tracker เป็นข้อมูลตัวอย่าง · UPVerse คือผู้สืบทอด
- Persona สายลงทุนในคลัง: `real-person/warren-buffett` · `finance/retail-investor-th` · `finance/cfp-wealth-manager-th` · `professional/financial-advisor-th` · `finance/crypto-trader-th`
