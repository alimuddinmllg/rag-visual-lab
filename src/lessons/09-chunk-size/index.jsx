// Lesson 9: choose chunk size and overlap by measuring, with a small test set.
import * as rag from "../../rag/core.js";
import { NUSABOT_EN, NUSABOT_ID } from "../../documents/nusabot.js";
import { LineChart } from "../../toolkit/charts.jsx";
import pySource from "./sweep.py?raw";

const L = (en, id) => ({ en, id });
const norm = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
const SIZES = [15, 20, 30, 40, 50, 60, 80, 100, 120];

export const TEST_SET = {
  en: [
    ["How much does PLA printing cost?", "2.000 per gram"], ["When is the lab open on Saturday?", "Saturday from 10:00 to 16:00"],
    ["How much does a gold card cost?", "250.000 per year"], ["Can the drone kit leave the lab?", "drone kit cannot leave the lab"],
    ["What is the fine for late returns?", "5.000 per item per day"], ["Where must lithium batteries be charged?", "fireproof charging bags"],
    ["When are files on the workstations deleted?", "deleted every Sunday night"], ["Who should I ask about urgent safety issues?", "lab assistant on duty"],
    ["How long can a print run before it needs an overnight slot?", "longer than eight hours"], ["What software is installed on the workstations?", "KiCad"],
  ],
  id: [
    ["Berapa biaya cetak PLA?", "2.000 per gram"], ["Jam berapa lab buka hari Sabtu?", "Sabtu pukul 10.00 sampai 16.00"],
    ["Berapa biaya kartu emas?", "250.000 per tahun"], ["Apakah kit drone boleh dibawa keluar lab?", "kit drone tidak boleh dibawa keluar lab"],
    ["Berapa denda jika terlambat mengembalikan alat?", "5.000 per alat per hari"], ["Di mana baterai litium harus diisi?", "kantong pengisian tahan api"],
    ["Kapan file di komputer kerja dihapus?", "dihapus setiap Minggu malam"], ["Siapa yang dihubungi untuk masalah keselamatan mendesak?", "asisten lab yang bertugas"],
    ["Berapa lama cetakan boleh berjalan sebelum perlu slot malam?", "lebih dari delapan jam"], ["Perangkat lunak apa yang terpasang di komputer kerja?", "KiCad"],
  ],
};

export function evaluate(doc, lang, tests, size, overlap, topK) {
  const stop = rag.stopwordsFor(lang);
  const { words } = rag.parseDocument(doc);
  const chunks = rag.chunkDocument(words, size, Math.min(overlap, size - 6));
  const emb = rag.embedChunks(chunks, stop, lang);
  let hits = 0, tokens = 0;
  const per = tests.map(([q, exp]) => {
    const qv = rag.vectorize(rag.tokenize(q, stop, lang), emb.idf);
    const { top } = rag.retrieve(qv, emb.vectors, topK);
    const ok = top.some((t) => norm(chunks[t.i].text).includes(norm(exp)));
    hits += ok;
    tokens += top.reduce((a, t) => a + chunks[t.i].words, 0) * 1.33;
    return ok;
  });
  return { size, rate: hits / tests.length, tokens: tokens / tests.length, per, n: chunks.length };
}

const stages = [
  { id: "testset", label: L("Test set", "Set uji"),
    desc: L("Write questions whose answers you know, plus a phrase the right chunk must contain.", "Tulis pertanyaan yang jawabannya Anda tahu, ditambah frasa yang harus ada di potongan yang benar."),
    run: ({ inputs }) => ({ lang: inputs.lang, doc: inputs.lang === "id" ? NUSABOT_ID : NUSABOT_EN, tests: TEST_SET[inputs.lang] }),
    log: (c) => ({ text: `${c.tests.length} questions with known answers` }), live: (c) => `${c.tests.length} questions` },
  { id: "sweep", label: L("Sweep", "Sapu"),
    desc: L("For each chunk size, re-chunk the document and run every test question through retrieval.", "Untuk setiap ukuran potongan, potong ulang dokumen dan jalankan setiap pertanyaan uji lewat retrieval."),
    run: (c) => ({ results: SIZES.map((s) => evaluate(c.doc, c.lang, c.tests, s, c.inputs.overlap, c.inputs.topK)) }),
    log: (c) => ({ text: `${SIZES.length} sizes × ${c.tests.length} questions = ${SIZES.length * c.tests.length} retrievals` }), live: () => `${SIZES.length} sizes` },
  { id: "score", label: L("Score", "Nilai"),
    desc: L("Hit rate: the share of questions where a retrieved chunk contains the right answer. Also track prompt size, which is cost.", "Hit rate: persentase pertanyaan yang potongan hasil retrieval-nya berisi jawaban benar. Catat juga ukuran prompt, yang berarti biaya."),
    run: (c) => ({ scored: true }),
    log: (c) => ({ text: c.results.map((r) => `${r.size}:${Math.round(r.rate * 100)}%`).join(" ") }), live: (c) => c.results.map((r) => `${Math.round(r.rate * 100)}%`).join(" ") },
  { id: "best", label: L("Pick", "Pilih"),
    desc: L("Pick the highest hit rate; among ties, the smallest chunks, because they make shorter, cheaper prompts.", "Pilih hit rate tertinggi; jika sama, potongan terkecil, karena prompt lebih pendek dan lebih murah."),
    run: (c) => { const best = [...c.results].sort((a, b) => b.rate - a.rate || a.size - b.size)[0]; return { best }; },
    log: (c) => ({ text: `best: ${c.best.size} words (${Math.round(c.best.rate * 100)}%, ~${Math.round(c.best.tokens)} prompt tokens)` }), live: (c) => `${c.best.size} words` },
];

function Board({ ctx, tr }) {
  const res = ctx.results;
  const maxTok = res ? Math.max(...res.map((r) => r.tokens)) : 1;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Hit rate by chunk size", "Hit rate menurut ukuran potongan"))}</h2>
        <span className="sub">{tr(L("built-in handbook", "buku panduan bawaan"))} · top-{ctx.inputs.topK} · overlap {ctx.inputs.overlap}</span></div>
      <div className="plain">
        {res && ctx.scored ? (
          <LineChart xLabel={tr(L("chunk size (words)", "ukuran potongan (kata)"))} yLabel={tr(L("hit rate", "hit rate"))}
            fmtY={(y) => `${Math.round(y * 100)}%`}
            series={[{ name: "hit", points: res.map((r) => [r.size, r.rate]) }, { name: "tok", cls: "series2", points: res.map((r) => [r.size, r.tokens / maxTok]) }]}
            best={ctx.best ? [ctx.best.size, ctx.best.rate, ] && Object.assign([ctx.best.size, ctx.best.rate], { label: `${tr(L("best", "terbaik"))}: ${ctx.best.size}` }) : null} />
        ) : <p className="note">{tr(L("Run the Sweep and Score steps to draw the chart.", "Jalankan langkah Sapu dan Nilai untuk menggambar grafik."))}</p>}
        <div className="legend2" style={{ borderTop: 0, padding: "4px 0 0" }}>
          <span><i style={{ background: "var(--accent)" }} />{tr(L("hit rate", "hit rate"))}</span>
          <span><i style={{ background: "var(--query)" }} />{tr(L("prompt size (relative to the largest)", "ukuran prompt (relatif terhadap yang terbesar)"))}</span>
        </div>
      </div>
    </div>
  );
}

function DataPanel({ ctx, tr }) {
  if (!ctx.results) return <p className="note plain">{tr(L("Run the Sweep step.", "Jalankan langkah Sapu."))}</p>;
  return (
    <div className="plain" style={{ overflowX: "auto" }}>
      <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
        <thead><tr><th style={{ textAlign: "left", fontFamily: "var(--body)" }}>{tr(L("question", "pertanyaan"))}</th>{ctx.results.map((r) => <th key={r.size} style={{ padding: "2px 6px", color: ctx.best?.size === r.size ? "var(--query)" : "var(--muted)" }}>{r.size}</th>)}</tr></thead>
        <tbody>{ctx.tests.map(([q], i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
            <td style={{ fontFamily: "var(--body)", padding: "4px 8px 4px 0" }}>{q}</td>
            {ctx.results.map((r) => <td key={r.size} style={{ textAlign: "center", color: r.per[i] ? "var(--good)" : "var(--warn)" }}>{r.per[i] ? "●" : "○"}</td>)}
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "\"What chunk size should I use?\" has no universal answer. The reliable way is to **measure**: write a few questions whose answers you already know, then test every setting." },
      { p: "**Hit rate** is the share of test questions where the right passage made it into the top-k. It measures retrieval only, before any model writes an answer." },
      { p: "Bigger chunks often raise the hit rate (the answer is more likely to be inside) but make every prompt longer and more expensive. The chart shows both." },
      { h: "Try" },
      { ol: ["Press **Play** and read the chart.", "Change **top-k** and **overlap** and see how the best size moves.", "Open the **Data** tab to see which questions fail at which size."] },
    ],
    id: [
      { p: "\"Ukuran potongan berapa yang harus dipakai?\" tidak punya jawaban universal. Cara yang dapat diandalkan adalah **mengukur**: tulis beberapa pertanyaan yang jawabannya sudah Anda tahu, lalu uji setiap pengaturan." },
      { p: "**Hit rate** adalah persentase pertanyaan uji yang bagian benarnya masuk ke top-k. Ini hanya mengukur retrieval, sebelum model menulis jawaban." },
      { p: "Potongan yang lebih besar sering menaikkan hit rate (jawaban lebih mungkin ada di dalamnya) tetapi membuat setiap prompt lebih panjang dan lebih mahal. Grafik menunjukkan keduanya." },
      { h: "Coba" },
      { ol: ["Tekan **Putar** dan baca grafiknya.", "Ubah **top-k** dan **overlap** dan lihat bagaimana ukuran terbaik bergeser.", "Buka tab **Data** untuk melihat pertanyaan mana yang gagal pada ukuran mana."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Top-1", "Set top-k to 1. Small chunks suffer most: the single best chunk often holds only half the answer."] }, { exp: ["Overlap", "Add 10 words of overlap and check whether the small sizes improve. Measure it rather than assuming it."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Top-1", "Atur top-k ke 1. Potongan kecil paling dirugikan: satu potongan terbaik sering hanya berisi setengah jawaban."] }, { exp: ["Overlap", "Tambahkan overlap 10 kata dan periksa apakah ukuran kecil membaik. Ukur, jangan berasumsi."] }],
  },
  specs: {
    en: [{ dl: [["Test set", "10 questions about the built-in handbook, each with a phrase the right chunk must contain. For your own documents, write your own (lesson 19)."], ["Hit rate", "Also called recall@k when there is one relevant passage per question."], ["Prompt size", "Average words in the top-k chunks × 1.33 tokens per word."]] }],
    id: [{ dl: [["Set uji", "10 pertanyaan tentang buku panduan bawaan, masing-masing dengan frasa yang harus ada di potongan yang benar. Untuk dokumen Anda sendiri, tulis set sendiri (pelajaran 19)."], ["Hit rate", "Disebut juga recall@k jika ada satu bagian relevan per pertanyaan."], ["Ukuran prompt", "Rata-rata kata di potongan top-k × 1,33 token per kata."]] }],
  },
};

export default {
  n: 9,
  stages, text, Board, DataPanel,
  controls: [
    { id: "overlap", label: L("Overlap", "Overlap"), min: 0, max: 20, step: 2, default: 0, format: (v, tr) => `${v} ${tr(L("words", "kata"))}` },
    { id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 5, step: 1, default: 2 },
  ],
  code: [{ id: "sweep", label: L("Size sweep", "Sapu ukuran"), source: pySource, runnable: false, filename: "sweep.py", note: L("Imports from lesson 6's rag_from_scratch.py.", "Mengimpor dari rag_from_scratch.py pelajaran 6.") }],
  variables: (c) => (c.results ? c.results.map((r) => [`size ${r.size}`, `${Math.round(r.rate * 100)}% · ~${Math.round(r.tokens)} tok`]) : []),
  challenges: [
    { id: "top1", text: L("Set top-k to 1 and find the best chunk size.", "Atur top-k ke 1 dan temukan ukuran potongan terbaik."), check: (c) => c.inputs.topK === 1 && c.best },
    { id: "perfect", text: L("Find settings that reach a 100% hit rate.", "Temukan pengaturan yang mencapai hit rate 100%."), check: (c) => c.best && c.best.rate === 1 },
  ],
  quiz: [
    { q: L("What does hit rate measure?", "Apa yang diukur hit rate?"),
      options: [L("How often the right passage is in the retrieved top-k", "Seberapa sering bagian yang benar ada di top-k hasil retrieval"), L("How fast retrieval runs", "Seberapa cepat retrieval berjalan"), L("How fluent the answer is", "Seberapa lancar jawabannya"), L("How many chunks there are", "Berapa jumlah potongan")],
      answer: 0, why: L("It checks retrieval alone, against answers you already know.", "Ini memeriksa retrieval saja, terhadap jawaban yang sudah Anda tahu.") },
    { q: L("Why not always use the biggest chunks?", "Mengapa tidak selalu memakai potongan terbesar?"),
      options: [L("Prompts get longer and more expensive, and extra text can distract the model", "Prompt menjadi lebih panjang dan mahal, dan teks tambahan bisa mengganggu model"), L("Big chunks can't be embedded", "Potongan besar tidak bisa di-embed"), L("They always lower the hit rate", "Selalu menurunkan hit rate"), L("No reason: bigger is better", "Tidak ada alasan: lebih besar lebih baik")],
      answer: 0, why: L("Hit rate is only half the trade-off; cost and focus are the other half.", "Hit rate hanya separuh pertimbangan; biaya dan fokus adalah separuh lainnya.") },
    { q: L("How should you choose chunk size for your own documents?", "Bagaimana memilih ukuran potongan untuk dokumen Anda sendiri?"),
      options: [L("Measure it with a test set of known questions", "Ukur dengan set uji berisi pertanyaan yang jawabannya diketahui"), L("Always use 512 tokens", "Selalu 512 token"), L("Copy the value from a blog post", "Salin nilai dari artikel blog"), L("Use the biggest your model allows", "Pakai yang terbesar yang diizinkan model")],
      answer: 0, why: L("The best size depends on how your documents are written.", "Ukuran terbaik tergantung pada cara dokumen Anda ditulis.") },
  ],
};
