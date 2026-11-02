// Lesson 21: answer metrics. Is every claim in the answer supported by the retrieved sources?
import { useMemo } from "react";
import * as rag from "../../rag/core.js";
import * as R from "../../rag/retrieval.js";
import * as ng from "../../rag/ngram.js";
import { GENERAL_EN, GENERAL_ID } from "../../documents/general.js";
import { useLLMAnswer } from "../../rag/llm.js";
import { L, pct, getIndex, quizQ } from "../shared.js";
import pySource from "./faithfulness.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const lm = {};
const closedBook = (q, lang) => { const m = (lm[lang] ||= ng.trainLM(ng.lmTokens(lang === "id" ? GENERAL_ID : GENERAL_EN))); const seed = ng.lmTokens(q).filter((t) => /[a-z]/.test(t)).slice(-2); return ng.detok([...seed, ...ng.generate(m, seed, 16, 0.8, 3).map((g) => g.w)]).replace(/^./, (c) => c.toUpperCase()); };
const nums = (s) => (s.match(/[0-9]+(?:[.,:][0-9]+)*/g) || []).map((x) => x.replace(/[.,:]/g, ""));

export function checkClaim(claim, sources, stop, lang, threshold) {
  const ct = [...new Set(rag.tokenize(claim, stop, lang))];
  let best = { ratio: 0, sentence: "" };
  for (const s of sources.flatMap((x) => x.split(/(?<=[.!?])\s+/))) {
    const st = new Set(rag.tokenize(s, stop, lang));
    const ratio = ct.length ? ct.filter((t) => st.has(t)).length / ct.length : 0;
    if (ratio > best.ratio) best = { ratio, sentence: s };
  }
  const srcNums = new Set(sources.flatMap(nums));
  const badNums = nums(claim).filter((n) => !srcNums.has(n));
  return { claim, ...best, badNums, supported: best.ratio >= threshold && !badNums.length };
}

function useExtra(base) {
  const prompt = useMemo(() => {
    if (base.source !== "llm") return null;
    const idx = getIndex(base.doc, 40, 8); const top = R.rankBy(R.tfidfScores(idx, base.question || "")).slice(0, 3);
    return rag.buildPrompt(base.question || "", top, idx.chunks, idx.sections, idx.lang);
  }, [base.source, base.doc, base.question]);
  const st = useLLMAnswer(prompt || "", prompt ? [{ role: "user", content: prompt }] : null, !!prompt);
  return useMemo(() => ({ llmAns: st }), [st]);
}

const stages = [
  { id: "retrieve", label: L("Sources", "Sumber"), desc: L("Retrieve the top 3 chunks: the only evidence the answer may use.", "Ambil 3 potongan teratas: satu-satunya bukti yang boleh dipakai jawaban."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, 40, 8); const q = inputs.question || ""; const top = R.rankBy(R.tfidfScores(idx, q)).slice(0, 3); return { idx, top, sources: top.map((t) => idx.chunks[t.i].text) }; },
    log: (c) => ({ text: c.top.map((t) => `#${t.i + 1}`).join(" ") }), live: (c) => "3 sources" },
  { id: "answer", label: L("Answer", "Jawaban"), desc: L("Get an answer from the chosen generator.", "Ambil jawaban dari generator yang dipilih."),
    run: (c) => {
      const q = c.inputs.question || "", idx = c.idx, src = c.inputs.source;
      const ext = rag.extractAnswer(c.top, idx.chunks, rag.tokenize(q, idx.stop, idx.lang).filter((t) => idx.tfidf.idf.has(t)), idx.tfidf.idf, idx.stop, idx.lang).text.replace(/\s*\[\d\]/g, "");
      let answer = ext;
      if (src === "closed") answer = closedBook(q, idx.lang);
      if (src === "mixed") answer = ext + " " + closedBook(q, idx.lang);
      if (src === "llm") answer = c.inputs.llmAns?.status === "ready" ? c.inputs.llmAns.text.replace(/\s*\[\d+\]/g, "") : c.inputs.llmAns?.status === "error" ? "(LLM error: " + c.inputs.llmAns.error + ")" : "(waiting for your LLM…)";
      return { answer };
    },
    log: (c) => ({ text: c.answer.slice(0, 100) }), live: (c) => c.inputs.source },
  { id: "claims", label: L("Split claims", "Pecah klaim"), desc: L("Split the answer into separate claims (here: sentences).", "Pecah jawaban menjadi klaim-klaim terpisah (di sini: kalimat)."),
    run: (c) => ({ claims: c.answer.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3) }), log: (c) => ({ text: `${c.claims.length} claims` }), live: (c) => `${c.claims.length} claims` },
  { id: "check", label: L("Check support", "Cek dukungan"), desc: L("For each claim, find the source sentence that covers most of its words. Every number in the claim must appear in the sources.", "Untuk setiap klaim, cari kalimat sumber yang mencakup sebagian besar katanya. Setiap angka dalam klaim harus ada di sumber."),
    run: (c) => ({ checks: c.claims.map((cl) => checkClaim(cl, c.sources, c.idx.stop, c.idx.lang, c.inputs.threshold)) }),
    log: (c) => ({ text: `${c.checks.filter((x) => x.supported).length}/${c.checks.length} supported`, warn: c.checks.some((x) => !x.supported) ? "unsupported claim" : null }), live: (c) => `${c.checks.filter((x) => x.supported).length}/${c.checks.length}` },
  { id: "score", label: L("Score", "Nilai"), desc: L("Faithfulness = supported claims ÷ all claims. Relevance = how similar the answer is to the question.", "Kesetiaan = klaim yang didukung ÷ semua klaim. Relevansi = kemiripan jawaban dengan pertanyaan."),
    run: (c) => {
      const idf = c.idx.tfidf.idf, v = (t) => rag.vectorize(rag.tokenize(t, c.idx.stop, c.idx.lang), idf);
      return { faith: c.checks.length ? c.checks.filter((x) => x.supported).length / c.checks.length : 0, relevance: rag.cosine(v(c.inputs.question || ""), v(c.answer)) };
    },
    log: (c) => ({ text: `faithfulness ${pct(c.faith)} · relevance ${c.relevance.toFixed(2)}` }), live: (c) => `faith ${pct(c.faith)}` },
];

function Board({ ctx, tr }) {
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Claim by claim", "Klaim demi klaim"))}</h2>
        {ctx.faith != null && <span className="sub">{tr(L("faithfulness", "kesetiaan"))} <b style={{ color: ctx.faith === 1 ? "var(--good)" : "var(--warn)" }}>{pct(ctx.faith)}</b> · {tr(L("relevance", "relevansi"))} {ctx.relevance.toFixed(2)}</span>}</div>
      <div className="plain" style={{ display: "grid", gap: 8 }}>
        {ctx.answer && <p style={{ margin: 0 }}><b>{tr(L("Answer", "Jawaban"))}:</b> {ctx.answer}</p>}
        {(ctx.checks || []).map((x, i) => (
          <div key={i} className="colcard" style={{ borderLeft: `4px solid ${x.supported ? "var(--good)" : "var(--warn)"}` }}>
            <h4>{x.supported ? "✓" : "✗"} {x.claim}<span className="sub">{pct(x.ratio)} {tr(L("of words found", "kata ditemukan"))}</span></h4>
            <div className="note" style={{ margin: 0 }}>{x.sentence ? <>{tr(L("Closest source sentence", "Kalimat sumber terdekat"))}: “{x.sentence}”</> : tr(L("No source sentence shares its words.", "Tidak ada kalimat sumber yang berbagi kata."))}
              {x.badNums.length > 0 && <b style={{ color: "var(--warn)" }}> · {tr(L("numbers not in sources", "angka tidak ada di sumber"))}: {x.badNums.join(", ")}</b>}</div>
          </div>
        ))}
        {!ctx.answer && <p className="note">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Good retrieval doesn't guarantee a good answer. The model can still add things the sources never said. **Faithfulness** checks every claim in the answer against the sources." },
      { p: "Pick a generator and compare: the extractive answer (faithful by construction), the closed-book model from lesson 2 (makes things up), a mix of both (the dangerous case: mostly right, one wrong claim), or your own LLM." },
      { p: "Here support is checked with word overlap and a numbers check. Production tools (such as RAGAS) ask an LLM to judge each claim; the idea is the same." }],
    id: [{ p: "Retrieval yang bagus tidak menjamin jawaban yang bagus. Model tetap bisa menambahkan hal yang tidak pernah dikatakan sumber. **Kesetiaan (faithfulness)** memeriksa setiap klaim di jawaban terhadap sumbernya." },
      { p: "Pilih generator dan bandingkan: jawaban ekstraktif (setia karena dibuat dari sumber), model buku tertutup dari pelajaran 2 (mengarang), campuran keduanya (kasus berbahaya: sebagian besar benar, satu klaim salah), atau LLM Anda sendiri." },
      { p: "Di sini dukungan dicek dengan kecocokan kata dan pemeriksaan angka. Alat produksi (seperti RAGAS) meminta LLM menilai setiap klaim; idenya sama." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["The mixed answer", "Choose \"Mixed\": the first claim is green, the invented one red. Readers would trust the whole answer."] }, { exp: ["Threshold", "Lower the threshold to 0.3 and a made-up claim may pass on shared words alone. The numbers check still catches wrong prices."] },
      { exp: ["Raise the bar", "Choose \"Extractive\", raise the threshold to 1.0 and ask \"When is the lab open on Saturday?\". The answer is copied from the handbook, yet a claim fails: it was cut at a chunk edge, so no single source sentence covers all its words. A threshold that is too strict marks honest answers as unfaithful."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Jawaban campuran", "Pilih \"Campuran\": klaim pertama hijau, klaim karangan merah. Pembaca akan memercayai seluruh jawaban."] }, { exp: ["Ambang", "Turunkan ambang ke 0,3 dan klaim karangan bisa lolos hanya karena berbagi kata. Pemeriksaan angka tetap menangkap harga yang salah."] },
      { exp: ["Naikkan standar", "Pilih \"Ekstraktif\", naikkan ambang ke 1,0, lalu coba beberapa pertanyaan. Jawabannya disalin dari buku panduan, tetapi klaim yang terpotong di batas potongan bisa gagal karena tidak ada satu kalimat sumber yang mencakup semua katanya. Ambang yang terlalu ketat menilai jawaban jujur sebagai tidak setia."] }],
  },
  specs: {
    en: [{ dl: [["Support ratio", "Share of the claim's content words found in its best-matching source sentence."], ["Numbers check", "Every number in the claim must appear somewhere in the sources."], ["Relevance", "TF-IDF cosine between question and answer. An answer can be faithful but off-topic, or on-topic but unfaithful."]] }],
    id: [{ dl: [["Rasio dukungan", "Bagian kata isi klaim yang ditemukan di kalimat sumber yang paling cocok."], ["Pemeriksaan angka", "Setiap angka dalam klaim harus muncul di sumber."], ["Relevansi", "Cosine TF-IDF antara pertanyaan dan jawaban. Jawaban bisa setia tetapi melenceng, atau sesuai topik tetapi tidak setia."]] }],
  },
};


export default {
  n: 21, stages, text, Board, useExtra,
  controls: [
    { id: "source", type: "select", default: "mixed", label: L("Answer from", "Jawaban dari"), options: [{ value: "extract", label: L("Extractive (lesson 6)", "Ekstraktif (pelajaran 6)") }, { value: "closed", label: L("Closed book (lesson 2)", "Buku tertutup (pelajaran 2)") }, { value: "mixed", label: L("Mixed: right + one invented claim", "Campuran: benar + satu klaim karangan") }, { value: "llm", label: L("Your LLM (connect in header)", "LLM Anda (hubungkan di header)") }] },
    { id: "threshold", label: L("Support threshold", "Ambang dukungan"), min: 0.2, max: 1, step: 0.05, default: 0.6, format: (v) => v.toFixed(2) },
  ],
  inputs: { document: true, question: true },
  defaultQuestion: { en: "How much does PLA printing cost?", id: "Berapa biaya cetak PLA?" },
  examples: { en: ["How much does PLA printing cost?", "How many items can members borrow?", "When is the lab open on Saturday?"], id: ["Berapa biaya cetak PLA?", "Berapa alat yang boleh dipinjam?", "Kapan lab buka hari Sabtu?"] },
  code: [
    { id: "f", label: L("Faithfulness (runs here)", "Kesetiaan (bisa dijalankan)"), source: pySource, runnable: true, filename: "faithfulness.py" },
    { id: "libs", label: L("With an LLM judge", "Dengan juri LLM"), source: libSource, runnable: false, filename: "faithfulness_llm_judge.py",
      note: L("Runs on your computer after: pip install openai. ragas and deepeval package the same idea.", "Jalankan di komputer Anda setelah: pip install openai. ragas dan deepeval mengemas ide yang sama.") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, llm = I.llmAns?.status === "ready" ? I.llmAns.text : null;
    return {
      prelude: prelude("tinyLm", "rag", "bm25"),
      globals: { DOCUMENT: doc.text, GENERAL: lang === "id" ? GENERAL_ID : GENERAL_EN, QUESTION: I.question || "", SOURCE: I.source, THRESHOLD: I.threshold, LANG: lang, STOPWORDS: stopList(lang), LLM_ANSWER: llm },
      call: "demo(DOCUMENT, GENERAL, QUESTION, SOURCE, THRESHOLD, LANG, STOPWORDS, LLM_ANSWER)",
      compare: I.source === "llm" && !llm ? null : (res) => {
        let ctx = { inputs: I };
        for (const st of stages) ctx = { ...ctx, ...st.run(ctx) };
        return res.answer === ctx.answer && JSON.stringify(res.supported) === JSON.stringify(ctx.checks.map((x) => x.supported))
          && Math.abs(res.faith - ctx.faith) < 1e-9 && Math.abs(res.relevance - ctx.relevance) < 1e-9;
      },
    };
  },
  variables: (c) => [["claims", c.claims ? String(c.claims.length) : "—"], ["faithfulness", c.faith != null ? pct(c.faith) : "—"]],
  challenges: [
    { id: "catch", text: L("Catch an invented claim (a red card).", "Tangkap klaim karangan (kartu merah)."), check: (c) => c.checks?.some((x) => !x.supported) },
    { id: "clean", text: L("Get an answer with 100% faithfulness.", "Dapatkan jawaban dengan kesetiaan 100%."), check: (c) => c.faith === 1 && c.checks.length > 0 },
    { id: "llm", text: L("Check an answer written by your own LLM.", "Periksa jawaban yang ditulis LLM Anda sendiri."), check: (c) => c.inputs.source === "llm" && c.inputs.llmAns?.status === "ready" && c.checks },
  ],
  quiz: [
    quizQ(L("Faithfulness measures…", "Kesetiaan (faithfulness) mengukur…"), [L("whether each claim is supported by the retrieved sources", "apakah setiap klaim didukung sumber yang diambil"), L("whether the answer is long", "apakah jawabannya panjang"), L("retrieval speed", "kecepatan retrieval"), L("the model's confidence", "keyakinan model")], 0, L("It ties the answer back to evidence.", "Ini mengikat jawaban ke bukti.")),
    quizQ(L("Why is a mostly-right answer with one invented claim dangerous?", "Mengapa jawaban yang sebagian besar benar dengan satu klaim karangan berbahaya?"), [L("Readers trust the whole answer because most of it checks out", "Pembaca memercayai seluruh jawaban karena sebagian besar terbukti benar"), L("It is too long", "Terlalu panjang"), L("It costs more tokens", "Lebih banyak token"), L("It isn't", "Tidak berbahaya")], 0, L("That's why claims are checked one by one.", "Karena itu klaim diperiksa satu per satu.")),
    quizQ(L("A claim shares most of its words with a source sentence, but says \"Rp 3.000\" where the source says \"Rp 2.000\". What should the check do?", "Sebuah klaim berbagi sebagian besar kata dengan kalimat sumber, tetapi menyebut \"Rp 3.000\" padahal sumbernya \"Rp 2.000\". Apa yang harus dilakukan pemeriksaan?"), [L("Mark it unsupported: every number must appear in the sources", "Tandai tidak didukung: setiap angka harus ada di sumber"), L("Mark it supported: most words match", "Tandai didukung: sebagian besar kata cocok"), L("Ignore numbers", "Abaikan angka"), L("Round the numbers", "Bulatkan angkanya")], 0, L("Word overlap alone misses the most harmful errors: a wrong price, time or amount. That is why numbers get their own check.", "Kecocokan kata saja melewatkan kesalahan paling berbahaya: harga, jam, atau jumlah yang salah. Karena itu angka diperiksa tersendiri.")),
  ],
};
