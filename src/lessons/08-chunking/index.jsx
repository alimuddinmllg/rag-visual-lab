// Lesson 8: chunking strategies side by side.
import { useState } from "react";
import * as ck from "../../rag/chunkers.js";
import { SECTION_COLORS } from "../../toolkit/DocumentSpace.jsx";
import * as rag from "../../rag/core.js";
import pySource from "./chunkers.py?raw";

const L = (en, id) => ({ en, id });
const NAMES = { fixed: L("Fixed size", "Ukuran tetap"), sentence: L("Sentence", "Kalimat"), recursive: L("Recursive", "Rekursif"), semantic: L("Semantic", "Semantik") };

const stages = [
  { id: "fixed", label: NAMES.fixed, desc: L("Cut every N words, wherever that lands. Simple and predictable, but it slices sentences in half.", "Potong setiap N kata, di mana pun jatuhnya. Sederhana dan bisa ditebak, tetapi membelah kalimat."),
    run: ({ inputs }) => { const sections = rag.parseDocument(inputs.doc.text).sections; return { sections, rows: { fixed: ck.fixedChunks(inputs.doc.text, inputs.size) } }; },
    log: (c) => ({ text: `${c.rows.fixed.length} chunks, ${ck.quality(c.rows.fixed).midCut} end mid-sentence` }), live: (c) => `${c.rows.fixed.length} chunks` },
  { id: "sentence", label: NAMES.sentence, desc: L("Pack whole sentences until the next one would not fit.", "Kumpulkan kalimat utuh sampai kalimat berikutnya tidak muat."),
    run: (c) => ({ rows: { ...c.rows, sentence: ck.sentenceChunks(c.inputs.doc.text, c.inputs.size) } }),
    log: (c) => ({ text: `${c.rows.sentence.length} chunks, ${ck.quality(c.rows.sentence).midCut} end mid-sentence` }), live: (c) => `${c.rows.sentence.length} chunks` },
  { id: "recursive", label: NAMES.recursive, desc: L("Try the biggest natural unit first: a whole section. Only if it is too big, split it into sentences.", "Coba unit alami terbesar dulu: satu bagian utuh. Hanya jika terlalu besar, pecah menjadi kalimat."),
    run: (c) => ({ rows: { ...c.rows, recursive: ck.recursiveChunks(c.inputs.doc.text, c.inputs.size) } }),
    log: (c) => ({ text: `${c.rows.recursive.length} chunks` }), live: (c) => `${c.rows.recursive.length} chunks` },
  { id: "semantic", label: NAMES.semantic, desc: L("Compare each sentence with the previous one. Where similarity drops below the threshold, the topic changed: start a new chunk.", "Bandingkan setiap kalimat dengan kalimat sebelumnya. Jika kemiripan turun di bawah ambang, topik berganti: mulai potongan baru."),
    run: (c) => { const r = ck.semanticChunks(c.inputs.doc.text, c.inputs.size, c.inputs.threshold, c.inputs.doc.lang); return { rows: { ...c.rows, semantic: r.chunks }, sims: r.sims }; },
    log: (c) => ({ text: `${c.rows.semantic.length} chunks (threshold ${c.inputs.threshold.toFixed(2)})` }), live: (c) => `${c.rows.semantic.length} chunks` },
  { id: "compare", label: L("Compare", "Bandingkan"), desc: L("Line them up: number of chunks, average size, and how many end in the middle of a sentence.", "Jajarkan: jumlah potongan, ukuran rata-rata, dan berapa yang berakhir di tengah kalimat."),
    run: (c) => ({ summary: Object.fromEntries(Object.entries(c.rows).map(([k, v]) => [k, ck.quality(v)])) }),
    log: (c) => ({ text: Object.entries(c.summary).map(([k, q]) => `${k} ${q.n}/${q.midCut}`).join(" · ") + "  (chunks/mid-sentence cuts)" }), live: () => "done" },
];

function Row({ id, chunks, sel, onSel, tr, summary }) {
  const total = chunks.reduce((a, c) => a + c.words, 0);
  const q = ck.quality(chunks);
  return (
    <div className="colcard">
      <h4>{tr(NAMES[id])}<span className="sub">{q.n} · ~{Math.round(q.avg)}w · <span style={{ color: q.midCut ? "var(--warn)" : "var(--good)" }}>{q.midCut} {tr(L("cut mid-sentence", "terpotong di tengah"))}</span></span></h4>
      <div className="segbar" style={{ height: 22, cursor: "pointer" }}>
        {chunks.map((c, i) => (
          <i key={i} title={c.text.slice(0, 120)} onClick={() => onSel([id, i])}
            style={{ width: `${(c.words / total) * 100}%`, background: SECTION_COLORS[c.sec % SECTION_COLORS.length], opacity: sel && sel[0] === id && sel[1] === i ? 1 : 0.55, outline: !/[.!?]$/.test(c.text) ? "2px solid var(--warn)" : "none", outlineOffset: -2 }} />
        ))}
      </div>
      {summary && null}
    </div>
  );
}

function Board({ ctx, tr }) {
  const [sel, setSel] = useState(null);
  const rows = ctx.rows || {};
  const selected = sel && rows[sel[0]]?.[sel[1]];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("The same document, cut four ways", "Dokumen yang sama, dipotong empat cara"))}</h2>
        <span className="sub">{tr(L("click a block to read it · red outline = ends mid-sentence", "klik blok untuk membaca · garis merah = berakhir di tengah kalimat"))}</span></div>
      <div className="cols">
        {Object.keys(NAMES).filter((k) => rows[k]).map((k) => <Row key={k} id={k} chunks={rows[k]} sel={sel} onSel={setSel} tr={tr} />)}
        {!Object.keys(rows).length && <p className="note">{tr(L("Press Play to start.", "Tekan Putar untuk mulai."))}</p>}
        {ctx.sims && (
          <div className="colcard">
            <h4>{tr(L("Semantic: similarity between neighbouring sentences", "Semantik: kemiripan antar kalimat yang bersebelahan"))}<span className="sub">{tr(L("dashed line = threshold", "garis putus = ambang"))}</span></h4>
            <svg viewBox="0 0 600 70" style={{ width: "100%", height: "auto" }} role="img" aria-label="similarity">
              {ctx.sims.map((s, i) => <rect key={i} x={(i / ctx.sims.length) * 600} y={65 - s * 60} width={Math.max(1, 600 / ctx.sims.length - 1)} height={s * 60} fill={s < ctx.inputs.threshold ? "var(--warn)" : "var(--accent)"} opacity={0.75} />)}
              <line x1={0} x2={600} y1={65 - ctx.inputs.threshold * 60} y2={65 - ctx.inputs.threshold * 60} stroke="var(--ink)" strokeDasharray="4 4" />
            </svg>
            <p className="note" style={{ margin: 0 }}>{tr(L("Red bars are topic changes: each starts a new chunk.", "Batang merah adalah pergantian topik: masing-masing memulai potongan baru."))}</p>
          </div>
        )}
        {selected && <div className="colcard"><h4>{tr(NAMES[sel[0]])} #{sel[1] + 1}<span className="sub">{selected.words} {tr(L("words", "kata"))}</span></h4><div style={{ fontSize: 13.5 }}>{selected.text}</div></div>}
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Before retrieval, a document is cut into **chunks**. Where you cut decides what the model can see together." },
      { ul: ["**Fixed size**: every N words. Fast, but cuts sentences apart.", "**Sentence**: whole sentences packed up to N words.", "**Recursive**: keep a whole section if it fits; otherwise fall back to sentences.", "**Semantic**: start a new chunk where the topic changes, measured by how similar each sentence is to the one before."] },
      { p: "Colours show the handbook section each chunk starts in. A red outline means the chunk ends in the middle of a sentence." },
    ],
    id: [
      { p: "Sebelum retrieval, dokumen dipotong menjadi **potongan (chunk)**. Tempat memotong menentukan apa yang bisa dilihat model bersama-sama." },
      { ul: ["**Ukuran tetap**: setiap N kata. Cepat, tetapi membelah kalimat.", "**Kalimat**: kalimat utuh dikumpulkan sampai N kata.", "**Rekursif**: pertahankan satu bagian utuh jika muat; jika tidak, pakai kalimat.", "**Semantik**: mulai potongan baru saat topik berganti, diukur dari kemiripan setiap kalimat dengan kalimat sebelumnya."] },
      { p: "Warna menunjukkan bagian buku panduan tempat potongan dimulai. Garis merah berarti potongan berakhir di tengah kalimat." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Big target size", "Set the size to 120. Recursive keeps each section whole; fixed size still cuts across sections."] },
      { exp: ["Semantic threshold", "At 0, semantic chunking behaves exactly like sentence packing. Raise it to just 0.01: it now splits wherever two neighbouring sentences share no words, which with TF-IDF is very often. Similarity from a neural model changes smoothly, so real semantic chunkers use one."] },
      { exp: ["Your document", "Upload a document with headings. Recursive chunking benefits most from good headings."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Ukuran target besar", "Atur ukuran ke 120. Rekursif mempertahankan setiap bagian utuh; ukuran tetap tetap memotong lintas bagian."] },
      { exp: ["Ambang semantik", "Pada 0, chunking semantik sama persis dengan pengumpulan kalimat. Naikkan ke 0,01 saja: kini ia memotong setiap kali dua kalimat bersebelahan tidak berbagi kata, yang dengan TF-IDF sangat sering terjadi. Kemiripan dari model neural berubah lebih halus, sehingga chunker semantik sungguhan memakainya."] },
      { exp: ["Dokumen Anda", "Unggah dokumen yang punya judul bagian. Chunking rekursif paling diuntungkan oleh judul yang baik."] }],
  },
  specs: {
    en: [{ dl: [["Target size", "Maximum words per chunk. A single sentence longer than this is cut into fixed pieces."], ["Semantic threshold", "Cosine similarity (TF-IDF) between neighbouring sentences below which a new chunk starts. Real systems use neural embeddings for this."], ["Which is best?", "It depends on the documents. Lesson 9 shows how to measure it with test questions instead of guessing."]] }],
    id: [{ dl: [["Ukuran target", "Jumlah kata maksimum per potongan. Kalimat yang lebih panjang dari ini dipotong menjadi bagian tetap."], ["Ambang semantik", "Cosine similarity (TF-IDF) antar kalimat bersebelahan; di bawah nilai ini potongan baru dimulai. Sistem sungguhan memakai embedding neural."], ["Mana yang terbaik?", "Tergantung dokumennya. Pelajaran 9 menunjukkan cara mengukurnya dengan pertanyaan uji, bukan menebak."]] }],
  },
};

export default {
  n: 8,
  stages, text, Board,
  controls: [
    { id: "size", label: L("Target size", "Ukuran target"), min: 15, max: 150, step: 5, default: 50, format: (v, tr) => `${v} ${tr(L("words", "kata"))}` },
    { id: "threshold", label: L("Semantic threshold", "Ambang semantik"), min: 0, max: 0.4, step: 0.01, default: 0, format: (v) => v.toFixed(2) },
  ],
  inputs: { document: true },
  code: [{ id: "chunkers", label: L("Four chunkers", "Empat chunker"), source: pySource, runnable: false, filename: "chunkers.py", note: L("Imports helpers from lesson 6's rag_from_scratch.py; keep both files together.", "Mengimpor fungsi dari rag_from_scratch.py pelajaran 6; simpan kedua file bersama.") }],
  variables: (c) => (c.rows ? Object.entries(c.rows).map(([k, v]) => [`len(${k})`, `${v.length} chunks, ${ck.quality(v).midCut} mid-sentence`]) : []),
  challenges: [
    { id: "nocut", text: L("Find a size where the sentence chunker makes zero mid-sentence cuts while fixed size makes at least 5.", "Temukan ukuran di mana chunker kalimat tidak memotong di tengah kalimat sama sekali sementara ukuran tetap memotong paling sedikit 5."), check: (c) => c.summary && c.summary.sentence.midCut === 0 && c.summary.fixed.midCut >= 5 },
    { id: "sections", text: L("Make recursive chunking keep every section whole (one chunk per section).", "Buat chunking rekursif mempertahankan setiap bagian utuh (satu potongan per bagian)."), check: (c) => c.rows?.recursive && c.rows.recursive.length === new Set(c.rows.recursive.map((x) => x.sec)).size && c.rows.recursive.length === c.sections.length },
    { id: "sem", text: L("Set the semantic threshold so it makes more chunks than the sentence chunker.", "Atur ambang semantik sehingga menghasilkan lebih banyak potongan daripada chunker kalimat."), check: (c) => c.summary && c.summary.semantic.n > c.summary.sentence.n },
  ],
  quiz: [
    { q: L("What is the main weakness of fixed-size chunking?", "Apa kelemahan utama chunking ukuran tetap?"),
      options: [L("It cuts sentences apart", "Membelah kalimat"), L("It is slow", "Lambat"), L("It needs a neural model", "Butuh model neural"), L("It only works in English", "Hanya untuk bahasa Inggris")],
      answer: 0, why: L("A fact split across two chunks may never be retrieved whole.", "Fakta yang terbelah di dua potongan mungkin tidak pernah diambil utuh.") },
    { q: L("Recursive chunking tries a section first. When does it split further?", "Chunking rekursif mencoba bagian dulu. Kapan ia memecah lebih lanjut?"),
      options: [L("When the section is bigger than the target size", "Saat bagian lebih besar dari ukuran target"), L("Always", "Selalu"), L("When the section has a number", "Saat bagian berisi angka"), L("Never", "Tidak pernah")],
      answer: 0, why: L("It keeps natural units whole whenever they fit.", "Ia mempertahankan unit alami tetap utuh selama muat.") },
    { q: L("Semantic chunking starts a new chunk when…", "Chunking semantik memulai potongan baru ketika…"),
      options: [L("the next sentence is not similar to the previous one", "kalimat berikutnya tidak mirip dengan kalimat sebelumnya"), L("a page ends", "halaman berakhir"), L("a number appears", "muncul angka"), L("every 50 words", "setiap 50 kata")],
      answer: 0, why: L("A drop in similarity signals a change of topic.", "Penurunan kemiripan menandakan pergantian topik.") },
  ],
};
