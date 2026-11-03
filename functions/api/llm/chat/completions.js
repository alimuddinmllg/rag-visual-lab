// POST /api/llm/chat/completions — the lab's own model, so students need no computer power and no API key.
// OpenAI-compatible in and out, so the browser uses it exactly like Ollama or any hosted service.
// Runs on Cloudflare Workers AI (binding "AI"). Limits keep the class inside the free daily allocation:
//   LLM_PER_USER  answers per person (one browser) per day (default 60)
//   LLM_PER_IP    answers per network per day (default 600): a class on one school Wi-Fi shares one IP address
//   LLM_PER_DAY   answers for everyone per day (default 1200)
//   LLM_MODEL     Workers AI model id (default below)
// Nothing from the prompt is stored. The only records are daily counters keyed by salted hashes
// (of the IP address plus a random code the browser keeps, and of the IP address alone).
import { db, handle, json, readBody, HttpError } from "../../../../functions-lib/db.js";

export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MAX_CHARS = 24000, MAX_OUT = 600;

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Accepts OpenAI chat messages, including an agent's tool calls and tool results (lesson 30),
// and turns them into the plain role/content pairs the Workers AI model reads.
export function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) throw new HttpError(400, "Send 1 to 24 messages.");
  const out = messages.map((m) => {
    if (!m || !["system", "user", "assistant", "tool"].includes(m.role)) throw new HttpError(400, "Each message needs a role: system, user, assistant or tool.");
    let content = typeof m.content === "string" ? m.content
      : Array.isArray(m.content) ? m.content.filter((p) => p?.type === "text").map((p) => p.text).join("\n") : "";
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length)
      content = (content ? content + "\n" : "") + m.tool_calls.map((c) => `[called ${c.function?.name}(${c.function?.arguments || ""})]`).join("\n");
    if (m.role === "tool") return { role: "user", content: `Result of the tool call:\n${content}` };
    if (Array.isArray(m.content) && m.content.some((p) => p?.type === "image_url")) throw new HttpError(400, "The lab model reads text only; it cannot look at images.");
    return { role: m.role, content };
  });
  if (out.reduce((a, m) => a + m.content.length, 0) > MAX_CHARS) throw new HttpError(413, `Prompt too long for the lab model (over ${MAX_CHARS} characters).`);
  return out;
}

/** Workers AI tool calls ({name, arguments}) in OpenAI's shape. */
export function toolCalls(result) {
  const calls = result?.tool_calls || result?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) return null;
  return calls.map((c, i) => {
    const name = c.function?.name || c.name, args = c.function?.arguments ?? c.arguments ?? {};
    return { id: c.id || `call_${Date.now().toString(36)}_${i}`, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } };
  });
}

export function replyText(result) {
  const raw = typeof result === "string" ? result : result?.response ?? result?.choices?.[0]?.message?.content ?? "";
  return String(raw).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

const MSG = {
  en: { day: "The lab model has used today's free allowance. It resets at 07:00 WIB (00:00 UTC). The lessons still work without it, and you can connect your own model in the LLM panel.",
    user: (n) => `You have used today's ${n} lab-model answers. They reset at 07:00 WIB (00:00 UTC). The lessons still work without them.`,
    net: (n) => `Your network (for example a campus Wi-Fi) has used today's ${n} lab-model answers. They reset at 07:00 WIB (00:00 UTC).` },
  id: { day: "Model lab sudah memakai jatah gratis hari ini. Jatah diatur ulang pukul 07.00 WIB (00.00 UTC). Pelajaran tetap berjalan tanpanya, dan Anda bisa menghubungkan model sendiri di panel LLM.",
    user: (n) => `Anda sudah memakai ${n} jawaban model lab hari ini. Jatah diatur ulang pukul 07.00 WIB (00.00 UTC). Pelajaran tetap berjalan tanpanya.`,
    net: (n) => `Jaringan Anda (misalnya Wi-Fi kampus) sudah memakai ${n} jawaban model lab hari ini. Jatah diatur ulang pukul 07.00 WIB (00.00 UTC).` },
};

export const today = () => new Date().toISOString().slice(0, 10);
export const ensureTable = (d) => d.prepare("CREATE TABLE IF NOT EXISTS llm_usage (day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who))").run();

/** Count this request against today's limits (per browser, per network, in total). Returns { used, left } or throws 429. */
export async function countUse(env, ip, client = "", lang = "en") {
  const T = MSG[lang] || MSG.en, d = await db(env), day = today(), salt = env.EXPORT_KEY || "lab";
  await ensureTable(d);
  const who = "p:" + await sha256(`${ip}|${client}|${day}|${salt}`);   // one person = one browser on one network
  const net = "n:" + await sha256(`${ip}|${day}|${salt}`);              // codes change daily; no raw IP is kept
  const perUser = +env.LLM_PER_USER || 60, perIp = +env.LLM_PER_IP || 600, perDay = +env.LLM_PER_DAY || 1200;
  const total = (await d.prepare("SELECT COALESCE(SUM(n), 0) AS t FROM llm_usage WHERE day = ? AND who LIKE 'p:%'").bind(day).first()).t;
  if (total >= perDay) throw new HttpError(429, T.day);
  const count = async (k) => (await d.prepare("SELECT n FROM llm_usage WHERE day = ? AND who = ?").bind(day, k).first())?.n || 0;
  const mine = await count(who), mynet = await count(net);
  if (mine >= perUser) throw new HttpError(429, T.user(perUser));
  if (mynet >= perIp) throw new HttpError(429, T.net(perIp));
  const up = "INSERT INTO llm_usage (day, who, n) VALUES (?, ?, 1) ON CONFLICT (day, who) DO UPDATE SET n = n + 1";
  await d.batch([
    d.prepare(up).bind(day, who), d.prepare(up).bind(day, net),
    d.prepare("DELETE FROM llm_usage WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)),
  ]);
  return { used: mine + 1, left: perUser - mine - 1 };
}

export const onRequestPost = handle(async ({ request, env }) => {
  if (!env.AI) throw new HttpError(503, "The lab model is not switched on yet (Workers AI binding \"AI\" missing).");
  const b = await readBody(request, 70000);
  const messages = cleanMessages(b.messages);
  const max = Math.min(MAX_OUT, Number.isInteger(b.max_tokens) && b.max_tokens > 0 ? b.max_tokens : 300);
  const temperature = typeof b.temperature === "number" ? Math.min(1, Math.max(0, b.temperature)) : 0;
  const lang = request.headers.get("x-lab-lang") === "id" ? "id" : "en";
  const client = /^[a-z0-9-]{8,64}$/i.test(request.headers.get("x-lab-client") || "") ? request.headers.get("x-lab-client") : "";
  const usage = await countUse(env, request.headers.get("cf-connecting-ip") || "unknown", client, lang);
  const model = env.LLM_MODEL || DEFAULT_MODEL;
  const input = { messages, max_tokens: max, temperature };
  if (Array.isArray(b.tools) && b.tools.length) input.tools = b.tools.slice(0, 8);
  if (b.response_format && ["json_object", "json_schema"].includes(b.response_format.type)) input.response_format = b.response_format;
  let result;
  try { result = await env.AI.run(model, input); }
  catch (e) {
    const m = String(e.message || e);
    if (/4006|neuron|allocation|quota|rate limit/i.test(m)) throw new HttpError(429, (MSG[lang] || MSG.en).day);   // Cloudflare's own daily limit
    throw new HttpError(502, `The lab model did not answer: ${m.slice(0, 160)}`);
  }
  const calls = input.tools ? toolCalls(result) : null, text = calls ? null : replyText(result);
  const id = "lab-" + Date.now().toString(36), created = Math.floor(Date.now() / 1000);
  const message = { role: "assistant", content: text, ...(calls ? { tool_calls: calls } : {}) }, finish = calls ? "tool_calls" : "stop";
  const usageInfo = { prompt_tokens: result?.usage?.prompt_tokens || 0, completion_tokens: result?.usage?.completion_tokens || 0, total_tokens: result?.usage?.total_tokens || 0 };
  if (b.stream) {   // one chunk with the whole answer, so streaming clients (lesson 27) work too
    const chunk = (delta, fr) => `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "lab", choices: [{ index: 0, delta, finish_reason: fr }] })}\n\n`;
    const body = chunk({ role: "assistant", content: text || "" }, null) + chunk({}, finish) + "data: [DONE]\n\n";
    return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
  }
  return json({ id, object: "chat.completion", created, model: "lab", choices: [{ index: 0, message, finish_reason: finish }], usage: usageInfo, lab: usage });
});

export const onRequestGet = () => json({ ok: true, info: "POST OpenAI-style chat messages here." });
