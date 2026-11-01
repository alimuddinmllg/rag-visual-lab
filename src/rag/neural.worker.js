// Web Worker: runs a multilingual sentence-embedding model in the browser.
// The model (~120 MB) downloads once from Hugging Face and is cached by the browser.
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
let extractor = null;

async function load() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: (p) => {
        if (p.status === "progress" && p.total) postMessage({ type: "download", loaded: p.loaded, total: p.total, file: p.file });
      },
    });
  }
  return extractor;
}

self.onmessage = async (e) => {
  const { id, texts } = e.data;
  try {
    const model = await load();
    const out = [];
    const B = 16;
    for (let i = 0; i < texts.length; i += B) {
      const res = await model(texts.slice(i, i + B), { pooling: "mean", normalize: true });
      out.push(...res.tolist());
      postMessage({ type: "progress", id, done: Math.min(i + B, texts.length), total: texts.length });
    }
    postMessage({ type: "result", id, vectors: out });
  } catch (err) {
    postMessage({ type: "error", id, message: String(err?.message || err) });
  }
};
