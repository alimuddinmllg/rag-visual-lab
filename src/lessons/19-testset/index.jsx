// Lesson 19: build a test set for your own document. Saved in this browser; used by lessons 14, 15, 17, 18, 20, 23.
import { useEffect, useState } from "react";
import { loadUserSets, saveUserSet } from "../../rag/testsets.js";
import { chat, llmReady, useLLM } from "../../rag/llm.js";
import { L, quizQ } from "../shared.js";
import pySource from "./test_set.py?raw";
import libSource from "./with_libraries.py?raw";

const FACT = /(Rp\s?[0-9][0-9.,]*(?:\s+per\s+\w+)?|\b[0-9]{1,2}[:.][0-9]{2}\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+\w+|\b[0-9]+(?:[.,][0-9]+)?\s*(?:%|days?|hours?|weeks?|pages?|credits?|hari|jam|minggu|halaman|sks)\b)/i;

export function findFacts(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("## ")) continue;
    for (const s of t.split(/(?<=[.!?])\s+/)) { const m = s.match(FACT); if (m && s.split(/\s+/).length >= 5) out.push({ sentence: s, fact: m[0] }); }
  }
  return out;
}
export const draftQuestion = (f, lang) => (lang === "id" ? "Menurut dokumen: " : "According to the document: ") + f.sentence.replace(f.fact, "___");

const stages = [
  { id: "facts", label: L("Find facts", "Cari fakta"), desc: L("Scan the document for sentences with checkable facts: prices, times, counts, durations.", "Pindai dokumen untuk kalimat berisi fakta yang bisa dicek: harga, jam, jumlah, durasi."),
    run: ({ inputs }) => ({ facts: findFacts(inputs.doc.text).slice(0, inputs.max) }), log: (c) => ({ text: `${c.facts.length} fact sentences` }), live: (c) => `${c.facts.length} facts` },
  { id: "draft", label: L("Draft questions", "Buat draf pertanyaan"), desc: L("Turn each fact into a draft question with a blank, and the fact as the expected answer phrase.", "Ubah setiap fakta menjadi draf pertanyaan berisi titik-titik, dan fakta itu sebagai frasa jawaban yang diharapkan."),
    run: (c) => ({ drafts: c.facts.map((f) => [draftQuestion(f, c.inputs.doc.lang), f.fact]) }), log: (c) => ({ text: c.drafts[0] ? c.drafts[0][0].slice(0, 80) : "nothing found", warn: c.drafts.length ? null : "no facts found" }), live: (c) => `${c.drafts.length} drafts` },
  { id: "review", label: L("Review", "Tinjau"), desc: L("Rewrite each draft the way a real person would ask it. Drafts that copy the document are too easy and make your scores look better than they are.", "Tulis ulang setiap draf seperti cara orang sungguhan bertanya. Draf yang menyalin dokumen terlalu mudah dan membuat skor tampak lebih baik dari kenyataannya."),
    run: () => ({ reviewing: true }), log: () => ({ text: "edit the questions on the board" }), live: () => "edit on the board" },
  { id: "save", label: L("Save", "Simpan"), desc: L("Save the set for this document. Lessons 14–23 will use it automatically.", "Simpan set untuk dokumen ini. Pelajaran 14–23 akan memakainya otomatis."),
    run: () => ({ canSave: true }), log: () => ({ text: "press Save on the board" }), live: () => "ready" },
];

function Board({ ctx, inputs, tr }) {
  const s = useLLM();
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const saved = loadUserSets()[inputs.doc.id];
  useEffect(() => { setItems((saved?.length ? saved : ctx.drafts || []).map((x) => [...x, true])); setMsg(null); /* eslint-disable-next-line */ }, [ctx.drafts, inputs.doc.id]);
  const edit = (i, k, v) => setItems(items.map((x, j) => (j === i ? Object.assign([...x], { [k]: v }) : x)));
  const save = () => { const keep = items.filter((x) => x[2]).map((x) => [x[0], x[1]]); setMsg(saveUserSet(inputs.doc.id, keep) ? { ok: true, n: keep.length } : { ok: false }); };
  const llmDraft = async () => {
    setMsg({ busy: true });
    const out = [];
    for (const [q, fact] of items) {
      const sentence = q.replace(/^[^:]+:\s*/, "").replace("___", fact);
      try { out.push([(await chat([{ role: "user", content: `Write one short, natural question that a student would ask and that this sentence answers. Use different words from the sentence where you can. Reply with the question only, in the same language as the sentence.\nSentence: ${sentence}` }], { maxTokens: 60 })).trim(), fact, true]); }
      catch { out.push([q, fact, true]); }
    }
    setItems(out); setMsg(null);
  };
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Your test set", "Set uji Anda"))}</h2><span className="sub">{inputs.doc.title}{saved?.length ? ` · ${tr(L("saved", "tersimpan"))}: ${saved.length}` : ""}</span></div>
      <div className="plain" style={{ display: "grid", gap: 8 }}>
        {!items.length && <p className="note">{tr(L("Press Play to find facts in the document.", "Tekan Putar untuk mencari fakta di dokumen."))}</p>}
        {items.map((x, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 170px", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={x[2]} onChange={(e) => edit(i, 2, e.target.checked)} aria-label="keep" />
            <input className="docsel" value={x[0]} onChange={(e) => edit(i, 0, e.target.value)} aria-label={`question ${i + 1}`} />
            <input className="docsel mono" value={x[1]} onChange={(e) => edit(i, 1, e.target.value)} aria-label={`expected ${i + 1}`} />
          </div>
        ))}
        {!!items.length && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <button className="btn primary" onClick={save}>{tr(L("Save test set", "Simpan set uji"))}</button>
          <button className="btn" disabled={!llmReady(s) || msg?.busy} onClick={llmDraft}>{tr(L("Rewrite questions with my LLM", "Tulis ulang pertanyaan dengan LLM saya"))}</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(items.filter((x) => x[2]).map((x) => ({ question: x[0], expected: x[1] })), null, 2)).catch(() => {})}>{tr(L("Copy as JSON", "Salin sebagai JSON"))}</button>
        </div>}
        {msg && !msg.busy && <p className={`note${msg.ok ? "" : " bad"}`}>{msg.ok ? tr(L(`Saved ${msg.n} questions for this document.`, `${msg.n} pertanyaan tersimpan untuk dokumen ini.`)) : tr(L("Couldn't save (browser storage blocked).", "Tidak bisa menyimpan (penyimpanan browser diblokir)."))}</p>}
        {msg?.busy && <p className="note busy">…</p>}
        <p className="note">{tr(L("Left: the question. Right: a phrase the right chunk must contain. Untick to leave a row out.", "Kiri: pertanyaan. Kanan: frasa yang harus ada di potongan yang benar. Hilangkan centang untuk membuang baris."))}</p>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "Every improvement in lessons 9–18 was **measured** against questions with known answers. For your own documents you need your own: a **test set**." },
      { p: "Good test questions are written the way your users talk, cover every part of the document, and include questions the document **can't** answer (lesson 23)." },
      { p: "This lesson drafts questions from facts in your document (prices, times, counts). The drafts copy the document's wording, which makes them too easy: **rewrite them**, by hand or with your LLM, then save. Lessons 14, 15, 17, 18, 20 and 23 will use your set." }],
    id: [{ p: "Setiap perbaikan di pelajaran 9–18 **diukur** dengan pertanyaan yang jawabannya diketahui. Untuk dokumen Anda sendiri, Anda butuh milik sendiri: **set uji**." },
      { p: "Pertanyaan uji yang baik ditulis seperti cara pengguna bertanya, mencakup semua bagian dokumen, dan termasuk pertanyaan yang **tidak** bisa dijawab dokumen (pelajaran 23)." },
      { p: "Pelajaran ini membuat draf pertanyaan dari fakta di dokumen Anda (harga, jam, jumlah). Draf memakai kata-kata dokumen, sehingga terlalu mudah: **tulis ulang**, manual atau dengan LLM Anda, lalu simpan. Pelajaran 14, 15, 17, 18, 20, dan 23 akan memakai set Anda." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Your own document", "Upload a document (Try it yourself), build and save a set, then open lesson 20 with the same document."] }, { exp: ["Easy vs real questions", "Save the drafts as they are, check lesson 20's scores, then reword them and check again. The drop is how much the drafts flattered you."] },
      { exp: ["Facts the scanner misses", "Upload a document whose facts are names, places or dates (\"15 March\"). The patterns find few drafts. Those questions must be written by hand, and they are often the ones users ask most."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Dokumen Anda sendiri", "Unggah dokumen (Coba sendiri), buat dan simpan set, lalu buka pelajaran 20 dengan dokumen yang sama."] }, { exp: ["Pertanyaan mudah vs nyata", "Simpan draf apa adanya, cek skor di pelajaran 20, lalu ubah kata-katanya dan cek lagi. Penurunannya menunjukkan seberapa besar draf membuat skor tampak bagus."] },
      { exp: ["Fakta yang terlewat", "Unggah dokumen yang faktanya berupa nama, tempat, atau tanggal (\"15 Maret\"). Polanya hanya menemukan sedikit draf. Pertanyaan seperti itu harus ditulis manual, dan justru sering paling banyak ditanyakan pengguna."] }],
  },
  specs: {
    en: [{ dl: [["Fact patterns", "Rp prices, times like 09:00, number words + noun (\"three items\"), numbers with units (days, hours, pages, %)."], ["Storage", "Saved per document in this browser. Copy as JSON to keep a file or share it."], ["Size", "20–50 questions is a good start; more for documents with many topics."]] }],
    id: [{ dl: [["Pola fakta", "Harga Rp, jam seperti 09.00, kata bilangan + benda (\"tiga alat\"), angka dengan satuan (hari, jam, halaman, %)."], ["Penyimpanan", "Disimpan per dokumen di browser ini. Salin sebagai JSON untuk menyimpan file atau membagikannya."], ["Jumlah", "20–50 pertanyaan adalah awal yang baik; lebih banyak untuk dokumen dengan banyak topik."]] }],
  },
};


export default {
  n: 19, stages, text, Board,
  controls: [{ id: "max", label: L("Max questions", "Maks. pertanyaan"), min: 5, max: 40, step: 5, default: 15 }],
  inputs: { document: true },
  code: [
    { id: "ts", label: L("Draft a test set (runs here)", "Buat draf set uji (bisa dijalankan)"), source: pySource, runnable: true, filename: "test_set.py" },
    { id: "libs", label: L("Reword with an LLM", "Ubah kata dengan LLM"), source: libSource, runnable: false, filename: "test_set_llm.py",
      note: L("Runs on your computer after: pip install openai. A test set is just data: keep it in version control next to your code.", "Jalankan di komputer Anda setelah: pip install openai. Set uji hanyalah data: simpan di version control di samping kode Anda.") },
  ],
  python: (c) => ({
    globals: { TEXT: c.inputs.doc.text, LANG: c.inputs.doc.lang, MAX: c.inputs.max },
    call: "demo(TEXT, LANG, MAX)",
    compare: (res) => {
      const js = findFacts(c.inputs.doc.text).slice(0, c.inputs.max).map((f) => [draftQuestion(f, c.inputs.doc.lang), f.fact]);
      return JSON.stringify(res.drafts) === JSON.stringify(js);
    },
  }),
  variables: (c) => [["facts", c.facts ? String(c.facts.length) : "—"]],
  challenges: [
    { id: "own", text: L("Save a test set for a document you uploaded.", "Simpan set uji untuk dokumen yang Anda unggah."), check: (c) => c.inputs.doc.user && (loadUserSets()[c.inputs.doc.id]?.length || 0) > 0 },
    { id: "reword", text: L("Save a set where every question is reworded (no \"___\" left).", "Simpan set di mana setiap pertanyaan sudah diubah (tidak ada \"___\" tersisa)."), check: (c) => { const s = loadUserSets()[c.inputs.doc.id]; return !!s?.length && s.every((x) => !x[0].includes("___")); } },
    { id: "ten", text: L("Save a set of at least 10 questions for the document you are using.", "Simpan set berisi paling sedikit 10 pertanyaan untuk dokumen yang sedang Anda pakai."), check: (c) => (loadUserSets()[c.inputs.doc.id]?.length || 0) >= 10 },
  ],
  quiz: [
    quizQ(L("Why are questions copied from the document a weak test?", "Mengapa pertanyaan yang disalin dari dokumen adalah uji yang lemah?"), [L("They share exact words with the answer, so retrieval looks better than it is", "Kata-katanya sama persis dengan jawaban, sehingga retrieval tampak lebih baik dari kenyataan"), L("They are too long", "Terlalu panjang"), L("They contain numbers", "Berisi angka"), L("They are fine", "Tidak masalah")], 0, L("Real users paraphrase; your test must too.", "Pengguna sungguhan memparafrasa; uji Anda juga harus begitu.")),
    quizQ(L("What else belongs in a test set besides answerable questions?", "Apa lagi yang perlu ada di set uji selain pertanyaan yang bisa dijawab?"), [L("Questions the document can't answer", "Pertanyaan yang tidak bisa dijawab dokumen"), L("The model's API key", "API key model"), L("The chunk size", "Ukuran potongan"), L("Nothing", "Tidak ada")], 0, L("Without them you can't measure whether the system knows when to say \"I don't know\".", "Tanpanya Anda tidak bisa mengukur apakah sistem tahu kapan harus menjawab \"tidak tahu\".")),
    quizQ(L("The expected phrase is \"Rp 2.000 per gram\" and the system answers \"Rp2000/gram\". What does a phrase-match check report?", "Frasa yang diharapkan \"Rp 2.000 per gram\" dan sistem menjawab \"Rp2000/gram\". Apa hasil pemeriksaan pencocokan frasa?"), [L("Wrong: the words differ, so keep expected phrases short and check odd misses by hand", "Salah: kata-katanya berbeda, jadi buat frasa yang diharapkan pendek dan periksa manual kegagalan yang janggal"), L("Correct: the numbers are the same", "Benar: angkanya sama"), L("It depends on the temperature", "Tergantung temperatur"), L("The check skips numbers", "Pemeriksaan melewati angka")], 0, L("Phrase matching is strict and cheap. It can mark a right answer wrong, so read a sample of failures yourself.", "Pencocokan frasa itu ketat dan murah. Ia bisa menilai jawaban benar sebagai salah, jadi baca sendiri sebagian kegagalannya.")),
  ],
};
