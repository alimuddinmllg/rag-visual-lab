// Lesson 4: embeddings. Sentences become points; similar meaning = nearby points.
import { useMemo } from "react";
import * as rag from "../../rag/core.js";
import { useNeuralVectors, dotDense } from "../../rag/neural.js";
import { methodControl } from "../../rag/stages.js";
import DocumentSpace from "../../toolkit/DocumentSpace.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import pySource from "./embeddings.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const L = (en, id) => ({ en, id });
const LIMIT = 80;

export function splitSentences(text) {
  const { sections } = rag.parseDocument(text);
  const out = [];
  let sec = 0, seen = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("## ")) { sec = seen++; continue; }
    for (const s of t.split(/(?<=[.!?])\s+/)) if (s.split(/\s+/).length >= 3) out.push({ text: s, sec: Math.max(0, sec), words: s.split(/\s+/).length });
  }
  return { sections, sentences: out.slice(0, LIMIT) };
}

function useExtra(base) {
  const want = base.method === "neural";
  const texts = useMemo(() => (want ? [...splitSentences(base.doc.text).sentences.map((s) => s.text), base.question || ""] : []), [want, base.doc, base.question]);
  const n = useNeuralVectors(texts, want);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ neural: want ? { ...n, texts } : null }), [want, n.status, n.vectors, n.progress, n.download, texts]);
}

const stages = [
  { id: "split", label: L("Split", "Pisah"),
    desc: L("Cut the document into sentences. Each sentence will become one point.", "Memotong dokumen menjadi kalimat. Setiap kalimat akan menjadi satu titik."),
    run: ({ inputs }) => { const { sections, sentences } = splitSentences(inputs.doc.text); const lang = inputs.doc.lang; return { sections, chunks: sentences, lang, stop: rag.stopwordsFor(lang) }; },
    log: (c) => ({ text: `${c.chunks.length} sentences` }), live: (c) => `${c.chunks.length} sentences` },
  { id: "vectorize", label: L("Vectorize", "Vektorisasi"),
    desc: L("Turn each sentence into a list of numbers. TF-IDF counts shared words; the neural model encodes meaning.", "Mengubah setiap kalimat menjadi deretan angka. TF-IDF menghitung kata yang sama; model neural menyandikan makna."),
    run: (c) => {
      const tfidf = rag.embedChunks(c.chunks, c.stop, c.lang);
      const n = c.inputs.neural;
      if (n && n.status === "ready" && n.vectors.length === c.chunks.length + 1 && n.texts[0] === c.chunks[0]?.text)
        return { tfidf, method: "neural", dense: n.vectors.slice(0, -1), qd: n.vectors.at(-1), dims: n.vectors[0].length };
      return { tfidf, method: "tfidf", dims: tfidf.vocab.length };
    },
    log: (c) => ({ text: `${c.method}: ${c.chunks.length} vectors × ${c.dims} numbers` }), live: (c) => `${c.method}, ${c.dims} dims` },
  { id: "map", label: L("Map to 2D", "Petakan ke 2D"),
    desc: L("Squash the vectors to two dimensions (PCA) so we can draw them. Nearby points have similar vectors.", "Memampatkan vektor menjadi dua dimensi (PCA) agar bisa digambar. Titik yang berdekatan punya vektor yang mirip."),
    run: (c) => ({ map: c.method === "neural" ? rag.pcaDense(c.dense) : rag.pca2(c.tfidf.vectors, c.tfidf.vocab) }),
    log: (c) => ({ text: `${c.dims} → 2 dimensions` }), live: () => "2D map" },
  { id: "neighbours", label: L("Neighbours", "Tetangga"),
    desc: L("Place your sentence on the map and find the closest sentences by cosine similarity.", "Letakkan kalimat Anda di peta dan cari kalimat terdekat dengan cosine similarity."),
    run: (c) => {
      const qTokens = rag.tokenize(c.inputs.question || "", c.stop, c.lang);
      const qv = rag.vectorize(qTokens, c.tfidf.idf);
      const known = [...new Set(qTokens.filter((t) => c.tfidf.idf.has(t)))];
      const neural = c.method === "neural";
      const scores = neural ? c.dense.map((v) => dotDense(c.qd, v)) : c.tfidf.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
      const top = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s).slice(0, c.inputs.k);
      const qxy = neural ? rag.projectDense(c.qd, c.map) : known.length ? rag.projectPoint(qv, c.map) : null;
      return { qTokens, known, scores, top, qxy, hasQuery: neural ? qTokens.length > 0 : known.length > 0 };
    },
    log: (c) => ({ text: `closest: ${c.top.map((t) => `#${t.i + 1} ${t.s.toFixed(2)}`).join(", ")}`, warn: c.hasQuery ? null : "no shared words" }),
    live: (c) => c.top.map((t) => `#${t.i + 1}=${t.s.toFixed(2)}`).join("  ") },
];

function Board({ ctx, runner, hover, setHover, tr }) {
  return (
    <div className="card">
      <div className="card-h"><h2>{tr(L("Sentence space", "Ruang kalimat"))}</h2>
        <span className="sub">{ctx.dims ? `${ctx.chunks.length} · ${ctx.method} · ${ctx.dims} dims → 2D` : ""}</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      <DocumentSpace points={ctx.map ? ctx.map.coords : null} labels={ctx.chunks || []} sections={ctx.sections || []}
        query={{ show: !!ctx.qTokens, xy: ctx.qxy }} links={ctx.top || null} threshold={-1}
        anim={runner.animStage === "map" ? "embed" : runner.animStage === "neighbours" ? "retrieve" : runner.animStage} runKey={runner.runKey}
        hover={hover} onHover={setHover}
        text={{ aria: L("Map of sentences", "Peta kalimat"), empty: L("Press Play or Step to start", "Tekan Putar atau Langkah untuk mulai"), question: L("your sentence", "kalimat Anda"), noMatch: L("TF-IDF: no word in your sentence appears in the document", "TF-IDF: tidak ada kata kalimat Anda yang muncul di dokumen") }} />
    </div>
  );
}

function DataPanel({ ctx, tr }) {
  return (
    <div className="plain">
      <div className="panel-h" style={{ padding: 0, marginBottom: 8 }}>{tr(L("Closest sentences", "Kalimat terdekat"))}<span className="sub">{ctx.method || ""}</span></div>
      {ctx.top ? (
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 13.5 }}>
          {ctx.top.map((t) => <li key={t.i}><span className="mono" style={{ color: "var(--query)" }}>{t.s.toFixed(2)}</span> · {ctx.chunks[t.i].text}</li>)}
        </ol>
      ) : <p className="note">{tr(L("Run the Neighbours step.", "Jalankan langkah Tetangga."))}</p>}
      {ctx.method === "tfidf" && ctx.known && <p className="note">{tr(L("Words that matched:", "Kata yang cocok:"))} {ctx.known.join(", ") || "—"}</p>}
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "An **embedding** turns text into a list of numbers (a vector). Think of it as coordinates: similar texts get nearby coordinates." },
      { p: "Here every sentence of the document is one dot. Your sentence is the star, and lines go to its closest neighbours." },
      { h: "Two kinds of embedding" },
      { ul: ["**TF-IDF** counts shared words. Fast and transparent, but blind to synonyms: \"price\" and \"cost\" are unrelated to it.", "**Neural** embeddings come from a model trained on huge amounts of text. They capture meaning, and work across languages. The download is about 120 MB, once."] },
      { h: "Try" },
      { ol: ["Run with TF-IDF and look at the neighbours.", "Switch **Embedding** to Neural and run again with the same sentence.", "Ask in English while the Indonesian handbook is loaded."] },
    ],
    id: [
      { p: "**Embedding** mengubah teks menjadi deretan angka (vektor). Anggap saja sebagai koordinat: teks yang mirip mendapat koordinat yang berdekatan." },
      { p: "Di sini setiap kalimat dokumen adalah satu titik. Kalimat Anda adalah bintang, dan garis menuju tetangga terdekatnya." },
      { h: "Dua jenis embedding" },
      { ul: ["**TF-IDF** menghitung kata yang sama. Cepat dan transparan, tetapi buta sinonim: \"harga\" dan \"biaya\" dianggap tidak berhubungan.", "Embedding **neural** berasal dari model yang dilatih dengan teks sangat banyak. Embedding ini menangkap makna dan bekerja lintas bahasa. Unduhannya sekitar 120 MB, sekali saja."] },
      { h: "Coba" },
      { ol: ["Jalankan dengan TF-IDF dan lihat tetangganya.", "Ganti **Embedding** ke Neural lalu jalankan lagi dengan kalimat yang sama.", "Bertanya dalam bahasa Inggris saat buku panduan Indonesia dimuat."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Synonyms", "\"What is the price of printing?\" With TF-IDF, \"price\" matches nothing. With Neural, the 3D printing prices come first."] },
      { exp: ["Across languages", "Load the Indonesian handbook and ask \"Can I borrow a drone?\" in English. TF-IDF finds no shared words; the neural model still finds the borrowing sentences."] },
      { exp: ["Clusters", "With Neural on, look at the map: sentences from the same section tend to group by colour, even when they share few words."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Sinonim", "\"Berapa harga mencetak?\" Dengan TF-IDF, \"harga\" tidak cocok dengan apa pun. Dengan Neural, biaya cetak 3D muncul paling atas."] },
      { exp: ["Lintas bahasa", "Muat buku panduan Indonesia dan tanyakan \"Can I borrow a drone?\" dalam bahasa Inggris. TF-IDF tidak menemukan kata yang sama; model neural tetap menemukan kalimat peminjaman."] },
      { exp: ["Kelompok", "Dengan Neural aktif, lihat petanya: kalimat dari bagian yang sama cenderung berkumpul menurut warna, walaupun kata-katanya sedikit yang sama."] }],
  },
  specs: {
    en: [{ dl: [["TF-IDF", "One dimension per word in the document; most numbers are zero. Instant, computed in your browser."], ["Neural model", "paraphrase-multilingual-MiniLM-L12-v2: 384 dimensions, 50+ languages including Indonesian. Runs in your browser; nothing is sent to a server."], ["Map", "PCA squashes hundreds of dimensions into 2, so distances on screen are approximate. The scores are exact."], ["Neighbours (k)", "How many closest sentences to show."]] }],
    id: [{ dl: [["TF-IDF", "Satu dimensi per kata di dokumen; sebagian besar angkanya nol. Instan, dihitung di browser Anda."], ["Model neural", "paraphrase-multilingual-MiniLM-L12-v2: 384 dimensi, lebih dari 50 bahasa termasuk Indonesia. Berjalan di browser Anda; tidak ada yang dikirim ke server."], ["Peta", "PCA memampatkan ratusan dimensi menjadi 2, jadi jarak di layar hanya perkiraan. Skornya tepat."], ["Tetangga (k)", "Berapa kalimat terdekat yang ditampilkan."]] }],
  },
};

export default {
  n: 4,
  stages, text, Board, DataPanel, useExtra,
  controls: [methodControl, { id: "k", label: L("Neighbours (k)", "Tetangga (k)"), min: 1, max: 8, step: 1, default: 3 }],
  inputs: { document: true, question: true },
  questionLabel: L("Your sentence", "Kalimat Anda"),
  runLabel: L("Place it", "Letakkan"),
  defaultQuestion: { en: "What is the price of printing?", id: "Berapa harga mencetak?" },
  examples: { en: ["What is the price of printing?", "Can I borrow a drone?", "Is the lab open at the weekend?", "Who do I contact about safety?"], id: ["Berapa harga mencetak?", "Can I borrow a drone?", "Apakah lab buka saat akhir pekan?", "Siapa yang dihubungi soal keselamatan?"] },
  code: [
    { id: "emb", label: L("TF-IDF embeddings (runs here)", "Embedding TF-IDF (bisa dijalankan)"), source: pySource, runnable: true, filename: "embeddings.py" },
    { id: "libs", label: L("Neural, with libraries", "Neural, dengan pustaka"), source: libSource, runnable: false, filename: "embeddings_libraries.py",
      note: L("Runs on your computer after: pip install sentence-transformers scikit-learn", "Jalankan di komputer Anda setelah: pip install sentence-transformers scikit-learn") },
  ],
  python: (c) => {
    const doc = c.inputs.doc, lang = doc.lang, k = c.inputs.k || 3;
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: doc.text, PROBE: c.inputs.question || "", LANG: lang, STOPWORDS: stopList(lang), K: k },
      call: "demo(DOCUMENT, PROBE, LANG, STOPWORDS, K)",
      compare: (res) => {
        const { sentences } = splitSentences(doc.text), stop = rag.stopwordsFor(lang);
        const e = rag.embedChunks(sentences, stop, lang);
        const qv = rag.vectorize(rag.tokenize(c.inputs.question || "", stop, lang), e.idf);
        const top = e.vectors.map((v, i) => ({ i, s: qv.size ? rag.cosine(qv, v) : 0 })).sort((a, b) => b.s - a.s).slice(0, k);
        return res.top.length === top.length && res.top.every(([i, s], j) => i === top[j].i && Math.abs(s - top[j].s) < 1e-9);
      },
    };
  },
  variables: (c) => [["method", c.method || "—"], ["len(sentences)", c.chunks ? String(c.chunks.length) : "—"], ["dims", c.dims ? String(c.dims) : "—"], ["nearest", c.top ? c.top.map((t) => `(${t.i}, ${t.s.toFixed(2)})`).join(", ") : "—"]],
  challenges: [
    { id: "neural", text: L("Switch to the neural embedding and place a sentence.", "Ganti ke embedding neural dan letakkan sebuah kalimat."), check: (c) => c.method === "neural" && c.top },
    { id: "nowords", text: L("With Neural, find a good neighbour (score ≥ 0.4) for a sentence that shares no words with the document.", "Dengan Neural, temukan tetangga yang baik (skor ≥ 0,4) untuk kalimat yang tidak berbagi kata dengan dokumen."), check: (c) => c.method === "neural" && c.known && c.known.length === 0 && c.top?.[0]?.s >= 0.4 },
    { id: "tfzero", text: L("With TF-IDF, ask something that matches no words at all.", "Dengan TF-IDF, tanyakan hal yang tidak cocok dengan kata apa pun."), check: (c) => c.method === "tfidf" && c.known && c.known.length === 0 && (c.inputs.question || "").length > 3 },
  ],
  quiz: [
    { q: L("What does it mean when two sentences have nearby embeddings?", "Apa artinya jika dua kalimat punya embedding yang berdekatan?"),
      options: [L("They have the same length", "Panjangnya sama"), L("The model considers them similar", "Model menganggap keduanya mirip"), L("They are in the same paragraph", "Keduanya di paragraf yang sama"), L("They were written by the same person", "Ditulis oleh orang yang sama")],
      answer: 1, why: L("Closeness in vector space is how retrieval measures relevance.", "Kedekatan di ruang vektor adalah cara retrieval mengukur relevansi.") },
    { q: L("Why does TF-IDF miss \"price\" when the document says \"cost\"?", "Mengapa TF-IDF gagal mencocokkan \"harga\" saat dokumen memakai \"biaya\"?"),
      options: [L("It only matches exact words", "Hanya mencocokkan kata yang persis sama"), L("The document is too short", "Dokumennya terlalu pendek"), L("It needs a GPU", "Perlu GPU"), L("Prices are numbers", "Harga adalah angka")],
      answer: 0, why: L("TF-IDF has one dimension per word; different words never overlap. Neural embeddings learn that the words mean the same thing.", "TF-IDF punya satu dimensi per kata; kata berbeda tidak pernah tumpang tindih. Embedding neural mempelajari bahwa kata-kata itu bermakna sama.") },
    { q: L("Why are positions on the 2D map only approximate?", "Mengapa posisi di peta 2D hanya perkiraan?"),
      options: [L("The vectors have hundreds of dimensions, squashed to two", "Vektornya punya ratusan dimensi yang dimampatkan menjadi dua"), L("The browser rounds numbers", "Browser membulatkan angka"), L("The model is random", "Modelnya acak"), L("They aren't: the map is exact", "Tidak: petanya tepat")],
      answer: 0, why: L("PCA keeps the two most spread-out directions and drops the rest, so always trust the scores.", "PCA mempertahankan dua arah yang paling menyebar dan membuang sisanya, jadi selalu percayai skornya.") },
  ],
};
