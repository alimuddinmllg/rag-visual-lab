// Lesson 18: lost in the middle (position test with your LLM) and context compression (measured here).
import { useState } from "react";
import * as rag from "../../rag/core.js";
import * as R from "../../rag/retrieval.js";
import { testSetFor, TEST_SET, HANDBOOK } from "../../rag/testsets.js";
import { chat, llmReady, useLLM } from "../../rag/llm.js";
import { L, pct, getIndex, quizQ } from "../shared.js";
import { BarList } from "../../toolkit/charts.jsx";
import pySource from "./compress.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const tok = rag.countTokens;
export function compress(text, qTokens, stop, lang) {
  const keep = text.split(/(?<=[.!?])\s+/).filter((s) => rag.tokenize(s, stop, lang).some((t) => qTokens.includes(t)));
  return keep.join(" ");
}

const stages = [
  { id: "retrieve", label: L("Retrieve", "Ambil"), desc: L("Top-k chunks for the question.", "Top-k potongan untuk pertanyaan."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, 40, 8); const q = inputs.question || ""; return { idx, qTokens: rag.tokenize(q, idx.stop, idx.lang), top: R.rankBy(R.tfidfScores(idx, q)).slice(0, inputs.topK) }; },
    log: (c) => ({ text: c.top.map((t) => `#${t.i + 1}`).join(" ") }), live: (c) => `${c.top.length} chunks` },
  { id: "compress", label: L("Compress", "Padatkan"), desc: L("Keep only the sentences that share a word with the question. Everything else is cut before it reaches the model.", "Hanya simpan kalimat yang berbagi kata dengan pertanyaan. Sisanya dipotong sebelum sampai ke model."),
    run: (c) => { const full = c.top.map((t) => c.idx.chunks[t.i].text).join(" "); const comp = c.top.map((t) => compress(c.idx.chunks[t.i].text, c.qTokens, c.idx.stop, c.idx.lang)).filter(Boolean).join(" "); return { full, comp }; },
    log: (c) => ({ text: `${tok(c.full)} → ${tok(c.comp || " ")} tokens` }), live: (c) => `-${Math.round((1 - tok(c.comp || " ") / tok(c.full)) * 100)}%` },
  { id: "measure", label: L("Measure", "Ukur"), desc: L("On the test questions: how many tokens did compression save, and how often did it throw the answer away?", "Pada pertanyaan uji: berapa token yang dihemat, dan seberapa sering jawabannya ikut terbuang?"),
    run: (c) => {
      const ts = testSetFor(c.inputs.doc); if (!ts) return { evaluation: null };
      let kept = 0, keptC = 0, tf = 0, tc = 0;
      for (const [q, e] of ts.items) {
        const qt = rag.tokenize(q, c.idx.stop, c.idx.lang); const top = R.rankBy(R.tfidfScores(c.idx, q)).slice(0, c.inputs.topK);
        const full = top.map((t) => c.idx.chunks[t.i].text).join(" "); const comp = top.map((t) => compress(c.idx.chunks[t.i].text, qt, c.idx.stop, c.idx.lang)).join(" ");
        kept += R.norm(full).includes(R.norm(e)); keptC += R.norm(comp).includes(R.norm(e)); tf += tok(full); tc += tok(comp || " ");
      }
      const n = ts.items.length;
      return { evaluation: { n, kept: kept / n, keptC: keptC / n, saved: 1 - tc / tf } };
    },
    log: (c) => (c.evaluation ? { text: `saved ${pct(c.evaluation.saved)} tokens · answer kept ${pct(c.evaluation.kept)} → ${pct(c.evaluation.keptC)}`, warn: c.evaluation.keptC < c.evaluation.kept ? "compression lost some answers" : null } : { text: "no test set" }),
    live: (c) => (c.evaluation ? `-${pct(c.evaluation.saved)} tokens` : "—") },
];

function PositionTest({ inputs, tr }) {
  const s = useLLM();
  const [res, setRes] = useState(null);
  const lang = inputs.uiLang;
  const run = async () => {
    const idx = getIndex({ id: "nusabot-" + lang, text: HANDBOOK[lang], lang }, 40, 0);
    const [q, e] = TEST_SET[lang][inputs.qi];
    const answerIdx = [...R.relevantFor(idx.chunks, e)][0];
    const distract = idx.chunks.map((_, i) => i).filter((i) => i !== answerIdx).slice(0, inputs.n - 1);
    const out = [];
    setRes({ busy: true, out });
    for (let p = 0; p < inputs.n; p++) {
      const order = [...distract.slice(0, p), answerIdx, ...distract.slice(p)];
      const prompt = `Answer using only the numbered passages.\n\n${order.map((i, k) => `[${k + 1}] ${idx.chunks[i].text}`).join("\n\n")}\n\nQuestion: ${q}\nAnswer briefly:`;
      try { const a = await chat([{ role: "user", content: prompt }], { maxTokens: 60 }); out.push({ p: p + 1, ok: R.norm(a).includes(R.norm(e)) || R.norm(a).includes(R.norm(e.split(" ")[0])), a }); }
      catch (err) { out.push({ p: p + 1, ok: false, a: "✗ " + err.message }); }
      setRes({ busy: p < inputs.n - 1, out: [...out] });
    }
  };
  return (
    <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
      <h3 style={{ fontSize: 14.5, margin: "0 0 6px" }}>{tr(L("Lost in the middle: test your own LLM", "Hilang di tengah: uji LLM Anda sendiri"))}</h3>
      <p className="note" style={{ marginTop: 0 }}>{tr(L("Puts the passage with the answer at position 1, 2, … among other passages and asks the same question each time.", "Meletakkan bagian berisi jawaban di posisi 1, 2, … di antara bagian lain dan menanyakan pertanyaan yang sama setiap kali."))} <b>“{TEST_SET[lang][inputs.qi][0]}”</b></p>
      <button className="btn primary" disabled={!llmReady(s) || res?.busy} onClick={run}>▶ {tr(L(`Run ${inputs.n} positions`, `Jalankan ${inputs.n} posisi`))}</button>
      {!llmReady(s) && <p className="note">{tr(L("Connect an LLM with the button in the header to run this. Small local models show the effect most clearly.", "Hubungkan LLM dengan tombol di header untuk menjalankan ini. Model lokal kecil paling jelas menunjukkan efeknya."))}</p>}
      {res && <div className="chips" style={{ marginTop: 10 }}>{res.out.map((r) => <span key={r.p} className="chip" title={r.a} style={{ borderColor: r.ok ? "var(--good)" : "var(--warn)" }}>{r.p}: {r.ok ? "✓" : "✗"}</span>)}{res.busy && <span className="note">…</span>}</div>}
    </div>
  );
}

function Board({ ctx, inputs, tr }) {
  const ev = ctx.evaluation;
  const hl = (t) => t.split(/(?<=[.!?])\s+/).map((s, i) => { const keep = rag.tokenize(s, ctx.idx.stop, ctx.idx.lang).some((w) => ctx.qTokens.includes(w)); return <span key={i} style={keep ? { background: "var(--accent-soft)" } : { color: "var(--muted)", textDecoration: "line-through" }}>{s} </span>; });
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Compress the context", "Padatkan konteks"))}</h2>{ctx.comp != null && <span className="sub">{tok(ctx.full)} → {tok(ctx.comp || " ")} tokens</span>}</div>
      <div className="plain" style={{ fontSize: 13.5, maxHeight: 220, overflow: "auto" }}>{ctx.full ? (ctx.comp != null ? ctx.top.map((t) => <p key={t.i} style={{ margin: "0 0 8px" }}><b className="mono">#{t.i + 1}</b> {hl(ctx.idx.chunks[t.i].text)}</p>) : ctx.top.map((t) => <p key={t.i} style={{ margin: "0 0 8px" }}>{ctx.idx.chunks[t.i].text}</p>)) : <span className="note">{tr(L("Press Play.", "Tekan Putar."))}</span>}</div>
      {ev && <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="note" style={{ marginTop: 0 }}>{tr(L(`Test set (${ev.n} questions): answer still in the context`, `Set uji (${ev.n} pertanyaan): jawaban masih ada di konteks`))}</p>
        <BarList fmt={pct} items={[{ label: tr(L("full chunks", "potongan utuh")), value: ev.kept }, { label: tr(L("compressed", "dipadatkan")), value: ev.keptC, hl: true }]} />
        <p className="note">{tr(L("Tokens saved", "Token dihemat"))}: <b>{pct(ev.saved)}</b></p>
      </div>}
      <PositionTest inputs={inputs} tr={tr} />
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Two problems with long prompts. First, models tend to use information at the **start and end** of a long context better than information in the **middle**. Liu et al. (2023) called this \"lost in the middle\". Test it on your own LLM below; the effect depends on the model." },
      { p: "Second, retrieved chunks carry lots of text that has nothing to do with the question. **Compression** removes it before the model sees it: fewer tokens, less distraction. The risk is cutting the answer, so measure that too." },
      { p: "Struck-through sentences are cut; highlighted ones are kept." }],
    id: [{ p: "Dua masalah pada prompt yang panjang. Pertama, model cenderung lebih baik memakai informasi di **awal dan akhir** konteks panjang daripada di **tengah**. Liu dkk. (2023) menyebutnya \"lost in the middle\". Uji pada LLM Anda sendiri di bawah; efeknya tergantung modelnya." },
      { p: "Kedua, potongan yang diambil membawa banyak teks yang tidak berhubungan dengan pertanyaan. **Pemadatan** membuangnya sebelum dilihat model: token lebih sedikit, gangguan lebih sedikit. Risikonya jawaban ikut terpotong, jadi ukur juga." },
      { p: "Kalimat yang dicoret dibuang; yang disorot disimpan." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Compression's risk", "Ask \"When does the lab close during exam weeks?\": does the answer sentence survive? Find one where it doesn't."] }, { exp: ["Positions", "With a local model, run 7 positions. Big modern models are much better at this than older ones; small models still show it."] },
      { exp: ["More chunks, more savings", "Raise top-k from 4 to 8 and measure again. More chunks means more sentences that share no words with the question, so compression saves a bigger share. Check whether the answer is still kept."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Risiko pemadatan", "Tanyakan \"Jam berapa lab tutup selama pekan ujian?\": apakah kalimat jawabannya bertahan? Temukan pertanyaan yang jawabannya hilang."] }, { exp: ["Posisi", "Dengan model lokal, jalankan 7 posisi. Model modern besar jauh lebih baik dalam hal ini dibanding model lama; model kecil masih menunjukkannya."] },
      { exp: ["Lebih banyak potongan, lebih hemat", "Naikkan top-k dari 4 ke 8 lalu ukur lagi. Lebih banyak potongan berarti lebih banyak kalimat yang tidak berbagi kata dengan pertanyaan, sehingga pemadatan menghemat porsi lebih besar. Periksa apakah jawabannya masih tersimpan."] }],
  },
  specs: {
    en: [{ dl: [["Compression rule", "Keep a sentence if it shares at least one content word with the question. Real compressors use a small model to score sentences."], ["Position test", "1 run per position with your connected LLM, temperature 0. Repeat runs and other questions for a fair measurement."], ["Reference", "Liu et al., \"Lost in the Middle: How Language Models Use Long Contexts\", TACL 2024."]] }],
    id: [{ dl: [["Aturan pemadatan", "Simpan kalimat jika berbagi setidaknya satu kata isi dengan pertanyaan. Pemadat sungguhan memakai model kecil untuk menilai kalimat."], ["Uji posisi", "1 kali per posisi dengan LLM yang terhubung, temperatur 0. Ulangi dan pakai pertanyaan lain agar pengukurannya adil."], ["Referensi", "Liu dkk., \"Lost in the Middle: How Language Models Use Long Contexts\", TACL 2024."]] }],
  },
};


export default {
  n: 18, stages, text, Board,
  controls: [{ id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 8, step: 1, default: 4 },
    { id: "n", label: L("Position test: passages", "Uji posisi: jumlah bagian"), min: 3, max: 12, step: 1, default: 7 },
    { id: "qi", type: "select", default: "0", label: L("Position test question", "Pertanyaan uji posisi"), options: TEST_SET.en.map((x, i) => ({ value: String(i), label: L(x[0], TEST_SET.id[i][0]) })) }],
  inputs: { document: true, question: true },
  defaultQuestion: { en: "When does the lab close during exam weeks?", id: "Jam berapa lab tutup selama pekan ujian?" },
  examples: { en: ["When does the lab close during exam weeks?", "How much does PLA printing cost?", "Who should I ask about urgent safety issues?"], id: ["Jam berapa lab tutup selama pekan ujian?", "Berapa biaya cetak PLA?", "Siapa yang dihubungi untuk masalah keselamatan mendesak?"] },
  code: [
    { id: "cmp", label: L("Compression (runs here)", "Pemadatan (bisa dijalankan)"), source: pySource, runnable: true, filename: "compress.py" },
    { id: "libs", label: L("Position test with a real LLM", "Uji posisi dengan LLM sungguhan"), source: libSource, runnable: false, filename: "position_test_llm.py",
      note: L("Runs on your computer after: pip install openai, with Ollama or any OpenAI-compatible server.", "Jalankan di komputer Anda setelah: pip install openai, dengan Ollama atau server lain yang kompatibel dengan OpenAI.") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, ts = testSetFor(doc), tests = ts ? ts.items : [];
    return {
      prelude: prelude("rag", "bm25"),
      globals: { DOCUMENT: doc.text, QUESTION: I.question || "", TESTS: tests, LANG: lang, STOPWORDS: stopList(lang), K: I.topK },
      call: "demo(DOCUMENT, QUESTION, [tuple(t) for t in TESTS], LANG, STOPWORDS, K)",
      compare: (res) => {
        const idx = getIndex(doc, 40, 8), q = I.question || "", qt = rag.tokenize(q, idx.stop, idx.lang);
        const top = R.rankBy(R.tfidfScores(idx, q)).slice(0, I.topK);
        const comp = top.map((t) => compress(idx.chunks[t.i].text, qt, idx.stop, idx.lang)).filter(Boolean).join(" ");
        if (JSON.stringify(res.top) !== JSON.stringify(top.map((t) => t.i)) || res.comp !== comp) return false;
        if (!tests.length) return res.evaluation == null;
        let kept = 0, keptC = 0, tf = 0, tc = 0;
        for (const [tq, e] of tests) {
          const qq = rag.tokenize(tq, idx.stop, idx.lang), tp = R.rankBy(R.tfidfScores(idx, tq)).slice(0, I.topK);
          const full = tp.map((t) => idx.chunks[t.i].text).join(" "), cc = tp.map((t) => compress(idx.chunks[t.i].text, qq, idx.stop, idx.lang)).join(" ");
          kept += R.norm(full).includes(R.norm(e)); keptC += R.norm(cc).includes(R.norm(e)); tf += tok(full); tc += tok(cc || " ");
        }
        const n = tests.length, ev = res.evaluation;
        return Math.abs(ev.kept - kept / n) < 1e-9 && Math.abs(ev.kept_compressed - keptC / n) < 1e-9 && Math.abs(ev.saved - (1 - tc / tf)) < 1e-9;
      },
    };
  },
  variables: (c) => [["full tokens", c.full ? String(tok(c.full)) : "—"], ["compressed", c.comp != null ? String(tok(c.comp || " ")) : "—"]],
  challenges: [
    { id: "lost", text: L("Find a question where compression removes the answer (it drops below full chunks on the test set, or the answer sentence is struck through).", "Temukan pertanyaan di mana pemadatan membuang jawabannya (turun di bawah potongan utuh di set uji, atau kalimat jawabannya tercoret)."), check: (c) => c.evaluation && c.evaluation.keptC < c.evaluation.kept },
    { id: "save", text: L("Measure how many tokens compression saves on the test set.", "Ukur berapa token yang dihemat pemadatan pada set uji."), check: (c) => !!c.evaluation },
    { id: "k8", text: L("Measure compression with top-k = 8.", "Ukur pemadatan dengan top-k = 8."), check: (c) => c.inputs.topK === 8 && !!c.evaluation },
  ],
  quiz: [
    quizQ(L("What does \"lost in the middle\" describe?", "Apa yang dijelaskan \"lost in the middle\"?"), [L("Models use the middle of a long context less well than its start and end", "Model kurang baik memakai bagian tengah konteks panjang dibanding awal dan akhirnya"), L("Documents lose their middle pages", "Dokumen kehilangan halaman tengah"), L("Retrieval skips medium-sized chunks", "Retrieval melewatkan potongan berukuran sedang"), L("Tokens are lost during encoding", "Token hilang saat encoding")], 0, L("That's why ordering (lesson 12) and shorter contexts help.", "Karena itu pengurutan (pelajaran 12) dan konteks lebih pendek membantu.")),
    quizQ(L("What is the risk of compressing the context?", "Apa risiko memadatkan konteks?"), [L("Cutting the sentence that holds the answer", "Memotong kalimat yang berisi jawaban"), L("Using more tokens", "Memakai lebih banyak token"), L("Slower retrieval", "Retrieval lebih lambat"), L("None", "Tidak ada")], 0, L("Measure answer retention, not just tokens saved.", "Ukur apakah jawaban tetap ada, bukan hanya token yang dihemat.")),
    quizQ(L("The position test shows ✓ at positions 1 and 7 but ✗ in the middle. What should you change?", "Uji posisi menunjukkan ✓ di posisi 1 dan 7 tetapi ✗ di tengah. Apa yang sebaiknya diubah?"), [L("Send fewer passages, and put the strongest at the start and end", "Kirim lebih sedikit bagian, dan taruh yang terkuat di awal dan akhir"), L("Send more passages", "Kirim lebih banyak bagian"), L("Raise the temperature", "Naikkan temperatur"), L("Nothing: the model is fine", "Tidak ada: modelnya baik-baik saja")], 0, L("Shorter contexts and the \"edges\" order from lesson 12 both work around the weak middle.", "Konteks yang lebih pendek dan urutan \"tepi\" dari pelajaran 12 sama-sama mengatasi bagian tengah yang lemah.")),
  ],
};
