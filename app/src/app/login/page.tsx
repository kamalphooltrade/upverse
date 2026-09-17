"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/components/shell";
import { Card, H2, Muted, Btn, Field, inputCls, Banner } from "@/components/ui";
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
function LoginInner() {
  const r = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") && sp.get("next")!.startsWith("/") ? sp.get("next")! : "/";
  const [p, setP] = useState(""); const [err, setErr] = useState<string | null>(null);
  const go = async () => { setErr(null); try { await api("/api/v1/auth/login", { method: "POST", json: { passphrase: p } }); r.push(next); r.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  return <div className="max-w-md mx-auto"><Card glow><H2>เข้าสู่ระบบ (เจ้าของ)</H2><Field label="รหัสผ่านเจ้าของ"><input className={inputCls} type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} /></Field>{err && <Banner tone="danger">{err}</Banner>}<Btn block variant="primary" onClick={go}>เข้าสู่ระบบ</Btn><Muted className="mt-2 text-[13px]">ใช้ส่วนตัว · ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต</Muted></Card></div>;
}
