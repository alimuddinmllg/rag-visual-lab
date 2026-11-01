// Lesson 14: hybrid search. Fuse keyword and vector rankings with reciprocal rank fusion (RRF).
import * as R from "../../rag/retrieval.js";
import { testSetFor } from "../../rag/testsets.js";
import { L, pct, getIndex, useNeuralForIndex, vectorRank, bm25Rank, hitAt, vectorMethodControl, quizQ } from "../shared.js";
import RankLists from "../../toolkit/RankLists.jsx";
import { BarList } from "../../toolkit/charts.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import pySource from "./fusion.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const PARA = { "nusabot-en": R.PARAPHRASES.en, "nusabot-id": R.PARAPHRASES.id };
const evalSet = (doc) => { const ts = testSetFor(doc); return [...(ts ? ts.items : []), ...(PARA[doc.id] || [])]; };

const stages = [
  { id: "keyword", label: L("Keyword", "Kata kunci"), desc: L("Rank chunks with BM25 (lesson 13).", "Urutkan potongan dengan BM25 (pelajaran 13)."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, 40, 8); return { idx, chunks: idx.chunks, bm: bm25Rank(idx, inputs.question || "") }; },
    log: (c) => ({ text: c.bm.slice(0, 3).map((x) => `#${x.i + 1}`).join(" ") }), live: (c) => `#${c.bm[0].i + 1}` },
  { id: "vector", label: L("Vector", "Vektor"), desc: L("Rank the same chunks with vector similarity.", "Urutkan potongan yang sama dengan kemiripan vektor."),
    run: (c) => { const v = vectorRank(c.idx, c.inputs.question || "", c.inputs.neural); return { vec: v.rank, vmethod: v.method }; },
    log: (c) => ({ text: `${c.vmethod}: ` + c.vec.slice(0, 3).map((x) => `#${x.i + 1}`).join(" ") }), live: (c) => `${c.vmethod} #${c.vec[0].i + 1}` },
  { id: "fuse", label: L("Fuse (RRF)", "Gabung (RRF)"), desc: L("Each list votes 1 / (k + rank) for its chunks. Chunks both lists like rise to the top. Raw scores are ignored, so BM25 and cosine never need the same scale.", "Setiap daftar memberi suara 1 / (k + peringkat). Potongan yang disukai kedua daftar naik ke atas. Skor mentah diabaikan, jadi BM25 dan cosine tidak perlu berskala sama."),
    run: (c) => ({ fused: R.rrf([c.bm, c.vec], c.inputs.rrfK) }), log: (c) => ({ text: c.fused.slice(0, 3).map((x) => `#${x.i + 1} ${x.s.toFixed(4)}`).join(", ") }), live: (c) => `#${c.fused[0].i + 1}` },
  { id: "evaluate", label: L("Evaluate", "Evaluasi"), desc: L("Run every test question (plus paraphrased ones for the handbook) through all three and count hits in the top-k.", "Jalankan setiap pertanyaan uji (ditambah parafrasa untuk buku panduan) lewat ketiganya dan hitung yang tepat di top-k."),
    run: (c) => {
      const set = evalSet(c.inputs.doc);
      if (!set.length) return { evaluation: null };
      const k = c.inputs.k, sc = { bm: 0, vec: 0, hyb: 0 };
      for (const [q, e] of set) {
        const rel = R.relevantFor(c.idx.chunks, e);
        const b = bm25Rank(c.idx, q), v = vectorRank(c.idx, q, c.inputs.neural).rank;
        sc.bm += hitAt(b, rel, k); sc.vec += hitAt(v, rel, k); sc.hyb += hitAt(R.rrf([b, v], c.inputs.rrfK), rel, k);
      }
      return { evaluation: { n: set.length, bm: sc.bm / set.length, vec: sc.vec / set.length, hyb: sc.hyb / set.length } };
    },
    log: (c) => (c.evaluation ? { text: `hit@${c.inputs.k}: BM25 ${pct(c.evaluation.bm)} · ${c.vmethod} ${pct(c.evaluation.vec)} · hybrid ${pct(c.evaluation.hyb)}` } : { text: "no test set for this document", warn: "build one in lesson 19" }),
    live: (c) => (c.evaluation ? `hybrid ${pct(c.evaluation.hyb)}` : "no test set") },
];

function Board({ ctx, hover, setHover, tr }) {
  const ev = ctx.evaluation;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Two rankings, fused into one", "Dua peringkat, digabung menjadi satu"))}</h2><span className="sub">RRF k = {ctx.inputs.rrfK}</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      {ctx.bm ? <RankLists chunks={ctx.chunks} hover={hover} onHover={setHover} tr={tr} n={7}
        columns={[{ title: "BM25", items: ctx.bm }, ...(ctx.fused ? [{ title: tr(L("Hybrid (RRF)", "Hibrida (RRF)")), items: ctx.fused, fmt: (v) => v.toFixed(3) }] : []), ...(ctx.vec ? [{ title: `${tr(L("Vector", "Vektor"))} (${ctx.vmethod})`, items: ctx.vec }] : [])]} />
        : <p className="note plain">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      {ctx.evaluation !== undefined && (
        <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
          {ev ? <>
            <p className="note" style={{ marginTop: 0 }}>{tr(L(`Hit rate @${ctx.inputs.k} on ${ev.n} questions`, `Hit rate @${ctx.inputs.k} pada ${ev.n} pertanyaan`))}</p>
            <BarList fmt={pct} items={[{ label: "BM25", value: ev.bm }, { label: ctx.vmethod, value: ev.vec }, { label: tr(L("hybrid", "hibrida")), value: ev.hyb, hl: ev.hyb >= Math.max(ev.bm, ev.vec) }]} />
          </> : <p className="note">{tr(L("No test set for this document. Make one in lesson 19.", "Belum ada set uji untuk dokumen ini. Buat di pelajaran 19."))}</p>}
        </div>
      )}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "**Hybrid search** runs keyword and vector search side by side and merges the results. The usual merge is **reciprocal rank fusion (RRF)**: it looks only at positions, not scores, so it needs no tuning to mix a BM25 score with a cosine similarity." },
      { p: "Hybrid helps when the two searches fail on **different** questions. TF-IDF and BM25 both match words, so on this handbook they fail on the same questions and fusing them changes nothing. Switch the vector side to **Neural** and the gap appears." },
      { h: "Try" }, { ol: ["Press **Play** and read the bar chart with TF-IDF.", "Switch to **Neural** and run again. Which wins now: BM25, neural, or hybrid?"] }],
    id: [{ p: "**Pencarian hibrida** menjalankan pencarian kata kunci dan vektor berdampingan lalu menggabungkan hasilnya. Penggabungan yang umum adalah **reciprocal rank fusion (RRF)**: hanya melihat posisi, bukan skor, sehingga tidak perlu disetel untuk mencampur skor BM25 dengan cosine similarity." },
      { p: "Hibrida membantu jika kedua pencarian gagal pada pertanyaan yang **berbeda**. TF-IDF dan BM25 sama-sama mencocokkan kata, jadi di buku panduan ini keduanya gagal pada pertanyaan yang sama dan penggabungan tidak mengubah apa pun. Ganti sisi vektor ke **Neural** dan perbedaannya muncul." },
      { h: "Coba" }, { ol: ["Tekan **Putar** dan baca grafik batang dengan TF-IDF.", "Ganti ke **Neural** lalu jalankan lagi. Mana yang menang sekarang: BM25, neural, atau hibrida?"] }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Honest result", "With TF-IDF on the handbook the three bars are equal. That is a real finding: fusing two methods that make the same mistakes buys nothing."] }, { exp: ["k", "Small k (1–5) lets the very top of each list dominate; large k (60, the common default) blends deeper."] },
      { exp: ["Paraphrases", "Ask \"What is the price per gram for PLA?\". The handbook says \"cost\", not \"price\": BM25 and TF-IDF both lean on \"PLA\" and \"gram\". With the neural side on, the vector list changes and so does the fused list."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Hasil jujur", "Dengan TF-IDF di buku panduan, ketiga batang sama. Itu temuan nyata: menggabungkan dua metode yang membuat kesalahan sama tidak memberi apa-apa."] }, { exp: ["k", "k kecil (1–5) membuat puncak setiap daftar mendominasi; k besar (60, nilai bawaan umum) mencampur lebih dalam."] },
      { exp: ["Parafrasa", "Tanyakan \"Berapa harga per gram untuk PLA?\". Buku panduan memakai \"biaya\", bukan \"harga\": BM25 dan TF-IDF sama-sama bergantung pada \"PLA\" dan \"gram\". Dengan sisi neural aktif, daftar vektor berubah dan begitu pula daftar gabungan."] }],
  },
  specs: {
    en: [{ dl: [["RRF", "score(chunk) = Σ over lists of 1 / (k + rank). Ranks start at 1."], ["Evaluation set", "The document's test set (built-in, or yours from lesson 19) plus 8 paraphrased questions for the handbook, which use words the handbook doesn't."], ["Alternatives", "Weighted score sums need the scores normalised first; RRF avoids that."]] }],
    id: [{ dl: [["RRF", "skor(potongan) = Σ untuk setiap daftar 1 / (k + peringkat). Peringkat mulai dari 1."], ["Set evaluasi", "Set uji dokumen (bawaan, atau milik Anda dari pelajaran 19) ditambah 8 pertanyaan parafrasa untuk buku panduan, yang memakai kata yang tidak ada di buku panduan."], ["Alternatif", "Penjumlahan skor berbobot perlu skor dinormalisasi dulu; RRF menghindarinya."]] }],
  },
};

export default {
  n: 14, stages, text, Board,
  controls: [{ id: "rrfK", label: L("RRF k", "RRF k"), min: 1, max: 100, step: 1, default: 60 }, { id: "k", label: L("Evaluate top-k", "Evaluasi top-k"), min: 1, max: 5, step: 1, default: 1 }, vectorMethodControl],
  extraValues: { size: 40, overlap: 8 },
  useExtra: (base) => useNeuralForIndex(base, { extraQuestions: PARA[base.doc.id]?.map((x) => x[0]) || [] }),
  inputs: { document: true, question: true },
  defaultQuestion: { en: "What is the price per gram for PLA?", id: "Berapa harga per gram untuk PLA?" },
  examples: { en: ["What is the price per gram for PLA?", "KiCad", "Is the lab open at the weekend?"], id: ["Berapa harga per gram untuk PLA?", "KiCad", "Apakah lab buka akhir pekan?"] },
  code: [
    { id: "rrf", label: L("Hybrid search (runs here)", "Pencarian hibrida (bisa dijalankan)"), source: pySource, runnable: true, filename: "fusion.py" },
    { id: "libs", label: L("With LangChain", "Dengan LangChain"), source: libSource, runnable: false, filename: "hybrid_libraries.py",
      note: L("Runs on your computer after: pip install langchain langchain-community langchain-huggingface rank-bm25 faiss-cpu", "Jalankan di komputer Anda setelah: pip install langchain langchain-community langchain-huggingface rank-bm25 faiss-cpu") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, tests = evalSet(doc);
    return {
      prelude: prelude("rag", "bm25"),
      globals: { DOCUMENT: doc.text, QUESTION: I.question || "", TESTS: tests, LANG: lang, STOPWORDS: stopList(lang), RRF_K: I.rrfK, K: I.k },
      call: "demo(DOCUMENT, QUESTION, [tuple(t) for t in TESTS], LANG, STOPWORDS, RRF_K, K)",
      compare: (res) => {
        const idx = getIndex(doc, 40, 8), q = I.question || "", tf = (x) => R.rankBy(R.tfidfScores(idx, x));
        const fused = R.rrf([bm25Rank(idx, q), tf(q)], I.rrfK).slice(0, 5).map((x) => x.i);
        if (JSON.stringify(res.fused) !== JSON.stringify(fused)) return false;
        if (!tests.length) return res.rates == null;
        const sc = { bm25: 0, vector: 0, hybrid: 0 };
        for (const [tq, e] of tests) {
          const rel = R.relevantFor(idx.chunks, e), b = bm25Rank(idx, tq), v = tf(tq);
          sc.bm25 += hitAt(b, rel, I.k); sc.vector += hitAt(v, rel, I.k); sc.hybrid += hitAt(R.rrf([b, v], I.rrfK), rel, I.k);
        }
        return Object.keys(sc).every((n) => Math.abs(res.rates[n] - sc[n] / tests.length) < 1e-9);
      },
    };
  },
  variables: (c) => [["fused top", c.fused ? c.fused.slice(0, 5).map((x) => x.i).join(", ") : "—"], ["hit rates", c.evaluation ? `${pct(c.evaluation.bm)} / ${pct(c.evaluation.vec)} / ${pct(c.evaluation.hyb)}` : "—"]],
  challenges: [
    { id: "neuralEval", text: L("Evaluate hybrid search with the neural vector side.", "Evaluasi pencarian hibrida dengan sisi vektor neural."), check: (c) => c.vmethod === "neural" && c.evaluation },
    { id: "win", text: L("Find settings where hybrid scores at least as well as both BM25 and vector search, and better than one of them.", "Temukan pengaturan di mana hibrida setidaknya sama baik dengan BM25 dan vektor, dan lebih baik dari salah satunya."), check: (c) => c.evaluation && c.evaluation.hyb >= c.evaluation.bm && c.evaluation.hyb >= c.evaluation.vec && c.evaluation.hyb > Math.min(c.evaluation.bm, c.evaluation.vec) },
    { id: "smallk", text: L("Set RRF k to 5 or less and see whether the fused #1 changes.", "Atur RRF k ke 5 atau kurang dan lihat apakah #1 gabungan berubah."), check: (c) => c.inputs.rrfK <= 5 && c.fused },
  ],
  quiz: [
    quizQ(L("Why does RRF use ranks instead of raw scores?", "Mengapa RRF memakai peringkat, bukan skor mentah?"), [L("BM25 and cosine scores live on different scales", "Skor BM25 dan cosine berada di skala berbeda"), L("Ranks are faster to compute", "Peringkat lebih cepat dihitung"), L("Scores are secret", "Skor dirahasiakan"), L("It doesn't", "Tidak benar")], 0, L("A BM25 score of 4 and a cosine of 0.4 can't be added meaningfully; positions can.", "Skor BM25 4 dan cosine 0,4 tidak bisa dijumlahkan secara bermakna; posisi bisa.")),
    quizQ(L("When does hybrid search help most?", "Kapan pencarian hibrida paling membantu?"), [L("When the two methods fail on different questions", "Saat kedua metode gagal pada pertanyaan yang berbeda"), L("Always by the same amount", "Selalu dengan besar yang sama"), L("When both are word-matching methods", "Saat keduanya metode pencocokan kata"), L("Only on short documents", "Hanya pada dokumen pendek")], 0, L("Fusion can only recover what at least one list found.", "Penggabungan hanya bisa menemukan kembali apa yang ditemukan setidaknya satu daftar.")),
    quizQ(L("Your measurement shows hybrid = BM25 = vector. What do you conclude?", "Pengukuran Anda menunjukkan hibrida = BM25 = vektor. Apa kesimpulannya?"), [L("For this data, the extra complexity buys nothing yet", "Untuk data ini, kerumitan tambahan belum memberi manfaat"), L("Hybrid is broken", "Hibrida rusak"), L("Use hybrid anyway, it's best practice", "Tetap pakai hibrida, itu praktik terbaik"), L("Delete the test set", "Hapus set uji")], 0, L("Measure on your own data before adding moving parts.", "Ukur di data Anda sendiri sebelum menambah komponen.")),
  ],
};
