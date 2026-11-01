// Phase 2 retrieval toolkit: BM25, rank fusion, re-ranking helpers, metrics.
// Twins: src/lessons/13-bm25/bm25.py (BM25), 14-hybrid/fusion.py (RRF), 20-metrics/metrics.py (metrics)
import * as rag from "./core.js";

export const norm = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

/** Chunk + index a document once: TF-IDF vectors and BM25 statistics. */
export function buildIndex(text, lang, size = 40, overlap = 8) {
  const stop = rag.stopwordsFor(lang);
  const { sections, words } = rag.parseDocument(text);
  const chunks = rag.chunkDocument(words, size, Math.min(overlap, size - 6));
  const toks = chunks.map((c) => rag.tokenize(c.text, stop, lang));
  const tfidf = rag.embedChunks(chunks, stop, lang);
  return { lang, stop, sections, chunks, toks, tfidf, bm25: bm25Stats(toks) };
}

// ---------- BM25 ----------
export function bm25Stats(toks) {
  const df = new Map();
  for (const ts of toks) for (const t of new Set(ts)) df.set(t, (df.get(t) || 0) + 1);
  const avgdl = toks.reduce((a, t) => a + t.length, 0) / Math.max(1, toks.length);
  const tfs = toks.map((ts) => { const m = new Map(); for (const t of ts) m.set(t, (m.get(t) || 0) + 1); return m; });
  return { df, avgdl, tfs, lens: toks.map((t) => t.length), N: toks.length };
}

export function bm25Scores(stats, qTokens, k1 = 1.2, b = 0.75) {
  const q = [...new Set(qTokens)];
  return stats.tfs.map((tf, i) => {
    let s = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const df = stats.df.get(t);
      const idf = Math.log((stats.N - df + 0.5) / (df + 0.5) + 1);
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * stats.lens[i]) / stats.avgdl));
    }
    return s;
  });
}

export const rankBy = (scores) => scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s || a.i - b.i);

export function tfidfScores(index, question) {
  const qv = rag.vectorize(rag.tokenize(question, index.stop, index.lang), index.tfidf.idf);
  return index.tfidf.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
}

// ---------- Fusion ----------
/** Reciprocal rank fusion: score = Σ 1 / (k + rank), rank starting at 1. */
export function rrf(rankings, k = 60, depth = 20) {
  const score = new Map();
  for (const r of rankings) r.slice(0, depth).forEach((x, pos) => score.set(x.i, (score.get(x.i) || 0) + 1 / (k + pos + 1)));
  return [...score.entries()].map(([i, s]) => ({ i, s })).sort((a, b) => b.s - a.s || a.i - b.i);
}

// ---------- Metrics ----------
export const relevantFor = (chunks, expected) => new Set(chunks.map((c, i) => (norm(c.text).includes(norm(expected)) ? i : -1)).filter((i) => i >= 0));
export function metricsAt(ranking, relevant, k) {
  const ids = ranking.slice(0, k).map((x) => x.i);
  const hits = ids.filter((i) => relevant.has(i)).length;
  const first = ranking.findIndex((x) => relevant.has(x.i));
  let dcg = 0;
  ids.forEach((i, p) => { if (relevant.has(i)) dcg += 1 / Math.log2(p + 2); });
  let idcg = 0;
  for (let p = 0; p < Math.min(relevant.size, k); p++) idcg += 1 / Math.log2(p + 2);
  return {
    recall: relevant.size ? hits / relevant.size : 0,
    precision: hits / k,
    rr: first >= 0 ? 1 / (first + 1) : 0,
    ndcg: idcg ? dcg / idcg : 0,
    firstRank: first >= 0 ? first + 1 : null,
  };
}
export const mean = (xs) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

// ---------- Re-ranking (lesson 15) ----------
// Stand-in for a cross-encoder: look at the question next to each candidate chunk,
// sentence by sentence, and score the chunk by its best-matching sentence (with BM25 weights).
export function rerankBySentence(index, question, candidates, k1 = 1.2) {
  const qt = [...new Set(rag.tokenize(question, index.stop, index.lang))];
  return candidates.map((c) => {
    const sents = index.chunks[c.i].text.split(/(?<=[.!?])\s+/);
    let best = 0, bestS = "";
    for (const s of sents) {
      const st = rag.tokenize(s, index.stop, index.lang);
      if (!st.length) continue;
      let sc = 0;
      for (const t of qt) {
        const f = st.filter((x) => x === t).length;
        if (!f) continue;
        const df = index.bm25.df.get(t) || 0;
        sc += Math.log((index.bm25.N - df + 0.5) / (df + 0.5) + 1) * (f * (k1 + 1)) / (f + k1);
      }
      const words = s.split(/\s+/).length;
      sc = sc / Math.sqrt(Math.max(4, words) / 12);  // a match inside a short, focused sentence counts more
      if (sc > best) { best = sc; bestS = s; }
    }
    return { i: c.i, s: best, sentence: bestS, before: c.s };
  }).sort((a, b) => b.s - a.s || a.i - b.i);
}

// ---------- Query rewriting (lesson 16) ----------
// A small synonym table stands in for an LLM that rewrites questions.
export const SYNONYMS = {
  en: { price: ["cost", "costs"], fee: ["cost", "charged"], fine: ["charged", "late"], penalty: ["charged", "late"], hours: ["open", "closed"],
    open: ["opening"], borrow: ["loan", "borrow"], loan: ["borrow"], rules: ["must", "required"], close: ["closed", "closes"], shut: ["closed", "closes"],
    weekend: ["saturday", "sunday"], computer: ["workstation", "workstations"], pc: ["workstation"], phone: ["whatsapp"], contact: ["front desk", "whatsapp"],
    battery: ["lithium", "batteries"], charge: ["charged", "charging"], member: ["membership"], join: ["membership"], print: ["printing", "prints"] },
  id: { harga: ["biaya"], tarif: ["biaya"], ongkos: ["biaya"], denda: ["dikenakan", "terlambat"], pinjam: ["meminjam"], tutup: ["tutup", "jam buka"],
    buka: ["jam buka"], aturan: ["wajib"], akhir: ["sabtu", "minggu"], pekan: ["sabtu", "minggu"], komputer: ["komputer kerja"], kontak: ["meja depan", "whatsapp"],
    hubungi: ["whatsapp", "meja depan"], baterai: ["litium"], anggota: ["keanggotaan"], daftar: ["keanggotaan"], cetak: ["cetak", "printer"] },
};
export function rewriteQuery(question, lang) {
  const table = SYNONYMS[lang] || SYNONYMS.en;
  const words = question.toLowerCase().match(/[a-z0-9]+/g) || [];
  const variants = [question];
  const swap = words.filter((w) => table[w]);
  if (swap.length) {
    variants.push(words.map((w) => (table[w] ? table[w][0] : w)).join(" "));
    const extra = swap.flatMap((w) => table[w]).filter((x, i, a) => a.indexOf(x) === i);
    variants.push(question + " " + extra.join(" "));
  }
  return variants;
}

// Paraphrased questions: the words people use, not the words in the document.
export const PARAPHRASES = {
  en: [
    ["What is the price per gram for PLA?", "2.000 per gram"], ["What is the fee for a gold card?", "250.000 per year"],
    ["What penalty do I pay if I bring equipment back late?", "5.000 per item per day"], ["Is the lab open at the weekend?", "Saturday from 10:00 to 16:00"],
    ["Where do I charge a battery?", "fireproof charging bags"], ["How can I contact the lab?", "WhatsApp"],
    ["When do they shut early?", "18:00"], ["What is the fee to join as a student?", "50.000 per semester"],
  ],
  id: [
    ["Berapa harga per gram untuk PLA?", "2.000 per gram"], ["Berapa tarif kartu emas?", "250.000 per tahun"],
    ["Berapa denda kalau alat dikembalikan telat?", "5.000 per alat per hari"], ["Apakah lab buka akhir pekan?", "Sabtu pukul 10.00 sampai 16.00"],
    ["Di mana saya bisa mengisi baterai?", "kantong pengisian tahan api"], ["Bagaimana cara menghubungi lab?", "WhatsApp"],
    ["Kapan lab tutup lebih cepat?", "18.00"], ["Berapa ongkos daftar anggota mahasiswa?", "50.000 per semester"],
  ],
};
