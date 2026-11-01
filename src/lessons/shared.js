// Helpers shared by Level 3–4 lessons.
import { useMemo } from "react";
import * as rag from "../rag/core.js";
import * as R from "../rag/retrieval.js";
import { useNeuralMap, dotDense } from "../rag/neural.js";
import { testSetFor } from "../rag/testsets.js";

export const L = (en, id) => ({ en, id });
export const pct = (x) => `${Math.round(x * 100)}%`;
export const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length >= 3);

export const indexCache = new Map();
export function getIndex(doc, size = 40, overlap = 8) {
  const k = `${doc.id}|${doc.text.length}|${size}|${overlap}`;
  if (!indexCache.has(k)) { if (indexCache.size > 30) indexCache.clear(); indexCache.set(k, R.buildIndex(doc.text, doc.lang, size, overlap)); }
  return indexCache.get(k);
}

/** useExtra hook: neural vectors for chunks, test questions and the current question (when method === "neural"). */
export function useNeuralForIndex(base, { sentences = false, extraQuestions = [] } = {}) {
  const want = base.method === "neural";
  const texts = useMemo(() => {
    if (!want) return [];
    const idx = getIndex(base.doc, base.size || 40, base.overlap ?? 8);
    const ts = testSetFor(base.doc);
    const out = [...idx.chunks.map((c) => c.text), ...(ts ? ts.items.map((x) => x[0]) : []), ...extraQuestions, base.question || ""];
    if (sentences) for (const c of idx.chunks) out.push(...sentencesOf(c.text));
    return [...new Set(out)];
  }, [want, base.doc, base.size, base.overlap, base.question, sentences, extraQuestions]);
  const n = useNeuralMap(texts, want);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ neural: want ? n : null }), [want, n.status, n.map, n.progress, n.download]);
}

/** Vector ranking: neural when ready, otherwise TF-IDF. */
export function vectorRank(idx, q, neural) {
  if (neural?.map?.has(q) && neural.map.has(idx.chunks[0].text)) {
    const qv = neural.map.get(q);
    return { method: "neural", rank: R.rankBy(idx.chunks.map((c) => dotDense(qv, neural.map.get(c.text)))) };
  }
  return { method: "tfidf", rank: R.rankBy(R.tfidfScores(idx, q)) };
}
export const bm25Rank = (idx, q, k1 = 1.2, b = 0.75) => R.rankBy(R.bm25Scores(idx.bm25, rag.tokenize(q, idx.stop, idx.lang), k1, b));
export const hitAt = (rank, rel, k) => rank.slice(0, k).some((x) => rel.has(x.i));

export const vectorMethodControl = {
  id: "method", type: "select", default: "tfidf", label: L("Vector search uses", "Pencarian vektor memakai"),
  options: [{ value: "tfidf", label: L("TF-IDF (instant)", "TF-IDF (instan)") }, { value: "neural", label: L("Neural (meaning, ~120 MB once)", "Neural (makna, ~120 MB sekali)") }],
};

export const quizQ = (q, options, answer, why) => ({ q, options, answer, why });
