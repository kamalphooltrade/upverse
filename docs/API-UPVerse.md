# UPVerse API v1 — คู่มือใช้งาน (ทดสอบจริง 18 ก.ย. 2569)

ฐาน: `http://localhost:3777/api/v1` (dev) · production = `https://<your-vercel-domain>/api/v1` · สคีมา: `GET /openapi.json`

**กติกา:** ทุก endpoint ตอบ JSON · ผิดพลาดเป็น `{ "error": { "code", "message" } }` · ยืนยันตั๋ว (`/tickets/{id}/confirm`) ทำได้จาก **เซสชันเจ้าของในเบราว์เซอร์เท่านั้น** — Bearer token ทุกชนิดได้ 403 · rate limit 60 ครั้ง/นาที/ตัวตน · ทุกการเรียกที่ถูกปฏิเสธลง audit

## การยืนยันตัวตน
| แบบ | ใช้เมื่อ | วิธี |
|---|---|---|
| เซสชันเจ้าของ | หน้าจอ · ยืนยันตั๋ว · ตั้งค่า | `POST /auth/login {"passphrase"}` → cookie `upv_session` (30 วัน) · ถ้าไม่ตั้ง `UPVERSE_OWNER_PASSPHRASE` = โหมด dev เปิดให้เข้า (ใช้ในเครื่องเท่านั้น) |
| API token | agent · n8n · ChatGPT Actions | สร้างในหน้าตั้งค่า (แสดงครั้งเดียว) → `Authorization: Bearer upv_…` · scope เป็น allow-list |

Scope ที่มี: `portfolio:read` `portfolio:write` `quotes:read` `scan:read` `watchlist:write` `theses:write` `tickets:propose` `journal:write` — **ไม่มี `tickets:confirm`**

## ตัวอย่างที่รันได้จริง
```bash
B=http://localhost:3777/api/v1; J='Content-Type: application/json'

# สุขภาพระบบ — บอกค่าที่บังคับใช้จริง (environment · kill switch · broker · กฎ)
curl -s $B/health | jq

# บันทึกรายการ paper: ฝากเงิน 100 USD ที่ 33.27 แล้วซื้อ VOO 0.1 หุ้น @ 500
curl -s -X POST $B/transactions -H "$J" -d '{"type":"deposit","amountUsd":100,"fxRateThb":33.27}'
curl -s -X POST $B/transactions -H "$J" -d '{"type":"buy","symbol":"VOO","qty":0.1,"price":500}'

# พอร์ต (ราคาจริงจาก yahoo ชั้น 2 · P&L แยกหุ้น/ค่าเงิน)
curl -s "$B/portfolio?account=all" | jq '{total_usd,total_thb,cash_usd,holdings:[.holdings[]|{symbol,qty,price,weight_pct,pnl_pct,quote_source}]}'

# ราคา
curl -s "$B/quotes?symbols=AAPL,MSFT,VOO" | jq

# หุ้น: quote + bars + indicators + EDGAR
curl -s "$B/instruments/AAPL?range=1y" | jq '{quote:.quote.price, rsi:.snapshot.rsi14, fy:.fundamentals.fy, fscore:.fundamentals.fScore}'

# รันสแกน (เจ้าของ) — เร็ว 60 ตัว หรือทั้ง S&P 500 (หลายนาที)
curl -s -X POST $B/scans/run -H "$J" -d '{"limit":60}'
curl -s "$B/scans?model=M4" | jq '.runs[0].results[:3]'

# เสนอตั๋ว (proposed เสมอ · คืนผลตรวจกฎ + ประโยคยืนยัน)
curl -s -X POST $B/tickets -H "$J" -d '{"side":"buy","symbol":"VOO","qty":0.05,"orderType":"LIMIT","limitPrice":400,"rationale":"DCA แกน","altZero":"ถือเงินสด","invalidation":"ไม่มี","tag":"DCA","rail":"manual"}' | jq '{id:.ticket.id, phrase:.ticket.confirmPhrase, checks:[.ticket.riskCheck[]|"\(.state):\(.code)"]}'

# ยืนยัน (เซสชันเจ้าของเท่านั้น — ต้องพิมพ์ประโยคตรงทุกตัวอักษร · idempotencyKey กันกดซ้ำ)
curl -s -X POST $B/tickets/<ID>/confirm -H "$J" -d '{"phrase":"ยืนยัน ซื้อ VOO 0.05","idempotencyKey":"abcdefgh12"}'

# รางส่งมือ: ทำในแอป Webull แล้วรายงานผลจริง → เข้าสมุดบันทึกอัตโนมัติ
curl -s -X POST $B/tickets/<ID>/fill -H "$J" -d '{"price":401.5,"qty":0.05,"fees":0}'

# journal
curl -s -X POST $B/journal -H "$J" -d '{"ticketId":"<ID>","symbol":"VOO","decision":"ซื้อ","emotion":"มั่นใจ","thesisShort":"DCA","expectation":"ถือยาว"}'

# เป้า/DCA → อัตราผลตอบแทนที่ "จำเป็น"
curl -s -X PUT $B/goal -H "$J" -d '{"targetThb":3000000,"targetDate":"2035-12-31","startAmountThb":4000,"monthlyContributionThb":3000,"dcaDay":25}' | jq .computed

# ภาษาคน (rule-based · คืน understood_as เสมอ)
curl -s -X POST $B/query -H "$J" -d '{"q":"พอร์ตตอนนี้เป็นไง"}'
curl -s -X POST $B/query -H "$J" -d '{"q":"ราคา MSFT"}'

# ด้วย token ของ agent (อ่าน + เสนอตั๋ว ได้ · ยืนยัน/แก้ตั้งค่า ไม่ได้)
T=upv_...; curl -s $B/portfolio -H "Authorization: Bearer $T"
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/tickets/<ID>/confirm -H "$J" -H "Authorization: Bearer $T" -d '{"phrase":"x","idempotencyKey":"abcdefgh12"}'   # → 403
```

## Endpoint ทั้งหมด
| Method · Path | Scope | หมายเหตุ |
|---|---|---|
| GET `/health` | — | environment · trading_enabled (setting+env) · api_rail_possible · broker status · กฎที่ใช้ · last_scan_at |
| GET `/openapi.json` · GET `/meta` | — / any | สคีมา · scope ของ token |
| POST `/auth/login` · POST `/auth/logout` | — | เซสชันเจ้าของ |
| GET/PUT `/auth/passphrase` | **เซสชันเจ้าของเท่านั้น** | ดูที่มาของรหัส (env/db/none) · PUT `{current,next}` เปลี่ยนรหัส (scrypt hash ใน DB · env ไม่ถูกใช้อีก · หมุนเซสชัน) |
| GET `/portfolio?account=all\|<id>` | portfolio:read | positions ที่ราคาล่าสุด + cash + P&L (หุ้น / ค่าเงิน) + caveats |
| GET/POST/DELETE `/transactions` | portfolio:read / write | บันทึกมือ (paper) · `{rows:[…]}` นำเข้า · ลบด้วย `?id=` |
| GET `/quotes?symbols=` | quotes:read | source · as_of · market_state · stale |
| GET `/instruments/{symbol}?range=3mo\|6mo\|1y\|2y` | quotes:read | bars + EMA20/SMA50/SMA200/RSI14 + snapshot + EDGAR + ป้ายสแกน + position |
| GET `/scans?model=&date=` | scan:read | ผลล่าสุดต่อโมเดล (M1–M5 · OVERLAP · AVOID) |
| POST `/scans/run {limit?,withFundamentals?}` | เจ้าของ / `x-cron-secret` | รันสแกน · GET พร้อม `Authorization: Bearer CRON_SECRET` = Vercel Cron |
| GET/POST/DELETE `/watchlist` | portfolio:read / watchlist:write | โซนเข้า · ระยะจากโซน |
| GET/POST `/tickets` · GET `/tickets/{id}` | portfolio:read / tickets:propose | สร้าง = proposed เสมอ · GET ตรวจกฎสดใหม่ |
| POST `/tickets/{id}/confirm` | **เซสชันเจ้าของเท่านั้น** | ตรวจซ้ำ · ประโยค · idempotency · manual→confirmed · api→ส่ง Webull เมื่อ prod+kill switch เปิด+เชื่อมแล้ว |
| POST `/tickets/{id}/fill` · `/reject` | เจ้าของ | รายงานผลจริง → ledger · ปฏิเสธ → journal |
| GET/POST/PATCH `/journal` | portfolio:read / journal:write | + `pending_journal` (ตั๋ว filled ที่ยังไม่บันทึก) |
| GET/PUT `/goal?current_thb=` | portfolio:read / เจ้าของ | อัตราที่จำเป็น · เส้นทาง 3 ฉากทัศน์ (ตัวเลขผู้ใช้กรอก) |
| GET/PATCH `/settings` · PUT `/settings/rules` | เจ้าของ | PROD ต้อง `confirmProdPhrase:"เปิดเงินจริง"` · กฎเป็นเวอร์ชันใหม่เสมอ |
| GET/POST/DELETE `/settings/tokens` | เจ้าของ | token แสดงครั้งเดียว · เพิกถอนได้ |
| POST `/broker/connect` | เจ้าของ | บันทึกกุญแจ (เข้ารหัส) + สร้าง token → **Webull ส่ง SMS** · คืน `instructions` |
| GET `/broker/status` · `?check=1` | เจ้าของ | มุมมองที่เก็บไว้ / ตรวจ token กับ Webull (ไม่ส่ง SMS) · `twoFaSecondsLeft` นับถอยหลัง 5 นาที |
| POST `/broker/status {action:"resend"}` · POST `/broker/disconnect` | เจ้าของ | สร้าง token ใหม่ (ส่ง SMS ใหม่) เมื่อ EXPIRED/INVALID · ลบกุญแจ+token |
| POST `/query {q}` | any (ตาม scope ที่ใช้) | ตัวแปลเจตนาแบบกฎ ไม่มี LLM |

## กฎความเสี่ยงที่ตรวจทุกตั๋ว (ค่าเริ่มต้น v1)
quote สด (≤ 60 วิ ตอนตลาดเปิด · fail-closed) · มูลค่า ≤ $500 · จำนวน ≤ 100 · whitelist (ราง API) · น้ำหนักหลังทำ: หุ้นเดี่ยว ≤ 10% (เตือน 8%) / แกน ETF (VOO SPY IVV VTI QQQ SCHD) ≤ 80% · เงินสดพอ + ขั้นต่ำ 5% · ความเสี่ยงต่อไม้ ≤ 1% (ยกเว้น tag DCA) · ตั๋ว/วัน ≤ 5 · ตั๋วซ้ำ · หมดอายุ · ราง API: kill switch (setting + env) · environment ตรง · เชื่อม Webull แล้ว · ขายไม่เกินที่ถือ

## 2FA ของ Webull — กรอกที่ไหน (จากเอกสารทางการ `authentication/token`)
1. กด "เชื่อม" ในหน้าตั้งค่า → แอปเรียก `POST /auth/tokens/create` → token สถานะ **PENDING** และ **Webull ส่ง SMS** ไปเบอร์ที่ผูกบัญชี
2. **ในแอป Webull:** Menu → Messages → **OpenAPI Notifications** → เปิดข้อความล่าสุด → กด **"Check Now"** → กรอกรหัส SMS → ยืนยัน (ภายใน **5 นาที** ไม่งั้น EXPIRED)
3. กลับมาที่หน้าตั้งค่า กด "ตรวจสถานะ" (หน้าจะตรวจให้เองทุก 5 วิ) → `POST /auth/tokens/check` → **NORMAL** = เชื่อมแล้ว
4. token จะ **INVALID ถ้าไม่มีการเรียก 15 วันติดต่อกัน** → งานสแกนกลางคืนเรียก refresh ให้ · ถ้าหลุดให้กด "ขอรหัสใหม่"

**แอป UPVerse ไม่มีช่องกรอกรหัส SMS โดยเจตนา** — รหัสกรอกในแอป Webull เท่านั้น (เราแค่รอสถานะ)

## ข้อค้นพบสำคัญ (จากซอร์ส SDK ทางการ 3.0.1)
- ลายเซ็น HMAC-SHA256 ของ Webull ถูกพอร์ตเป็น TypeScript และ **ตรวจเทียบกับ Python SDK แล้วตรงทั้ง GET/POST** (`x-version` ส่งแต่ไม่ถูก sign)
- endpoint TH: `api.webull.co.th` / `data-api.webull.co.th` · token: `POST /auth/tokens/create` → `POST /auth/tokens/check` จน `NORMAL`
- **ไม่มี host UAT/sandbox ใน SDK** → "UAT" ในแอป = ไม่ส่งจริง · การส่งจริงต้อง environment=prod + kill switch 2 ชั้น + เชื่อมแล้ว + ตั๋วผ่านกฎ + เจ้าของพิมพ์ยืนยัน
- market data ของ Webull ต้องมี subscription (403 ถ้าไม่มี) — เวอร์ชันนี้ใช้ Yahoo (ชั้น 2) และ EDGAR (ทางการ)
