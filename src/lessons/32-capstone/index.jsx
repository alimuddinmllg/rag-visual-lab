// Lesson 32: capstone. The whole pipeline on the learner's own document, measured on their own test set,
// with a downloadable report and the complete project as a notebook. Twin: ./capstone.py
import * as rag from "../../rag/core.js";
import * as R from "../../rag/retrieval.js";
import { testSetFor } from "../../rag/testsets.js";
import { L, pct, getIndex, bm25Rank, quizQ } from "../shared.js";
import { BarList } from "../../toolkit/charts.jsx";
import { prelude, stopList } from "../prelude.js";
import pySource from "./capstone.py?raw";
import libSource from "./with_libraries.py?raw";

const EXAMPLES = {
  en: ["How much does PLA printing cost?", "Can the drone kit leave the lab?", "What is the capital of France?"],
  id: ["Berapa biaya cetak PLA?", "Apakah kit drone boleh dibawa keluar lab?", "Apa ibu kota Prancis?"],
};

export function ranking(idx, q, retriever) {
  const v = R.rankBy(R.tfidfScores(idx, q)).map((x) => x.i);
  if (retriever === "tfidf") return v;
  const b = bm25Rank(idx, q).map((x) => x.i);
  return retriever === "bm25" ? b : R.rrf([bm25Rank(idx, q), R.rankBy(R.tfidfScores(idx, q))]).map((x) => x.i);
}
export function evaluate(tests, retriever, k, idx) {
  const per = tests.map(([q, e]) => {
    const order = ranking(idx, q, retriever), m = R.metricsAt(order.map((i) => ({ i })), R.relevantFor(idx.chunks, e), k);
    return { q, hit: m.precision > 0, rr: m.rr, ndcg: m.ndcg };
  });
  const n = Math.max(1, per.length), sum = (f) => per.reduce((a, p) => a + f(p), 0);
  return { hit: sum((p) => (p.hit ? 1 : 0)) / n, mrr: sum((p) => p.rr) / n, ndcg: sum((p) => p.ndcg) / n, per };
}
function answer(q, retriever, k, minSim, idx) {
  const qt = rag.tokenize(q, idx.stop, idx.lang), known = [...new Set(qt.filter((t) => idx.tfidf.idf.has(t)))];
  const qv = rag.vectorize(qt, idx.tfidf.idf), cos = idx.tfidf.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
  const used = ranking(idx, q, retriever).slice(0, k).filter((i) => cos[i] >= minSim && known.length).map((i) => ({ i, s: cos[i] }));
  return { used, answer: rag.extractAnswer(used, idx.chunks, known, idx.tfidf.idf, idx.stop, idx.lang) };
}

const stages = [
  { id: "load", label: L("Load", "Muat"), desc: L("Your document: pick it in the document box (upload or paste in any lesson).", "Dokumen Anda: pilih di kotak dokumen (unggah atau tempel di pelajaran mana pun)."),
    run: ({ inputs }) => { const p = rag.parseDocument(inputs.doc.text); return { nSections: p.sections.length, nWords: p.words.length }; },
    log: (c) => ({ text: `${c.nWords} words, ${c.nSections} section(s)` }), live: (c) => `${c.nWords} words` },
  { id: "chunk", label: L("Chunk", "Potong"), desc: L("Cut it into chunks of the size you chose (lessons 8–9).", "Potong menjadi potongan berukuran pilihan Anda (pelajaran 8–9)."),
    run: (c) => ({ idx: getIndex(c.inputs.doc, c.inputs.size, 8) }), log: (c) => ({ text: `${c.idx.chunks.length} chunks` }), live: (c) => `${c.idx.chunks.length} chunks` },
  { id: "index", label: L("Index", "Indeks"), desc: L("TF-IDF vectors and BM25 statistics, ready for any of the three retrievers (lessons 6, 13, 14).", "Vektor TF-IDF dan statistik BM25, siap untuk ketiga retriever (pelajaran 6, 13, 14)."),
    run: (c) => ({ terms: c.idx.tfidf.vocab.length }), log: (c) => ({ text: `${c.terms} terms` }), live: (c) => `${c.terms} terms` },
  { id: "evaluate", label: L("Evaluate", "Evaluasi"), desc: L("Score retrieval on your test set (lessons 19–20). No test set yet? Make one in lesson 19.", "Nilai retrieval pada set uji Anda (pelajaran 19–20). Belum punya? Buat di pelajaran 19."),
    run: (c) => { const ts = testSetFor(c.inputs.doc); return { ts, ev: ts ? evaluate(ts.items, c.inputs.retriever, c.inputs.k, c.idx) : null }; },
    log: (c) => (c.ev ? { text: `hit@${c.inputs.k} ${pct(c.ev.hit)}, MRR ${c.ev.mrr.toFixed(2)}`, warn: c.ev.hit < 0.8 ? "below 80%" : null } : { text: "no test set", warn: "make one in lesson 19" }), live: (c) => (c.ev ? pct(c.ev.hit) : "no test set") },
  { id: "answer", label: L("Answer", "Jawab"), desc: L("Answer your question with citations, or refuse when no chunk is close enough (lesson 23).", "Jawab pertanyaan Anda dengan sitasi, atau tolak jika tidak ada potongan yang cukup dekat (pelajaran 23)."),
    run: (c) => { const a = answer(c.inputs.question || "", c.inputs.retriever, c.inputs.k, c.inputs.minSim, c.idx); return { used: a.used, answer: a.answer }; },
    log: (c) => ({ text: c.answer.text.slice(0, 90), warn: c.answer.grounded ? null : "refused" }), live: (c) => (c.answer.grounded ? `${c.used.length} source(s)` : "refused") },
  { id: "report", label: L("Report", "Laporan"), desc: L("Everything above in one page you can download, plus the full project as a notebook (Code tab).", "Semua di atas dalam satu halaman yang bisa diunduh, ditambah seluruh proyek sebagai notebook (tab Kode)."),
    run: () => ({ reported: true }), log: () => ({ text: "report ready" }), live: () => "ready" },
];

function reportMd(ctx, tr) {
  const I = ctx.inputs, T = (en, id) => tr(L(en, id));
  const lines = [`# ${T("RAG report", "Laporan RAG")}: ${I.doc.name || I.doc.id}`, "", `## ${T("Setup", "Pengaturan")}`,
    `- ${T("Document", "Dokumen")}: ${ctx.nWords} ${T("words", "kata")}, ${ctx.nSections} ${T("sections", "bagian")}`,
    `- ${T("Chunks", "Potongan")}: ${ctx.idx.chunks.length} × ${I.size} ${T("words, overlap 8", "kata, overlap 8")}`,
    `- ${T("Retriever", "Retriever")}: ${I.retriever}, top-k ${I.k}, ${T("refuse below cosine", "tolak di bawah cosine")} ${I.minSim}`, "", `## ${T("Evaluation", "Evaluasi")}`];
  if (ctx.ev) {
    lines.push(`${ctx.ts.items.length} ${T("test questions", "pertanyaan uji")} (${ctx.ts.source}): hit@${I.k} ${pct(ctx.ev.hit)}, MRR ${ctx.ev.mrr.toFixed(2)}, nDCG@${I.k} ${ctx.ev.ndcg.toFixed(2)}`, "", `| ${T("Question", "Pertanyaan")} | hit@${I.k} | RR |`, "|---|---|---|");
    for (const p of ctx.ev.per) lines.push(`| ${p.q.replace(/\|/g, "/")} | ${p.hit ? "✓" : "✗"} | ${p.rr.toFixed(2)} |`);
  } else lines.push(T("No test set yet: make one in lesson 19.", "Belum ada set uji: buat di pelajaran 19."));
  lines.push("", `## ${T("Sample answer", "Contoh jawaban")}`, `**Q:** ${I.question}`, "", `**A:** ${ctx.answer.text}`, "");
  ctx.used.forEach((x, r) => lines.push(`[${r + 1}] ${ctx.idx.chunks[x.i].text}`, ""));
  lines.push("---", T("Made with NalarNusa RAG Visual Lab, lesson 32.", "Dibuat dengan NalarNusa RAG Visual Lab, pelajaran 32."));
  return lines.join("\n");
}

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, I = ctx.inputs, T = (en, id) => tr(L(en, id));
  const download = () => {
    const blob = new Blob([reportMd(ctx, tr)], { type: "text/markdown" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `rag-report-${I.doc.id}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="card board">
      <div className="card-h"><h2>{T("Your RAG, measured", "RAG Anda, terukur")}</h2><span className="sub">{I.doc.user ? T("your document", "dokumen Anda") : T("sample document: pick your own above", "dokumen contoh: pilih milik Anda di atas")}</span></div>
      <div className="plain" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {[[T("words", "kata"), ctx.nWords], [T("sections", "bagian"), ctx.nSections], [T("chunks", "potongan"), ctx.idx?.chunks.length], [T("terms", "istilah"), ctx.terms]].map(([k, v]) =>
          <div key={k} className="colcard"><h4 style={{ fontSize: 11 }}>{k}</h4><b style={{ fontSize: 20 }}>{v ?? "…"}</b></div>)}
      </div>
      <div className="split">
        <div className="plain">
          <h4 style={{ margin: "0 0 6px" }}>{T("Retrieval on your test set", "Retrieval pada set uji Anda")}</h4>
          {ph < 4 ? <p className="note">{T("Run to the Evaluate step.", "Jalankan sampai langkah Evaluasi.")}</p>
            : ctx.ev ? <>
              <BarList items={[{ label: `hit@${I.k}`, value: ctx.ev.hit, hl: true }, { label: "MRR", value: ctx.ev.mrr }, { label: `nDCG@${I.k}`, value: ctx.ev.ndcg }]} />
              <p className="sub" style={{ margin: "6px 0" }}>{ctx.ts.items.length} {T("questions", "pertanyaan")} · {ctx.ts.source === "yours" ? T("your test set", "set uji Anda") : T("built-in test set", "set uji bawaan")}</p>
              {ctx.ev.per.filter((p) => !p.hit).length > 0 && <div style={{ fontSize: 12.5 }}><b>{T("Missed", "Meleset")}:</b><ul style={{ margin: "2px 0", paddingLeft: 18 }}>{ctx.ev.per.filter((p) => !p.hit).map((p) => <li key={p.q}>{p.q}</li>)}</ul></div>}
            </> : <p className="note bad">{T("This document has no test set yet. Make one in lesson 19 (it takes five minutes), then come back.", "Dokumen ini belum punya set uji. Buat di pelajaran 19 (hanya lima menit), lalu kembali ke sini.")} <a href="#lesson-19">{T("Go to lesson 19", "Ke pelajaran 19")} →</a></p>}
        </div>
        <div className="plain">
          <h4 style={{ margin: "0 0 6px" }}>{T("Your question", "Pertanyaan Anda")}</h4>
          {ph >= 5 ? <>
            <div style={{ fontSize: 13, marginBottom: 6 }}><b>{I.question}</b></div>
            <div className={`answer${ctx.answer.grounded ? "" : " none"}`}>{ctx.answer.text}</div>
            {ctx.used.map((x, r) => <div key={x.i} className="colcard" style={{ fontSize: 12, marginTop: 6 }}><h4 style={{ fontSize: 11 }}>[{r + 1}] <span className="sub">cos {x.s.toFixed(2)}</span></h4>{ctx.idx.chunks[x.i].text}</div>)}
          </> : <p className="note">{T("Run to the Answer step.", "Jalankan sampai langkah Jawab.")}</p>}
        </div>
      </div>
      {ph >= 6 && <div className="plain" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn primary" onClick={download}>{T("Download report (.md)", "Unduh laporan (.md)")}</button>
        <span className="note" style={{ margin: 0 }}>{T("For the whole project as code, open the Code tab and press Download notebook or Open in Colab.", "Untuk seluruh proyek sebagai kode, buka tab Kode lalu tekan Unduh notebook atau Buka di Colab.")}</span>
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Time to build your own. This lesson is the whole pipeline from the course, on **your** document, measured on **your** test set, with the settings **you** chose by measuring." },
      { h: "Checklist" },
      { ol: ["Pick your document in the document box (upload or paste: it stays in your browser).", "Make a test set for it in **lesson 19**: 5–10 questions, each with the phrase the right chunk must contain.", "Come back and choose the retriever, chunk size and top-k that score best. Change one thing at a time.", "Ask an out-of-scope question and set the refusal threshold so it is refused, while real questions still get answers.", "Download the report, and the notebook from the Code tab: it carries your document and test set, ready for Colab."] },
    ],
    id: [
      { p: "Saatnya membangun milik Anda sendiri. Pelajaran ini adalah seluruh pipeline dari kursus, pada dokumen **Anda**, diukur dengan set uji **Anda**, dengan pengaturan yang **Anda** pilih lewat pengukuran." },
      { h: "Daftar periksa" },
      { ol: ["Pilih dokumen Anda di kotak dokumen (unggah atau tempel: tetap di peramban Anda).", "Buat set uji di **pelajaran 19**: 5–10 pertanyaan, masing-masing dengan frasa yang harus ada di potongan yang benar.", "Kembali ke sini dan pilih retriever, ukuran potongan, dan top-k yang nilainya terbaik. Ubah satu hal setiap kali.", "Ajukan pertanyaan di luar cakupan dan atur ambang penolakan agar ditolak, sementara pertanyaan sungguhan tetap dijawab.", "Unduh laporannya, dan notebook dari tab Kode: berisi dokumen dan set uji Anda, siap untuk Colab."] },
    ],
  },
  experiments: {
    en: [{ h: "What to try" },
      { exp: ["Pick by measuring", "Try all three retrievers at the same chunk size. Keep the one with the best hit@k and MRR, then tune the chunk size."] },
      { exp: ["Read the misses", "Each missed question tells you something: the answer is split across chunks (bigger chunks), the words differ (hybrid), or the test phrase is wrong (fix the test set)."] },
      { exp: ["Then go further", "Level 5 showed what comes next: neural embeddings (header switch), an index at scale (25), syncing (26), budgets (27), tables and images (28), graphs (29), agents (30) and monitoring (31)."] }],
    id: [{ h: "Yang bisa dicoba" },
      { exp: ["Pilih dengan mengukur", "Coba ketiga retriever pada ukuran potongan yang sama. Pertahankan yang hit@k dan MRR-nya terbaik, lalu setel ukuran potongannya."] },
      { exp: ["Baca yang meleset", "Setiap pertanyaan yang meleset memberi tahu sesuatu: jawabannya terbelah antar potongan (potongan lebih besar), kata-katanya berbeda (hibrida), atau frasa ujinya salah (perbaiki set uji)."] },
      { exp: ["Lalu melangkah lebih jauh", "Level 5 menunjukkan langkah berikutnya: embedding neural (tombol di header), indeks berskala (25), sinkronisasi (26), anggaran (27), tabel dan gambar (28), graf (29), agen (30), dan pemantauan (31)."] }],
  },
  specs: {
    en: [{ dl: [["Retrievers", "tfidf (lesson 6), bm25 (13), hybrid with reciprocal rank fusion (14)."], ["Metrics", "hit@k = a relevant chunk is in the top k; MRR and nDCG from lesson 20."], ["Refusal", "If no chunk in the top k reaches the cosine threshold, the answer is \"I don't know\" (lesson 23)."], ["Privacy", "Your document and test set stay in this browser. The notebook you download contains them, so share it with care."]] }],
    id: [{ dl: [["Retriever", "tfidf (pelajaran 6), bm25 (13), hibrida dengan reciprocal rank fusion (14)."], ["Metrik", "hit@k = ada potongan relevan di top k; MRR dan nDCG dari pelajaran 20."], ["Penolakan", "Jika tidak ada potongan di top k yang mencapai ambang cosine, jawabannya \"Saya tidak tahu\" (pelajaran 23)."], ["Privasi", "Dokumen dan set uji Anda tetap di peramban ini. Notebook yang Anda unduh berisi keduanya, jadi bagikan dengan hati-hati."]] }],
  },
};

export default {
  n: 32, stages, text, Board,
  inputs: { document: true, question: true },
  defaultQuestion: { en: EXAMPLES.en[0], id: EXAMPLES.id[0] },
  examples: EXAMPLES,
  controls: [
    { id: "retriever", type: "select", default: "hybrid", label: L("Retriever", "Retriever"), options: [{ value: "tfidf", label: L("TF-IDF", "TF-IDF") }, { value: "bm25", label: L("BM25", "BM25") }, { value: "hybrid", label: L("Hybrid (RRF)", "Hibrida (RRF)") }] },
    { id: "size", label: L("Chunk size (words)", "Ukuran potongan (kata)"), min: 20, max: 200, step: 10, default: 60 },
    { id: "k", label: L("Top-k", "Top-k"), min: 1, max: 8, step: 1, default: 3 },
    { id: "minSim", label: L("Refuse below cosine", "Tolak di bawah cosine"), min: 0, max: 0.5, step: 0.05, default: 0.1, format: (v) => v.toFixed(2) },
  ],
  code: [
    { id: "cap", label: L("Your whole RAG (runs here)", "Seluruh RAG Anda (bisa dijalankan)"), source: pySource, runnable: true, filename: "capstone.py" },
    { id: "libs", label: L("The same project with libraries", "Proyek yang sama dengan library"), source: libSource, runnable: false, filename: "capstone_libraries.py", note: L("Runs on your computer after: pip install sentence-transformers rank-bm25 numpy openai", "Jalankan di komputer Anda setelah: pip install sentence-transformers rank-bm25 numpy openai") },
  ],
  variables: (c) => [["chunks", c.idx ? String(c.idx.chunks.length) : "—"], ["hit@k", c.ev ? pct(c.ev.hit) : "—"], ["used", c.used ? JSON.stringify(c.used.map((x) => x.i)) : "—"]],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, ts = testSetFor(doc);
    return {
      prelude: prelude("rag", "bm25", "fusion", "metrics"),
      globals: { DOCUMENT: doc.text, TESTS: ts ? ts.items : [], QUESTION: I.question || "", RETRIEVER: I.retriever, SIZE: I.size, K: I.k, MIN_SIM: I.minSim, LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(DOCUMENT, [tuple(t) for t in TESTS], QUESTION, RETRIEVER, SIZE, K, MIN_SIM, LANG, STOPWORDS)",
      compare: (res) => {
        const idx = getIndex(doc, I.size, 8), ev = ts ? evaluate(ts.items, I.retriever, I.k, idx) : null, a = answer(I.question || "", I.retriever, I.k, I.minSim, idx);
        const close = (x, y) => Math.abs(x - y) < 1e-9;
        const evOk = !ev ? res.eval == null : res.eval && close(res.eval.hit, ev.hit) && close(res.eval.mrr, ev.mrr) && close(res.eval.ndcg, ev.ndcg) && res.eval.per.every((p, i) => p.hit === ev.per[i].hit);
        return res.chunks === idx.chunks.length && res.terms === idx.tfidf.vocab.length && evOk && JSON.stringify(res.used) === JSON.stringify(a.used.map((x) => x.i)) && res.answer === a.answer.text;
      },
    };
  },
  challenges: [
    { id: "own", text: L("Run the capstone on your own document.", "Jalankan proyek akhir pada dokumen Anda sendiri."), check: (c) => c.inputs.doc.user && c.idx },
    { id: "score", text: L("Reach hit@k of 90% or more on a test set, with top-k of 3 or less.", "Capai hit@k 90% atau lebih pada set uji, dengan top-k 3 atau kurang."), check: (c) => c.ev && c.ev.hit >= 0.9 && c.inputs.k <= 3 },
    { id: "refuse", text: L("Get an out-of-scope question refused while your test set still scores 80% or more.", "Buat pertanyaan di luar cakupan ditolak sementara set uji Anda tetap bernilai 80% atau lebih."), check: (c) => c.answer && !c.answer.grounded && c.ev && c.ev.hit >= 0.8 },
  ],
  quiz: [
    quizQ(L("You changed the chunk size and the retriever at once, and hit@k went up. What do you know?", "Anda mengubah ukuran potongan dan retriever sekaligus, dan hit@k naik. Apa yang Anda ketahui?"), [L("Not which change helped: change one thing at a time", "Tidak tahu perubahan mana yang membantu: ubah satu hal setiap kali"), L("Both changes helped", "Keduanya membantu"), L("The retriever helped", "Retriever yang membantu"), L("The chunk size helped", "Ukuran potongan yang membantu")], 0, L("One change per run keeps your conclusions honest.", "Satu perubahan per percobaan menjaga kesimpulan Anda tetap jujur.")),
    quizQ(L("A test question keeps missing. What do you check first?", "Satu pertanyaan uji terus meleset. Apa yang diperiksa lebih dulu?"), [L("Whether its expected phrase really appears in one chunk", "Apakah frasa yang diharapkan benar-benar ada di satu potongan"), L("The model's temperature", "Temperatur model"), L("The browser", "Peramban"), L("The number of quiz questions", "Jumlah soal kuis")], 0, L("A phrase split by a chunk boundary can never be found; fix the test or the chunk size.", "Frasa yang terbelah batas potongan tidak akan pernah ditemukan; perbaiki uji atau ukuran potongannya.")),
    quizQ(L("What should a RAG report always include?", "Apa yang harus selalu ada di laporan RAG?"), [L("The settings, the test set results, and example answers with their sources", "Pengaturan, hasil set uji, dan contoh jawaban beserta sumbernya"), L("Only the best answer", "Hanya jawaban terbaik"), L("The model's name", "Nama modelnya"), L("A screenshot", "Tangkapan layar")], 0, L("Someone else should be able to repeat your numbers.", "Orang lain harus bisa mengulang angka-angka Anda.")),
  ],
};
