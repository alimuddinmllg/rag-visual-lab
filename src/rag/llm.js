// Optional: real LLM answers from any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Groq, OpenAI…).
// Settings live only in this browser. Requests go straight from the browser to the endpoint you set.
import { useEffect, useState } from "react";

const KEY = "lab-llm-v1";
const listeners = new Set();
let settings = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } })()
  || { enabled: false, baseUrl: "http://localhost:11434/v1", model: "llama3.2", apiKey: "" };

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
export const llmReady = (s = settings) => s.enabled && s.baseUrl && s.model;

export async function chat(messages, { temperature = 0, maxTokens = 300 } = {}) {
  const s = settings;
  const res = await fetch(s.baseUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
    body: JSON.stringify({ model: s.model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
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
    chat(messages).then((text) => alive && setSt({ status: "ready", text })).catch((e) => alive && setSt({ status: "error", error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, s.baseUrl, s.model, s.enabled]);
  return st;
}
