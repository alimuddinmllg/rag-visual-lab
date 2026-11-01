// Lesson 20: retrieval metrics on a test set: recall@k, precision@k, MRR, nDCG@k.
import * as R from "../../rag/retrieval.js";
import { testSetFor } from "../../rag/testsets.js";
import { L, pct, getIndex, bm25Rank, quizQ } from "../shared.js";
import { BarList } from "../../toolkit/charts.jsx";
import pySource from "./metrics.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

function rank(idx, q, how) {
  const v = R.rankBy(R.tfidfScores(idx, q));
  if (how === "tfidf") return v;
  const b = bm25Rank(idx, q);
  return how === "bm25" ? b : R.rrf([b, v]);
}

const stages = [
  { id: "relevant", label: L("Relevant chunks", "Potongan relevan"), desc: L("For each test question, mark which chunks contain the expected answer phrase.", "Untuk setiap pertanyaan uji, tandai potongan yang berisi frasa jawaban yang diharapkan."),
    run: ({ inputs }) => { const ts = testSetFor(inputs.doc); const idx = getIndex(inputs.doc, inputs.size, 8); return { idx, ts, rel: ts ? ts.items.map(([, e]) => R.relevantFor(idx.chunks, e)) : [] }; },
    log: (c) => (c.ts ? { text: `${c.ts.items.length} questions (${c.ts.source}), ${c.rel.filter((r) => !r.size).length} with no relevant chunk`, warn: c.rel.some((r) => !r.size) ? "some answers are split across chunks" : null } : { text: "no test set", warn: "build one in lesson 19" }),
    live: (c) => (c.ts ? `${c.ts.items.length} questions` : "no test set") },
  { id: "scores", label: L("Rank", "Peringkat"), desc: L("Run every question through the chosen retriever.", "Jalankan setiap pertanyaan lewat retriever yang dipilih."),
    run: (c) => ({ ranks: c.ts ? c.ts.items.map(([q]) => rank(c.idx, q, c.inputs.retriever)) : [] }), log: (c) => ({ text: `${c.inputs.retriever}` }), live: (c) => c.inputs.retriever },
  { id: "recall", label: L("Recall & precision", "Recall & presisi"), desc: L("Recall@k: share of the relevant chunks found in the top k. Precision@k: share of the top k that is relevant.", "Recall@k: bagian potongan relevan yang ditemukan di top k. Presisi@k: bagian top k yang relevan."),
    run: (c) => ({ per: c.ranks.map((r, i) => R.metricsAt(r, c.rel[i], c.inputs.k)) }), log: (c) => ({ text: `recall@${c.inputs.k} ${pct(R.mean(c.per.map((m) => m.recall)))} · precision@${c.inputs.k} ${pct(R.mean(c.per.map((m) => m.precision)))}` }), live: (c) => pct(R.mean(c.per.map((m) => m.recall))) },
  { id: "mrr", label: "MRR", desc: L("Reciprocal rank: 1 if the first relevant chunk is #1, ½ if #2, ⅓ if #3… averaged over questions.", "Reciprocal rank: 1 jika potongan relevan pertama di #1, ½ jika #2, ⅓ jika #3… dirata-rata atas pertanyaan."),
    run: (c) => ({ mrr: R.mean(c.per.map((m) => m.rr)) }), log: (c) => ({ text: `MRR ${c.mrr.toFixed(2)}` }), live: (c) => c.mrr.toFixed(2) },
  { id: "ndcg", label: "nDCG", desc: L("nDCG@k rewards relevant chunks near the top more than lower down, compared with the best possible order.", "nDCG@k memberi nilai lebih untuk potongan relevan di dekat puncak, dibandingkan dengan urutan terbaik yang mungkin."),
    run: (c) => ({ ndcg: R.mean(c.per.map((m) => m.ndcg)) }), log: (c) => ({ text: `nDCG@${c.inputs.k} ${c.ndcg.toFixed(2)}` }), live: (c) => c.ndcg.toFixed(2) },
];

function Board({ ctx, runner, tr }) {
  if (ctx.ts === null) return <div className="card board"><div className="card-h"><h2>{tr(L("Retrieval scorecard", "Rapor retrieval"))}</h2></div><p className="note plain">{tr(L("This document has no test set yet. Build one in lesson 19, or pick the built-in handbook.", "Dokumen ini belum punya set uji. Buat di pelajaran 19, atau pilih buku panduan bawaan."))}</p></div>;
  const per = ctx.per || [];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Retrieval scorecard", "Rapor retrieval"))}</h2><span className="sub">{ctx.ts ? `${ctx.ts.items.length} ${tr(L("questions", "pertanyaan"))} · ${ctx.ts.source}` : ""}</span></div>
      <div className="split">
        <div className="plain">
          {per.length ? <BarList fmt={(v) => v.toFixed(2)} items={[
            { label: `recall@${ctx.inputs.k}`, value: R.mean(per.map((m) => m.recall)) }, { label: `precision@${ctx.inputs.k}`, value: R.mean(per.map((m) => m.precision)) },
            ...(ctx.mrr != null ? [{ label: "MRR", value: ctx.mrr }] : []), ...(ctx.ndcg != null ? [{ label: `nDCG@${ctx.inputs.k}`, value: ctx.ndcg, hl: true }] : [])]} /> : <p className="note">{tr(L("Run to the Recall step.", "Jalankan sampai langkah Recall."))}</p>}
        </div>
        <div className="plain" style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
            <thead><tr style={{ color: "var(--muted)" }}><th style={{ textAlign: "left" }}>{tr(L("question", "pertanyaan"))}</th><th>{tr(L("first hit", "tepat pertama"))}</th></tr></thead>
            <tbody>{ctx.ts?.items.map(([q], i) => { const m = per[i]; const r = m?.firstRank; return (
              <tr key={i} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: "3px 6px 3px 0" }}>{q}</td>
                <td className="mono" style={{ textAlign: "center", color: !m ? "var(--muted)" : r && r <= ctx.inputs.k ? "var(--good)" : "var(--warn)" }}>{!m ? "…" : r ? `#${r}` : "—"}</td></tr>); })}</tbody>
          </table>
        </div>
      </div>
      {runner.phase >= 1 && ctx.rel?.some((r) => !r.size) && <p className="note plain bad" style={{ margin: 0 }}>{tr(L("Some expected phrases appear in no chunk (split by a chunk boundary). Those questions can never score. Try a bigger chunk size.", "Beberapa frasa yang diharapkan tidak ada di potongan mana pun (terbelah batas potongan). Pertanyaan itu tidak akan pernah bernilai. Coba ukuran potongan lebih besar."))}</p>}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Lesson 9 used one number, hit rate. Real evaluations use a few, because they answer different questions:" },
      { ul: ["**Recall@k**: did we find the answer at all within k results? (Missing it is fatal.)", "**Precision@k**: how much of what we send is useful? (Noise costs tokens and confuses the model.)", "**MRR**: how high is the first good result?", "**nDCG@k**: are the good results near the top, compared with the ideal order?"] },
      { p: "Change the retriever, k or chunk size and watch which numbers move. Uses the built-in test set, or yours from lesson 19." }],
    id: [{ p: "Pelajaran 9 memakai satu angka, hit rate. Evaluasi sungguhan memakai beberapa, karena menjawab pertanyaan yang berbeda:" },
      { ul: ["**Recall@k**: apakah jawabannya ditemukan dalam k hasil? (Melewatkannya berakibat fatal.)", "**Presisi@k**: berapa banyak yang dikirim benar-benar berguna? (Gangguan memakan token dan membingungkan model.)", "**MRR**: setinggi apa hasil bagus pertama?", "**nDCG@k**: apakah hasil bagus berada di dekat puncak, dibandingkan urutan ideal?"] },
      { p: "Ganti retriever, k, atau ukuran potongan dan lihat angka mana yang bergerak. Memakai set uji bawaan, atau milik Anda dari pelajaran 19." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Raise k", "Recall goes up; precision goes down. That trade-off is why you can't optimise one number."] }, { exp: ["Retrievers", "Compare TF-IDF, BM25 and hybrid on MRR. Small differences on 10 questions are noise; you need more questions to trust them."] },
      { exp: ["Chunk size moves every metric", "Change the chunk size from 40 to 15. Recall drops for every retriever (on the English handbook from 0.95 to 0.60), yet every answer phrase still sits whole in some chunk: small overlapping chunks repeat each answer in several chunks, and the top 3 cannot hold them all. A metric measures the whole pipeline in front of it, chunking included."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Naikkan k", "Recall naik; presisi turun. Karena itu Anda tidak bisa mengoptimalkan satu angka saja."] }, { exp: ["Retriever", "Bandingkan TF-IDF, BM25, dan hibrida pada MRR. Selisih kecil pada 10 pertanyaan hanyalah kebetulan; Anda butuh lebih banyak pertanyaan untuk mempercayainya."] },
      { exp: ["Ukuran potongan menggeser semua metrik", "Ubah ukuran potongan dari 40 ke 15. Recall turun untuk semua retriever (pada buku panduan Indonesia dari 1,00 ke 0,80), padahal setiap frasa jawaban masih utuh di salah satu potongan: potongan kecil yang tumpang tindih mengulang setiap jawaban di beberapa potongan, dan top 3 tidak bisa memuat semuanya. Metrik mengukur seluruh pipeline di depannya, termasuk chunking."] }],
  },
  specs: {
    en: [{ dl: [["Relevant chunk", "One that contains the expected phrase (case and punctuation ignored)."], ["nDCG", "DCG = Σ rel / log2(rank + 1); divided by the best possible DCG. Binary relevance here."], ["Checked", "These formulas are checked against the Python in the Code tab by npm run golden."]] }],
    id: [{ dl: [["Potongan relevan", "Potongan yang berisi frasa yang diharapkan (huruf besar dan tanda baca diabaikan)."], ["nDCG", "DCG = Σ rel / log2(peringkat + 1); dibagi DCG terbaik yang mungkin. Relevansi biner di sini."], ["Diperiksa", "Rumus-rumus ini dicek terhadap Python di tab Kode oleh npm run golden."]] }],
  },
};

export default {
  n: 20, stages, text, Board,
  controls: [
    { id: "retriever", type: "select", default: "tfidf", label: L("Retriever", "Retriever"), options: [{ value: "tfidf", label: "TF-IDF" }, { value: "bm25", label: "BM25" }, { value: "hybrid", label: L("Hybrid (RRF)", "Hibrida (RRF)") }] },
    { id: "k", label: L("k", "k"), min: 1, max: 8, step: 1, default: 3 },
    { id: "size", label: L("Chunk size", "Ukuran potongan"), min: 15, max: 120, step: 5, default: 40 },
  ],
  inputs: { document: true },
  code: [
    { id: "m", label: L("Metrics (runs here)", "Metrik (bisa dijalankan)"), source: pySource, runnable: true, filename: "metrics.py" },
    { id: "libs", label: L("With ranx", "Dengan ranx"), source: libSource, runnable: false, filename: "metrics_ranx.py",
      note: L("Runs on your computer after: pip install ranx", "Jalankan di komputer Anda setelah: pip install ranx") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, ts = testSetFor(doc), tests = ts ? ts.items : [];
    return {
      prelude: prelude("rag", "bm25", "fusion"),
      globals: { DOCUMENT: doc.text, TESTS: tests, RETRIEVER: I.retriever, K: I.k, SIZE: I.size, LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(DOCUMENT, [tuple(t) for t in TESTS], RETRIEVER, K, SIZE, LANG, STOPWORDS)",
      compare: (res) => {
        const idx = getIndex(doc, I.size, 8);
        const per = tests.map(([q, e]) => R.metricsAt(rank(idx, q, I.retriever), R.relevantFor(idx.chunks, e), I.k));
        return ["recall", "precision", "rr", "ndcg"].every((m) => Math.abs(res[m] - R.mean(per.map((p) => p[m]))) < 1e-9);
      },
    };
  },
  variables: (c) => [["MRR", c.mrr != null ? c.mrr.toFixed(3) : "—"], ["nDCG", c.ndcg != null ? c.ndcg.toFixed(3) : "—"]],
  challenges: [
    { id: "tradeoff", text: L("Raise k to 8 and note what happens to precision.", "Naikkan k ke 8 dan perhatikan apa yang terjadi pada presisi."), check: (c) => c.inputs.k >= 8 && c.per },
    { id: "mrr1", text: L("Find settings with MRR of 0.9 or higher.", "Temukan pengaturan dengan MRR 0,9 atau lebih."), check: (c) => c.mrr >= 0.9 },
    { id: "own", text: L("Score your own test set (from lesson 19).", "Nilai set uji Anda sendiri (dari pelajaran 19)."), check: (c) => c.ts?.source === "yours" && c.ndcg != null },
  ],
  quiz: [
    quizQ(L("Which metric tells you whether the answer was found at all in the top k?", "Metrik mana yang memberi tahu apakah jawaban ditemukan dalam top k?"), [L("Recall@k", "Recall@k"), L("Precision@k", "Presisi@k"), L("Temperature", "Temperatur"), L("Token count", "Jumlah token")], 0, L("Recall is about not missing things.", "Recall tentang tidak melewatkan sesuatu.")),
    quizQ(L("First relevant result at rank 4. Reciprocal rank?", "Hasil relevan pertama di peringkat 4. Reciprocal rank?"), [L("0.25", "0,25"), L("4", "4"), L("0.4", "0,4"), L("1", "1")], 0, L("1 / 4 = 0.25.", "1 / 4 = 0,25.")),
    quizQ(L("Raising k usually…", "Menaikkan k biasanya…"), [L("raises recall and lowers precision", "menaikkan recall dan menurunkan presisi"), L("raises both", "menaikkan keduanya"), L("lowers both", "menurunkan keduanya"), L("changes nothing", "tidak mengubah apa pun")], 0, L("More results catch more answers but include more noise.", "Lebih banyak hasil menangkap lebih banyak jawaban tetapi juga lebih banyak gangguan.")),
  ],
};
