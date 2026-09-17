// Disk cache location: project data/ locally; /tmp on Vercel (only writable path there — ephemeral per instance, fine for caches).
import path from "node:path";
import os from "node:os";
export function cacheDir(sub = ""): string {
  const base = process.env.UPVERSE_DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "upverse-cache") : path.join(process.cwd(), "data"));
  return sub ? path.join(base, sub) : base;
}
