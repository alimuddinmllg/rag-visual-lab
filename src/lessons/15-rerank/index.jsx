// Lesson 15: re-ranking. A second, more careful look at the first stage's top candidates.
import * as R from "../../rag/retrieval.js";
import { dotDense } from "../../rag/neural.js";
import { testSetFor } from "../../rag/testsets.js";
import { L, pct, getIndex, useNeuralForIndex, hitAt, sentencesOf, quizQ } from "../shared.js";
import RankLists from "../../toolkit/RankLists.jsx";
import { BarList } from "../../toolkit/charts.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";

const PARA = { "nusabot-en": R.PARAPHRASES.en, "nusabot-id": R.PARAPHRASES.id };
const pySource = `# NalarNusa RAG Visual Lab · Lesson 15 · Re-ranking with a cross-encoder
# pip install sentence-transformers
from sentence_transformers import CrossEncoder

# @stage first
# candidates = top 10 chunks from a fast first stage (BM25, vectors or hybrid)
# @end

# @stage pairs
reranker = CrossEncoder("cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")   # multilingual
pairs = [(question, chunks[i]["text"]) for i, _ in candidates]
# @end

# @stage score
scores = reranker.predict(pairs)          # reads question and chunk TOGETHER: slower, sharper
# @end

# @stage reorder
reranked = [i for _, (i, _) in sorted(zip(scores, candidates), key=lambda x: -x[0])]
# @end

# @stage evaluate
# compare hit@1 before and after on your test set (lesson 20) before keeping it
# @end
`;

function rerank(idx, q, cands, neural, mode) {
  if (mode === "neural" && neural?.map?.has(q)) {
    const qv = neural.map.get(q);
    return cands.map((c) => {
      let best = -1, bestS = "";
      for (const s of sentencesOf(idx.chunks[c.i].text)) { const v = neural.map.get(s); if (!v) continue; const d = dotDense(qv, v); if (d > best) { best = d; bestS = s; } }
      return { i: c.i, s: best, sentence: bestS };
    }).sort((a, b) => b.s - a.s || a.i - b.i);
  }
  return R.rerankBySentence(idx, q, cands);
}

const stages = [
  { id: "first", label: L("First stage", "Tahap pertama"), desc: L("A fast search (TF-IDF here) picks the top N candidates.", "Pencarian cepat (di sini TF-IDF) memilih N kandidat teratas."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, inputs.size, 0); return { idx, chunks: idx.chunks, first: R.rankBy(R.tfidfScores(idx, inputs.question || "")).slice(0, inputs.n) }; },
    log: (c) => ({ text: `${c.first.length} candidates: ` + c.first.slice(0, 5).map((x) => `#${x.i + 1}`).join(" ") }), live: (c) => `${c.first.length} candidates` },
  { id: "pairs", label: L("Pair up", "Pasangkan"), desc: L("Put the question next to each candidate, sentence by sentence.", "Letakkan pertanyaan di samping setiap kandidat, kalimat demi kalimat."),
    run: (c) => ({ mode: c.inputs.reranker === "neural" && c.inputs.neural?.map ? "neural" : "lexical" }), log: (c) => ({ text: `${c.mode} re-ranker` }), live: (c) => c.mode },
  { id: "score", label: L("Score", "Skor"), desc: L("Score each candidate by its best-matching sentence. A real cross-encoder reads question and chunk together in one neural network.", "Beri skor setiap kandidat dari kalimat yang paling cocok. Cross-encoder sungguhan membaca pertanyaan dan potongan bersama dalam satu jaringan saraf."),
    run: (c) => ({ reranked: rerank(c.idx, c.inputs.question || "", c.first, c.inputs.neural, c.mode) }), log: (c) => ({ text: `best sentence: "${(c.reranked[0]?.sentence || "").slice(0, 70)}"` }), live: (c) => `#${c.reranked[0]?.i + 1}` },
  { id: "reorder", label: L("Re-order", "Urutkan ulang"), desc: L("Sort the candidates by the new score. Lines show who moved.", "Urutkan kandidat dengan skor baru. Garis menunjukkan yang berpindah."),
    run: (c) => ({ moved: c.reranked[0].i !== c.first[0].i }), log: (c) => ({ text: c.moved ? `new #1: #${c.reranked[0].i + 1} (was #${c.first[0].i + 1})` : "same #1" }), live: (c) => (c.moved ? "new #1" : "same #1") },
  { id: "evaluate", label: L("Measure", "Ukur"), desc: L("Does it actually help? Compare hit@1 before and after on the test questions.", "Apakah benar membantu? Bandingkan hit@1 sebelum dan sesudah pada pertanyaan uji."),
    run: (c) => {
      const ts = testSetFor(c.inputs.doc); const set = [...(ts ? ts.items : []), ...(PARA[c.inputs.doc.id] || [])];
      if (!set.length) return { evaluation: null };
      let b = 0, a = 0;
      for (const [q, e] of set) { const rel = R.relevantFor(c.idx.chunks, e); const f = R.rankBy(R.tfidfScores(c.idx, q)).slice(0, c.inputs.n); b += hitAt(f, rel, 1); a += hitAt(rerank(c.idx, q, f, c.inputs.neural, c.mode), rel, 1); }
      return { evaluation: { n: set.length, before: b / set.length, after: a / set.length } };
    },
    log: (c) => (c.evaluation ? { text: `hit@1 ${pct(c.evaluation.before)} → ${pct(c.evaluation.after)}`, warn: c.evaluation.after < c.evaluation.before ? "re-ranking made it worse" : null } : { text: "no test set" }),
    live: (c) => (c.evaluation ? `${pct(c.evaluation.before)} → ${pct(c.evaluation.after)}` : "—") },
];

function Board({ ctx, hover, setHover, tr }) {
  const ev = ctx.evaluation;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Before and after re-ranking", "Sebelum dan sesudah re-ranking"))}</h2><span className="sub">{ctx.mode ? `${ctx.mode} re-ranker` : ""}</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      {ctx.first ? <RankLists chunks={ctx.chunks} hover={hover} onHover={setHover} tr={tr} n={Math.min(8, ctx.first.length)}
        columns={[{ title: tr(L("First stage (TF-IDF)", "Tahap pertama (TF-IDF)")), items: ctx.first }, ...(ctx.reranked ? [{ title: tr(L("Re-ranked", "Setelah re-ranking")), items: ctx.reranked }] : [])]} /> : <p className="note plain">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      {ctx.reranked?.[0]?.sentence && <p className="plain note" style={{ margin: 0 }}>{tr(L("Best-matching sentence:", "Kalimat yang paling cocok:"))} <b>{ctx.reranked[0].sentence}</b></p>}
      {ev && <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="note" style={{ marginTop: 0 }}>hit@1 · {ev.n} {tr(L("questions", "pertanyaan"))}</p>
        <BarList fmt={pct} items={[{ label: tr(L("before", "sebelum")), value: ev.before }, { label: tr(L("after", "sesudah")), value: ev.after, hl: ev.after > ev.before }]} />
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Fast search has to compare the question with millions of chunks, so it looks at each chunk only roughly. **Re-ranking** takes the top 10–50 candidates and looks again, more carefully, with a slower model." },
      { p: "Production systems use a **cross-encoder**: a neural network that reads the question and the chunk together. Here two stand-ins show the idea: a word-level sentence matcher, and a neural sentence matcher." },
      { p: "**Measure before you keep it.** With the word-level matcher on this handbook, the gain is small or even negative: it sees the same words the first stage saw. A re-ranker only helps if it notices something the first stage missed." }],
    id: [{ p: "Pencarian cepat harus membandingkan pertanyaan dengan jutaan potongan, jadi tiap potongan hanya dilihat secara kasar. **Re-ranking** mengambil 10–50 kandidat teratas lalu melihat lagi dengan lebih teliti, memakai model yang lebih lambat." },
      { p: "Sistem produksi memakai **cross-encoder**: jaringan saraf yang membaca pertanyaan dan potongan bersama-sama. Di sini dua pengganti menunjukkan idenya: pencocok kalimat berbasis kata, dan pencocok kalimat neural." },
      { p: "**Ukur sebelum dipakai.** Dengan pencocok berbasis kata di buku panduan ini, peningkatannya kecil atau bahkan negatif: ia melihat kata yang sama dengan tahap pertama. Re-ranker hanya membantu jika ia menangkap sesuatu yang dilewatkan tahap pertama." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Big chunks", "Set chunk size to 120. Each chunk now mixes topics, and finding the one matching sentence matters more."] }, { exp: ["Neural re-ranker", "Switch the re-ranker to Neural and measure again on the paraphrased questions."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Potongan besar", "Atur ukuran potongan ke 120. Setiap potongan kini mencampur topik, sehingga menemukan satu kalimat yang cocok makin penting."] }, { exp: ["Re-ranker neural", "Ganti re-ranker ke Neural dan ukur lagi pada pertanyaan parafrasa."] }],
  },
  specs: {
    en: [{ dl: [["Candidates (N)", "How many first-stage results the re-ranker looks at. More = slower but more chances to rescue a good chunk."], ["Lexical re-ranker", "Best sentence by BM25-weighted word matches, favouring short focused sentences."], ["Neural re-ranker", "Best sentence by neural similarity. A true cross-encoder is stronger still; the Code tab shows one."]] }],
    id: [{ dl: [["Kandidat (N)", "Berapa hasil tahap pertama yang diperiksa re-ranker. Lebih banyak = lebih lambat tetapi lebih banyak peluang menyelamatkan potongan yang bagus."], ["Re-ranker leksikal", "Kalimat terbaik berdasarkan kecocokan kata berbobot BM25, mengutamakan kalimat pendek yang fokus."], ["Re-ranker neural", "Kalimat terbaik berdasarkan kemiripan neural. Cross-encoder sungguhan lebih kuat lagi; tab Kode menunjukkannya."]] }],
  },
};

export default {
  n: 15, stages, text, Board,
  controls: [
    { id: "n", label: L("Candidates (N)", "Kandidat (N)"), min: 3, max: 20, step: 1, default: 10 },
    { id: "size", label: L("Chunk size", "Ukuran potongan"), min: 20, max: 120, step: 10, default: 40 },
    { id: "reranker", type: "select", default: "lexical", label: L("Re-ranker", "Re-ranker"), options: [{ value: "lexical", label: L("Word-level sentence matcher", "Pencocok kalimat berbasis kata") }, { value: "neural", label: L("Neural sentence matcher (~120 MB once)", "Pencocok kalimat neural (~120 MB sekali)") }] },
  ],
  extraValues: { overlap: 0 },
  useExtra: (base) => useNeuralForIndex({ ...base, method: base.reranker === "neural" ? "neural" : "off", overlap: 0 }, { sentences: true, extraQuestions: PARA[base.doc.id]?.map((x) => x[0]) || [] }),
  inputs: { document: true, question: true },
  defaultQuestion: { en: "Where do I charge a battery?", id: "Di mana saya bisa mengisi baterai?" },
  examples: { en: ["Where do I charge a battery?", "How much does PLA printing cost?", "When do they shut early?"], id: ["Di mana saya bisa mengisi baterai?", "Berapa biaya cetak PLA?", "Kapan lab tutup lebih cepat?"] },
  code: [{ id: "ce", label: L("Cross-encoder re-ranking", "Re-ranking cross-encoder"), source: pySource, runnable: false, filename: "rerank.py", note: L("Runs on your computer after: pip install sentence-transformers", "Jalankan di komputer Anda setelah: pip install sentence-transformers") }],
  variables: (c) => [["first", c.first ? c.first.map((x) => x.i).join(", ") : "—"], ["reranked", c.reranked ? c.reranked.map((x) => x.i).join(", ") : "—"]],
  challenges: [
    { id: "measure", text: L("Measure the lexical re-ranker. Did it help?", "Ukur re-ranker leksikal. Apakah membantu?"), check: (c) => c.mode === "lexical" && c.evaluation },
    { id: "neural", text: L("Measure the neural re-ranker on the same questions.", "Ukur re-ranker neural pada pertanyaan yang sama."), check: (c) => c.mode === "neural" && c.evaluation },
    { id: "rescue", text: L("Find a question where re-ranking changes the #1 result.", "Temukan pertanyaan di mana re-ranking mengubah hasil #1."), check: (c) => c.moved === true },
  ],
  quiz: [
    quizQ(L("Why not use the careful model for the whole search?", "Mengapa model yang teliti tidak dipakai untuk seluruh pencarian?"), [L("It is too slow to run on every chunk", "Terlalu lambat untuk dijalankan di setiap potongan"), L("It is less accurate", "Kurang akurat"), L("It only works in English", "Hanya untuk bahasa Inggris"), L("It can't read numbers", "Tidak bisa membaca angka")], 0, L("Cheap first stage over everything, expensive second stage over a few: that's the pattern.", "Tahap pertama murah untuk semua, tahap kedua mahal untuk sedikit: itulah polanya.")),
    quizQ(L("A re-ranker made hit@1 worse on your test set. What now?", "Re-ranker memperburuk hit@1 di set uji Anda. Lalu?"), [L("Don't ship it; it doesn't fit your data", "Jangan dipakai; tidak cocok dengan data Anda"), L("Ship it anyway", "Tetap dipakai"), L("Raise the temperature", "Naikkan temperatur"), L("Delete the test questions it got wrong", "Hapus pertanyaan uji yang salah")], 0, L("Measurements beat intuition and blog posts.", "Pengukuran mengalahkan intuisi dan artikel blog.")),
    quizQ(L("What makes a cross-encoder sharper than vector search?", "Apa yang membuat cross-encoder lebih tajam dari pencarian vektor?"), [L("It reads the question and chunk together", "Membaca pertanyaan dan potongan bersama-sama"), L("It uses bigger chunks", "Memakai potongan lebih besar"), L("It uses BM25", "Memakai BM25"), L("It ignores the question", "Mengabaikan pertanyaan")], 0, L("Vector search encodes each side separately; a cross-encoder can compare them word by word.", "Pencarian vektor menyandikan tiap sisi terpisah; cross-encoder bisa membandingkannya kata demi kata.")),
  ],
};
