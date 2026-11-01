// Lesson 23: hallucination and refusal tuning. Choose the similarity threshold with answerable AND unanswerable questions.
import * as R from "../../rag/retrieval.js";
import { testSetFor, UNANSWERABLE } from "../../rag/testsets.js";
import { L, pct, getIndex, quizQ } from "../shared.js";
import { LineChart } from "../../toolkit/charts.jsx";
import pySource from "./refusal.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const TH = Array.from({ length: 31 }, (_, i) => +(i * 0.02).toFixed(2));

export function sweep(idx, answerable, unanswerable, topK) {
  const a = answerable.map(([q, e]) => { const r = R.rankBy(R.tfidfScores(idx, q)).slice(0, topK); const rel = R.relevantFor(idx.chunks, e); return { top: r[0]?.s || 0, goodScore: Math.max(0, ...r.filter((x) => rel.has(x.i)).map((x) => x.s)) }; });
  const u = unanswerable.map((q) => R.rankBy(R.tfidfScores(idx, q))[0]?.s || 0);
  return TH.map((th) => {
    const answered = a.filter((x) => x.top >= th).length / a.length;
    const correct = a.filter((x) => x.goodScore >= th).length / a.length;
    const refused = u.filter((s) => s < th).length / u.length;
    return { th, answered, correct, refused, balanced: (correct + refused) / 2 };
  });
}

const stages = [
  { id: "questions", label: L("Questions", "Pertanyaan"), desc: L("Two sets: questions the document answers, and questions it can't.", "Dua set: pertanyaan yang dijawab dokumen, dan yang tidak."),
    run: ({ inputs }) => { const ts = testSetFor(inputs.doc); return { ts, un: UNANSWERABLE[inputs.doc.lang] || UNANSWERABLE.en, idx: getIndex(inputs.doc, 40, 8) }; },
    log: (c) => (c.ts ? { text: `${c.ts.items.length} answerable + ${c.un.length} unanswerable` } : { text: "no test set", warn: "build one in lesson 19" }), live: (c) => (c.ts ? `${c.ts.items.length} + ${c.un.length}` : "—") },
  { id: "sweep", label: L("Sweep", "Sapu"), desc: L("For every threshold from 0 to 0.6: which answerable questions still get the right chunk, and which unanswerable ones get refused?", "Untuk setiap ambang dari 0 sampai 0,6: pertanyaan mana yang masih mendapat potongan benar, dan pertanyaan tak terjawab mana yang ditolak?"),
    run: (c) => ({ curve: c.ts ? sweep(c.idx, c.ts.items, c.un, c.inputs.topK) : null }), log: (c) => ({ text: c.curve ? `${c.curve.length} thresholds` : "—" }), live: () => "0 → 0.6" },
  { id: "pick", label: L("Pick", "Pilih"), desc: L("Pick the threshold with the best balance between answering and refusing.", "Pilih ambang dengan keseimbangan terbaik antara menjawab dan menolak."),
    run: (c) => { if (!c.curve) return { best: null, at: null }; const best = [...c.curve].sort((a, b) => b.balanced - a.balanced || a.th - b.th)[0]; const at = c.curve.find((p) => Math.abs(p.th - c.inputs.threshold) < 1e-9) || c.curve[0]; return { best, at }; },
    log: (c) => (c.best ? { text: `best ${c.best.th.toFixed(2)}: correct ${pct(c.best.correct)}, refused ${pct(c.best.refused)}` } : { text: "—" }), live: (c) => (c.best ? c.best.th.toFixed(2) : "—") },
];

function Board({ ctx, tr }) {
  const cv = ctx.curve;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Answer or refuse?", "Menjawab atau menolak?"))}</h2>{ctx.at && <span className="sub">{tr(L("your threshold", "ambang Anda"))} {ctx.inputs.threshold.toFixed(2)}: {tr(L("correct", "benar"))} {pct(ctx.at.correct)} · {tr(L("refused", "ditolak"))} {pct(ctx.at.refused)}</span>}</div>
      <div className="plain">
        {cv ? <>
          <LineChart xLabel={tr(L("minimum similarity", "kemiripan minimum"))} yLabel="%" fmtY={(y) => `${Math.round(y * 100)}%`} fmtX={(x) => x.toFixed(1)}
            series={[{ name: "a", points: cv.map((p) => [p.th, p.correct]) }, { name: "u", cls: "series2", points: cv.map((p) => [p.th, p.refused]) }]}
            best={ctx.best ? Object.assign([ctx.best.th, ctx.best.correct], { label: `${tr(L("best", "terbaik"))} ${ctx.best.th.toFixed(2)}` }) : null} />
          <div className="legend2" style={{ borderTop: 0, padding: "4px 0 0" }}>
            <span><i style={{ background: "var(--accent)" }} />{tr(L("answerable: right chunk still passes", "bisa dijawab: potongan benar masih lolos"))}</span>
            <span><i style={{ background: "var(--query)" }} />{tr(L("unanswerable: correctly refused", "tak bisa dijawab: ditolak dengan benar"))}</span>
          </div>
        </> : <p className="note">{tr(L("Run the Sweep step. Needs a test set (built-in handbook, or yours from lesson 19).", "Jalankan langkah Sapu. Perlu set uji (buku panduan bawaan, atau milik Anda dari pelajaran 19)."))}</p>}
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "A RAG system should answer when the documents contain the answer, and say \"I don't know\" when they don't. The **similarity threshold** (lesson 6) is the dial between the two." },
      { ul: ["Too low: it \"answers\" questions the documents can't support, which invites hallucination.", "Too high: it refuses questions it could have answered."] },
      { p: "You can only set it well by measuring with **both** kinds of questions. The chart shows the trade-off; the marked point is the best balance." }],
    id: [{ p: "Sistem RAG harus menjawab jika dokumen berisi jawabannya, dan berkata \"tidak tahu\" jika tidak. **Ambang kemiripan** (pelajaran 6) adalah pengatur di antara keduanya." },
      { ul: ["Terlalu rendah: sistem \"menjawab\" pertanyaan yang tidak didukung dokumen, membuka peluang halusinasi.", "Terlalu tinggi: sistem menolak pertanyaan yang sebenarnya bisa dijawab."] },
      { p: "Ambang hanya bisa diatur dengan baik dengan mengukur memakai **kedua** jenis pertanyaan. Grafik menunjukkan pertimbangannya; titik yang ditandai adalah keseimbangan terbaik." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Where do the lines cross?", "Move your threshold to the crossing point. Every system has to choose a side: in a medical or legal setting you'd rather refuse too often."] }, { exp: ["Neural scores", "Neural similarities are higher across the board (lesson 6), so the right threshold for neural search is a different number. Always re-tune after changing the embedding."] },
      { exp: ["The default is too low", "Leave your threshold at 0.10, the value lesson 6 uses. Every answerable question passes, but only 3 of the 5 unanswerable ones are refused: the other 2 would get a confident answer built from unrelated chunks."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Di mana garisnya berpotongan?", "Pindahkan ambang Anda ke titik potong. Setiap sistem harus memilih sisi: di bidang medis atau hukum lebih baik terlalu sering menolak."] }, { exp: ["Skor neural", "Kemiripan neural lebih tinggi secara umum (pelajaran 6), jadi ambang yang tepat untuk pencarian neural adalah angka lain. Selalu setel ulang setelah mengganti embedding."] },
      { exp: ["Nilai bawaan terlalu rendah", "Biarkan ambang Anda di 0,10, nilai yang dipakai pelajaran 6. Semua pertanyaan yang bisa dijawab lolos, tetapi hanya 3 dari 5 pertanyaan tak terjawab yang ditolak: 2 lainnya akan mendapat jawaban meyakinkan dari potongan yang tidak berhubungan."] }],
  },
  specs: {
    en: [{ dl: [["Answerable, correct", "The best-scoring chunk that contains the expected phrase is within top-k and above the threshold."], ["Unanswerable, refused", "The best chunk's score is below the threshold."], ["Balanced", "Average of the two rates; the best point maximises it (ties: lower threshold)."]] }],
    id: [{ dl: [["Bisa dijawab, benar", "Potongan berskor tertinggi yang berisi frasa yang diharapkan ada di top-k dan di atas ambang."], ["Tak bisa dijawab, ditolak", "Skor potongan terbaik di bawah ambang."], ["Seimbang", "Rata-rata kedua tingkat; titik terbaik memaksimalkannya (jika sama: ambang lebih rendah)."]] }],
  },
};


export default {
  n: 23, stages, text, Board,
  controls: [{ id: "threshold", label: L("Your threshold", "Ambang Anda"), min: 0, max: 0.6, step: 0.02, default: 0.1, format: (v) => v.toFixed(2) }, { id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 5, step: 1, default: 3 }],
  inputs: { document: true },
  code: [
    { id: "th", label: L("Threshold sweep (runs here)", "Sapu ambang (bisa dijalankan)"), source: pySource, runnable: true, filename: "refusal.py" },
    { id: "libs", label: L("Neural scores, with libraries", "Skor neural, dengan pustaka"), source: libSource, runnable: false, filename: "refusal_neural.py",
      note: L("Runs on your computer after: pip install sentence-transformers numpy", "Jalankan di komputer Anda setelah: pip install sentence-transformers numpy") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, ts = testSetFor(doc), un = UNANSWERABLE[lang] || UNANSWERABLE.en;
    return {
      prelude: prelude("rag", "bm25"),
      globals: { DOCUMENT: doc.text, ANSWERABLE: ts ? ts.items : [], UNANSWERABLE: un, LANG: lang, STOPWORDS: stopList(lang), TOP_K: I.topK, THRESHOLD: I.threshold },
      call: "demo(DOCUMENT, [tuple(t) for t in ANSWERABLE], UNANSWERABLE, LANG, STOPWORDS, TOP_K, THRESHOLD)",
      compare: ts ? (res) => {
        const cv = sweep(getIndex(doc, 40, 8), ts.items, un, I.topK), best = [...cv].sort((a, b) => b.balanced - a.balanced || a.th - b.th)[0];
        return Math.abs(res.best - best.th) < 1e-9 && cv.every((p, i) => Math.abs(res.curve[i][0] - p.correct) < 1e-9 && Math.abs(res.curve[i][1] - p.refused) < 1e-9);
      } : null,
    };
  },
  variables: (c) => [["best", c.best ? c.best.th.toFixed(2) : "—"]],
  challenges: [
    { id: "best", text: L("Set your threshold to the best balanced point.", "Atur ambang Anda ke titik seimbang terbaik."), check: (c) => c.best && Math.abs(c.inputs.threshold - c.best.th) < 1e-9 },
    { id: "safe", text: L("Find a threshold that refuses every unanswerable question.", "Temukan ambang yang menolak semua pertanyaan tak terjawab."), check: (c) => c.at && c.at.refused === 1 },
    { id: "both", text: L("Find a threshold where at least 90% of answerable questions keep the right chunk AND every unanswerable question is refused.", "Temukan ambang di mana paling sedikit 90% pertanyaan yang bisa dijawab tetap mendapat potongan benar DAN semua pertanyaan tak terjawab ditolak."), check: (c) => c.at && c.at.correct >= 0.9 && c.at.refused === 1 },
  ],
  quiz: [
    quizQ(L("What happens when the threshold is too low?", "Apa yang terjadi jika ambang terlalu rendah?"), [L("The system answers questions the documents can't support", "Sistem menjawab pertanyaan yang tidak didukung dokumen"), L("It refuses everything", "Menolak semuanya"), L("Retrieval gets slower", "Retrieval melambat"), L("Nothing", "Tidak ada")], 0, L("Weak matches get through and the model fills the gap.", "Kecocokan lemah lolos dan model mengisi celahnya.")),
    quizQ(L("Why do you need unanswerable questions to tune the threshold?", "Mengapa perlu pertanyaan tak terjawab untuk menyetel ambang?"), [L("Without them, the lowest threshold always looks best", "Tanpanya, ambang terendah selalu tampak terbaik"), L("They make the test faster", "Membuat uji lebih cepat"), L("The chart needs two lines", "Grafik butuh dua garis"), L("You don't", "Tidak perlu")], 0, L("Only answerable questions reward answering everything.", "Pertanyaan yang bisa dijawab saja memberi nilai untuk menjawab semuanya.")),
    quizQ(L("You switch from TF-IDF to neural embeddings. What happens to the threshold you tuned?", "Anda beralih dari TF-IDF ke embedding neural. Apa yang terjadi pada ambang yang sudah Anda setel?"), [L("Tune it again: the scores live on a different scale", "Setel ulang: skornya berada di skala berbeda"), L("Keep it: thresholds don't depend on the model", "Pertahankan: ambang tidak bergantung pada model"), L("Set it to 0", "Atur ke 0"), L("Double it", "Gandakan")], 0, L("Every embedding model spreads its similarity scores differently, so a threshold only means something for the model it was tuned with.", "Setiap model embedding menyebarkan skor kemiripannya secara berbeda, sehingga ambang hanya bermakna untuk model tempat ia disetel.")),
  ],
};
