// Lesson 13: keyword search (BM25) vs vector search.
import * as rag from "../../rag/core.js";
import { L, getIndex, useNeuralForIndex, vectorRank, bm25Rank, vectorMethodControl, quizQ } from "../shared.js";
import RankLists from "../../toolkit/RankLists.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import pySource from "./bm25.py?raw";
import libSource from "./with_libraries.py?raw";
import * as R from "../../rag/retrieval.js";
import { prelude, stopList } from "../prelude.js";

const stages = [
  { id: "tokens", label: L("Index", "Indeks"), desc: L("Chunk the document and list the words in each chunk.", "Potong dokumen dan catat kata-kata di setiap potongan."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, 40, 8); return { idx, chunks: idx.chunks, qTokens: rag.tokenize(inputs.question || "", idx.stop, idx.lang) }; },
    log: (c) => ({ text: `${c.chunks.length} chunks · query words: ${c.qTokens.join(", ") || "—"}` }), live: (c) => c.qTokens.join(", ") || "—" },
  { id: "bm25", label: L("BM25", "BM25"), desc: L("Keyword score: rare query words that appear in a chunk count a lot; repeats count less and less; long chunks are penalised.", "Skor kata kunci: kata kueri yang langka dan muncul di potongan bernilai tinggi; pengulangan makin kecil nilainya; potongan panjang dikurangi."),
    run: (c) => ({ bm: bm25Rank(c.idx, c.inputs.question || "", c.inputs.k1, c.inputs.b) }),
    log: (c) => ({ text: c.bm.slice(0, 3).map((x) => `#${x.i + 1} ${x.s.toFixed(2)}`).join(", ") }), live: (c) => `top #${c.bm[0].i + 1}` },
  { id: "vector", label: L("Vector", "Vektor"), desc: L("Similarity score from embeddings (TF-IDF or neural), as in lesson 6.", "Skor kemiripan dari embedding (TF-IDF atau neural), seperti di pelajaran 6."),
    run: (c) => { const v = vectorRank(c.idx, c.inputs.question || "", c.inputs.neural); return { vec: v.rank, vmethod: v.method }; },
    log: (c) => ({ text: `${c.vmethod}: ` + c.vec.slice(0, 3).map((x) => `#${x.i + 1} ${x.s.toFixed(2)}`).join(", ") }), live: (c) => `${c.vmethod}, top #${c.vec[0].i + 1}` },
  { id: "compare", label: L("Compare", "Bandingkan"), desc: L("Lines show where each chunk moved between the two lists. How many of the top 5 do they share?", "Garis menunjukkan perpindahan setiap potongan di antara dua daftar. Berapa banyak top 5 yang sama?"),
    run: (c) => { const a = new Set(c.bm.slice(0, 5).map((x) => x.i)); return { overlap: c.vec.slice(0, 5).filter((x) => a.has(x.i)).length, sameTop: c.bm[0].i === c.vec[0].i }; },
    log: (c) => ({ text: `top-5 overlap ${c.overlap}/5 · same #1: ${c.sameTop ? "yes" : "no"}` }), live: (c) => `${c.overlap}/5 shared` },
];

function Board({ ctx, hover, setHover, tr }) {
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Keyword vs vector ranking", "Peringkat kata kunci vs vektor"))}</h2>
        <span className="sub">{ctx.overlap != null ? `${tr(L("shared in top 5", "sama di top 5"))}: ${ctx.overlap}/5` : ""}</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      {ctx.bm ? <RankLists chunks={ctx.chunks} hover={hover} onHover={setHover} tr={tr}
        columns={[{ title: "BM25", items: ctx.bm }, ...(ctx.vec ? [{ title: `${tr(L("Vector", "Vektor"))} (${ctx.vmethod})`, items: ctx.vec }] : [])]} />
        : <p className="note plain">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      <div className="legend2"><span><i style={{ background: "var(--good)" }} />{tr(L("ranked higher by vector", "lebih tinggi di vektor"))}</span><span><i style={{ background: "var(--warn)" }} />{tr(L("ranked lower", "lebih rendah"))}</span></div>
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Before embeddings, search engines ranked by **keywords**. The best-known formula, **BM25**, is still used everywhere because it is fast, explainable and very good at exact terms: product codes, names, numbers." },
      { p: "Vector search is better at meaning (synonyms, other languages) but can miss an exact rare term. The two fail differently, which is why lesson 14 combines them." },
      { h: "Try" }, { ol: ["Ask with an exact term like \"KiCad\" or \"QRIS\": BM25 is sure of itself.", "Switch the vector side to **Neural** and ask \"What is the price of printing?\": the lists disagree."] }],
    id: [{ p: "Sebelum ada embedding, mesin pencari mengurutkan berdasarkan **kata kunci**. Rumus yang paling terkenal, **BM25**, masih dipakai di mana-mana karena cepat, mudah dijelaskan, dan sangat baik untuk istilah persis: kode produk, nama, angka." },
      { p: "Pencarian vektor lebih baik untuk makna (sinonim, bahasa lain) tetapi bisa melewatkan istilah langka yang persis. Keduanya gagal dengan cara berbeda, karena itu pelajaran 14 menggabungkannya." },
      { h: "Coba" }, { ol: ["Tanyakan istilah persis seperti \"KiCad\" atau \"QRIS\": BM25 sangat yakin.", "Ganti sisi vektor ke **Neural** dan tanyakan \"Berapa harga mencetak?\": kedua daftar berbeda pendapat."] }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["k1 (saturation)", "At k1 = 0 a word counts the same once or ten times. Raise it and repeated words count more."] }, { exp: ["b (length)", "At b = 0 long chunks are not penalised; at 1 fully. Watch long chunks move."] },
      { exp: ["Exact code", "Ask \"KiCad\" alone. BM25 puts the chunks with that rare word on top and gives every other chunk 0. Then ask \"What is the price of printing?\": BM25 can only use \"print\", because \"price\" never appears in the handbook. The neural vector search also understands \"price\"."] }],
    id: [{ h: "Eksperimen" }, { exp: ["k1 (kejenuhan)", "Pada k1 = 0 kata yang muncul sekali atau sepuluh kali dihitung sama. Naikkan dan kata yang berulang bernilai lebih."] }, { exp: ["b (panjang)", "Pada b = 0 potongan panjang tidak dikurangi; pada 1 dikurangi penuh. Perhatikan potongan panjang bergeser."] },
      { exp: ["Kode persis", "Tanyakan \"KiCad\" saja. BM25 menaruh potongan yang berisi kata langka itu di atas dan memberi semua potongan lain nilai 0. Lalu tanyakan \"Berapa harga mencetak?\": BM25 hanya bisa memakai \"mencetak\", karena \"harga\" tidak pernah muncul di buku panduan. Pencarian vektor neural juga memahami \"harga\"."] }],
  },
  specs: {
    en: [{ dl: [["BM25", "Σ idf(t) · f(t)·(k1+1) / (f(t) + k1·(1 − b + b·len/avglen)) over query words t."], ["Defaults", "k1 = 1.2, b = 0.75: the values most search engines start from."], ["Where it's used", "Elasticsearch, OpenSearch, Lucene, PostgreSQL full-text extensions, and the keyword half of most hybrid RAG systems."]] }],
    id: [{ dl: [["BM25", "Σ idf(t) · f(t)·(k1+1) / (f(t) + k1·(1 − b + b·panjang/rata-rata)) untuk setiap kata kueri t."], ["Bawaan", "k1 = 1,2, b = 0,75: nilai awal di sebagian besar mesin pencari."], ["Dipakai di", "Elasticsearch, OpenSearch, Lucene, ekstensi full-text PostgreSQL, dan sisi kata kunci di sebagian besar sistem RAG hibrida."]] }],
  },
};

export default {
  n: 13, stages, text, Board,
  controls: [{ id: "k1", label: L("k1", "k1"), min: 0, max: 3, step: 0.1, default: 1.2, format: (v) => v.toFixed(1) }, { id: "b", label: L("b", "b"), min: 0, max: 1, step: 0.05, default: 0.75, format: (v) => v.toFixed(2) }, vectorMethodControl],
  extraValues: { size: 40, overlap: 8 },
  useExtra: (base) => useNeuralForIndex(base),
  inputs: { document: true, question: true },
  defaultQuestion: { en: "What software is on the workstations?", id: "Perangkat lunak apa yang ada di komputer kerja?" },
  examples: { en: ["What software is on the workstations?", "KiCad", "What is the price of printing?", "Can I pay with QRIS?"], id: ["Perangkat lunak apa yang ada di komputer kerja?", "KiCad", "Berapa harga mencetak?", "Apakah bisa bayar pakai QRIS?"] },
  code: [
    { id: "bm25", label: L("BM25 (runs here)", "BM25 (bisa dijalankan)"), source: pySource, runnable: true, filename: "bm25.py" },
    { id: "libs", label: L("With rank_bm25", "Dengan rank_bm25"), source: libSource, runnable: false, filename: "bm25_libraries.py",
      note: L("Runs on your computer after: pip install rank-bm25 sentence-transformers", "Jalankan di komputer Anda setelah: pip install rank-bm25 sentence-transformers") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang;
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: doc.text, QUESTION: I.question || "", LANG: lang, STOPWORDS: stopList(lang), K1: I.k1, B: I.b },
      call: "demo(DOCUMENT, QUESTION, LANG, STOPWORDS, K1, B)",
      compare: (res) => {
        const idx = getIndex(doc, 40, 8), q = I.question || "";
        const bm = bm25Rank(idx, q, I.k1, I.b).slice(0, 5).map((x) => x.i), vec = R.rankBy(R.tfidfScores(idx, q)).slice(0, 5).map((x) => x.i);
        return JSON.stringify(res.bm25) === JSON.stringify(bm) && JSON.stringify(res.vector) === JSON.stringify(vec);
      },
    };
  },
  variables: (c) => [["k1, b", `${c.inputs.k1}, ${c.inputs.b}`], ["bm25 top", c.bm ? c.bm.slice(0, 5).map((x) => x.i).join(", ") : "—"], ["vector top", c.vec ? c.vec.slice(0, 5).map((x) => x.i).join(", ") : "—"]],
  challenges: [
    { id: "disagree", text: L("Find a question where BM25 and vector search pick a different #1.", "Temukan pertanyaan yang membuat BM25 dan pencarian vektor memilih #1 yang berbeda."), check: (c) => c.sameTop === false },
    { id: "b0", text: L("Set b to 0 and run a question.", "Atur b ke 0 dan jalankan sebuah pertanyaan."), check: (c) => c.inputs.b === 0 && c.bm },
    { id: "neural", text: L("Compare BM25 with the neural vector search.", "Bandingkan BM25 dengan pencarian vektor neural."), check: (c) => c.vmethod === "neural" },
  ],
  quiz: [
    quizQ(L("Which search is best for an exact product code like \"QRIS-2026\"?", "Pencarian mana yang terbaik untuk kode persis seperti \"QRIS-2026\"?"), [L("Keyword search (BM25)", "Pencarian kata kunci (BM25)"), L("Neural vector search", "Pencarian vektor neural"), L("Neither", "Tidak keduanya"), L("Only an LLM", "Hanya LLM")], 0, L("Exact rare strings are exactly what keyword scoring rewards.", "String langka yang persis adalah hal yang paling dihargai skor kata kunci.")),
    quizQ(L("What does BM25's b parameter control?", "Apa yang diatur parameter b pada BM25?"), [L("How much long chunks are penalised", "Seberapa besar potongan panjang dikurangi"), L("The number of results", "Jumlah hasil"), L("The language", "Bahasa"), L("The embedding size", "Ukuran embedding")], 0, L("b = 0 ignores length; b = 1 normalises fully.", "b = 0 mengabaikan panjang; b = 1 menormalkan penuh.")),
    quizQ(L("Why combine keyword and vector search?", "Mengapa menggabungkan pencarian kata kunci dan vektor?"), [L("They fail on different questions", "Keduanya gagal pada pertanyaan yang berbeda"), L("It is cheaper", "Lebih murah"), L("Vectors can't handle English", "Vektor tidak bisa bahasa Inggris"), L("BM25 needs vectors to run", "BM25 butuh vektor untuk berjalan")], 0, L("Exact terms vs meaning: each covers the other's blind spot.", "Istilah persis vs makna: masing-masing menutup titik buta yang lain.")),
  ],
};
