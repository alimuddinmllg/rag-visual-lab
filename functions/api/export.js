// GET /api/export?table=pilot|feedback&format=csv|json — for the researcher only.
// Needs the secret EXPORT_KEY (set in Cloudflare) in the header:  Authorization: Bearer <key>
import { db, handle, json, HttpError } from "../../functions-lib/db.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                 // keep spreadsheet formulas from running
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const onRequestGet = handle(async ({ request, env }) => {
  if (!env.EXPORT_KEY) throw new HttpError(503, "EXPORT_KEY is not set in Cloudflare.");
  const auth = request.headers.get("authorization") || "";
  if (!safeEqual(auth.replace(/^Bearer\s+/i, ""), env.EXPORT_KEY)) throw new HttpError(401, "Wrong key.");
  const url = new URL(request.url);
  const table = url.searchParams.get("table") === "feedback" ? "feedback" : "pilot";
  const d = await db(env);
  const { results } = await d.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  if (url.searchParams.get("format") === "json") return json({ ok: true, table, rows: results });
  const cols = results.length ? Object.keys(results[0]) : [];
  const body = "﻿" + [cols.join(","), ...results.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rag-lab-${table}.csv"`, "cache-control": "no-store" },
  });
});
