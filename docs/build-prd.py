#!/usr/bin/env python3
"""Build docs/PRD.html from the markdown sources (SPEC.md · API-UPVerse.md · mcp/README.md · TECHNIQUES.md · DECISIONS.md).
Run from repo root:  python3 docs/build-prd.py   (needs: pip3 install --user markdown)
Style follows docs/DESIGN.md v0.2: IBM Plex Sans Thai · gradient emerald→teal · rounded corners · light/dark."""
import re, datetime, pathlib, html
import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = [
    ("spec", "SPEC — ข้อกำหนดผลิตภัณฑ์ v0.2", ROOT / "docs/SPEC.md"),
    ("api", "API v1 — สเปกและตัวอย่างจริง", ROOT / "docs/API-UPVerse.md"),
    ("mcp", "MCP — ดึงข้อมูล/สั่งงานจาก Claude Code", ROOT / "mcp/README.md"),
    ("techniques", "หลักการวิเคราะห์ที่ใช้", ROOT / "docs/TECHNIQUES.md"),
    ("decisions", "บันทึกการตัดสินใจ", ROOT / "docs/DECISIONS.md"),
]
MD = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"], extension_configs={"toc": {"toc_depth": "2-3"}})

def render(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r":::(tip|caution|note)\n(.*?)\n:::", r"> **\1:** \2", text, flags=re.S)
    MD.reset()
    return MD.convert(text)

sections, nav = [], []
for key, title, path in SRC:
    body = render(path)
    # collect h2 for the sidebar
    heads = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', body)
    nav.append((key, title, [(h[0], re.sub("<.*?>", "", h[1])) for h in heads][:40]))
    sections.append(f'<section id="{key}" class="doc"><div class="doc-head"><span class="kicker">{html.escape(path.relative_to(ROOT).as_posix())}</span><h1>{html.escape(title)}</h1></div>{body}</section>')

nav_html = "".join(
    f'<details {"open" if k == "spec" else ""}><summary><a href="#{k}">{html.escape(t)}</a></summary><ul>' + "".join(f'<li><a href="#{hid}">{ht}</a></li>' for hid, ht in hs) + "</ul></details>"
    for k, t, hs in nav
)
built = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
page = f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UPVerse PRD v0.2</title>
<meta name="description" content="ข้อกำหนดผลิตภัณฑ์ UPVerse (SPEC v0.2) + สเปก API v1 + MCP + หลักการวิเคราะห์ + บันทึกการตัดสินใจ — สร้างจาก markdown ในโปรเจกต์">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{{--bg:#F6F8FA;--card:#FFFFFF;--ink:#0F172A;--muted:#475569;--line:rgba(15,23,42,.10);--accent:#059669;--accent2:#14B8A6;--code:#F1F5F9;--warn:#B45309}}
:root:not([data-theme="light"]){{@media (prefers-color-scheme:dark){{--bg:#0B1220;--card:#111A2E;--ink:#E5EAF2;--muted:#94A3B8;--line:rgba(255,255,255,.10);--code:#0F172A;--warn:#FBBF24}}}}
:root[data-theme="dark"]{{--bg:#0B1220;--card:#111A2E;--ink:#E5EAF2;--muted:#94A3B8;--line:rgba(255,255,255,.10);--code:#0F172A;--warn:#FBBF24}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}
body{{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 "IBM Plex Sans Thai",system-ui,sans-serif}}
.top{{position:sticky;top:0;z-index:5;background:linear-gradient(90deg,var(--accent),var(--accent2));color:#fff;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between}}
.top b{{font-size:18px}}.top span{{font-size:13px;opacity:.9}}
.wrap{{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;max-width:1280px;margin:0 auto;padding:16px}}
nav{{position:sticky;top:64px;align-self:start;max-height:calc(100vh - 80px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:12px 14px;font-size:14px}}
nav details{{margin:4px 0}}nav summary{{cursor:pointer;font-weight:600;padding:6px 4px;list-style:none}}nav summary::-webkit-details-marker{{display:none}}
nav ul{{list-style:none;margin:0 0 8px;padding:0 0 0 10px;border-left:2px solid var(--line)}}nav li{{margin:2px 0}}nav a{{color:var(--muted);text-decoration:none;display:block;padding:3px 6px;border-radius:10px}}nav a:hover{{background:var(--code);color:var(--ink)}}
main{{min-width:0}}
.doc{{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:20px 22px;margin-bottom:24px;box-shadow:0 10px 30px -20px rgba(2,6,23,.35)}}
.doc-head{{border-bottom:1px solid var(--line);margin:-4px 0 12px;padding-bottom:10px}}.kicker{{font:13px "IBM Plex Mono",monospace;color:var(--muted)}}
.doc h1{{font-size:26px;margin:4px 0 0;line-height:1.3}}.doc h2{{font-size:22px;margin:32px 0 10px;padding-top:14px;border-top:1px dashed var(--line)}}.doc h3{{font-size:18px;margin:22px 0 8px}}.doc h4{{font-size:16px;margin:16px 0 6px}}
.doc p,.doc li{{max-width:80ch}}.doc a{{color:var(--accent)}}.doc blockquote{{margin:12px 0;padding:10px 14px;border-left:4px solid var(--accent2);background:var(--code);border-radius:0 16px 16px 0;color:var(--muted)}}
.doc code{{font:14px "IBM Plex Mono",monospace;background:var(--code);padding:1px 6px;border-radius:8px}}.doc pre{{background:var(--code);padding:12px 14px;border-radius:18px;overflow:auto;font-size:13.5px;line-height:1.5}}.doc pre code{{padding:0;background:none}}
.doc table{{display:block;width:100%;overflow:auto;border-collapse:collapse;font-size:15px;margin:10px 0 16px;border-radius:18px}}.doc th,.doc td{{border:1px solid var(--line);padding:8px 10px;vertical-align:top;text-align:left}}.doc th{{background:var(--code);font-weight:600;white-space:nowrap}}.doc tr:nth-child(even) td{{background:color-mix(in srgb,var(--code) 55%,transparent)}}
.doc hr{{border:0;border-top:1px dashed var(--line);margin:22px 0}}
.foot{{color:var(--muted);font-size:13px;text-align:center;padding:12px 16px 32px}}
@media (max-width:900px){{.wrap{{grid-template-columns:1fr;padding:10px 12px}}nav{{position:static;max-height:none}}.doc{{padding:16px 14px;border-radius:22px}}.doc h1{{font-size:22px}}.doc h2{{font-size:19px}}body{{font-size:16px}}}}
</style></head>
<body>
<div class="top"><b>UPVerse · PRD v0.2</b><span>ที่ปรึกษาการลงทุนส่วนตัวของต้น · Webull TH · หุ้นสหรัฐเศษหุ้น · สร้าง {built} จาก markdown ใน repo (<code style="color:#fff">python3 docs/build-prd.py</code>)</span></div>
<div class="wrap"><nav>{nav_html}</nav><main>{"".join(sections)}</main></div>
<div class="foot">ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต · ตัวเลขเกณฑ์ทั้งหมดเป็นค่าเริ่มต้นที่ต้องยืนยันด้วยข้อมูลจริงก่อนใช้ · เอกสารต้นทางคือไฟล์ .md — แก้ที่นั่นแล้วสร้างใหม่</div>
</body></html>"""
out = ROOT / "docs/PRD.html"
out.write_text(page, encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)} · {len(page)/1024:.0f} KB · sections {len(sections)}")
