// Lesson 30: agentic RAG. A loop that plans, calls a search tool, checks what it read, rewrites and retries,
// and stops when it has enough or runs out of steps. Twin: ./agent.py
import * as rag from "../../rag/core.js";
import { SYNONYMS } from "../../rag/retrieval.js";
import { HANDBOOK } from "../../rag/testsets.js";
import { L, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./agent.py?raw";
import libSource from "./with_libraries.py?raw";

const QS = {
  en: [["What is the price per gram for PLA?", ["2.000 per gram"]], ["How much does a gold card cost, and how many days in advance must after-hours access be booked?", ["250.000 per year", "two days in advance"]], ["What is the penalty for late returns, and what is the Wi-Fi password?", ["5.000 per item per day", null]]],
  id: [["Berapa harga per gram untuk PLA?", ["2.000 per gram"]], ["Berapa biaya kartu emas, dan berapa hari sebelumnya akses di luar jam buka harus dipesan?", ["250.000 per tahun", "dua hari"]], ["Berapa ongkos jika terlambat mengembalikan alat, dan apa kata sandi Wi-Fi?", ["5.000 per alat per hari", null]]],
};
const SAY = { en: { missing: "I couldn't find this in the document: {}.", steps: "I ran out of steps before checking: {}." }, id: { missing: "Saya tidak menemukan ini di dokumen: {}.", steps: "Langkah habis sebelum saya memeriksa: {}." } };
const uniq = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);

export function rewrite(part, syn) { const w = part.toLowerCase().match(/[a-z0-9]+/g) || []; return w.some((x) => syn[x]) ? w.map((x) => (syn[x] ? syn[x][0] : x)).join(" ") : null; }
export const plan = (q, lang) => q.split(lang === "en" ? /,\s+and\s+/ : /,\s+dan\s+/).map((p) => p.trim().replace(/\?+$/, "")).filter(Boolean);
function toolSearch(query, ix, k = 3) {
  const qv = rag.vectorize(rag.tokenize(query, ix.stop, ix.lang), ix.idf);
  return ix.vectors.map((v, i) => ({ i, s: qv.size ? rag.cosine(qv, v) : 0 })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, k);
}
function enough(part, query, top, ix) {
  const q = uniq(rag.tokenize(query, ix.stop, ix.lang)), unknown = q.filter((t) => !ix.idf.has(t));
  const words = uniq(rag.tokenize(part, ix.stop, ix.lang)), have = new Set(rag.tokenize(ix.chunks[top[0].i].text, ix.stop, ix.lang));
  const cover = words.filter((t) => ix.idf.has(t) && have.has(t)).length / Math.max(1, words.length);
  return { ok: !unknown.length && cover >= 0.6 && top[0].s >= 0.15, unknown, cover };
}
export function agent(question, ix, maxSteps) {
  const parts = plan(question, ix.lang), trace = [["plan", parts]], found = {}, status = {};
  let steps = 0;
  parts.forEach((part, p) => {
    const queries = [part], retry = rewrite(part, SYNONYMS[ix.lang]);
    if (retry) queries.push(retry);
    for (let a = 0; a < queries.length; a++) {
      if (steps >= maxSteps) { status[p] = "steps"; break; }
      steps++;
      const top = toolSearch(queries[a], ix), e = enough(part, queries[a], top, ix);
      trace.push(["search", p, queries[a], top[0].i, top[0].s, e.ok, e.unknown, e.cover]);
      if (e.ok) { found[p] = top[0]; status[p] = "found"; break; }
      if (a + 1 < queries.length) trace.push(["rewrite", p, queries[a + 1]]); else status[p] = "missing";
    }
    if (!(p in status)) status[p] = "steps";
  });
  return { parts, found, status, trace, steps };
}
function compose(parts, found, status, ix) {
  const out = [], cites = [];
  parts.forEach((part, p) => {
    if (status[p] === "found") {
      cites.push(found[p].i);
      const known = rag.tokenize(part, ix.stop, ix.lang).filter((t) => ix.idf.has(t));
      out.push(rag.extractAnswer([found[p]], ix.chunks, known, ix.idf, ix.stop, ix.lang).text.split("[1]").join(`[${cites.length}]`));
    } else out.push(SAY[ix.lang][status[p]].replace("{}", part));
  });
  return { answer: out.join(" "), used: cites };
}
const grade = (answer, expected, status) => expected.map((e, p) => (e ? answer.includes(e) : status != null && status[p] === "missing"));

const ixCache = {};
function index(lang) {
  if (!ixCache[lang]) {
    const stop = rag.stopwordsFor(lang), chunks = rag.chunkDocument(rag.parseDocument(HANDBOOK[lang]).words, 40, 8), emb = rag.embedChunks(chunks, stop, lang);
    ixCache[lang] = { lang, stop, chunks, idf: emb.idf, vectors: emb.vectors };
  }
  return ixCache[lang];
}

function run(inputs) {
  const lang = inputs.uiLang, ix = index(lang), [q, expected] = QS[lang][+inputs.qi];
  if (inputs.mode === "one-shot") {
    const top = toolSearch(q, ix), known = rag.tokenize(q, ix.stop, ix.lang).filter((t) => ix.idf.has(t));
    const answer = rag.extractAnswer(top, ix.chunks, known, ix.idf, ix.stop, ix.lang).text;
    return { ix, q, expected, parts: plan(q, lang), status: null, trace: [["search", 0, q, top[0].i, null, null, [], null]], steps: 1, answer, used: top.map((x) => x.i), right: grade(answer, expected, null) };
  }
  const a = agent(q, ix, inputs.maxSteps), c = compose(a.parts, a.found, a.status, ix);
  return { ix, q, expected, ...a, ...c, right: grade(c.answer, expected, a.status) };
}

const stages = [
  { id: "plan", label: L("Plan", "Rencana"), desc: L("Split the question into parts that can be looked up one at a time.", "Pecah pertanyaan menjadi bagian-bagian yang bisa dicari satu per satu."),
    run: ({ inputs }) => { const r = run(inputs); return { full: r, q: r.q, parts: r.parts }; }, log: (c) => ({ text: `${c.parts.length} part(s)` }), live: (c) => `${c.parts.length} part(s)` },
  { id: "search", label: L("Search", "Cari"), desc: L("Call the search tool with a query and read the best chunk.", "Panggil alat pencarian dengan sebuah kueri lalu baca potongan terbaik."),
    run: (c) => ({ shown: 2 }), log: (c) => ({ text: `${c.full.trace.filter((t) => t[0] === "search").length} search call(s)` }), live: (c) => `${c.full.steps} call(s)` },
  { id: "check", label: L("Check", "Periksa"), desc: L("Is this enough? Every query word must exist in the document, and the chunk must contain most of the part's words. If not, rewrite in the document's words and try again.", "Cukupkah? Setiap kata kueri harus ada di dokumen, dan potongan harus berisi sebagian besar kata bagian itu. Jika tidak, tulis ulang dengan kata-kata dokumen lalu coba lagi."),
    run: () => ({ shown: 3 }), log: (c) => ({ text: `${c.full.trace.filter((t) => t[0] === "rewrite").length} rewrite(s)` }), live: (c) => `${c.full.trace.filter((t) => t[0] === "rewrite").length} rewrite(s)` },
  { id: "loop", label: L("Loop or stop", "Ulang atau berhenti"), desc: L("Move to the next part, retry, or stop: when every part is settled, or the step budget is spent.", "Lanjut ke bagian berikutnya, ulangi, atau berhenti: saat setiap bagian selesai, atau anggaran langkah habis."),
    run: () => ({ shown: 4 }), log: (c) => ({ text: `${c.full.steps} of ${c.inputs.mode === "one-shot" ? 1 : c.inputs.maxSteps} steps used`, warn: c.full.status && Object.values(c.full.status).includes("steps") ? "ran out of steps" : null }), live: (c) => `${c.full.steps} steps` },
  { id: "answer", label: L("Answer", "Jawab"), desc: L("Answer each part from its own evidence, and say plainly which parts the document doesn't cover.", "Jawab setiap bagian dari buktinya sendiri, dan katakan terus terang bagian mana yang tidak ada di dokumen."),
    run: (c) => ({ answer: c.full.answer, right: c.full.right }), log: (c) => ({ text: `${c.right.filter(Boolean).length}/${c.right.length} parts right`, warn: c.right.every(Boolean) ? null : "not every part is right" }), live: (c) => `${c.right.filter(Boolean).length}/${c.right.length}` },
];

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, f = ctx.full;
  if (!f) return null;
  const T = (en, id) => tr(L(en, id));
  const rows = f.trace.filter((t) => t[0] !== "plan");
  return (
    <div className="card board">
      <div className="card-h"><h2>{T("The agent's trace", "Jejak agen")}</h2><span className="sub">{ctx.inputs.mode === "one-shot" ? T("one search, then answer", "satu pencarian, lalu jawab") : `${T("up to", "paling banyak")} ${ctx.inputs.maxSteps} ${T("searches", "pencarian")}`}</span></div>
      <div className="plain" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13.5 }}><b>{f.q}</b></div>
        {ctx.inputs.mode === "agent" && <div className="colcard"><h4>1 · {T("Plan", "Rencana")}</h4><ol style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 13 }}>{f.parts.map((p, i) => <li key={i}>{p} <span className="sub">· {f.status[i] === "found" ? "✓" : f.status[i] === "missing" ? T("not in the document", "tidak ada di dokumen") : T("not checked", "belum diperiksa")}</span></li>)}</ol></div>}
        {ph >= 2 && rows.map((t, k) => t[0] === "rewrite"
          ? <div key={k} className="colcard" style={{ borderLeft: "4px solid #b58bd6", fontSize: 12.5 }}><h4>{T("Rewrite", "Tulis ulang")}</h4>{T("Not enough. Try the document's words:", "Belum cukup. Coba kata-kata dokumen:")} <span className="mono">“{t[2]}”</span></div>
          : <div key={k} className="colcard" style={{ borderLeft: `4px solid ${t[5] == null ? "var(--line)" : t[5] ? "var(--good)" : "var(--warn)"}`, fontSize: 12.5 }}>
            <h4>{T("Search", "Cari")} <span className="mono" style={{ fontWeight: 400 }}>search(“{t[2]}”)</span>{t[4] != null && <span className="sub"> · {t[4].toFixed(2)}</span>}</h4>
            <div>{f.ix.chunks[t[3]].text}</div>
            {ph >= 3 && t[5] != null && <div className="sub" style={{ marginTop: 4, color: t[5] ? "var(--good)" : "var(--warn)" }}>{t[5] ? T("Enough: this answers the part.", "Cukup: ini menjawab bagian tersebut.") : t[6].length ? `${T("Not enough: the document never uses", "Belum cukup: dokumen tidak pernah memakai")} ${t[6].map((w) => `“${w}”`).join(", ")}.` : `${T("Not enough: only", "Belum cukup: hanya")} ${Math.round(t[7] * 100)}% ${T("of the words match.", "kata yang cocok.")}`}</div>}
          </div>)}
        {ph >= 4 && <p className="note" style={{ margin: 0 }}>{f.steps} {T("search call(s).", "panggilan pencarian.")} {f.status && Object.values(f.status).includes("steps") ? T("The step budget ran out before every part was checked.", "Anggaran langkah habis sebelum semua bagian diperiksa.") : ""}</p>}
        {ph >= 5 && <div className="answer" style={{ borderLeft: `4px solid ${f.right.every(Boolean) ? "var(--good)" : "var(--warn)"}` }}>
          <b style={{ color: f.right.every(Boolean) ? "var(--good)" : "var(--warn)" }}>{f.right.filter(Boolean).length}/{f.right.length} {T("parts right", "bagian benar")}:</b> {f.answer}</div>}
        {ph >= 5 && ctx.inputs.mode === "one-shot" && f.expected.includes(null) && <p className="note" style={{ margin: 0 }}>{T("One search answered what it could and said nothing about the rest. The user can't tell that a part is missing.", "Satu pencarian menjawab yang bisa dijawab dan diam tentang sisanya. Pengguna tidak tahu bahwa ada bagian yang hilang.")}</p>}
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Classic RAG searches once and answers. An **agent** runs a loop: it decides what to look up, calls a **search tool**, reads what came back, and decides whether that is enough. If not, it rewrites the query and searches again. It stops when every part is settled or a **step budget** runs out." },
      { p: "The decisions are normally made by an LLM. Here they are a few readable rules so you can see exactly why each step happens, and every run is the same." },
      { p: "Ask the two-part questions in both modes, then lower the step budget." },
    ],
    id: [
      { p: "RAG klasik mencari sekali lalu menjawab. **Agen** menjalankan perulangan: ia memutuskan apa yang dicari, memanggil **alat pencarian**, membaca hasilnya, dan memutuskan apakah itu cukup. Jika belum, ia menulis ulang kueri lalu mencari lagi. Ia berhenti saat setiap bagian selesai atau **anggaran langkah** habis." },
      { p: "Keputusannya biasanya dibuat oleh LLM. Di sini keputusannya berupa beberapa aturan yang mudah dibaca agar Anda bisa melihat persis mengapa setiap langkah terjadi, dan setiap jalannya sama." },
      { p: "Ajukan pertanyaan dua bagian di kedua mode, lalu kecilkan anggaran langkah." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Saying what's missing", "Third question, one-shot: a good answer about late returns, and silence about the password. Switch to the agent: it searches for the password, finds nothing, and says so."] },
      { exp: ["The rewrite", "First question with the agent: \"price\" never appears in the handbook, so the first search is rejected even though it found the right chunk. The retry uses \"cost\", the document's word."] },
      { exp: ["Budget", "Set the step budget to 1 or 2 on the third question. Each search is a model call in a real agent: more steps cost more time and money (lesson 27)."] },
      { exp: ["When one search is enough", "The second question works in both modes. An agent earns its cost on questions that need several lookups or an honest \"not found\"."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Menyebut yang hilang", "Pertanyaan ketiga, one-shot: jawaban yang baik tentang keterlambatan, dan diam soal kata sandi. Ganti ke agen: ia mencari kata sandi, tidak menemukan apa pun, dan mengatakannya."] },
      { exp: ["Penulisan ulang", "Pertanyaan pertama dengan agen: \"harga\" tidak pernah muncul di buku panduan, jadi pencarian pertama ditolak meskipun menemukan potongan yang benar. Percobaan kedua memakai \"biaya\", kata dari dokumen."] },
      { exp: ["Anggaran", "Atur anggaran langkah ke 1 atau 2 pada pertanyaan ketiga. Setiap pencarian adalah panggilan model pada agen sungguhan: lebih banyak langkah, lebih banyak waktu dan uang (pelajaran 27)."] },
      { exp: ["Saat satu pencarian cukup", "Pertanyaan kedua berhasil di kedua mode. Agen sepadan biayanya pada pertanyaan yang butuh beberapa pencarian atau \"tidak ditemukan\" yang jujur."] }],
  },
  specs: {
    en: [{ dl: [["Tool", "search(query) returns the top 3 chunks. Real agents can also have tools for filters, calculators or other databases."], ["Enough?", "Every query word must exist in the document, the best chunk must contain at least 60% of the part's words, and its score must be 0.15 or more. An LLM judges this in a real agent, less predictably."], ["Rewrite", "The lesson 16 synonym table, standing in for the LLM writing a better query."], ["Step budget", "A hard cap on tool calls. Without one, an agent that never feels sure can loop and spend without limit."]] }],
    id: [{ dl: [["Alat", "search(query) mengembalikan 3 potongan teratas. Agen sungguhan juga bisa punya alat untuk filter, kalkulator, atau database lain."], ["Cukup?", "Setiap kata kueri harus ada di dokumen, potongan terbaik harus berisi minimal 60% kata bagian itu, dan skornya minimal 0,15. Pada agen sungguhan LLM yang menilai ini, dengan hasil yang kurang bisa ditebak."], ["Tulis ulang", "Tabel sinonim pelajaran 16, menggantikan LLM yang menulis kueri yang lebih baik."], ["Anggaran langkah", "Batas keras jumlah panggilan alat. Tanpa batas, agen yang tidak pernah merasa yakin bisa berputar dan menghabiskan biaya tanpa henti."]] }],
  },
};

export default {
  n: 30, stages, text, Board,
  controls: [
    { id: "qi", type: "select", default: "2", label: L("Question", "Pertanyaan"), options: QS.en.map(([q], i) => ({ value: String(i), label: L(q, QS.id[i][0]) })) },
    { id: "mode", type: "select", default: "agent", label: L("Mode", "Mode"), options: [{ value: "one-shot", label: L("One search (classic RAG)", "Satu pencarian (RAG klasik)") }, { value: "agent", label: L("Agent loop", "Perulangan agen") }] },
    { id: "maxSteps", label: L("Step budget", "Anggaran langkah"), min: 1, max: 5, step: 1, default: 4 },
  ],
  code: [
    { id: "agent", label: L("Agent loop (runs here)", "Perulangan agen (bisa dijalankan)"), source: pySource, runnable: true, filename: "agent.py" },
    { id: "libs", label: L("With LLM tool calling", "Dengan pemanggilan alat LLM"), source: libSource, runnable: false, filename: "agent_tools.py", note: L("Runs on your computer after: pip install openai numpy sentence-transformers", "Jalankan di komputer Anda setelah: pip install openai numpy sentence-transformers") },
  ],
  variables: (c) => [["steps", c.full ? String(c.full.steps) : "—"], ["status", c.full?.status ? JSON.stringify(Object.values(c.full.status)) : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang, [q, e] = QS[lang][+I.qi];
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: HANDBOOK[lang], QUESTION: q, EXPECTED: e, MODE: I.mode, MAX_STEPS: I.maxSteps, SYNONYMS: SYNONYMS[lang], LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(DOCUMENT, QUESTION, EXPECTED, MODE, MAX_STEPS, SYNONYMS, LANG, STOPWORDS)",
      compare: (res) => {
        const f = run(I), close = (a, b) => (a == null || b == null ? a === b || (a == null && b == null) : Math.abs(a - b) < 1e-9);
        const same = res.trace.length === f.trace.length && res.trace.every((t, k) => {
          const u = f.trace[k];
          if (t[0] !== u[0]) return false;
          if (t[0] === "search") return t[1] === u[1] && t[2] === u[2] && t[3] === u[3] && close(t[4], u[4]) && t[5] === u[5] && JSON.stringify(t[6]) === JSON.stringify(u[6]) && close(t[7], u[7]);
          return JSON.stringify(t) === JSON.stringify(u);
        });
        return same && res.answer === f.answer && JSON.stringify(res.used) === JSON.stringify(f.used) && res.steps === f.steps && JSON.stringify(res.right) === JSON.stringify(f.right);
      },
    };
  },
  challenges: [
    { id: "honest", text: L("Get an answer that says plainly which part the document can't answer.", "Dapatkan jawaban yang dengan jelas menyebut bagian mana yang tidak bisa dijawab dokumen."), check: (c) => c.right && c.inputs.mode === "agent" && +c.inputs.qi === 2 && c.right.every(Boolean) },
    { id: "retry", text: L("Watch the agent reject its first search and recover with a rewrite.", "Lihat agen menolak pencarian pertamanya lalu pulih dengan penulisan ulang."), check: (c) => c.full && c.full.trace.some((t) => t[0] === "rewrite") && c.right?.[0] === true },
    { id: "budget", text: L("Find the smallest step budget that still gets every part of the third question right.", "Temukan anggaran langkah terkecil yang tetap menjawab benar setiap bagian pertanyaan ketiga."), check: (c) => c.right && c.inputs.mode === "agent" && +c.inputs.qi === 2 && c.inputs.maxSteps === 3 && c.right.every(Boolean) },
  ],
  quiz: [
    quizQ(L("What does an agent do that a single search doesn't?", "Apa yang dilakukan agen tetapi tidak oleh satu pencarian?"), [L("Decides after each search whether to search again", "Memutuskan setelah setiap pencarian apakah perlu mencari lagi"), L("Uses a bigger index", "Memakai indeks yang lebih besar"), L("Skips retrieval", "Melewati retrieval"), L("Always answers faster", "Selalu menjawab lebih cepat")], 0, L("The loop is the difference: search, check, retry or stop.", "Perulangan itulah bedanya: cari, periksa, ulangi atau berhenti.")),
    quizQ(L("Why give an agent a step budget?", "Mengapa agen diberi anggaran langkah?"), [L("Each step costs time and money, and an unsure agent could loop forever", "Setiap langkah memakan waktu dan uang, dan agen yang ragu bisa berputar tanpa henti"), L("To make answers longer", "Agar jawaban lebih panjang"), L("Because search tools need it", "Karena alat pencarian membutuhkannya"), L("It improves embeddings", "Memperbaiki embedding")], 0, L("A hard cap keeps cost and latency predictable.", "Batas keras menjaga biaya dan latensi tetap bisa ditebak.")),
    quizQ(L("When is classic one-search RAG the better choice?", "Kapan RAG klasik satu pencarian lebih baik?"), [L("Simple questions one search can answer: cheaper and faster", "Pertanyaan sederhana yang bisa dijawab satu pencarian: lebih murah dan cepat"), L("Never", "Tidak pernah"), L("Multi-part questions", "Pertanyaan banyak bagian"), L("When the document is missing an answer", "Saat dokumen tidak punya jawabannya")], 0, L("Use the loop where it pays: several lookups, or an honest \"not found\".", "Pakai perulangan saat sepadan: beberapa pencarian, atau \"tidak ditemukan\" yang jujur.")),
  ],
};
