// Lesson 17: small-to-big retrieval. Search small (sentences), answer big (their surrounding passage).
import * as rag from "../../rag/core.js";
import * as R from "../../rag/retrieval.js";
import { testSetFor } from "../../rag/testsets.js";
import { L, pct, getIndex, quizQ } from "../shared.js";
import { BarList } from "../../toolkit/charts.jsx";
import { SECTION_COLORS } from "../../toolkit/DocumentSpace.jsx";
import pySource from "./small_to_big.py?raw";
import libSource from "./with_libraries.py?raw";
import { prelude, stopList } from "../prelude.js";

export function sentenceIndex(doc) {
  const { sections } = rag.parseDocument(doc.text);
  const sents = [];
  let sec = -1;
  for (const line of doc.text.split("\n")) {
    const t = line.trim(); if (!t) continue;
    if (t.startsWith("## ")) { sec++; continue; }
    for (const s of t.split(/(?<=[.!?])\s+/)) if (s) sents.push({ text: s, sec: Math.max(0, sec), words: s.split(/\s+/).length });
  }
  const stop = rag.stopwordsFor(doc.lang);
  return { sections, sents, stop, emb: rag.embedChunks(sents, stop, doc.lang) };
}
export function parentOf(si, i, w) {
  const s = si.sents[i];
  const same = si.sents.map((x, j) => j).filter((j) => si.sents[j].sec === s.sec);
  const pos = same.indexOf(i);
  const ids = w >= 4 ? same : same.slice(Math.max(0, pos - w), pos + w + 1);
  return { ids, text: ids.map((j) => si.sents[j].text).join(" ") };
}
function rankSents(si, q, lang) {
  const qv = rag.vectorize(rag.tokenize(q, si.stop, lang), si.emb.idf);
  return R.rankBy(si.emb.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0)));
}

const tok = (t) => Math.round(t.split(/\s+/).length * 1.33);

const stages = [
  { id: "small", label: L("Index small", "Indeks kecil"), desc: L("Index single sentences. Small units give sharp, precise matches.", "Indeks kalimat tunggal. Unit kecil memberi kecocokan yang tajam dan tepat."),
    run: ({ inputs }) => { const si = sentenceIndex(inputs.doc); return { si, top: rankSents(si, inputs.question || "", inputs.doc.lang).slice(0, inputs.topK) }; },
    log: (c) => ({ text: `${c.si.sents.length} sentences · best: "${c.si.sents[c.top[0].i].text.slice(0, 60)}"` }), live: (c) => `${c.si.sents.length} sentences` },
  { id: "expand", label: L("Expand", "Perluas"), desc: L("For each matched sentence, fetch its parent: the sentences around it, or its whole section.", "Untuk setiap kalimat yang cocok, ambil induknya: kalimat di sekitarnya, atau seluruh bagiannya."),
    run: (c) => ({ parents: c.top.map((t) => ({ ...t, ...parentOf(c.si, t.i, c.inputs.window) })) }),
    log: (c) => ({ text: `context: ${c.parents.reduce((a, p) => a + tok(p.text), 0)} tokens (was ${c.top.reduce((a, t) => a + tok(c.si.sents[t.i].text), 0)})` }), live: (c) => `${c.parents.reduce((a, p) => a + tok(p.text), 0)} tokens` },
  { id: "compare", label: L("Compare", "Bandingkan"), desc: L("On the test questions: does the context contain the answer? Small only, big chunks only, or small-to-big?", "Pada pertanyaan uji: apakah konteks berisi jawaban? Hanya kecil, hanya potongan besar, atau kecil-ke-besar?"),
    run: (c) => {
      const ts = testSetFor(c.inputs.doc); if (!ts) return { evaluation: null };
      const big = getIndex(c.inputs.doc, 80, 0);
      const r = { small: 0, big: 0, s2b: 0, tSmall: 0, tBig: 0, tS2b: 0 };
      for (const [q, e] of ts.items) {
        const top = rankSents(c.si, q, c.inputs.doc.lang).slice(0, c.inputs.topK);
        const has = (t) => R.norm(t).includes(R.norm(e));
        const sTxt = top.map((t) => c.si.sents[t.i].text).join(" ");
        const pTxt = [...new Set(top.flatMap((t) => parentOf(c.si, t.i, c.inputs.window).ids))].map((j) => c.si.sents[j].text).join(" ");
        const bTop = R.rankBy(R.tfidfScores(big, q)).slice(0, c.inputs.topK); const bTxt = bTop.map((t) => big.chunks[t.i].text).join(" ");
        r.small += has(sTxt); r.s2b += has(pTxt); r.big += has(bTxt); r.tSmall += tok(sTxt); r.tS2b += tok(pTxt); r.tBig += tok(bTxt);
      }
      const n = ts.items.length;
      return { evaluation: { n, small: r.small / n, big: r.big / n, s2b: r.s2b / n, tSmall: r.tSmall / n, tBig: r.tBig / n, tS2b: r.tS2b / n } };
    },
    log: (c) => (c.evaluation ? { text: `answer in context: small ${pct(c.evaluation.small)} · big ${pct(c.evaluation.big)} · small-to-big ${pct(c.evaluation.s2b)}` } : { text: "no test set" }),
    live: (c) => (c.evaluation ? pct(c.evaluation.s2b) : "—") },
];

function Board({ ctx, tr }) {
  const ev = ctx.evaluation;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Match a sentence, send its passage", "Cocokkan kalimat, kirim bagiannya"))}</h2><span className="sub">{tr(L("window", "jendela"))}: {ctx.inputs.window >= 4 ? tr(L("whole section", "seluruh bagian")) : `±${ctx.inputs.window}`}</span></div>
      <div className="plain" style={{ display: "grid", gap: 10 }}>
        {(ctx.parents || ctx.top || []).map((p, k) => (
          <div key={k} className="colcard" style={{ borderLeft: `4px solid ${SECTION_COLORS[ctx.si.sents[p.i].sec % SECTION_COLORS.length]}` }}>
            <h4>{ctx.si.sections[ctx.si.sents[p.i].sec]}<span className="sub">{p.s.toFixed(2)}</span></h4>
            <div style={{ fontSize: 13.5 }}>
              {(p.ids || [p.i]).map((j) => <span key={j} style={j === p.i ? { background: "var(--query-soft)", fontWeight: 600 } : { color: "var(--muted)" }}>{ctx.si.sents[j].text} </span>)}
            </div>
          </div>
        ))}
        {!ctx.top && <p className="note">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      </div>
      {ev && <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="note" style={{ marginTop: 0 }}>{tr(L(`Answer present in the context · ${ev.n} questions · top-${ctx.inputs.topK}`, `Jawaban ada di konteks · ${ev.n} pertanyaan · top-${ctx.inputs.topK}`))}</p>
        <BarList fmt={pct} items={[{ label: tr(L("small only", "kecil saja")), value: ev.small }, { label: tr(L("big chunks", "potongan besar")), value: ev.big }, { label: tr(L("small-to-big", "kecil-ke-besar")), value: ev.s2b, hl: ev.s2b >= ev.big }]} />
        <p className="note">{tr(L("Average context size", "Rata-rata ukuran konteks"))}: {Math.round(ev.tSmall)} / {Math.round(ev.tBig)} / {Math.round(ev.tS2b)} tokens</p>
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Small chunks match precisely but lose context. Big chunks keep context but match vaguely. **Small-to-big** gets both: search over small units (sentences), then hand the model the bigger passage around each match." },
      { p: "The highlighted sentence is what matched; the grey text around it is the parent passage that goes into the prompt." }],
    id: [{ p: "Potongan kecil cocok dengan tepat tetapi kehilangan konteks. Potongan besar menjaga konteks tetapi cocoknya samar. **Kecil-ke-besar** mendapat keduanya: cari di unit kecil (kalimat), lalu berikan ke model bagian yang lebih besar di sekitar setiap kecocokan." },
      { p: "Kalimat yang disorot adalah yang cocok; teks abu-abu di sekitarnya adalah bagian induk yang masuk ke prompt." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Window 0", "Only the matched sentence goes in: precise, but answers split over two sentences go missing."] }, { exp: ["Whole section", "Set the window to the maximum. Compare the token cost with big chunks."] },
      { exp: ["Top-1 only", "Set top-k to 1 and window ±1. On the handbook the answer is in the context for every test question, at about half the tokens of one big chunk. Then set top-k to 5: the tokens triple and the hit rate has nowhere left to go."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Jendela 0", "Hanya kalimat yang cocok yang masuk: tepat, tetapi jawaban yang terbagi di dua kalimat hilang."] }, { exp: ["Seluruh bagian", "Atur jendela ke maksimum. Bandingkan biaya token dengan potongan besar."] },
      { exp: ["Hanya top-1", "Atur top-k ke 1 dan jendela ±1. Pada buku panduan, jawabannya ada di konteks untuk setiap pertanyaan uji, dengan token sekitar setengah dari satu potongan besar. Lalu atur top-k ke 5: tokennya naik tiga kali lipat dan hit rate tidak bisa naik lagi."] }],
  },
  specs: {
    en: [{ dl: [["Window", "Sentences added on each side of the match, within the same section; the maximum sends the whole section."], ["Big chunks", "80-word chunks searched directly, for comparison."], ["Also called", "Parent-document retrieval, sentence-window retrieval."]] }],
    id: [{ dl: [["Jendela", "Kalimat yang ditambahkan di tiap sisi kecocokan, di bagian yang sama; nilai maksimum mengirim seluruh bagian."], ["Potongan besar", "Potongan 80 kata yang dicari langsung, sebagai pembanding."], ["Nama lain", "Parent-document retrieval, sentence-window retrieval."]] }],
  },
};


export default {
  n: 17, stages, text, Board,
  controls: [{ id: "window", label: L("Window (sentences each side)", "Jendela (kalimat tiap sisi)"), min: 0, max: 4, step: 1, default: 1, format: (v, tr) => (v >= 4 ? tr(L("section", "bagian")) : `±${v}`) }, { id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 5, step: 1, default: 2 }],
  inputs: { document: true, question: true },
  defaultQuestion: { en: "How long can a print run before it needs an overnight slot?", id: "Berapa lama cetakan boleh berjalan sebelum perlu slot malam?" },
  examples: { en: ["How long can a print run before it needs an overnight slot?", "Can the drone kit leave the lab?", "How do I pay for membership?"], id: ["Berapa lama cetakan boleh berjalan sebelum perlu slot malam?", "Apakah kit drone boleh dibawa keluar lab?", "Bagaimana cara membayar keanggotaan?"] },
  code: [
    { id: "s2b", label: L("Small-to-big (runs here)", "Kecil-ke-besar (bisa dijalankan)"), source: pySource, runnable: true, filename: "small_to_big.py" },
    { id: "libs", label: L("With LlamaIndex", "Dengan LlamaIndex"), source: libSource, runnable: false, filename: "small_to_big_llamaindex.py",
      note: L("Runs on your computer after: pip install llama-index llama-index-embeddings-huggingface", "Jalankan di komputer Anda setelah: pip install llama-index llama-index-embeddings-huggingface") },
  ],
  python: (c) => {
    const I = c.inputs, doc = I.doc, lang = doc.lang, ts = testSetFor(doc), tests = ts ? ts.items : [];
    return {
      prelude: prelude("rag", "bm25"),
      globals: { DOCUMENT: doc.text, QUESTION: I.question || "", TESTS: tests, LANG: lang, STOPWORDS: stopList(lang), WINDOW: I.window, TOP_K: I.topK },
      call: "demo(DOCUMENT, QUESTION, [tuple(t) for t in TESTS], LANG, STOPWORDS, WINDOW, TOP_K)",
      compare: (res) => {
        const si = sentenceIndex(doc), top = rankSents(si, I.question || "", lang).slice(0, I.topK).map((t) => t.i);
        if (JSON.stringify(res.top) !== JSON.stringify(top)) return false;
        if (!tests.length) return res.rates == null;
        const big = getIndex(doc, 80, 0), r = { small: 0, big: 0, s2b: 0 };
        for (const [q, e] of tests) {
          const tp = rankSents(si, q, lang).slice(0, I.topK), has = (t) => R.norm(t).includes(R.norm(e));
          r.small += has(tp.map((t) => si.sents[t.i].text).join(" "));
          r.s2b += has([...new Set(tp.flatMap((t) => parentOf(si, t.i, I.window).ids))].map((j) => si.sents[j].text).join(" "));
          r.big += has(R.rankBy(R.tfidfScores(big, q)).slice(0, I.topK).map((t) => big.chunks[t.i].text).join(" "));
        }
        return Object.keys(r).every((k) => Math.abs(res.rates[k] - r[k] / tests.length) < 1e-9);
      },
    };
  },
  variables: (c) => [["matched", c.top ? c.top.map((t) => t.i).join(", ") : "—"], ["parent sizes", c.parents ? c.parents.map((p) => p.ids.length).join(", ") + " sentences" : "—"]],
  challenges: [
    { id: "beat", text: L("Find settings where small-to-big contains the answer as often as big chunks, with fewer tokens.", "Temukan pengaturan di mana kecil-ke-besar memuat jawaban sesering potongan besar, dengan token lebih sedikit."), check: (c) => c.evaluation && c.evaluation.s2b >= c.evaluation.big && c.evaluation.tS2b < c.evaluation.tBig },
    { id: "w0", text: L("Set the window to 0 and measure.", "Atur jendela ke 0 lalu ukur."), check: (c) => c.inputs.window === 0 && c.evaluation },
    { id: "section", text: L("Send whole sections (window at the maximum) and compare the token cost with big chunks.", "Kirim seluruh bagian (jendela maksimum) dan bandingkan biaya token dengan potongan besar."), check: (c) => c.inputs.window >= 4 && c.evaluation },
  ],
  quiz: [
    quizQ(L("What is searched in small-to-big retrieval?", "Apa yang dicari dalam retrieval kecil-ke-besar?"), [L("Small units, such as sentences", "Unit kecil, seperti kalimat"), L("Whole documents", "Seluruh dokumen"), L("The model's memory", "Ingatan model"), L("Random passages", "Bagian acak")], 0, L("Search small for precision, then expand for context.", "Cari yang kecil untuk ketepatan, lalu perluas untuk konteks.")),
    quizQ(L("What is the cost of a very large window?", "Apa biaya jendela yang sangat besar?"), [L("More tokens in every prompt", "Lebih banyak token di setiap prompt"), L("Lower precision of the match", "Ketepatan kecocokan menurun"), L("Slower embedding", "Embedding lebih lambat"), L("None", "Tidak ada")], 0, L("The match stays precise; the prompt just gets longer.", "Kecocokan tetap tepat; hanya prompt yang lebih panjang.")),
    quizQ(L("Window 0 misses an answer that spans two sentences. What is the fix?", "Jendela 0 melewatkan jawaban yang terbagi di dua kalimat. Apa perbaikannya?"), [L("Widen the window so the neighbouring sentence comes along", "Perlebar jendela agar kalimat tetangga ikut terbawa"), L("Use a bigger embedding model", "Pakai model embedding yang lebih besar"), L("Lower the temperature", "Turunkan temperatur"), L("Remove stopwords", "Hapus stopword")], 0, L("The match was right; the context was too small. Expanding fixes context without hurting the match.", "Kecocokannya sudah benar; konteksnya yang terlalu kecil. Perluasan memperbaiki konteks tanpa merusak kecocokan.")),
  ],
};
