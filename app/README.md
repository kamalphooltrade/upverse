# UPVerse — แอป (Next.js 16 · App Router)

ระบบบันทึกพอร์ต + สแกน S&P 500 + ตั๋วคำสั่ง 2 ขั้น สำหรับใช้ส่วนตัว · **ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต**

## รันในเครื่อง (โหมด paper — ไม่ต้องมีกุญแจใด ๆ)
```bash
cd app && npm install && npm run dev -- -p 3777
# เปิด http://localhost:3777 · ข้อมูลเก็บที่ app/data/upverse.json (git-ignored)
```

## ตั้งค่าก่อนใช้จริง (app/.env.local — ดู ../.env.example)
1. `UPVERSE_OWNER_PASSPHRASE` — รหัสผ่านเจ้าของ (ถ้าว่าง = โหมด dev เปิดให้เข้าได้ ใช้ในเครื่องเท่านั้น)
2. `UPVERSE_MASTER_KEY` — `openssl rand -hex 32` — ใช้เข้ารหัสกุญแจ Webull ที่ใส่ในหน้าตั้งค่า
3. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ทางเลือก) — เมื่อใส่ ข้อมูลจะเก็บในตาราง `upverse_state` แทนไฟล์ (รัน `supabase/migrations/0001_upverse_state.sql` ก่อน)
4. `CRON_SECRET` — ให้ Vercel Cron (`vercel.json`) / GitHub Actions (`.github/workflows/nightly-scan.yml`) เรียกสแกนกลางคืน 05:30 ICT
5. `TRADING_ENABLED=false` — kill switch ชั้น env · เปิด `true` เฉพาะเมื่อผ่านประตูเฟส 2 (SPEC §14.3)

## Deploy (Vercel · บัญชี upwellness · repo kamalphooltrade/upverse)
- Root Directory = `app` · Framework = Next.js · ใส่ env ข้อ 1–5 ใน Vercel Project Settings
- ตรวจหลัง deploy: `curl https://<domain>/api/v1/health` ต้องตอบ `owner_auth: "passphrase"`, `storage: "supabase"`, `trading.api_rail_possible: false`

## เชื่อม Webull (OpenAPI region th)
ตั้งค่า › เชื่อม Webull › ใส่ App Key/Secret (จาก developer.webull.co.th) → ครั้งแรก Webull ขอ 2FA ในแอป → กด "ตรวจสถานะ" · กุญแจถูกเข้ารหัส ไม่แสดงเต็ม ไม่ส่งให้ AI · **ห้ามพิมพ์กุญแจในแชท**

## โครงโค้ด
```
src/lib/types.ts        โดเมน (SPEC §8)
src/lib/store/          ไฟล์ JSON ↔ Supabase (สลับด้วย env)
src/lib/prices/         ผู้ให้ราคา (Yahoo ชั้น 2 · Webull เมื่อมีสิทธิ์)
src/lib/portfolio/      ต้นทุนเฉลี่ย · P&L · สูตรเป้า
src/lib/risk/           ตรวจกฎตั๋ว (ทุกข้อมีตัวเลขจริง)
src/lib/scan/           จักรวาล · ตัวชี้วัด · EDGAR · โมเดล M1–M5 · ตัวรัน
src/lib/webull/         ลายเซ็น HMAC (ตรวจเทียบ SDK แล้ว) · token 2FA · คำสั่ง · เข้ารหัสกุญแจ
src/app/api/v1/         API (docs/API-UPVerse.md)
src/app/*               หน้าจอ 10 หน้า (DESIGN.md v0.2)
```
