// Auth (SPEC F1.1 / F1.6 / F11). Single-owner app:
//  - Owner session: passphrase (UPVERSE_OWNER_PASSPHRASE) → httpOnly cookie with HMAC token. Only sessions can confirm tickets.
//  - API tokens: "upv_" + 40 hex; stored as prefix(8) + sha256; scopes allow-list. Cannot confirm tickets (no such scope exists).
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { ApiScope, DataFile } from "./types";
import { readData } from "./store";

const COOKIE = "upv_session";
const SECRET = () => process.env.UPVERSE_SESSION_SECRET || process.env.UPVERSE_OWNER_PASSPHRASE || "dev-only-secret-change-me";

export function ownerConfigured() {
  return !!process.env.UPVERSE_OWNER_PASSPHRASE;
}
async function ownerConfiguredAny() {
  if (process.env.UPVERSE_OWNER_PASSPHRASE) return true;
  try { return !!(await readData()).owner; } catch { return false; }
}

function sign(payload: string) {
  return createHmac("sha256", SECRET()).update(payload).digest("hex");
}

export function makeSessionToken(days = 30) {
  const exp = Date.now() + days * 86400e3;
  const payload = `owner.${exp}.${randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(tok: string | undefined | null): boolean {
  if (!tok) return false;
  const i = tok.lastIndexOf(".");
  if (i < 0) return false;
  const payload = tok.slice(0, i), sig = tok.slice(i + 1);
  const exp = Number(payload.split(".")[1]);
  if (!exp || exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload));
  return a.length === b.length && timingSafeEqual(a, b);
}

import { scryptSync } from "node:crypto";
export function hashPassphrase(p: string, salt?: string) {
  const s = salt ?? randomBytes(16).toString("hex");
  return { salt: s, hash: scryptSync(p.normalize("NFKC"), s, 32, { N: 16384, r: 8, p: 1 }).toString("hex") };
}
/** Owner passphrase: DB hash wins (set via "เปลี่ยนรหัสผ่าน"); env UPVERSE_OWNER_PASSPHRASE is the bootstrap value. */
export async function checkPassphrase(p: string): Promise<boolean> {
  const d = await readData();
  if (d.owner) {
    const { hash } = hashPassphrase(p, d.owner.salt);
    const a = Buffer.from(hash, "hex"), b = Buffer.from(d.owner.passphraseHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const want = process.env.UPVERSE_OWNER_PASSPHRASE;
  if (!want) return false;
  const a = Buffer.from(p), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function ownerPassphraseSource(): Promise<"db" | "env" | "none"> {
  const d = await readData();
  if (d.owner) return "db";
  return process.env.UPVERSE_OWNER_PASSPHRASE ? "env" : "none";
}

export async function isOwnerSession(): Promise<boolean> {
  // Dev convenience: when no passphrase configured anywhere (env or DB), local requests are treated as owner (paper mode only).
  if (!(await ownerConfiguredAny())) return true;
  const c = await cookies();
  return verifySessionToken(c.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;

// ---------- API tokens ----------
export function newApiToken() {
  const raw = "upv_" + randomBytes(20).toString("hex");
  return { raw, prefix: raw.slice(0, 12), hash: createHash("sha256").update(raw).digest("hex") };
}

export type Principal = { kind: "owner" } | { kind: "token"; id: string; label: string; scopes: ApiScope[] } | { kind: "anon" };

export async function principalFrom(req: Request, d?: DataFile): Promise<Principal> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(upv_[0-9a-f]{40})$/i);
  if (m) {
    const data = d ?? (await readData());
    const hash = createHash("sha256").update(m[1]).digest("hex");
    const t = data.apiTokens.find((x) => x.hash === hash && !x.revokedAt);
    if (t) return { kind: "token", id: t.id, label: t.label, scopes: t.scopes as ApiScope[] };
    return { kind: "anon" };
  }
  if (await isOwnerSession()) return { kind: "owner" };
  return { kind: "anon" };
}

export function allowed(p: Principal, scope: ApiScope): boolean {
  if (p.kind === "owner") return true;
  if (p.kind === "token") return p.scopes.includes(scope);
  return false;
}

export function deny(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
