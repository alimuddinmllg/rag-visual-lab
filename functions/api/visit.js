// POST /api/visit — counts one page view for the visit statistics on the Admin page.
// Stored: day, page, language, country/region/city (from Cloudflare's IP lookup), device type, the referring site,
// whether this browser is new to the lab, and a daily visitor code. Not stored: the IP address or anything you type.
import { db, handle, json, readBody, str, sha256 } from "../../functions-lib/db.js";

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|python-requests|curl|wget/i;
const PAGE = /^(home|privacy|glossary|pilot|level-[1-9]|lesson-\d{1,2})$/;
const KEEP_DAYS = 400;   // about 13 months

function device(ua) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  return /mobi|iphone|android/i.test(ua) ? "mobile" : "desktop";
}

function refHost(ref, own) {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
    return !h || h === own || h.endsWith(".pages.dev") ? null : h.slice(0, 80);
  } catch { return null; }
}

export const onRequestPost = handle(async ({ request, env }) => {
  const ua = request.headers.get("user-agent") || "";
  if (BOT.test(ua)) return json({ ok: true, skipped: "bot" });
  const b = await readBody(request, 2000);
  const page = PAGE.test(b.page || "") ? b.page : null;
  if (!page) return json({ ok: true, skipped: "page" });
  const day = new Date().toISOString().slice(0, 10), cf = request.cf || {};
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const client = /^[a-z0-9-]{8,64}$/i.test(b.client || "") ? b.client : ua;
  const vid = await sha256(`${ip}|${client}|${day}|${env.EXPORT_KEY || "lab"}|visit`);
  const own = new URL(request.url).hostname.replace(/^www\./, "");
  const d = await db(env);
  const seen = (await d.prepare("SELECT COUNT(*) AS n FROM visits WHERE day = ? AND vid = ?").bind(day, vid).first()).n;
  if (seen >= 300) return json({ ok: true, skipped: "limit" });   // a stuck tab or a script, not a person reading
  await d.batch([
    d.prepare("INSERT INTO visits (day, vid, first, page, lang, country, region, city, device, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(day, vid, b.first === true ? 1 : 0, page, b.lang === "id" ? "id" : "en", str(cf.country, 2), str(cf.region, 60), str(cf.city, 60), device(ua), b.landing === true ? (refHost(str(b.ref, 300) || "", own) || "") : null),   // "" = came directly
    d.prepare("DELETE FROM visits WHERE day < ?").bind(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10)),
  ]);
  return json({ ok: true });
});
