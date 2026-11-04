// GET /api/visits?days=30 — visit statistics for the researcher (Authorization: Bearer <EXPORT_KEY>).
// "Visitors" counts each browser once per day; the codes change daily, so people can't be followed across days.
import { db, handle, json, requireKey } from "../../functions-lib/db.js";

export const onRequestGet = handle(async ({ request, env }) => {
  requireKey(request, env);
  const days = Math.min(400, Math.max(1, parseInt(new URL(request.url).searchParams.get("days"), 10) || 30));
  const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const d = await db(env);
  const q = (sql) => d.prepare(sql).bind(from).all().then((r) => r.results);
  // a visitor = one (day, vid); "new" = the first visit ever from that browser
  const visitors = "COUNT(DISTINCT day || vid)";
  const top = (col, n = 15) => q(`SELECT COALESCE(${col}, '') AS k, ${visitors} AS visitors, COUNT(*) AS views FROM visits WHERE day >= ? GROUP BY k ORDER BY visitors DESC, views DESC LIMIT ${n}`);
  const [total] = await q(`SELECT ${visitors} AS visitors, COUNT(*) AS views, COUNT(DISTINCT CASE WHEN first = 1 THEN day || vid END) AS new_visitors,
      COUNT(DISTINCT country) AS countries FROM visits WHERE day >= ?`);
  const byDay = await q(`SELECT day, ${visitors} AS visitors, COUNT(*) AS views, COUNT(DISTINCT CASE WHEN first = 1 THEN vid END) AS new_visitors
      FROM visits WHERE day >= ? GROUP BY day ORDER BY day`);
  const [countries, regions, cities, refs, devices, langs, pages] = await Promise.all([
    top("country", 30),
    q(`SELECT country || '|' || COALESCE(region, '') AS k, ${visitors} AS visitors, COUNT(*) AS views FROM visits WHERE day >= ? GROUP BY k ORDER BY visitors DESC LIMIT 20`),
    q(`SELECT country || '|' || COALESCE(city, '') AS k, ${visitors} AS visitors, COUNT(*) AS views FROM visits WHERE day >= ? GROUP BY k ORDER BY visitors DESC LIMIT 20`),
    q(`SELECT ref AS k, ${visitors} AS visitors, COUNT(*) AS views FROM visits WHERE day >= ? AND ref IS NOT NULL GROUP BY k ORDER BY visitors DESC LIMIT 15`), top("device", 5), top("lang", 5), top("page", 40),
  ]);
  return json({ ok: true, days, from, total, byDay, countries, regions, cities, refs, devices, langs, pages });
});
