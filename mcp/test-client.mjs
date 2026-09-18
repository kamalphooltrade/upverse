// Smoke test: spawn the server over stdio, list tools, call a few. Usage: node test-client.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const t = new StdioClientTransport({ command: "node", args: ["upverse-mcp.mjs"], env: { ...process.env } });
const c = new Client({ name: "upverse-test", version: "0.0.1" });
await c.connect(t);
const tools = await c.listTools();
console.log("tools:", tools.tools.map((x) => x.name).join(", "));
const show = (r) => console.log((r.isError ? "ERR " : "OK  ") + r.content[0].text.slice(0, 400).replace(/\n/g, " "));
show(await c.callTool({ name: "upverse_health", arguments: {} }));
show(await c.callTool({ name: "upverse_portfolio", arguments: { account: "all" } }));
show(await c.callTool({ name: "upverse_theses", arguments: { symbol: "AXON" } }));
show(await c.callTool({ name: "upverse_quotes", arguments: { symbols: ["NVDA", "AXON"] } }));
show(await c.callTool({ name: "upverse_api", arguments: { method: "GET", path: "/meta" } }));
await c.close();
