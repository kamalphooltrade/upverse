# upverse-mcp — ดึงข้อมูล/สั่งงาน UPVerse จาก Claude Code (หรือ MCP client อื่น)

MCP server (stdio) ที่ห่อ REST API v1 ของแอป (`docs/API-UPVerse.md`) เป็นเครื่องมือ 18 ตัว · ไม่มี LLM ในตัว · ทำได้เท่าที่ token มี scope — **ยืนยันตั๋วไม่ได้** (เจ้าของกดในแอปเท่านั้น)

## ติดตั้ง (ครั้งเดียว)
```bash
cd mcp && npm install
```
สร้าง API token ในแอป: ตั้งค่า → API tokens → scope ที่แนะนำ `portfolio:read quotes:read scan:read theses:read theses:write tickets:propose journal:write watchlist:write` แล้วเก็บไว้ที่ (ไม่อยู่ใน repo):
```bash
mkdir -p ~/.upverse && printf '%s' 'upv_…' > ~/.upverse/token && chmod 600 ~/.upverse/token
```
หรือตั้ง env `UPVERSE_TOKEN` · เปลี่ยน URL ด้วย `UPVERSE_URL` (ค่าเริ่มต้น https://upverse-app.vercel.app)

## ใช้กับ Claude Code
`.mcp.json` ที่ root ของ repo ลงทะเบียน server ชื่อ `upverse` ไว้แล้ว — เปิด Claude Code ในโฟลเดอร์นี้ → อนุมัติ server ครั้งแรก → ถามได้เลย เช่น "ดูพอร์ต" "วิเคราะห์พอร์ต" "thesis NVDA" "สแกน M4" "เสนอตั๋วซื้อ VOO $10"
ถ้าเปิดจากโฟลเดอร์อื่น: `claude mcp add upverse -- node /path/to/UPVerse/mcp/upverse-mcp.mjs`

## ใช้กับ Claude Desktop
`claude_desktop_config.json` → `"upverse": { "command": "node", "args": ["/ABS/PATH/UPVerse/mcp/upverse-mcp.mjs"] }`

## ทดสอบ
```bash
cd mcp && node test-client.mjs
```

## เครื่องมือ
| อ่าน | เขียน (scope) | อื่น |
|---|---|---|
| `upverse_health` · `upverse_portfolio` · `upverse_review` · `upverse_instrument` · `upverse_quotes` · `upverse_scans` · `upverse_theses` · `upverse_tickets` · `upverse_transactions` · `upverse_watchlist` · `upverse_journal` · `upverse_goal` | `upverse_thesis_create` (theses:write) · `upverse_ticket_propose` (tickets:propose → proposed เสมอ) · `upverse_watchlist_add` · `upverse_journal_add` | `upverse_query` (ตัวแปลเจตนาแบบกฎ) · `upverse_api` (เรียก /api/v1 ตรง) |
