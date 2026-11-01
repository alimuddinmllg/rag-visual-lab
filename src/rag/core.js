// RAG core: pure functions, no UI.
// Every function here has a line-for-line twin in
// src/lessons/06-rag-pipeline/rag_from_scratch.py. `npm run golden` checks
// that both produce the same numbers. Change one, change the other.

import STOPWORDS from "./stopwords.json";

export function stopwordsFor(lang) {
  return new Set(STOPWORDS[lang] || STOPWORDS.en);
}

// ---------- Stage 1: chunk ----------
export function parseDocument(text) {
  const sections = [];
  const words = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("## ")) { sections.push(t.slice(3)); continue; }
    for (const w of t.split(/\s+/)) words.push({ w, sec: Math.max(0, sections.length - 1) });
  }
  if (!sections.length) sections.push("Document");
  return { sections, words };
}

export function chunkDocument(words, size, overlap) {
  const step = Math.max(5, size - overlap);
  const chunks = [];
  for (let start = 0; start < words.length; start += step) {
    const ws = words.slice(start, start + size);
    const counts = new Map();
    for (const x of ws) counts.set(x.sec, (counts.get(x.sec) || 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const mixed = ranked.length > 1 && ranked[0][1] / ws.length < 0.75;
    chunks.push({
      id: chunks.length,
      text: ws.map((x) => x.w).join(" "),
      words: ws.length,
      start,
      sec: ranked[0][0],
      sec2: mixed ? ranked[1][0] : null,
    });
    if (start + size >= words.length) break;
  }
  return chunks;
}

// ---------- Stage 2: embed ----------
export function stem(w, lang) {
  if (lang !== "en") return w;
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text, stop, lang) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 1 && !stop.has(t))
    .map((t) => stem(t, lang));
}

export function vectorize(tokens, idf) {
  const tf = new Map();
  for (const t of tokens) if (idf.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
  const v = new Map();
  let norm = 0;
  for (const [t, c] of tf) {
    const w = (1 + Math.log(c)) * idf.get(t);
    v.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of v) v.set(t, w / norm);
  return v;
}

export function embedChunks(chunks, stop, lang) {
  const toks = chunks.map((c) => tokenize(c.text, stop, lang));
  const df = new Map();
  for (const ts of toks) for (const t of new Set(ts)) df.set(t, (df.get(t) || 0) + 1);
  const N = chunks.length;
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  const vocab = [...idf.keys()];
  const vectors = toks.map((ts) => vectorize(ts, idf));
  return { idf, vocab, vectors };
}

// 2D map: PCA via power iteration on the Gram matrix (deterministic).
function dense(v, index, V) {
  const a = new Float64Array(V);
  for (const [t, w] of v) a[index.get(t)] = w;
  return a;
}
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export function pca2(vectors, vocab) {
  const V = vocab.length;
  const index = new Map(vocab.map((t, i) => [t, i]));
  const X = vectors.map((v) => dense(v, index, V));
  return { ...pcaDense(X), index };
}

// PCA to 2D for any list of equal-length dense vectors.
export function pcaDense(X) {
  const n = X.length, V = n ? X[0].length : 0;
  const mean = new Float64Array(V);
  for (const a of X) for (let j = 0; j < V; j++) mean[j] += a[j] / n;
  const Xc = X.map((a) => Float64Array.from(a, (x, j) => x - mean[j]));
  let K = Xc.map((a) => Xc.map((b) => dot(a, b)));
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: n }, (_, i) => 1 + ((i * 7 + c * 3) % 5) * 0.13);
    let lam = 0;
    for (let it = 0; it < 150; it++) {
      const w = K.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const nm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      v = w.map((x) => x / nm);
      lam = nm;
    }
    let mi = 0;
    v.forEach((x, i) => { if (Math.abs(x) > Math.abs(v[mi])) mi = i; });
    if (v[mi] < 0) v = v.map((x) => -x);
    comps.push({ v, lam });
    K = K.map((row, i) => row.map((x, j) => x - lam * v[i] * v[j]));
  }
  const coords = X.map((_, i) => comps.map((c) => c.v[i] * Math.sqrt(Math.max(c.lam, 1e-12))));
  const axes = comps.map((c) => {
    const a = new Float64Array(V), s = Math.sqrt(Math.max(c.lam, 1e-12));
    Xc.forEach((row, i) => { const f = c.v[i] / s; for (let j = 0; j < V; j++) a[j] += row[j] * f; });
    return a;
  });
  return { coords, mean, axes };
}

export function projectPoint(v, map) {
  return projectDense(dense(v, map.index, map.mean.length), map);
}
export function projectDense(q, map) {
  return map.axes.map((a) => {
    let s = 0;
    for (let j = 0; j < q.length; j++) s += (q[j] - map.mean[j]) * a[j];
    return s;
  });
}

// ---------- Stage 3 + 4: query and retrieve ----------
export function cosine(a, b) {
  let s = 0;
  const [x, y] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of x) if (y.has(t)) s += w * y.get(t);
  return s;
}

export function retrieve(qv, vectors, topK) {
  const scores = vectors.map((v) => (qv.size ? cosine(qv, v) : 0));
  const top = scores
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK);
  return { scores, top };
}

// ---------- Stage 5: generate ----------
export const PROMPT_TEMPLATE = {
  en: {
    system: "You are a helpful assistant for the NusaBot Robotics Lab.\nAnswer ONLY using the context below and cite sources like [1].\nIf the answer is not in the context, say you don't know.",
    context: "Context:", none: "(no relevant chunks found)", question: "Question:", answer: "Answer:",
    refuse: "I don't know. The document doesn't contain anything about this question.",
  },
  id: {
    system: "Anda adalah asisten untuk NusaBot Robotics Lab.\nJawab HANYA berdasarkan konteks di bawah dan sebutkan sumber seperti [1].\nJika jawabannya tidak ada di konteks, katakan Anda tidak tahu.",
    context: "Konteks:", none: "(tidak ada potongan yang relevan)", question: "Pertanyaan:", answer: "Jawaban:",
    refuse: "Saya tidak tahu. Dokumen tidak berisi informasi tentang pertanyaan ini.",
  },
};

export function buildPrompt(question, used, chunks, sections, lang) {
  const T = PROMPT_TEMPLATE[lang] || PROMPT_TEMPLATE.en;
  const ctx = used.map((t, r) => `[${r + 1}] (${sections[chunks[t.i].sec]}) ${chunks[t.i].text}`).join("\n\n");
  return `${T.system}\n\n${T.context}\n${ctx || T.none}\n\n${T.question} ${question}\n${T.answer}`;
}

export function countTokens(text) {
  // Rough estimate: 1 word ≈ 1.33 tokens.
  return Math.round(text.split(/\s+/).length * 1.33);
}

// Simulated generator: picks the best-matching sentences and cites them.
export function extractAnswer(used, chunks, knownTerms, idf, stop, lang) {
  const T = PROMPT_TEMPLATE[lang] || PROMPT_TEMPLATE.en;
  if (!used.length) return { grounded: false, parts: [], text: T.refuse };
  const qset = new Set(knownTerms);
  const cands = [];
  used.forEach((t, r) => {
    for (const sent of chunks[t.i].text.split(/(?<=[.!?])\s+/)) {
      let sc = 0;
      for (const x of new Set(tokenize(sent, stop, lang))) if (qset.has(x)) sc += idf.get(x) || 0;
      if (sc > 0) cands.push({ sent, sc, r });
    }
  });
  cands.sort((a, b) => b.sc - a.sc);
  const picks = [];
  for (const c of cands) {
    if (picks.length >= 2) break;
    if (c.sent.split(/\s+/).length < 5) continue;
    // overlapping chunks repeat text: skip a sentence that shares its first 40 characters with a pick
    if (picks.some((p) => p.sent.includes(c.sent.slice(0, 40)) || c.sent.includes(p.sent.slice(0, 40)))) continue;
    if (picks.length && c.sc < picks[0].sc * 0.6) break;
    picks.push(c);
  }
  if (!picks.length) return { grounded: false, parts: [], text: T.refuse };
  const fmt = (s) => (/^[A-Z0-9]/.test(s) ? "" : "…") + s + (/[.!?]$/.test(s) ? "" : "…");
  const parts = picks.map((c) => ({ text: fmt(c.sent), cite: c.r + 1 }));
  return { grounded: true, parts, text: parts.map((p) => `${p.text} [${p.cite}]`).join(" ") };
}

// ---------- whole pipeline (used by the golden test) ----------
export function runPipeline({ document, question, size, overlap, topK, minSim, lang }) {
  const stop = stopwordsFor(lang);
  const { sections, words } = parseDocument(document);
  const chunks = chunkDocument(words, size, overlap);
  const emb = embedChunks(chunks, stop, lang);
  const map = pca2(emb.vectors, emb.vocab);
  const qTokens = tokenize(question, stop, lang);
  const qv = vectorize(qTokens, emb.idf);
  const known = [...new Set(qTokens.filter((t) => emb.idf.has(t)))];
  const { scores, top } = retrieve(qv, emb.vectors, topK);
  const used = top.filter((t) => t.s >= minSim && known.length);
  const prompt = buildPrompt(question, used, chunks, sections, lang);
  const answer = extractAnswer(used, chunks, known, emb.idf, stop, lang);
  return {
    n_chunks: chunks.length,
    vocab_size: emb.vocab.length,
    known,
    top: top.map((t) => [t.i, t.s]),
    used: used.map((t) => t.i),
    coords: map.coords,
    query_xy: known.length ? projectPoint(qv, map) : null,
    prompt,
    answer: answer.text,
  };
}
