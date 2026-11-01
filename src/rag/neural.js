// Neural embeddings on the main thread side: a cache plus a React hook.
import { useEffect, useState } from "react";

export const NEURAL_MODEL = "paraphrase-multilingual-MiniLM-L12-v2";
const cache = new Map();           // text -> number[] (unit length, 384 dims)
let worker = null, nextId = 1;
const pending = new Map();
const listeners = new Set();
let downloadState = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./neural.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "download") { downloadState = m; listeners.forEach((f) => f()); return; }
      const p = pending.get(m.id);
      if (!p) return;
      if (m.type === "progress") { p.onProgress?.(m.done, m.total); return; }
      pending.delete(m.id);
      if (m.type === "result") p.resolve(m.vectors); else p.reject(new Error(m.message));
    };
  }
  return worker;
}

export async function embedTexts(texts, onProgress) {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  if (missing.length) {
    const id = nextId++;
    const vectors = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ id, texts: missing });
    });
    missing.forEach((t, i) => cache.set(t, vectors[i]));
  }
  return texts.map((t) => cache.get(t));
}

export const dotDense = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Embed `texts` when `enabled`. Returns { status, vectors, progress }. */
export function useNeuralVectors(texts, enabled) {
  const [state, setState] = useState({ status: "off", vectors: null, progress: null });
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  const key = enabled ? texts.join("␞") : "";
  useEffect(() => {
    if (!enabled || !texts.length) { setState({ status: "off", vectors: null, progress: null }); return; }
    if (texts.every((t) => cache.has(t))) { setState({ status: "ready", vectors: texts.map((t) => cache.get(t)), progress: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, status: "loading", vectors: null }));
    embedTexts(texts, (done, total) => alive && setState((s) => ({ ...s, progress: { done, total } })))
      .then((v) => alive && setState({ status: "ready", vectors: v, progress: null }))
      .catch((e) => alive && setState({ status: "error", vectors: null, progress: null, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...state, download: state.status === "loading" ? downloadState : null };
}
