// GET /api/llm/usage — lab-model use over the last 7 days, for the researcher (Authorization: Bearer <EXPORT_KEY>).
// Counts only: answers, people (browsers) and networks per day. Nothing about what was asked.
import { db, handle, json, HttpError } from "../../../functions-lib/db.js";
import { ensureTable, today } from "./chat/completions.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export const onRequestGet = handle(async ({ request, env }) => {
  if (!env.EXPORT_KEY) throw new HttpError(503, "EXPORT_KEY is not set in Cloudflare.");
  if (!safeEqual((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.EXPORT_KEY)) throw new HttpError(401, "Wrong key.");
  const d = await db(env);
  await ensureTable(d);
  const { results } = await d.prepare(`SELECT day,
      SUM(CASE WHEN who LIKE 'p:%' THEN n ELSE 0 END) AS answers,
      SUM(CASE WHEN who LIKE 'p:%' THEN 1 ELSE 0 END) AS people,
      SUM(CASE WHEN who LIKE 'n:%' THEN 1 ELSE 0 END) AS networks,
      MAX(CASE WHEN who LIKE 'p:%' THEN n ELSE 0 END) AS most_by_one
    FROM llm_usage GROUP BY day ORDER BY day DESC LIMIT 7`).all();
  return json({ ok: true, today: today(), limits: { per_person: +env.LLM_PER_USER || 60, per_network: +env.LLM_PER_IP || 600, per_day: +env.LLM_PER_DAY || 1200 }, ai: !!env.AI, days: results });
});
