// POST /api/llm/chat/completions — the lab's own model, so students need no computer power and no API key.
// OpenAI-compatible in and out, so the browser uses it exactly like Ollama or any hosted service.
// Runs on Cloudflare Workers AI (binding "AI"). Limits keep the class inside the free daily allocation:
//   LLM_PER_USER  answers per person per day (default 40)
//   LLM_PER_DAY   answers for everyone per day (default 1000)
//   LLM_MODEL     Workers AI model id (default below)
// Nothing from the prompt is stored. The only record is a daily counter keyed by a salted hash of the IP address.
import { db, handle, json, readBody, HttpError } from "../../../../functions-lib/db.js";

export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MAX_CHARS = 16000, MAX_OUT = 400;

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 12) throw new HttpError(400, "Send 1 to 12 messages.");
  const out = messages.map((m) => {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") throw new HttpError(400, "Each message needs a role and text content.");
    return { role: m.role, content: m.content };
  });
  if (out.reduce((a, m) => a + m.content.length, 0) > MAX_CHARS) throw new HttpError(413, `Prompt too long for the lab model (over ${MAX_CHARS} characters).`);
  return out;
}

export function replyText(result) {
  const raw = typeof result === "string" ? result : result?.response ?? result?.choices?.[0]?.message?.content ?? "";
  return String(raw).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

const MSG = {
  en: { day: "The lab model has used today's free allowance. It resets at 07:00 WIB (00:00 UTC). You can also connect your own model in the LLM panel.",
    user: (n) => `You have used today's ${n} lab-model answers. They reset at 07:00 WIB (00:00 UTC).` },
  id: { day: "Model lab sudah memakai jatah gratis hari ini. Jatah diatur ulang pukul 07.00 WIB (00.00 UTC). Anda juga bisa menghubungkan model sendiri di panel LLM.",
    user: (n) => `Anda sudah memakai ${n} jawaban model lab hari ini. Jatah diatur ulang pukul 07.00 WIB (00.00 UTC).` },
};

/** Count this request against today's limits. Returns { used, left } or throws 429. */
export async function countUse(env, ip, lang = "en") {
  const T = MSG[lang] || MSG.en;
  const d = await db(env);
  await d.prepare("CREATE TABLE IF NOT EXISTS llm_usage (day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who))").run();
  const day = new Date().toISOString().slice(0, 10);
  const who = await sha256(`${ip}|${day}|${env.EXPORT_KEY || "lab"}`);        // changes every day; no raw IP is kept
  const perUser = +env.LLM_PER_USER || 40, perDay = +env.LLM_PER_DAY || 1000;
  const total = (await d.prepare("SELECT COALESCE(SUM(n), 0) AS t FROM llm_usage WHERE day = ?").bind(day).first()).t;
  if (total >= perDay) throw new HttpError(429, T.day);
  const mine = (await d.prepare("SELECT n FROM llm_usage WHERE day = ? AND who = ?").bind(day, who).first())?.n || 0;
  if (mine >= perUser) throw new HttpError(429, T.user(perUser));
  await d.batch([
    d.prepare("INSERT INTO llm_usage (day, who, n) VALUES (?, ?, 1) ON CONFLICT (day, who) DO UPDATE SET n = n + 1").bind(day, who),
    d.prepare("DELETE FROM llm_usage WHERE day < ?").bind(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)),
  ]);
  return { used: mine + 1, left: perUser - mine - 1 };
}

export const onRequestPost = handle(async ({ request, env }) => {
  if (!env.AI) throw new HttpError(503, "The lab model is not switched on yet (Workers AI binding \"AI\" missing).");
  const b = await readBody(request, 70000);
  const messages = cleanMessages(b.messages);
  const max = Math.min(MAX_OUT, Number.isInteger(b.max_tokens) && b.max_tokens > 0 ? b.max_tokens : 300);
  const temperature = typeof b.temperature === "number" ? Math.min(1, Math.max(0, b.temperature)) : 0;
  const usage = await countUse(env, request.headers.get("cf-connecting-ip") || "unknown", request.headers.get("x-lab-lang") === "id" ? "id" : "en");
  const model = env.LLM_MODEL || DEFAULT_MODEL;
  let result;
  try { result = await env.AI.run(model, { messages, max_tokens: max, temperature }); }
  catch (e) { throw new HttpError(502, `The lab model did not answer: ${String(e.message || e).slice(0, 160)}`); }
  return json({ object: "chat.completion", model: "lab", choices: [{ index: 0, message: { role: "assistant", content: replyText(result) }, finish_reason: "stop" }], lab: usage });
});

export const onRequestGet = () => json({ ok: true, info: "POST OpenAI-style chat messages here." });
