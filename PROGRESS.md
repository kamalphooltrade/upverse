# PROGRESS — UPVerse (Personal Financial Advisor)

## สถานะล่าสุด: 18 ก.ย. 2569 (01:00) — 🟢 พอร์ตจริงจาก Webull แสดงในแอปแล้ว
- ✅ ต้นเชื่อม Webull สำเร็จ (token NORMAL · บัญชี Individual Cash CTH6641233) · ต้นตั้งรหัสผ่านในแอปแล้ว (source=db)
- ✅ **แก้ endpoint ให้ตรง TH จริง**: `/trading/accounts/list` · `/trading/assets/balances/get` · `/trading/assets/positions/list` · `/trading/orders/historical-orders/list` (ที่ผมใช้ก่อนหน้า `/app/subscriptions/list` เป็นของ US → 404)
- ✅ **sync** (`POST /broker/sync` · ปุ่ม "ดึงจาก Webull" ในหน้าพอร์ต · งานกลางคืนเรียกให้): snapshot balance+positions (qty/cost/last_price จาก Webull = ชั้น 1) + นำเข้า fills → บัญชี `webull_live` · พอร์ตรวม paper + live · ราคาใช้ของ Webull ถ้าใหม่กว่า Yahoo
- ✅ ผล sync จริง: 7 ตำแหน่ง (NVDA INTC TSLA AXON GOOG AAPL USB เศษหุ้น) · เงินสด $46.09 · มูลค่าหุ้น $20.40 · Webull รายงานรวม ฿2,210.58 · fills นำเข้า 4 รายการ
- ⚠️ **ข้อจำกัด Webull TH**: historical-orders คืนเฉพาะช่วงล่าสุด (start_time ทุกรูปแบบ → 417 · ยิงถี่ → 429) → ledger ของบัญชี Webull ไม่ครบ **positions snapshot = ความจริง** · market-data host timeout/ต้อง subscription → ใช้ last_price จาก positions
- ✅ กัน dev ปน prod: `UPVERSE_USE_SUPABASE=1` เท่านั้นถึงใช้ Supabase นอก Vercel (ผมเปิดชั่วคราวเพื่อทดสอบ sync จริง แล้วปิดคืน)
- ✅ **GitHub Actions nightly ตั้ง secrets แล้ว** (`UPVERSE_URL` · `CRON_SECRET`) รันจริงผ่าน: สแกนทั้ง S&P 500 + sync Webull + keep-alive token · 05:30 ICT อ.–ส.
- ✅ แก้บั๊ก prod: cache EDGAR/universe เขียนดิสก์ไม่ได้บน Vercel (เงียบ → M2/M3/M5 excluded 440) → ย้ายไป `/tmp` + best-effort · ตอนนี้ excluded 0

## สถานะก่อนหน้า: 18 ก.ย. 2569 (00:45) — เปลี่ยนรหัสผ่านในแอปได้ · 2FA Webull ตามเอกสารทางการ
- ✅ **เปลี่ยนรหัสผ่านเจ้าของในแอป** (ตั้งค่า › รหัสผ่านเจ้าของ): เก็บ scrypt hash ใน DB · env `UPVERSE_OWNER_PASSPHRASE` เป็นแค่ค่าตั้งต้น (เมื่อตั้งในแอปแล้ว env ไม่ถูกใช้) · ต้องใส่รหัสเดิม · API token เปลี่ยนไม่ได้ (403) · หมุนเซสชัน · ทดสอบผ่าน UI แล้ว
- ✅ **2FA Webull ทำตามเอกสาร `authentication/token`**: create → PENDING + **Webull ส่ง SMS** → ผู้ใช้ไป **แอป Webull → Menu → Messages → OpenAPI Notifications → Check Now → กรอก SMS** (5 นาที) → เรากด "ตรวจสถานะ" → NORMAL · token เก็บเข้ารหัส (ไม่สร้างใหม่ทุกครั้ง = ไม่ SMS ซ้ำ) · ปุ่ม "ขอรหัสใหม่" แยก · INVALID หลัง 15 วันไม่ใช้ → สแกนกลางคืนเรียก refresh ต่ออายุ · **แอปเราไม่มีช่องกรอก SMS โดยเจตนา**
- ✅ ยิงจริงถึง `api.webull.co.th` ด้วยกุญแจปลอม → `401 UNAUTHORIZED: Invalid credentials` (ลายเซ็น/endpoint ถูกรับที่ปลายทาง)
- ✅ กัน dev ในเครื่องปนข้อมูล prod: นอก Vercel ใช้ Supabase เฉพาะ `UPVERSE_USE_SUPABASE=1`
- 🔵 **ที่ต้นต้องมี:** เบอร์โทรที่ผูกบัญชี Webull รับ SMS ได้ · บัญชี OpenAPI อนุมัติแล้ว (Developer Tool → API Management)

## สถานะก่อนหน้า: 18 ก.ย. 2569 (00:20) — 🟢 LIVE บน Vercel + Supabase · https://upverse-app.vercel.app
- ✅ **push** `kamalphooltrade/upverse` main (c358664 → 0de20b0) · repo public · secret scanning + push protection เปิด
- ✅ **Vercel** โปรเจกต์ `ultimatepassion/upverse` (team upwellness · ต้น login device-code เอง) · rootDirectory=`app` · deploy จาก CLI (root ของ repo) · alias ถาวร **https://upverse-app.vercel.app** (+ upverse-ultimatepassion.vercel.app · upverse-weld.vercel.app) · ปิด SSO deployment protection (แอปมี passphrase เอง)
- ⚠️ **git auto-deploy ยังไม่ผูก**: Vercel GitHub App ของบัญชี upwellness ไม่มีสิทธิ์ repo ของ `kamalphooltrade` (repo_no_access) → deploy ด้วย `vercel deploy --prod --scope ultimatepassion` จาก root ของ repo ไปก่อน · แก้ถาวร: ต้นเพิ่ม repo ใน GitHub App ของ Vercel (บัญชี kamalphooltrade) แล้วผูกใน Project → Git
- ✅ **Supabase** `aqklpnjzgtpqotxebthn` (org ของ kamalphooltrade · ap-southeast-2 · ต้น login CLI เอง) · migration `upverse_state` applied · RLS on · 0 policy (service role เท่านั้น — anon อ่านได้ `[]`) · env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ใน Vercel (Sensitive) และ `app/.env.local`
- ✅ **env production ครบ 9 ตัว** (passphrase · session secret · master key · cron secret · TRADING_ENABLED=false · owner id · SEC UA · supabase ×2) — ค่าอยู่ใน `app/OWNER-SECRETS.local.md` (git-ignored) **ต้นเก็บลง password manager แล้วลบไฟล์**
- ✅ **พิสูจน์บน production**: health `storage: supabase · owner_auth: passphrase · master_key: true · api_rail_possible: false` · login ผิด 401/ถูก 200 · เขียน deposit+buy → อ่านพอร์ตราคาจริง → แถวอยู่ใน Supabase → ลบข้อมูลทดสอบแล้ว (พอร์ตว่างพร้อมใช้)
- ✅ แก้ระหว่างทาง: บน Vercel ไม่มี Supabase → เดิม 500 EROFS · ตอนนี้ health 503 + ข้อความชัด (`storage: none`) · ทุก route มี error boundary (`safe()`)
- ⏳ ยังไม่ทำ: cron กลางคืน (ตั้งใน `vercel.json` แล้ว แต่ Hobby plan รัน cron ได้วันละครั้งและเวลาไม่แน่นอน — ใช้ GitHub Actions `nightly-scan.yml` แทน: ต้องใส่ secrets `UPVERSE_URL` + `CRON_SECRET` ใน repo) · LINE alerts · Webull sync

## สถานะก่อนหน้า: 18 ก.ย. 2569 (00:xx) — แอปพร้อมใช้ในเครื่อง (โหมด paper)
- ✅ **Next.js 16.3 + TypeScript + Tailwind v4** ที่ `app/` · build ผ่าน · lint/tsc ผ่าน · 31 routes
- ✅ **API v1 ครบ** (`docs/API-UPVerse.md` มี curl ที่รันแล้วจริง): health · auth · portfolio · transactions · quotes · instruments · scans(+run) · watchlist · tickets (propose/get/confirm/fill/reject) · journal · goal · settings(+rules/tokens) · broker(connect/status/disconnect) · openapi.json · query
- ✅ **หน้าจอ 10 หน้า** ตามดีไซน์ v2 gradient: หน้าหลัก · พอร์ต (+ชีทบันทึก paper) · สแกน · หุ้น (แท่งเทียนจริง+EMA/SMA/RSI+EDGAR) · watchlist · ตั๋ว (รายการ+สร้าง) · ตั๋ว/ยืนยัน · journal · เป้า/DCA · ตั้งค่า · login — ทดสอบ 375px มืด: ไม่ล้น · ปุ่ม ≥ 44px
- ✅ **ท่อสแกนจริง**: Wikipedia S&P 500 (503) → Yahoo bars 2 ปี → SEC EDGAR companyfacts (แก้บั๊กปีงบ: รวมแท็กทางเลือก + คีย์ด้วยปีสิ้นงวด → AAPL FY2025 · F-score 9/9) → M1–M5 + OVERLAP + AVOID · รัน 60 ตัว = 10 วิ
- ✅ **ตั๋ว 2 ขั้นพิสูจน์แล้ว (e2e)**: token confirm → 403 · ประโยคผิด → 422 · ⛔ → ยืนยันไม่ได้ · idempotent · fill → ledger (ต้นทุนเฉลี่ยถูก) → journal pending
- ✅ **Webull adapter (TS)**: ลายเซ็น HMAC-SHA256 **ตรงกับ Python SDK 3.0.1 ทั้ง GET/POST** (x-version ไม่ถูก sign) · host th · token 2FA flow · place/preview/cancel · เข้ารหัสกุญแจ AES-256-GCM
- 🔴 **ข้อค้นพบ:** SDK ทางการไม่มี host UAT/sandbox → "UAT" ในแอป = ไม่ส่งจริง (รางส่งมือ) · ส่งจริง = prod + kill switch 2 ชั้น + เชื่อมแล้ว + ผ่านกฎ + เจ้าของพิมพ์ยืนยัน
- ✅ กฎความเสี่ยง: เพิ่ม `coreSymbols` (ETF แกนยกเว้นเพดานหุ้นเดี่ยว ใช้เพดานแกน 80%) หลัง e2e ชี้ว่าตั๋ว DCA VOO โดน block ผิดเจตนา
- ✅ Supabase migration `app/supabase/migrations/0001_upverse_state.sql` · Vercel cron `app/vercel.json` · GitHub Actions `nightly-scan.yml` · `.env.example` ครบ
- ⏳ **ยังไม่ deploy** (ต้อง: Vercel login เป็นบัญชี upwellness · ใส่ env 5 ตัว · รัน migration ใน Supabase) · ยังไม่ commit (รอต้นสั่ง)
- ⏳ ยังไม่ทำ (P1/P2): LINE alerts · บรีฟเช้า · Webull market data/sync positions (ต้องกุญแจชุดใหม่ + subscription) · thesis จาก agent (ใช้ journal ไปก่อน) · ตั๋วชุด DCA · scan_outcomes (ความแม่น)

## สถานะก่อนหน้า: 17 ก.ย. 2569 (ดึก) — ต้นเคาะสไตล์ → mockup v2 gradient (Tailwind+React)
- ✅ ต้นสั่ง `/ui-ux-pro-max`: gradient + ขอบโค้งมน smooth + Tailwind/React → `docs/design/mockup-v2-gradient.html` (React 18 + Tailwind CDN · 10 หน้า · ข้อมูลสมมติ) · DESIGN.md v0.2 §6.1 บันทึกการตัดสินใจ + class ที่ใช้
- ✅ วัดจริง 375px มืด/สว่าง + 1440px: ไม่ล้น · คอนทราสต์ต่ำสุด 6.29 (มืด) / 5.02 (สว่าง) · ทุกปุ่ม ≥ 44px · ไม่มี console error
- 🔴 **ต้นวาง Webull App Key/Secret ในแชท** → ถือว่าหลุด · แจ้งให้ regenerate แล้ว (ดู "กับดักที่รู้แล้ว") · ยังไม่มีการใช้/บันทึกค่าใด ๆ
- ⏳ ยังรอ: ฟอนต์ A/B · แถบ/โดนัท · ปุ่มกลาง · ภาษา (DESIGN §6) และคำถาม Q1–Q7 (SPEC §17)

## สถานะก่อนหน้า: 17 ก.ย. 2569 (ค่ำ) — SPEC v0.1 + DESIGN v0.1 + mockup คลิกได้
- ✅ `docs/SPEC.md` v0.1 — 20 หมวด: ปัญหา/เป้า · non-goals · F1–F14 พร้อมเกณฑ์ตรวจรับ · **โมเดลสแกน 5 ตัว (M1 กลับตัว+วอลุ่ม · M2 ดาวรุ่ง VI · M3 ของถูกมีเหตุผล · M4 ผู้นำแนวโน้ม · M5 เครื่องจ่ายเงิน) + M6 P1** · schema 25 ตาราง · Webull TH facts (ตรวจแล้ว) · sequences · security · gates · คำถามเปิด Q1–Q14
- ✅ `docs/DESIGN.md` v0.1 — ระบบดีไซน์ (สี 2 ธีมผ่าน AA วัดจริง · จานสีกราฟผ่าน dataviz validator ทั้งมืด/สว่าง · Plex Sans Thai 17.5px) · โครง 10 หน้า · กติกา responsive · เช็กลิสต์ · **ทางเลือก 5 ข้อรอต้นเลือก (§6)**
- ✅ `docs/design/mockup.html` — ต้นแบบคลิกได้ 10 หน้า ข้อมูลสมมติ · ทดสอบในเบราว์เซอร์จริง 375px (มืด/สว่าง) + 1440px: ไม่มี horizontal scroll ทุกหน้า · คอนทราสต์ต่ำสุด 4.51:1 (สว่าง) / 6.45:1 (มืด) · ไม่มีปุ่ม < 40px · เปิดดู: `python3 -m http.server 8766` แล้ว `/docs/design/mockup.html`
- ✅ `design-system/upverse/MASTER.md` (ผลดิบจาก ui-ux-pro-max — ตัดสินใจต่างจากที่มันเสนอ ดู DESIGN §1.1)
- ✅ ยืนยัน git remote = `kamalphooltrade/upverse` (ถูกต้อง) · ที่เคยพูดถึง `kimprojecttpl` คือบัญชี Vercel CLI ไม่ใช่ git
- ⏳ ยังไม่ commit (รอต้นสั่ง) · ยังไม่ scaffold แอป (รอ Q1–Q7 + Sprint 0)

## สถานะก่อนหน้า: 17 ก.ย. 2569 (เช้า) — ตั้งต้นโปรเจกต์ + สร้าง agent
- ✅ สร้าง agent `upverse-advisor` (`~/.claude/agents/upverse-advisor.md`) — บทบาท · กฎเหล็ก · 6 หน้าที่ · ค่าเสี่ยงเริ่มต้น · แบบฟอร์มส่งงาน · วง persona · สถาปัตยกรรมแอป · คำถามเปิด 12 ข้อ
- ✅ ลงทะเบียนใน `AGENT-INDEX.md` + `~/.claude/CLAUDE.md` (specialist เรียกตรง) · memory `project_upverse`
- ✅ `git init` ในโฟลเดอร์นี้ + remote `origin` → `kamalphooltrade/upverse` (ยังไม่ commit — รอต้นสั่ง)
- ✅ ตรวจข้อเท็จจริง Webull ไทย + OpenAPI (ดู agent §5.2) — พอร์ทัล `developer.webull.co.th` มีจริง · region `th` · skills/MCP ทางการ **ไม่รองรับ th**
- ⏳ **ยังไม่มีข้อมูลพอร์ตจริง · ยอดเติมต่อเดือน · เป้าเป็นตัวเลข** → ยังทำ Portfolio Review / Scan จริงไม่ได้
- ⏳ ยังไม่ scaffold แอป (รอคำตอบเรื่อง Supabase/Vercel/OpenAPI ก่อน — กันสร้างผิดบัญชี)

## รอต้นเคาะ (คำถาม 12 ข้อ — ฉบับเต็ม agent §14)
1. เป้า (กี่ล้าน · ปีไหน) · เงินตั้งต้น · **เติมต่อเดือน**
2. พอร์ตปัจจุบัน (CSV จาก Webull หรือรอ API)
3. ความเสี่ยงที่รับได้ · ค่าเริ่มต้น §3 ใช้ได้ไหม
4. สิทธิ์ options ของบัญชี · รับแผน 3 เฟสไหม
5. สมัคร Webull OpenAPI แล้วหรือยัง · แอปควร "ส่งจริงหลังยืนยัน" หรือ "เตรียมตั๋วให้กดเอง"
6. จ่ายค่า market data ไหม หรือใช้แหล่งฟรีทำวิจัยก่อน
7. Supabase `aqklpnjzgtpqotxebthn` อยู่บัญชีไหน · ใส่กุญแจเอง/เพิ่ม MCP
8. Vercel: team ของบัญชี upwellness · ชื่อโปรเจกต์ · โดเมน
9. ภาษี (sachiel): ถิ่นที่อยู่ทางภาษี · W-8BEN · แผนนำเงินกลับ
10. จักรวาล: S&P 500 อย่างเดียว / ETF แกน / HK
11. บรีฟเช้าอัตโนมัติ + LINE ไหม · ความถี่รีวิว
12. สร้าง persona ใหม่ 3 ตัว (technical trader · options income · risk manager) ไหม

## ทำอะไรต่อ
| # | งาน | เจ้าของ | เมื่อไร |
|---|---|---|---|
| 1 | ตอบคำถาม 12 ข้อ (อย่างน้อยข้อ 1–5) | ต้น | ก่อนเริ่มงานวิเคราะห์จริง |
| 2 | ส่งออกพอร์ตจาก Webull (CSV/ภาพ → ยืนยันตัวเลข) | ต้น | พร้อมข้อ 1 |
| 3 | สมัคร Webull OpenAPI (App Key/Secret) — เก็บใน `app/.env.local` เท่านั้น | ต้น | สัปดาห์นี้ (รีวิว 1–2 วันทำการ) |
| 4 | Portfolio Review + Scan Report ฉบับแรก (S&P 500 · scorecard v1) | upverse-advisor | หลังได้ข้อ 1–2 |
| 0 | **regenerate Webull App Key/Secret** (OpenAPI Management) แล้วใส่ใน **หน้าตั้งค่าของแอป** (ไม่ใช่แชท) หลังตั้ง `UPVERSE_MASTER_KEY` | ต้น | **ทันที** |
| 0b | รันแอปในเครื่อง: `cd app && npm run dev -- -p 3777` → บันทึกพอร์ตจริงในหน้า "พอร์ต" (paper) · กด "รันเร็ว" ในหน้าสแกน | ต้น | วันนี้ |
| 0c | ~~commit + push + deploy + migration~~ ✅ LIVE https://upverse-app.vercel.app | — | เสร็จ 18 ก.ย. |
| 0d | เก็บ `app/OWNER-SECRETS.local.md` ลง password manager แล้วลบไฟล์ · เข้า /login ด้วย passphrase | ต้น | วันนี้ |
| 0e | ผูก git auto-deploy: GitHub → Settings → Applications → Vercel → เพิ่ม repo `upverse` (บัญชี kamalphooltrade) แล้ว Vercel Project → Settings → Git → Connect | ต้น | เมื่อสะดวก |
| 0f | ใส่ GitHub secrets `UPVERSE_URL=https://upverse-app.vercel.app` + `CRON_SECRET` (จากไฟล์ secrets) เพื่อให้สแกนกลางคืนรันเอง | ต้น | เมื่อสะดวก |
| 5 | ~~เขียน `docs/SPEC.md`~~ ✅ v0.1 → ต้นรีวิว + เลือกทางเลือกดีไซน์ที่เหลือ 4 ข้อ (DESIGN §6 · สไตล์เคาะแล้ว = gradient v2) | ต้น | สัปดาห์นี้ |
| 5b | lucifer ทุบ SPEC v0.1 (เติม §19) | lucifer | ก่อน Sprint 0 |
| 6 | Sprint 0: พิสูจน์ Webull TH API ด้วยบัญชีทดสอบ (SPEC §14.1 S0.1–S0.6) → แล้ว scaffold Next.js + Supabase + `/api/v1/health` | metatron | หลังต้นตอบ Q1–Q7 |
| 7 | ประเด็นภาษีต่างประเทศ/W-8BEN | sachiel | ก่อนนำเงินกลับไทยครั้งแรก |
| 8 | ทุบแผน 3 เฟส + ค่าเสี่ยง §3 | lucifer | ก่อนเคาะใช้จริง |

## กับดักที่รู้แล้ว
- 🔴 **17 ก.ย. 2569 (ค่ำ): Webull App Key/Secret ถูกวางในแชท Claude Code** → ถือว่าหลุด · **ต้อง revoke/regenerate ที่ Webull OpenAPI Management ก่อนใช้ทุกกรณี** · ชุดใหม่ใส่ `app/.env.local` เองเท่านั้น (ห้ามส่งในแชทอีก) · agent ห้ามใช้ชุดเดิมแม้เห็นใน transcript
- โฟลเดอร์แม่ `/Users/ckawin` มี `.git` หลงอยู่ (remote `upwellness/hyrox`) — `git status` จากที่นี่เห็นไฟล์ทั้ง home · ห้าม `git add .` ที่ระดับ home
- เศษหุ้นทำ covered call ไม่ได้ (ต้อง 100 หุ้นเต็ม) · CSP ต้องกันเงินสด strike×100 → ออปชันเป็นเรื่องเฟส 2–3
- Webull skills/MCP ทางการรองรับแค่ US/HK/JP/SG/MY/UK/MX/BR/ZA → ต่อ Python SDK ตรงด้วย region `th` และทดสอบกับบัญชีทดสอบร่วมก่อน
- repo เป็น public → `.env*` อยู่ใน `.gitignore` แล้ว · ห้ามใส่ข้อมูลพอร์ตจริงใน repo
