// Reusable retrieval stages for lessons that work on a document.
// They support two embedding methods:
//   "tfidf"  – word vectors computed instantly (always computed; also used for answer extraction)
//   "neural" – a multilingual sentence model in a Web Worker (vectors arrive via inputs.neural)
import { useMemo } from "react";
import * as rag from "./core.js";
import { dotDense, useNeuralVectors } from "./neural.js";

export const fmt2 = (x) => x.toFixed(2);

export function chunkTexts(doc, size, overlap) {
  const { words } = rag.parseDocument(doc.text);
  return rag.chunkDocument(words, size, overlap).map((c) => c.text);
}

/** React hook for lesson.useExtra: embeds chunks + question with the neural model when chosen. */
export function useNeuralExtra(base) {
  const want = base.method === "neural";
  const texts = useMemo(
    () => (want ? [...chunkTexts(base.doc, base.size, base.overlap), base.question || ""] : []),
    [want, base.doc, base.size, base.overlap, base.question]);
  const n = useNeuralVectors(texts, want);
  return useMemo(() => ({ neural: want ? { ...n, texts } : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [want, n.status, n.vectors, n.progress, n.download, texts]);
}

function neuralReady(c) {
  const n = c.inputs.neural;
  return n && n.status === "ready" && n.vectors && n.texts.length === c.chunks.length + 1
    && n.texts[0] === c.chunks[0]?.text ? n : null;
}

export const chunkStage = ({ inputs }) => {
  const lang = inputs.doc.lang;
  const { sections, words } = rag.parseDocument(inputs.doc.text);
  return { lang, stop: rag.stopwordsFor(lang), sections, chunks: rag.chunkDocument(words, inputs.size, inputs.overlap) };
};

export const embedStage = (c) => {
  const tfidf = rag.embedChunks(c.chunks, c.stop, c.lang);
  const n = neuralReady(c);
  if (n) {
    const dense = n.vectors.slice(0, c.chunks.length);
    return { tfidf, method: "neural", dense, dims: dense[0].length, map: rag.pcaDense(dense) };
  }
  return { tfidf, method: "tfidf", dims: tfidf.vocab.length, map: rag.pca2(tfidf.vectors, tfidf.vocab) };
};

export const queryStage = (c) => {
  const qTokens = rag.tokenize(c.inputs.question || "", c.stop, c.lang);
  const qv = rag.vectorize(qTokens, c.tfidf.idf);
  const known = [...new Set(qTokens.filter((t) => c.tfidf.idf.has(t)))];
  if (c.method === "neural") {
    const qd = neuralReady(c).vectors[c.chunks.length];
    return { qTokens, qv, qd, known, hasQuery: qTokens.length > 0, qxy: rag.projectDense(qd, c.map) };
  }
  return { qTokens, qv, known, hasQuery: known.length > 0, qxy: known.length ? rag.projectPoint(qv, c.map) : null };
};

export const retrieveStage = (c, filter = null) => {
  let scores;
  if (c.method === "neural") scores = c.dense.map((v) => dotDense(c.qd, v));
  else scores = c.tfidf.vectors.map((v) => (c.qv.size ? rag.cosine(c.qv, v) : 0));
  const allowed = (i) => !filter || filter(i);
  const top = scores.map((s, i) => ({ i, s })).filter((t) => allowed(t.i))
    .sort((a, b) => b.s - a.s).slice(0, c.inputs.topK);
  const used = top.filter((t) => t.s >= c.inputs.minSim && c.hasQuery);
  return { scores, top, used };
};

export const generateStage = (c) => {
  const prompt = rag.buildPrompt(c.inputs.question, c.used, c.chunks, c.sections, c.lang);
  let answer = rag.extractAnswer(c.used, c.chunks, c.qTokens.filter((t) => c.tfidf.idf.has(t)), c.tfidf.idf, c.stop, c.lang);
  // Neural retrieval can find chunks that share no words with the question.
  // The word-matching extractor then finds no sentence, so quote the top chunk's first sentence instead.
  if (c.method === "neural" && c.used.length && !answer.grounded) {
    const first = c.chunks[c.used[0].i].text.split(/(?<=[.!?])\s+/)[0];
    answer = { grounded: true, parts: [{ text: first, cite: 1 }], text: `${first} [1]` };
  }
  return { prompt, answer, promptTokens: rag.countTokens(prompt) };
};

export const methodControl = {
  id: "method", type: "select", default: "tfidf",
  label: { en: "Embedding", id: "Embedding" },
  options: [
    { value: "tfidf", label: { en: "TF-IDF (word matching, instant)", id: "TF-IDF (kecocokan kata, instan)" } },
    { value: "neural", label: { en: "Neural (meaning, ~120 MB download once)", id: "Neural (makna, unduhan ~120 MB sekali)" } },
  ],
};
