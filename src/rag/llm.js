// Optional: real LLM answers. Three ways, all OpenAI-compatible:
//   lab    the lab's own model (/api/llm, Cloudflare Workers AI): no setup, no key, a daily limit per person
//   own    any hosted service with the learner's own key (Groq, OpenRouter, Google AI Studio, OpenAI…)
//   ollama a model on the learner's own computer
// Settings live only in this browser. For "own" and "ollama", requests go straight from the browser to that address.
import { useEffect, useState } from "react";

const KEY = "lab-llm-v1";
const listeners = new Set();
export const PRESETS = {
  lab: { provider: "lab", baseUrl: "/api/llm", model: "lab", apiKey: "" },
  own: { provider: "own", baseUrl: "", model: "", apiKey: "" },
  ollama: { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.2", apiKey: "" },
};
const guessProvider = (s) => (s.baseUrl === "/api/llm" ? "lab" : /localhost|127\.0\.0\.1/.test(s.baseUrl || "") ? "ollama" : "own");
let settings = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && { ...s, provider: s.provider || guessProvider(s) }; } catch { return null; } })()
  || { enabled: false, ...PRESETS.lab };

export function saveLLM(next) {
  settings = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* memory only */ }
  listeners.forEach((f) => f(next));
}
export function useLLM() {
  const [s, setS] = useState(settings);
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  return s;
}
export const llmReady = (s = settings) => !!(s.enabled && s.baseUrl && s.model);
export const enableLabModel = () => saveLLM({ ...PRESETS.lab, enabled: true });

export async function chat(messages, { temperature = 0, maxTokens = 300 } = {}) {
  const s = settings;
  const res = await fetch(s.baseUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}),
      ...(s.provider === "lab" ? { "x-lab-lang": (() => { try { return document.documentElement.lang || localStorage.getItem("lab-lang") || "en"; } catch { return "en"; } })() } : {}) },
    body: JSON.stringify({ model: s.model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body.slice(0, 200);
    try { const j = JSON.parse(body); msg = j.error?.message || j.error || msg; } catch { /* not JSON */ }
    throw new Error(`${res.status}: ${msg}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

/** React hook: run `messages` through the LLM when `key` changes and `enabled`. */
export function useLLMAnswer(key, messages, enabled) {
  const s = useLLM();
  const [st, setSt] = useState({ status: "off" });
  useEffect(() => {
    if (!enabled || !llmReady(s) || !messages) { setSt({ status: "off" }); return; }
    let alive = true;
    setSt({ status: "loading" });
    // Wait until the prompt stops changing (a slider being dragged), so one move costs one answer, not twenty.
    const timer = setTimeout(() => {
      chat(messages).then((text) => alive && setSt({ status: "ready", text })).catch((e) => alive && setSt({ status: "error", error: e.message }));
    }, 900);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, s.baseUrl, s.model, s.enabled]);
  return st;
}
