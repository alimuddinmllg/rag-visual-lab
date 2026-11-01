// Lesson 22: failure clinic. Six broken pipelines: find the faulty stage, fix it, verify.
import * as rag from "../../rag/core.js";
import * as R from "../../rag/retrieval.js";
import { HANDBOOK } from "../../rag/testsets.js";
import { L, quizQ } from "../shared.js";
import STOPWORDS from "../../rag/stopwords.json";
import pySource from "./debug.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude } from "../prelude.js";

const CAUSES = { chunking: L("Chunking", "Chunking"), threshold: L("Similarity threshold", "Ambang kemiripan"), filter: L("Metadata filter", "Filter metadata"), topk: L("Top-k too small", "Top-k terlalu kecil"), language: L("Language / document mismatch", "Bahasa / dokumen tidak cocok"), wording: L("Question wording (vocabulary gap)", "Kata-kata pertanyaan (celah kosakata)") };

export const CASES = [
  { id: 1, cause: "chunking", q: L("How much does PLA printing cost?", "Berapa biaya cetak PLA?"), expect: L("2.000 per gram", "2.000 per gram"), broken: { size: 6, overlap: 0, topK: 1 }, fixed: { size: 40, overlap: 8, topK: 3 } },
  { id: 2, cause: "threshold", q: L("When is the lab open on Saturday?", "Kapan lab buka hari Sabtu?"), expect: L("Saturday from 10:00", "Sabtu pukul 10.00"), broken: { minSim: 0.6 }, fixed: { minSim: 0.1 } },
  { id: 3, cause: "filter", q: L("Where must lithium batteries be charged?", "Di mana baterai litium harus diisi?"), expect: L("fireproof charging bags", "kantong pengisian tahan api"), broken: { filter: 2 }, fixed: { filter: null } },
  { id: 4, cause: "topk", q: L("How much does printing cost?", "Berapa biaya mencetak?"), expect: L("500 per page", "2.000 per gram"), inChunks: true, broken: { topK: 1 }, fixed: { topK: 3 } },
  { id: 5, cause: "language", q: L("When does the lab close during exam weeks?", "When does the lab close during exam weeks?"), expect: L("18:00", "18.00"), broken: { docLang: "other" }, fixed: { docLang: "same" } },
  { id: 6, cause: "wording", q: L("What is the fee to join as a student?", "Berapa ongkos daftar anggota mahasiswa?"), expect: L("50.000 per semester", "50.000 per semester"), broken: { rewrite: false }, fixed: { rewrite: true } },
];

export function runCase(cs, lang, which) {
  const p = { size: 40, overlap: 8, topK: 3, minSim: 0.1, filter: null, docLang: "same", rewrite: false, ...cs[which] };
  const isEN = cs.id === 5 ? true : lang === "en";
  const docLang = cs.id === 5 ? (p.docLang === "same" ? "en" : "id") : lang;
  const question = isEN && cs.id === 5 ? cs.q.en : cs.q[lang];
  const idx = R.buildIndex(HANDBOOK[docLang], docLang, p.size, p.overlap);
  const variants = p.rewrite ? R.rewriteQuery(question, docLang) : [question];
  let rank = variants.length > 1 ? R.rrf(variants.map((v) => R.rankBy(R.tfidfScores(idx, v)))) : R.rankBy(R.tfidfScores(idx, question));
  const cos = R.tfidfScores(idx, question);
  if (p.filter != null) rank = rank.filter((x) => idx.chunks[x.i].sec === p.filter);
  const top = rank.slice(0, p.topK).map((x) => ({ i: x.i, s: variants.length > 1 ? Math.max(cos[x.i], 0.11) : x.s }));
  const used = top.filter((t) => t.s >= p.minSim);
  const qt = variants.flatMap((v) => rag.tokenize(v, idx.stop, docLang)).filter((t) => idx.tfidf.idf.has(t));
  const answer = rag.extractAnswer(used, idx.chunks, qt, idx.tfidf.idf, idx.stop, docLang);
  const expect = cs.id === 5 ? (docLang === "en" ? "18:00" : "18.00") : cs.expect[lang];
  // Case 4 is judged like a retrieval check: did the chunk holding the answer reach the prompt?
  const ok = cs.inChunks ? used.some((t) => R.norm(idx.chunks[t.i].text).includes(R.norm(expect))) : R.norm(answer.text).includes(R.norm(expect));
  return { p, idx, question, docLang, top, used, answer, ok, sections: idx.sections };
}

const stages = [
  { id: "observe", label: L("Observe", "Amati"), desc: L("Run the broken pipeline and read the answer.", "Jalankan pipeline yang rusak dan baca jawabannya."),
    run: ({ inputs }) => { const cs = CASES[+inputs.cs]; return { cs, broken: runCase(cs, inputs.uiLang, "broken") }; },
    log: (c) => ({ text: c.broken.answer.text.slice(0, 90), warn: c.broken.ok ? null : "wrong or missing answer" }), live: (c) => (c.broken.ok ? "ok?" : "broken") },
  { id: "inspect", label: L("Inspect", "Periksa"), desc: L("Look at what each stage produced: chunk sizes, scores, filters, the question words that matched.", "Lihat hasil setiap langkah: ukuran potongan, skor, filter, kata pertanyaan yang cocok."),
    run: () => ({ inspected: true }), log: (c) => ({ text: `top: ${c.broken.top.map((t) => `#${t.i + 1} ${t.s.toFixed(2)}`).join(", ") || "none"} · used ${c.broken.used.length}` }), live: () => "see board" },
  { id: "diagnose", label: L("Diagnose", "Diagnosis"), desc: L("Pick the stage you think is at fault in Try it yourself.", "Pilih langkah yang menurut Anda bermasalah di Coba sendiri."),
    run: (c) => ({ correct: c.inputs.guess === c.cs.cause }), log: (c) => ({ text: c.inputs.guess === "none" ? "no diagnosis yet" : c.correct ? "correct diagnosis" : "not this one", warn: c.correct ? null : "try another" }), live: (c) => (c.correct ? "✓" : "✗") },
  { id: "fix", label: L("Fix", "Perbaiki"), desc: L("Apply the fix for that stage and run again.", "Terapkan perbaikan untuk langkah itu lalu jalankan lagi."),
    run: (c) => ({ fixed: runCase(c.cs, c.inputs.uiLang, "fixed") }), log: (c) => ({ text: c.fixed.answer.text.slice(0, 90) }), live: () => "fixed run" },
  { id: "verify", label: L("Verify", "Verifikasi"), desc: L("Does the fixed pipeline give the right answer now?", "Apakah pipeline yang diperbaiki sekarang memberi jawaban benar?"),
    run: (c) => ({ verified: c.fixed.ok }), log: (c) => ({ text: c.verified ? "fixed ✓" : "still wrong", warn: c.verified ? null : "check again" }), live: (c) => (c.verified ? "✓" : "✗") },
];

function RunView({ r, tr, title, good }) {
  return (
    <div className={`panel${good == null ? "" : good ? " good" : " bad"}`}>
      <h4>{title}</h4>
      <dl className="kv" style={{ fontSize: 12.5 }}>
        <dt>{tr(L("question", "pertanyaan"))}</dt><dd>{r.question}</dd>
        <dt>{tr(L("document", "dokumen"))}</dt><dd>{r.docLang === "en" ? "handbook (EN)" : "buku panduan (ID)"}</dd>
        <dt>{tr(L("settings", "pengaturan"))}</dt><dd>size {r.p.size} · overlap {r.p.overlap} · top-k {r.p.topK} · min {r.p.minSim}{r.p.filter != null ? ` · filter: ${r.sections[r.p.filter]}` : ""}{r.p.rewrite ? " · rewrite on" : ""}</dd>
        <dt>{tr(L("retrieved", "diambil"))}</dt><dd>{r.top.map((t) => `#${t.i + 1} (${t.s.toFixed(2)})`).join(", ") || "—"}</dd>
      </dl>
      <p style={{ margin: "8px 0 0" }}><b>{tr(L("Answer", "Jawaban"))}:</b> {r.answer.text}</p>
    </div>
  );
}

function Board({ ctx, runner, tr }) {
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Case", "Kasus"))} {ctx.cs ? ctx.cs.id : ""}: {tr(L("something is wrong", "ada yang salah"))}</h2>
        {ctx.correct != null && <span className="sub" style={{ color: ctx.correct ? "var(--good)" : "var(--warn)" }}>{ctx.correct ? tr(L("diagnosis correct", "diagnosis benar")) : tr(L("diagnosis: try again", "diagnosis: coba lagi"))}</span>}</div>
      <div className="vs">
        {ctx.broken ? <RunView r={ctx.broken} tr={tr} title={tr(L("Broken pipeline", "Pipeline rusak"))} good={runner.phase >= 1 ? ctx.broken.ok : null} /> : <p className="note">{tr(L("Press Play.", "Tekan Putar."))}</p>}
        {ctx.fixed && <RunView r={ctx.fixed} tr={tr} title={tr(L("After the fix", "Setelah diperbaiki"))} good={ctx.fixed.ok} />}
      </div>
      {ctx.correct === false && runner.phase >= 3 && <p className="note plain" style={{ margin: 0 }}>{tr(L("Compare the settings line with lessons 6–16: which one would explain this answer?", "Bandingkan baris pengaturan dengan pelajaran 6–16: mana yang menjelaskan jawaban ini?"))}</p>}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "In real projects nobody tells you which stage broke. You see a bad answer and work backwards. Each case here hides **one** fault from lessons 6–16." },
      { ol: ["**Observe** the wrong answer.", "**Inspect** the settings and what was retrieved.", "**Diagnose**: pick the faulty stage in Try it yourself and press Play again.", "Watch the **fix** run, and **verify** it."] }],
    id: [{ p: "Di proyek nyata tidak ada yang memberi tahu langkah mana yang rusak. Anda melihat jawaban yang buruk lalu menelusuri mundur. Setiap kasus di sini menyembunyikan **satu** kesalahan dari pelajaran 6–16." },
      { ol: ["**Amati** jawaban yang salah.", "**Periksa** pengaturan dan apa yang diambil.", "**Diagnosis**: pilih langkah yang bermasalah di Coba sendiri lalu tekan Putar lagi.", "Lihat **perbaikannya** berjalan, lalu **verifikasi**."] }],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Diagnose before you fix", "For each case, write down your diagnosis before you open the fixed run. Guessing and then checking is how you learn to read a pipeline; jumping to the fix teaches nothing."] },
      { exp: ["Break it yourself", "Go to lesson 10 and filter to the wrong section, or to lesson 6 and set the minimum similarity to 0.6. You have just recreated cases 2 and 3 with your own question."] },
      { exp: ["Same symptom, different cause", "Cases 2 and 3 both end in \"I don't know\". Only the inspect step tells them apart: in case 2 the right chunk was retrieved and then dropped by the threshold; in case 3 the filter removed it before the search even started."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Diagnosis sebelum perbaikan", "Untuk setiap kasus, tulis diagnosis Anda sebelum membuka hasil perbaikan. Menebak lalu memeriksa adalah cara belajar membaca pipeline; langsung melompat ke perbaikan tidak mengajarkan apa pun."] },
      { exp: ["Rusak sendiri", "Buka pelajaran 10 dan saring ke bagian yang salah, atau pelajaran 6 dan atur kemiripan minimum ke 0,6. Anda baru saja membuat ulang kasus 2 dan 3 dengan pertanyaan Anda sendiri."] },
      { exp: ["Gejala sama, penyebab berbeda", "Kasus 2 dan 3 sama-sama berakhir dengan \"tidak tahu\". Hanya langkah periksa yang membedakannya: di kasus 2 potongan yang benar sudah diambil lalu dibuang oleh ambang; di kasus 3 filter membuangnya sebelum pencarian dimulai."] }],
  },
  specs: {
    en: [{ dl: [["Debugging order", "Check retrieval first (is the answer in any retrieved chunk?), then the prompt, then the model. Most RAG failures are retrieval failures."], ["Logging", "Log every stage's output, as the Monitor does. Without it, case 3 (a silent filter) is almost impossible to find."]] }],
    id: [{ dl: [["Urutan debugging", "Periksa retrieval dulu (apakah jawaban ada di potongan yang diambil?), lalu prompt, lalu model. Sebagian besar kegagalan RAG adalah kegagalan retrieval."], ["Logging", "Catat keluaran setiap langkah, seperti Monitor. Tanpanya, kasus 3 (filter yang diam-diam) hampir mustahil ditemukan."]] }],
  },
};


export default {
  n: 22, stages, text, Board,
  controls: [
    { id: "cs", type: "select", default: "0", label: L("Case", "Kasus"), options: CASES.map((c, i) => ({ value: String(i), label: L(`Case ${c.id}: ${c.q.en}`, `Kasus ${c.id}: ${c.q.id}`) })) },
    { id: "guess", type: "select", default: "none", label: L("Your diagnosis", "Diagnosis Anda"), options: [{ value: "none", label: L("— pick a stage —", "— pilih langkah —") }, ...Object.entries(CAUSES).map(([v, label]) => ({ value: v, label }))] },
  ],
  code: [
    { id: "dbg", label: L("Failure clinic (runs here)", "Klinik kegagalan (bisa dijalankan)"), source: pySource, runnable: true, filename: "debug.py" },
    { id: "libs", label: L("Tracing every stage", "Melacak setiap langkah"), source: libSource, runnable: false, filename: "trace_stages.py",
      note: L("Plain Python logging. Langfuse, Phoenix and LangSmith record the same things for you.", "Logging Python biasa. Langfuse, Phoenix, dan LangSmith mencatat hal yang sama untuk Anda.") },
  ],
  python: (c) => ({
    prelude: prelude("rag", "bm25", "fusion", "rewrite"),
    globals: { CASE: +c.inputs.cs, LANG: c.inputs.uiLang, HANDBOOK: HANDBOOK, STOPWORDS: { en: STOPWORDS.en, id: STOPWORDS.id } },
    call: "demo(CASE, LANG, HANDBOOK, STOPWORDS)",
    compare: (res) => {
      const cs = CASES[+c.inputs.cs], b = runCase(cs, c.inputs.uiLang, "broken"), f = runCase(cs, c.inputs.uiLang, "fixed");
      return res.broken === b.ok && res.fixed === f.ok && res.answers[0] === b.answer.text && res.answers[1] === f.answer.text;
    },
  }),
  variables: (c) => [["case", c.cs ? String(c.cs.id) : "—"], ["broken ok", c.broken ? String(c.broken.ok) : "—"], ["fixed ok", c.fixed ? String(c.fixed.ok) : "—"]],
  challenges: CASES.map((cs, i) => ({ id: "c" + cs.id, text: L(`Diagnose case ${cs.id} correctly.`, `Diagnosis kasus ${cs.id} dengan benar.`), check: (c) => +c.inputs.cs === i && c.correct === true })),
  quiz: [
    quizQ(L("A RAG answer is wrong. What should you check first?", "Jawaban RAG salah. Apa yang diperiksa pertama?"), [L("Whether the answer is in any retrieved chunk", "Apakah jawabannya ada di potongan yang diambil"), L("The model's temperature", "Temperatur model"), L("The UI", "Tampilan"), L("The API key", "API key")], 0, L("That one check splits retrieval problems from generation problems.", "Satu pemeriksaan itu memisahkan masalah retrieval dari masalah generasi.")),
    quizQ(L("Why change only one thing at a time?", "Mengapa hanya mengubah satu hal setiap kali?"), [L("So you know which change helped", "Agar tahu perubahan mana yang membantu"), L("It's faster", "Lebih cepat"), L("The engine requires it", "Mesin mengharuskannya"), L("No reason", "Tanpa alasan")], 0, L("Several changes at once make the result impossible to explain.", "Beberapa perubahan sekaligus membuat hasilnya mustahil dijelaskan.")),
    quizQ(L("The expected answer is in the retrieved chunks, but the answer is still wrong. Which stage is at fault?", "Jawaban yang diharapkan ada di potongan yang diambil, tetapi jawabannya tetap salah. Langkah mana yang bermasalah?"), [L("Generation: the prompt or the model", "Generasi: prompt atau modelnya"), L("Chunking", "Chunking"), L("The metadata filter", "Filter metadata"), L("The embedding model", "Model embedding")], 0, L("Retrieval did its job. Look at the prompt and check the answer claim by claim (lesson 21).", "Retrieval sudah bekerja. Periksa prompt dan cek jawaban klaim demi klaim (pelajaran 21).")),
  ],
};
