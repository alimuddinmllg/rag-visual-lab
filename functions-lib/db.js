// Shared helpers for the pilot + feedback API (Cloudflare Pages Functions, D1 binding "DB").
// Tables are created on first use, so setup is only: create the D1 database and bind it as DB.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pilot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created TEXT NOT NULL,
    version TEXT NOT NULL,
    class_code TEXT,
    pid TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('pre','post')),
    lang TEXT,
    consent INTEGER NOT NULL,
    answers TEXT,
    score INTEGER,
    score_l1 INTEGER, score_l2 INTEGER, score_l3 INTEGER, score_l4 INTEGER,
    confidence TEXT,
    sus TEXT,
    sus_score REAL,
    helped TEXT,
    confusing TEXT,
    lessons_done TEXT,
    minutes REAL,
    mobile INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS pilot_pid ON pilot (pid)`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created TEXT NOT NULL,
    page TEXT,
    lesson INTEGER,
    lang TEXT,
    rating INTEGER,
    text TEXT
  )`,
  // Visit statistics: one row per page view. vid is a daily code (hash of network + browser code + day + secret),
  // so a visitor can be counted once per day but not followed from day to day. No IP address is stored.
  `CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,
    vid TEXT NOT NULL,
    first INTEGER NOT NULL DEFAULT 0,
    page TEXT,
    lang TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    device TEXT,
    ref TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS visits_day ON visits (day)`,
];

let ready = false;
export async function db(env) {
  if (!env.DB) throw new HttpError(503, "The database is not connected yet (D1 binding \"DB\" missing).");
  if (!ready) { await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))); ready = true; }
  return env.DB;
}

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function readBody(request, maxBytes = 20000) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Send JSON.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Too large.");
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON."); }
}

export const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
export const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
export const PID = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function handle(fn) {
  return async (context) => {
    try { return await fn(context); }
    catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
      return json({ ok: false, error: "Server error." }, 500);
    }
  };
}

/** Constant-time comparison for the researcher key. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export function requireKey(request, env) {
  if (!env.EXPORT_KEY) throw new HttpError(503, "EXPORT_KEY is not set in Cloudflare.");
  if (!safeEqual((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.EXPORT_KEY)) throw new HttpError(401, "Wrong key.");
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
