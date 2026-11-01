// Lesson 2: closed book (the model's memory) vs open book (retrieve, then answer).
import * as ng from "../../rag/ngram.js";
import * as rag from "../../rag/core.js";
import { NUSABOT_EN, NUSABOT_ID } from "../../documents/nusabot.js";
import { GENERAL_EN, GENERAL_ID } from "../../documents/general.js";
import pySource from "./open_vs_closed.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

const L = (en, id) => ({ en, id });
const norm = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

const QA = {
  en: [
    { q: "How much does PLA printing cost?", stem: "PLA prints cost", expect: "2 000 per gram", fact: "Rp 2.000 per gram" },
    { q: "What colour vest does the lab assistant on duty wear?", stem: "The lab assistant on duty wears", expect: "green vest", fact: "a green vest" },
    { q: "How many items can members borrow at once?", stem: "Members may borrow", expect: "three items", fact: "three items" },
    { q: "When does the lab close during exam weeks?", stem: "During exam weeks the lab closes", expect: "18 00", fact: "18:00" },
  ],
  id: [
    { q: "Berapa biaya cetak PLA?", stem: "Cetak PLA dikenakan biaya", expect: "2 000 per gram", fact: "Rp 2.000 per gram" },
    { q: "Siapa koordinator lab?", stem: "Koordinator lab", expect: "rahma", fact: "Rahma Putri" },
    { q: "Berapa alat yang boleh dipinjam sekaligus?", stem: "Anggota boleh meminjam", expect: "tiga alat", fact: "tiga alat" },
    { q: "Jam berapa lab tutup selama pekan ujian?", stem: "Selama pekan ujian lab tutup", expect: "18 00", fact: "18.00" },
  ],
};

const lmCache = {};
const closedLM = (lang) => (lmCache[lang] ||= ng.trainLM(ng.lmTokens(lang === "id" ? GENERAL_ID : GENERAL_EN)));
const closedAnswer = (lang, stem, temp, seed) => {
  const p = ng.lmTokens(stem);
  return ng.detok([...p, ...ng.generate(closedLM(lang), p, 10, temp, seed).map((g) => g.w)]);
};

const stages = [
  { id: "ask", label: L("Ask", "Tanya"),
    desc: L("Pick a question whose true answer is in the NusaBot handbook.", "Pilih pertanyaan yang jawabannya ada di buku panduan NusaBot."),
    run: ({ inputs }) => ({ lang: inputs.lang, qa: QA[inputs.lang][inputs.qi] }),
    log: (c) => ({ text: `"${c.qa.q}" · true answer: ${c.qa.fact}` }), live: (c) => c.qa.q },
  { id: "closed", label: L("Closed book", "Buku tertutup"),
    desc: L("The model answers from memory. It was trained on general text about other labs and has never seen this handbook.", "Model menjawab dari ingatan. Model dilatih dengan teks umum tentang lab lain dan tidak pernah melihat buku panduan ini."),
    run: (c) => {
      const text = closedAnswer(c.lang, c.qa.stem, c.inputs.temperature, 1);
      return { closed: { text, ok: norm(text).includes(" " + c.qa.expect + " ") } };
    },
    log: (c) => ({ text: c.closed.text, warn: c.closed.ok ? null : "wrong" }), live: (c) => (c.closed.ok ? "correct" : "wrong") },
  { id: "repeat", label: L("Try again", "Coba lagi"),
    desc: L("Ask the closed-book model many times with different random seeds and count how often it is right.", "Tanya model buku tertutup berkali-kali dengan benih acak berbeda dan hitung berapa kali benar."),
    run: (c) => {
      let right = 0;
      const samples = [];
      for (let s = 1; s <= c.inputs.tries; s++) {
        const t = closedAnswer(c.lang, c.qa.stem, c.inputs.temperature, s);
        const ok = norm(t).includes(" " + c.qa.expect + " ");
        right += ok;
        if (samples.length < 4 && !samples.some((x) => x.t === t)) samples.push({ t, ok });
      }
      return { closedRight: right, samples };
    },
    log: (c) => ({ text: `closed book correct ${c.closedRight}/${c.inputs.tries}` }), live: (c) => `${c.closedRight}/${c.inputs.tries} correct` },
  { id: "retrieve", label: L("Retrieve", "Ambil"),
    desc: L("Open book: search the handbook for the passage most similar to the question.", "Buku terbuka: cari bagian buku panduan yang paling mirip dengan pertanyaan."),
    run: (c) => ({ open: rag.runPipeline({ document: c.lang === "id" ? NUSABOT_ID : NUSABOT_EN, question: c.qa.q, size: 40, overlap: 8, topK: 3, minSim: 0.1, lang: c.lang }) }),
    log: (c) => ({ text: `top chunk #${c.open.top[0][0] + 1} (score ${c.open.top[0][1].toFixed(2)})` }), live: (c) => `#${c.open.top[0][0] + 1} score ${c.open.top[0][1].toFixed(2)}` },
  { id: "open", label: L("Open book", "Buku terbuka"),
    desc: L("Answer using only the retrieved passage, with a citation.", "Jawab hanya dari bagian yang diambil, dengan sitasi."),
    run: (c) => ({ openOk: norm(c.open.answer).includes(" " + c.qa.expect + " ") }),
    log: (c) => ({ text: c.open.answer, warn: c.openOk ? null : "wrong" }), live: (c) => (c.openOk ? "correct" : "wrong") },
];

const qControl = {
  id: "qi", type: "select", default: "0", label: L("Question", "Pertanyaan"),
  options: QA.en.map((_, i) => ({ value: String(i), label: L(QA.en[i].q, QA.id[i].q) })),
};
const controls = [
  qControl,
  { id: "temperature", label: L("Temperature", "Temperatur"), min: 0.1, max: 2, step: 0.1, default: 1, format: (v) => v.toFixed(1) },
  { id: "tries", label: L("Closed-book tries", "Percobaan buku tertutup"), min: 5, max: 30, step: 5, default: 20 },
];

function Verdict({ ok, tr }) {
  return <b className={ok ? "ok" : "bad"} style={{ color: ok ? "var(--good)" : "var(--warn)" }}>{ok ? "✓ " + tr(L("correct", "benar")) : "✗ " + tr(L("wrong", "salah"))}</b>;
}

function Board({ ctx, tr }) {
  const tries = ctx.inputs.tries;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Same question, two ways to answer", "Pertanyaan sama, dua cara menjawab"))}</h2>
        {ctx.qa && <span className="sub">{tr(L("true answer", "jawaban benar"))}: <b>{ctx.qa.fact}</b></span>}</div>
      {ctx.qa && <p style={{ padding: "10px 16px 0", margin: 0, fontWeight: 600 }}>“{ctx.qa.q}”</p>}
      <div className="vs">
        <div className={`panel${ctx.closed ? (ctx.closed.ok ? " good" : " bad") : ""}`}>
          <h4>📕 {tr(L("Closed book: from memory", "Buku tertutup: dari ingatan"))}</h4>
          {ctx.closed ? <>
            <p style={{ margin: "0 0 6px" }}>{ctx.closed.text}</p><Verdict ok={ctx.closed.ok} tr={tr} />
          </> : <p className="note">{tr(L("Waiting…", "Menunggu…"))}</p>}
          {ctx.closedRight != null && (
            <div style={{ marginTop: 12 }}>
              <div className="note" style={{ marginTop: 0 }}>{tr(L("Correct over", "Benar dari"))} {tries} {tr(L("tries", "percobaan"))}: <b>{ctx.closedRight}/{tries}</b></div>
              <div className="segbar" style={{ height: 14, marginTop: 4 }}>
                <i style={{ width: `${(ctx.closedRight / tries) * 100}%`, background: "var(--good)" }} />
                <i style={{ width: `${(1 - ctx.closedRight / tries) * 100}%`, background: "var(--warn)" }} />
              </div>
              <p className="note">{tr(L("Other answers it gave:", "Jawaban lain yang diberikan:"))}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{ctx.samples.map((s, i) => <li key={i}>{s.t}</li>)}</ul>
            </div>
          )}
        </div>
        <div className={`panel${ctx.openOk != null ? (ctx.openOk ? " good" : " bad") : ""}`}>
          <h4>📖 {tr(L("Open book: retrieve, then answer", "Buku terbuka: ambil, lalu jawab"))}</h4>
          {ctx.open ? <>
            <p className="note" style={{ marginTop: 0 }}>{tr(L("Retrieved from the handbook", "Diambil dari buku panduan"))}: #{ctx.open.top[0][0] + 1} · {tr(L("score", "skor"))} {ctx.open.top[0][1].toFixed(2)}</p>
            {ctx.openOk != null ? <><p style={{ margin: "0 0 6px" }}>{ctx.open.answer}</p><Verdict ok={ctx.openOk} tr={tr} /></> : <p className="note">{tr(L("Waiting…", "Menunggu…"))}</p>}
          </> : <p className="note">{tr(L("Waiting…", "Menunggu…"))}</p>}
        </div>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "An LLM only knows what was in its training data. It has **never seen your private documents**: your university's rules, your lab's prices, your company's policies." },
      { p: "Ask it anyway and it answers like a student in a **closed-book exam**: it writes what usually goes in that sentence elsewhere. The answer sounds right and is often wrong." },
      { p: "RAG turns it into an **open-book exam**: first look up the relevant page, then answer from it." },
      { h: "On the board" },
      { ul: ["Left: a model trained on general text about other labs answers from memory.", "Right: the same question, answered from the retrieved handbook passage.", "The bar shows how often memory alone gets it right."] },
    ],
    id: [
      { p: "LLM hanya tahu apa yang ada di data pelatihannya. Model **tidak pernah melihat dokumen pribadi Anda**: aturan kampus, harga lab, kebijakan perusahaan." },
      { p: "Jika tetap ditanya, model menjawab seperti mahasiswa dalam **ujian buku tertutup**: menulis apa yang biasanya ada di kalimat seperti itu di tempat lain. Jawabannya terdengar benar dan sering salah." },
      { p: "RAG mengubahnya menjadi **ujian buku terbuka**: cari halaman yang relevan dulu, lalu jawab dari halaman itu." },
      { h: "Di papan" },
      { ul: ["Kiri: model yang dilatih dengan teks umum tentang lab lain menjawab dari ingatan.", "Kanan: pertanyaan yang sama dijawab dari bagian buku panduan yang diambil.", "Batang menunjukkan seberapa sering ingatan saja bisa benar."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Try every question", "Closed book gets each one wrong, but in a different believable way: another price, another name, another time."] },
      { exp: ["Lower the temperature", "At 0.1 the closed-book answer stops changing between tries, but it is still wrong. Being consistent is not the same as being correct."] },
      { exp: ["Raise the temperature", "At 1.8 the closed-book model mixes words from many labs. Count the right answers over 30 tries: still zero, because the fact was never in its training text."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Coba semua pertanyaan", "Buku tertutup salah di setiap pertanyaan, dengan cara berbeda yang meyakinkan: harga lain, nama lain, jam lain."] },
      { exp: ["Turunkan temperatur", "Pada 0,1 jawaban buku tertutup tidak lagi berubah antar percobaan, tetapi tetap salah. Konsisten tidak sama dengan benar."] },
      { exp: ["Naikkan temperatur", "Pada 1,8 model buku tertutup mencampur kata dari banyak lab. Hitung jawaban benar dari 30 percobaan: tetap nol, karena fakta itu tidak pernah ada di teks pelatihannya."] }],
  },
  specs: {
    en: [{ h: "What is simplified" }, { ul: ["The closed-book model is the tiny counting model from lesson 1, trained on a short fictional text about other labs.", "A real LLM is far more capable, but the core problem is the same: it cannot know facts that were never in its training data.", "\"Correct\" means the true fact appears in the answer text."] }],
    id: [{ h: "Yang disederhanakan" }, { ul: ["Model buku tertutup adalah model hitung mini dari pelajaran 1, dilatih dengan teks fiktif singkat tentang lab lain.", "LLM sungguhan jauh lebih mampu, tetapi masalah intinya sama: model tidak bisa tahu fakta yang tidak pernah ada di data pelatihannya.", "\"Benar\" berarti fakta yang benar muncul di teks jawaban."] }],
  },
};

export default {
  n: 2,
  stages, controls, text, Board,
  code: [
    { id: "cmp", label: L("Closed vs open book (runs here)", "Buku tertutup vs terbuka (bisa dijalankan)"), source: pySource, runnable: true, filename: "open_vs_closed.py" },
    { id: "libs", label: L("With libraries", "Dengan pustaka"), source: libSource, runnable: false, filename: "open_vs_closed_libraries.py",
      note: L("Runs on your computer with a real LLM: pip install openai sentence-transformers, then start Ollama.", "Jalankan di komputer Anda dengan LLM sungguhan: pip install openai sentence-transformers, lalu jalankan Ollama.") },
  ],
  python: (c) => {
    const lang = c.inputs.lang, qa = QA[lang][c.inputs.qi];
    return {
      prelude: prelude("tinyLm", "rag"),
      globals: { HANDBOOK: lang === "id" ? NUSABOT_ID : NUSABOT_EN, GENERAL: lang === "id" ? GENERAL_ID : GENERAL_EN,
        QUESTION: qa.q, STEM: qa.stem, EXPECT: qa.expect, LANG: lang, STOPWORDS: stopList(lang), TEMP: c.inputs.temperature, TRIES: c.inputs.tries },
      call: "demo(HANDBOOK, GENERAL, QUESTION, STEM, EXPECT, LANG, STOPWORDS, TEMP, TRIES)",
      compare: (res) => {
        let right = 0;
        for (let s = 1; s <= c.inputs.tries; s++) right += norm(closedAnswer(lang, qa.stem, c.inputs.temperature, s)).includes(" " + qa.expect + " ");
        const open = rag.runPipeline({ document: lang === "id" ? NUSABOT_ID : NUSABOT_EN, question: qa.q, size: 40, overlap: 8, topK: 3, minSim: 0.1, lang });
        return res.closed === closedAnswer(lang, qa.stem, c.inputs.temperature, 1) && res.closed_right === right && res.open === open.answer;
      },
    };
  },
  variables: (c) => [["question", c.qa ? c.qa.q : "—"], ["closed answer", c.closed ? c.closed.text : "—"], ["closed correct", c.closedRight != null ? `${c.closedRight}/${c.inputs.tries}` : "—"], ["open answer", c.openOk != null ? c.open.answer : "—"]],
  challenges: [
    { id: "all", text: L("Run all four questions to the end. Does memory ever win?", "Jalankan keempat pertanyaan sampai selesai. Apakah ingatan pernah menang?"),
      check: (c) => { if (c.openOk != null) (window.__l2seen ||= new Set()).add(c.inputs.qi); return (window.__l2seen?.size || 0) >= 4; } },
    { id: "hot", text: L("Set temperature to 1.8 or higher with 30 tries. Does randomness ever find the true fact?", "Atur temperatur 1,8 atau lebih dengan 30 percobaan. Apakah keacakan pernah menemukan fakta yang benar?"), check: (c) => c.inputs.temperature >= 1.79 && c.inputs.tries >= 30 && c.closedRight != null },
    { id: "cold", text: L("Set temperature to 0.1: the closed-book answer becomes consistent. Is it right now?", "Atur temperatur 0,1: jawaban buku tertutup menjadi konsisten. Apakah sekarang benar?"), check: (c) => c.inputs.temperature <= 0.11 && c.closedRight != null },
  ],
  quiz: [
    { q: L("Why can't an LLM answer questions about your lab's handbook from memory?", "Mengapa LLM tidak bisa menjawab pertanyaan tentang buku panduan lab Anda dari ingatan?"),
      options: [L("It was never trained on that document", "Model tidak pernah dilatih dengan dokumen itu"), L("Handbooks are too long", "Buku panduan terlalu panjang"), L("LLMs can't read numbers", "LLM tidak bisa membaca angka"), L("It needs a higher temperature", "Model butuh temperatur lebih tinggi")],
      answer: 0, why: L("Private or recent documents are not in the training data, so the model fills the gap with what is typical elsewhere.", "Dokumen pribadi atau baru tidak ada di data pelatihan, sehingga model mengisi celah dengan hal yang biasa di tempat lain.") },
    { q: L("What does RAG add before the model answers?", "Apa yang ditambahkan RAG sebelum model menjawab?"),
      options: [L("More training", "Pelatihan tambahan"), L("The relevant passage from your documents, in the prompt", "Bagian relevan dari dokumen Anda, di dalam prompt"), L("A lower temperature", "Temperatur yang lebih rendah"), L("A bigger model", "Model yang lebih besar")],
      answer: 1, why: L("Retrieval puts the facts in front of the model; no retraining is needed.", "Retrieval meletakkan fakta di depan model; tidak perlu melatih ulang.") },
    { q: L("The closed-book model gives the same answer 20 times in a row. What does that tell you?", "Model buku tertutup memberi jawaban sama 20 kali berturut-turut. Apa artinya?"),
      options: [L("The answer is definitely correct", "Jawabannya pasti benar"), L("Only that it is consistent, not that it is correct", "Hanya bahwa jawabannya konsisten, bukan benar"), L("The document was retrieved", "Dokumen sudah diambil"), L("The model was retrained", "Model sudah dilatih ulang")],
      answer: 1, why: L("Confidence and consistency are not evidence. Checking against a source is.", "Keyakinan dan konsistensi bukan bukti. Memeriksa terhadap sumber adalah bukti.") },
  ],
};
