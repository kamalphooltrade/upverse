#!/usr/bin/env node
// UPVerse MCP server — exposes the app's REST API v1 as MCP tools (stdio).
// Auth: UPVERSE_TOKEN (agent API token "upv_…" created in the app's settings page) via env or ~/.upverse/token.
// The token's scopes bound what this server can do; it can NEVER confirm tickets (no such scope exists) — the owner does that in the app.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.UPVERSE_URL ?? "https://upverse-app.vercel.app").replace(/\/$/, "");
function loadToken() {
  if (process.env.UPVERSE_TOKEN) return process.env.UPVERSE_TOKEN.trim();
  for (const p of [join(homedir(), ".upverse", "token"), join(homedir(), ".config", "upverse", "token")]) {
    try { const t = readFileSync(p, "utf8").trim(); if (t) return t; } catch { /* next */ }
  }
  return null;
}
const TOKEN = loadToken();

async function call(method, path, { query, body } = {}) {
  const url = new URL(BASE + "/api/v1" + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers = { Accept: "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; }
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error?.code ?? res.statusText;
    const hint = res.status === 401 ? " — ไม่มี/ผิด token: ตั้ง UPVERSE_TOKEN หรือ ~/.upverse/token (สร้างในหน้าตั้งค่าของแอป)" : res.status === 403 ? " — token ไม่มี scope นี้ (ยืนยันตั๋ว/ตั้งค่า ทำได้เฉพาะเจ้าของในแอป)" : "";
    throw new Error(`HTTP ${res.status} ${method} ${path}: ${msg}${hint}`);
  }
  return data;
}
const text = (data) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (e) => ({ content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
const run = (fn) => async (args) => { try { return text(await fn(args ?? {})); } catch (e) { return fail(e); } };

const server = new McpServer({ name: "upverse", version: "0.1.0" }, { instructions: `UPVerse = ที่ปรึกษาการลงทุนส่วนตัวของต้น (Webull TH · หุ้นสหรัฐ เศษหุ้น). ตัวเลขทุกตัวมีที่มา+เวลา (ราคา Yahoo ชั้น 2 · Webull ชั้น 1 ตอน sync · งบ SEC EDGAR รายปี). เครื่องมือเขียน (thesis/ตั๋ว/journal/watchlist) สร้างได้แต่ "ตั๋ว" จะอยู่สถานะ proposed เสมอ — เจ้าของยืนยันในแอปเท่านั้น. ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต. Base URL: ${BASE}` });

// ---- read ----
server.registerTool("upverse_health", { title: "สุขภาพระบบ", description: "สถานะแอป: environment · kill switch · broker/token · กฎความเสี่ยง (whitelist, เพดาน) · สแกนล่าสุด · จำนวนข้อมูล (ไม่ต้องใช้ token)", inputSchema: {} }, run(() => call("GET", "/health")));
server.registerTool("upverse_portfolio", { title: "พอร์ตปัจจุบัน", description: "ตำแหน่งทั้งหมด (Webull snapshot + paper) ราคาล่าสุด มูลค่า น้ำหนัก P&L เงินสด FX", inputSchema: { account: z.string().default("all").describe("all หรือ account id เช่น webull-605760") } }, run(({ account }) => call("GET", "/portfolio", { query: { account } })));
server.registerTool("upverse_review", { title: "วิเคราะห์พอร์ต (ควรทำอะไร)", description: "สัดส่วน vs แผน · เทียบ SPY · รายตัว: stage/trend template/RS/มูลค่า/คุณภาพ/thesis/คะแนน + ป้าย ถือ/เพิ่ม/ลด/ออก/โยก/ทบทวน พร้อมเหตุผล · ถัวได้ไหม · ผู้สมัครโยกเงินพร้อมด่าน (ใช้เวลา ~5–10 วิ)", inputSchema: { account: z.string().default("all") } }, run(({ account }) => call("GET", "/portfolio/review", { query: { account } })));
server.registerTool("upverse_instrument", { title: "หุ้น 1 ตัว", description: "ราคา + แท่งราคา + EMA20/SMA50/SMA200/RSI14 + snapshot เทคนิค + งบ EDGAR + ป้ายสแกน + ตำแหน่งที่ถือ + thesis ล่าสุด", inputSchema: { symbol: z.string().describe("เช่น NVDA"), range: z.enum(["3mo", "6mo", "1y", "2y"]).default("1y"), bars: z.boolean().default(false).describe("true = รวมแท่งราคาทั้งหมด (ยาว) · false = ตัดแท่งออก") } }, run(async ({ symbol, range, bars }) => { const d = await call("GET", `/instruments/${encodeURIComponent(symbol.toUpperCase())}`, { query: { range } }); if (!bars) { delete d.bars; delete d.indicators; } return d; }));
server.registerTool("upverse_quotes", { title: "ราคาล่าสุด", description: "ราคาหลายตัว พร้อม source/as_of/market_state/stale", inputSchema: { symbols: z.array(z.string()).min(1).max(50) } }, run(({ symbols }) => call("GET", "/quotes", { query: { symbols: symbols.join(",") } })));
server.registerTool("upverse_scans", { title: "ผลสแกน Top 10", description: "ผลสแกน S&P 500 ล่าสุดต่อโมเดล (M1 กลับตัว+วอลุ่ม · M2 ดาวรุ่ง VI · M3 deep value · M4 ผู้นำแนวโน้ม · M5 ปันผลทบต้น · OVERLAP · AVOID) พร้อม 'ทำไม'", inputSchema: { model: z.string().optional().describe("M1..M5 | OVERLAP | AVOID · ว่าง = ทุกโมเดล"), date: z.string().optional().describe("YYYY-MM-DD") } }, run(({ model, date }) => call("GET", "/scans", { query: { model, date } })));
server.registerTool("upverse_theses", { title: "thesis ทั้งหมด", description: "บทวิเคราะห์ (draft_ai/confirmed/stale/rejected) ที่ agent เขียน + ต้นยืนยัน", inputSchema: { symbol: z.string().optional() } }, run(async ({ symbol }) => { const d = await call("GET", "/theses"); if (symbol) d.theses = d.theses.filter((t) => t.symbol === symbol.toUpperCase()); return d; }));
server.registerTool("upverse_tickets", { title: "ตั๋วคำสั่ง", description: "รายการตั๋ว (proposed/confirmed/sent/filled/…) หรือตั๋วเดียวพร้อมผลตรวจกฎสด + order log", inputSchema: { id: z.string().optional(), status: z.string().optional() } }, run(({ id, status }) => (id ? call("GET", `/tickets/${id}`) : call("GET", "/tickets", { query: { status } }))));
server.registerTool("upverse_transactions", { title: "รายการซื้อขาย", description: "ledger: fills จาก Webull + บันทึกมือ", inputSchema: { account: z.string().default("all"), limit: z.number().int().min(1).max(500).default(100) } }, run(({ account, limit }) => call("GET", "/transactions", { query: { account, limit } })));
server.registerTool("upverse_watchlist", { title: "watchlist", description: "รายการเฝ้าดู + โซนเข้า", inputSchema: {} }, run(() => call("GET", "/watchlist")));
server.registerTool("upverse_journal", { title: "สมุดบันทึกการตัดสินใจ", description: "journal entries + ตั๋วที่ยังไม่ได้บันทึก", inputSchema: {} }, run(() => call("GET", "/journal")));
server.registerTool("upverse_goal", { title: "เป้าหมาย/แผน", description: "เป้าเป็นบาท · เติมต่อเดือน · สัดส่วนเป้า · อัตราที่จำเป็น", inputSchema: {} }, run(() => call("GET", "/goal")));

// ---- write (scoped) ----
server.registerTool("upverse_thesis_create", { title: "ส่ง thesis เข้าแอป (draft)", description: "สร้าง thesis ใหม่ (สถานะ draft_ai — ต้นยืนยัน/ปฏิเสธในหน้า /stock/{symbol}) · สคีมา: summary ≤600 · verdict ถือ|เพิ่ม|ลด|ออก|รอ|ดูต่อ · role แกน|ดาวเทียม|รายได้|เก็งจังหวะ|ไม่เข้าเกณฑ์ · sections 3–12 {title,body≤4000} · scenarios bear/base/bull ×3 {name,value,assumption≤500} · buyBelow · invalidation ≤1500 · altZero ≤1500 · dissent ≤6 {persona≤60,point≤600,response≤600} · sources ≥1 {label≤200,asOf≤40} · priceAtWrite · reviewAfter", inputSchema: { thesis: z.record(z.any()).describe("JSON ตามสคีมา") } }, run(({ thesis }) => call("POST", "/theses", { body: thesis })));
server.registerTool("upverse_ticket_propose", { title: "เสนอตั๋วคำสั่ง (proposed)", description: "สร้างตั๋วซื้อ/ขาย — สถานะ proposed เสมอ ระบบตรวจกฎทันที · ต้นยืนยันด้วยประโยคในแอป (token ยืนยันไม่ได้) · ต้องมี rationale/altZero/invalidation", inputSchema: { accountId: z.string().describe("เช่น webull-605760 หรือ paper-1"), side: z.enum(["buy", "sell"]), symbol: z.string(), qty: z.number().positive().optional(), notionalUsd: z.number().positive().optional(), orderType: z.enum(["LIMIT", "MARKET"]).default("LIMIT"), limitPrice: z.number().positive().optional(), stopPrice: z.number().positive().optional(), targetPrice: z.number().positive().optional(), thesisId: z.string().optional(), rationale: z.string().min(1).max(2000), altZero: z.string().min(1).max(1000), invalidation: z.string().min(1).max(1000), tag: z.string().max(40).optional(), expiresInDays: z.number().min(1).max(30).default(3), rail: z.enum(["api", "manual"]).default("manual") } }, run((args) => call("POST", "/tickets", { body: args })));
server.registerTool("upverse_watchlist_add", { title: "เพิ่ม watchlist", description: "เพิ่มหุ้นเข้ารายการเฝ้าดู พร้อมเหตุผล/โซนเข้า", inputSchema: { symbol: z.string(), reason: z.string().default(""), zoneLow: z.number().optional(), zoneHigh: z.number().optional(), stop: z.number().optional(), note: z.string().default(""), fromModel: z.string().optional() } }, run((args) => call("POST", "/watchlist", { body: args })));
server.registerTool("upverse_journal_add", { title: "บันทึก journal", description: "บันทึกการตัดสินใจ/อารมณ์/บทเรียน (ตาม JournalEntry ของแอป)", inputSchema: { entry: z.record(z.any()).describe("JSON ตามสคีมา journal ของแอป") } }, run(({ entry }) => call("POST", "/journal", { body: entry })));
server.registerTool("upverse_query", { title: "ถามแบบภาษาคน (กฎ ไม่มี LLM)", description: "ตัวแปลเจตนาแบบกฎของแอป เช่น 'พอร์ตเป็นไง' 'สแกน M4' 'ราคา NVDA'", inputSchema: { q: z.string() } }, run(({ q }) => call("POST", "/query", { body: { q } })));

// ---- escape hatch (bounded to /api/v1) ----
server.registerTool("upverse_api", { title: "เรียก API v1 ตรง", description: "สำหรับ endpoint ที่ยังไม่มีเครื่องมือเฉพาะ · path ต้องขึ้นต้นด้วย / และอยู่ใต้ /api/v1 · scope ตาม token", inputSchema: { method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"), path: z.string().regex(/^\/[a-zA-Z0-9_\-\/\.]*$/), query: z.record(z.string()).optional(), body: z.record(z.any()).optional() } }, run(({ method, path, query, body }) => call(method, path, { query, body })));

const transport = new StdioServerTransport();
await server.connect(transport);
if (!TOKEN) console.error("[upverse-mcp] no token — only /health will work. Set UPVERSE_TOKEN or ~/.upverse/token");
console.error(`[upverse-mcp] ready · ${BASE} · token ${TOKEN ? "set (" + TOKEN.slice(0, 8) + "…)" : "none"}`);
