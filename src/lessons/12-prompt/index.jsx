// Lesson 12: assembling the prompt. Order, token budget, and citations back to sources.
import { useState } from "react";
import * as rag from "../../rag/core.js";
import * as S from "../../rag/stages.js";
import { SECTION_COLORS } from "../../toolkit/DocumentSpace.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import pySource from "./assemble.py?raw";

const L = (en, id) => ({ en, id });
const tok = rag.countTokens;

export function orderTop(top, how) {
  if (how === "document") return [...top].sort((a, b) => a.i - b.i);
  if (how === "edges") { const f = top.filter((_, k) => k % 2 === 0), b = top.filter((_, k) => k % 2 === 1); return [...f, ...b.reverse()]; }
  return [...top];
}

const stages = [
  { id: "retrieve", label: L("Retrieve", "Ambil"), desc: L("Get the top-k chunks for the question (lesson 6).", "Ambil top-k potongan untuk pertanyaan (pelajaran 6)."),
    run: (c0) => { let c = { ...c0, ...S.chunkStage(c0) }; c = { ...c, ...S.embedStage(c) }; c = { ...c, ...S.queryStage(c) }; return { ...c, ...S.retrieveStage(c) }; },
    log: (c) => ({ text: c.used.map((t) => `#${t.i + 1} ${t.s.toFixed(2)}`).join(", ") || "nothing relevant" }), live: (c) => `${c.used.length} chunks` },
  { id: "order", label: L("Order", "Urutkan"), desc: L("Decide the order chunks appear in. Models pay most attention to the start and the end of the prompt.", "Tentukan urutan potongan. Model paling memperhatikan awal dan akhir prompt."),
    run: (c) => ({ ordered: orderTop(c.used, c.inputs.order) }), log: (c) => ({ text: `${c.inputs.order}: ${c.ordered.map((t) => "#" + (t.i + 1)).join(" ")}` }), live: (c) => c.inputs.order },
  { id: "budget", label: L("Fit budget", "Sesuaikan anggaran"), desc: L("Count tokens. Instructions, question and room for the answer come first; chunks fill what is left, in order, until the next one doesn't fit.", "Hitung token. Instruksi, pertanyaan, dan ruang jawaban didahulukan; potongan mengisi sisanya, berurutan, sampai potongan berikutnya tidak muat."),
    run: (c) => {
      const sys = rag.PROMPT_TEMPLATE[c.lang].system;
      const fixed = { system: tok(sys), question: tok(c.inputs.question || ""), reserve: c.inputs.reserve };
      let room = c.inputs.budget - fixed.system - fixed.question - fixed.reserve;
      const kept = [], dropped = [];
      for (const t of c.ordered) { const cost = tok(c.chunks[t.i].text); if (cost <= room) { kept.push({ ...t, cost }); room -= cost; } else dropped.push({ ...t, cost }); }
      return { fixed, kept, dropped, room };
    },
    log: (c) => ({ text: `kept ${c.kept.length}, dropped ${c.dropped.length}, ${Math.max(0, c.room)} tokens spare`, warn: c.dropped.length ? `${c.dropped.length} chunk(s) didn't fit` : null }),
    live: (c) => `${c.kept.length} kept / ${c.dropped.length} dropped` },
  { id: "assemble", label: L("Assemble", "Susun"), desc: L("Write the final prompt: instructions, numbered sources, the question.", "Tulis prompt akhir: instruksi, sumber bernomor, pertanyaan."),
    run: (c) => { const prompt = rag.buildPrompt(c.inputs.question, c.kept, c.chunks, c.sections, c.lang); return { prompt, promptTokens: tok(prompt) }; },
    log: (c) => ({ text: `≈${c.promptTokens} tokens of ${c.inputs.budget}` }), live: (c) => `≈${c.promptTokens} tokens` },
  { id: "cite", label: L("Cite", "Sitasi"), desc: L("The answer marks each claim with [n]. Every marker points back to a numbered source, so readers can check it.", "Jawaban menandai setiap klaim dengan [n]. Setiap penanda menunjuk ke sumber bernomor, sehingga pembaca bisa memeriksanya."),
    run: (c) => ({ answer: rag.extractAnswer(c.kept, c.chunks, c.qTokens.filter((t) => c.tfidf.idf.has(t)), c.tfidf.idf, c.stop, c.lang) }),
    log: (c) => ({ text: c.answer.text.slice(0, 100) }), live: (c) => (c.answer.grounded ? `cites ${c.answer.parts.map((p) => "[" + p.cite + "]").join(" ")}` : "no sources") },
];

function Board({ ctx, runner, tr }) {
  const [cite, setCite] = useState(null);
  const B = ctx.inputs.budget, ph = runner.phase;
  const seg = (w, bg, label, key, extra = {}) => <i key={key} title={label} style={{ width: `${Math.max(0, (w / B) * 100)}%`, background: bg, position: "relative", ...extra }} />;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("The prompt, token by token", "Prompt, token demi token"))}</h2><span className="sub">{tr(L("budget", "anggaran"))}: {B} tokens</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      <div className="plain">
        {ph >= 3 ? <>
          <div className="segbar" style={{ height: 34, borderRadius: 6 }}>
            {seg(ctx.fixed.system, "var(--muted)", "system", "s")}
            {ctx.kept.map((t, n) => seg(t.cost, SECTION_COLORS[ctx.chunks[t.i].sec % SECTION_COLORS.length], `[${n + 1}] #${t.i + 1}`, "k" + t.i, { opacity: cite == null || cite === n + 1 ? 1 : 0.3 }))}
            {seg(ctx.fixed.question, "#7a5cc2", "question", "q")}
            {seg(Math.max(0, ctx.room), "var(--grid)", "spare", "sp")}
            {seg(ctx.fixed.reserve, "repeating-linear-gradient(45deg,var(--grid),var(--grid) 4px,var(--line) 4px,var(--line) 8px)", "answer", "r")}
          </div>
          <div className="legend2" style={{ borderTop: 0, padding: "6px 0" }}>
            <span><i style={{ background: "var(--muted)" }} />{tr(L("instructions", "instruksi"))} {ctx.fixed.system}</span>
            <span><i style={{ background: "var(--accent)" }} />{tr(L("sources", "sumber"))} {ctx.kept.reduce((a, t) => a + t.cost, 0)}</span>
            <span><i style={{ background: "#7a5cc2" }} />{tr(L("question", "pertanyaan"))} {ctx.fixed.question}</span>
            <span><i style={{ background: "var(--line)" }} />{tr(L("reserved for the answer", "cadangan untuk jawaban"))} {ctx.fixed.reserve}</span>
          </div>
          {ctx.dropped.length > 0 && <p className="note bad">{tr(L("Didn't fit:", "Tidak muat:"))} {ctx.dropped.map((t) => `#${t.i + 1} (${t.cost} tok)`).join(", ")}</p>}
        </> : <p className="note">{tr(L("Run to the Fit budget step to see the token budget.", "Jalankan sampai langkah Sesuaikan anggaran untuk melihat anggaran token."))}</p>}
      </div>
      <div className="split">
        <div className="plain">
          <p className="note" style={{ marginTop: 0 }}>{tr(L("Sources in the prompt, in order", "Sumber di prompt, berurutan"))}</p>
          <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, display: "grid", gap: 6 }}>
            {(ctx.kept || ctx.ordered || []).map((t, n) => (
              <li key={t.i} style={{ background: cite === n + 1 ? "var(--query-soft)" : "transparent", borderRadius: 6, padding: "2px 4px" }}>
                <span className="mono" style={{ color: "var(--muted)" }}>#{t.i + 1} · {t.s.toFixed(2)}</span> {ctx.chunks[t.i].text.slice(0, 140)}…
              </li>))}
          </ol>
        </div>
        <div className="plain">
          <p className="note" style={{ marginTop: 0 }}>{tr(L("Answer with citations: hover a marker", "Jawaban dengan sitasi: arahkan ke penanda"))}</p>
          {ctx.answer ? (
            <div className={`answer${ctx.answer.grounded ? "" : " none"}`}>
              {ctx.answer.grounded ? ctx.answer.parts.map((p, i) => (
                <span key={i}>{p.text}<sup role="button" tabIndex={0} style={{ cursor: "pointer" }} onMouseEnter={() => setCite(p.cite)} onMouseLeave={() => setCite(null)} onFocus={() => setCite(p.cite)} onBlur={() => setCite(null)}>[{p.cite}]</sup>{" "}</span>
              )) : ctx.answer.text}
            </div>
          ) : <p className="note">{tr(L("Waiting for the Cite step…", "Menunggu langkah Sitasi…"))}</p>}
        </div>
      </div>
    </div>
  );
}

function DataPanel({ ctx, tr }) {
  return <pre className="code" style={{ maxHeight: 360, padding: "10px 12px", whiteSpace: "pre-wrap", margin: 0 }}>{ctx.prompt || tr(L("Run the Assemble step to see the full prompt.", "Jalankan langkah Susun untuk melihat prompt lengkap."))}</pre>;
}

const text = {
  overview: {
    en: [
      { p: "Retrieval gives you chunks. The **prompt** is where they meet the model, and it has a **token budget**: instructions + sources + question + room for the answer must all fit." },
      { ul: ["**Order** matters: models attend best to the start and end of a long prompt. \"Edges\" puts the strongest chunks there.", "**Budget**: when chunks don't fit, the lowest-ranked ones are dropped. Reserve room for the answer, or it gets cut off.", "**Citations**: number the sources so every claim in the answer can be traced back and checked."] },
      { h: "Try" },
      { ol: ["Shrink the **budget** until chunks start being dropped.", "Hover a [n] marker in the answer to highlight its source.", "Switch **order** and watch the numbering change."] },
    ],
    id: [
      { p: "Retrieval memberi potongan. **Prompt** adalah tempat potongan itu bertemu model, dan prompt punya **anggaran token**: instruksi + sumber + pertanyaan + ruang untuk jawaban semuanya harus muat." },
      { ul: ["**Urutan** penting: model paling memperhatikan awal dan akhir prompt yang panjang. \"Tepi\" menaruh potongan terkuat di sana.", "**Anggaran**: jika potongan tidak muat, yang peringkatnya terendah dibuang. Sisakan ruang untuk jawaban, atau jawabannya terpotong.", "**Sitasi**: beri nomor pada sumber agar setiap klaim di jawaban bisa dilacak dan diperiksa."] },
      { h: "Coba" },
      { ol: ["Kecilkan **anggaran** sampai potongan mulai dibuang.", "Arahkan kursor ke penanda [n] di jawaban untuk menyorot sumbernya.", "Ganti **urutan** dan lihat penomoran berubah."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Starve the answer", "Set the answer reserve to 0. The prompt fits more sources, but in a real model the answer would be cut off mid-sentence."] }, { exp: ["Lost in the middle", "With top-k 7 and order \"edges\", the best chunk is [1] and the second best is last. Lesson 18 measures why this helps."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Kurangi ruang jawaban", "Atur cadangan jawaban ke 0. Prompt memuat lebih banyak sumber, tetapi pada model sungguhan jawaban akan terpotong di tengah kalimat."] }, { exp: ["Hilang di tengah", "Dengan top-k 7 dan urutan \"tepi\", potongan terbaik menjadi [1] dan terbaik kedua di akhir. Pelajaran 18 mengukur mengapa ini membantu."] }],
  },
  specs: {
    en: [{ dl: [["Budget", "The total tokens you allow per request: a cost and latency decision, not only the model's maximum."], ["Answer reserve", "Tokens kept free for the model's reply."], ["Order: score", "Best first."], ["Order: document", "Source reading order. Helps when chunks continue each other."], ["Order: edges", "Best at the start, second best at the end, weakest in the middle."]] }],
    id: [{ dl: [["Anggaran", "Total token yang diizinkan per permintaan: keputusan biaya dan latensi, bukan hanya batas maksimum model."], ["Cadangan jawaban", "Token yang dibiarkan kosong untuk balasan model."], ["Urutan: skor", "Terbaik dulu."], ["Urutan: dokumen", "Urutan baca sumber. Membantu jika potongan saling bersambung."], ["Urutan: tepi", "Terbaik di awal, terbaik kedua di akhir, terlemah di tengah."]] }],
  },
};

export default {
  n: 12,
  stages, text, Board, DataPanel,
  controls: [
    { id: "budget", label: L("Token budget", "Anggaran token"), min: 150, max: 1200, step: 25, default: 450 },
    { id: "reserve", label: L("Answer reserve", "Cadangan jawaban"), min: 0, max: 300, step: 25, default: 100 },
    { id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 8, step: 1, default: 5 },
    { id: "order", type: "select", default: "score", label: L("Order", "Urutan"), options: [{ value: "score", label: L("By score (best first)", "Menurut skor (terbaik dulu)") }, { value: "document", label: L("Document order", "Urutan dokumen") }, { value: "edges", label: L("Edges (best at start and end)", "Tepi (terbaik di awal dan akhir)") }] },
    S.methodControl,
  ],
  extraValues: { size: 40, overlap: 8, minSim: 0.05 },
  useExtra: S.useNeuralExtra,
  inputs: { document: true, question: true },
  defaultQuestion: { en: "How much does PLA printing cost?", id: "Berapa biaya cetak PLA?" },
  examples: { en: ["How much does PLA printing cost?", "What are the safety rules?", "How do I get after-hours access?"], id: ["Berapa biaya cetak PLA?", "Apa aturan keselamatannya?", "Bagaimana mendapat akses di luar jam buka?"] },
  code: [{ id: "asm", label: L("Prompt assembly", "Penyusunan prompt"), source: pySource, runnable: false, filename: "assemble.py", note: L("Pair with lesson 6's retrieve(); then send the prompt to any LLM.", "Pasangkan dengan retrieve() pelajaran 6; lalu kirim prompt ke LLM mana pun.") }],
  variables: (c) => [["order", c.ordered ? c.ordered.map((t) => t.i).join(", ") : "—"], ["kept", c.kept ? c.kept.map((t) => t.i).join(", ") : "—"], ["dropped", c.dropped ? c.dropped.map((t) => t.i).join(", ") || "[]" : "—"], ["prompt tokens", c.promptTokens ? String(c.promptTokens) : "—"]],
  challenges: [
    { id: "drop", text: L("Lower the budget until at least two chunks are dropped.", "Turunkan anggaran sampai paling sedikit dua potongan dibuang."), check: (c) => c.dropped && c.dropped.length >= 2 },
    { id: "edges", text: L("Use the \"edges\" order with at least 4 sources in the prompt.", "Gunakan urutan \"tepi\" dengan paling sedikit 4 sumber di prompt."), check: (c) => c.inputs.order === "edges" && c.kept && c.kept.length >= 4 },
    { id: "cite", text: L("Get an answer that cites two different sources.", "Dapatkan jawaban yang menyitasi dua sumber berbeda."), check: (c) => c.answer?.grounded && new Set(c.answer.parts.map((p) => p.cite)).size >= 2 },
  ],
  quiz: [
    { q: L("What must fit inside the token budget?", "Apa saja yang harus muat dalam anggaran token?"),
      options: [L("Instructions, sources, question and the answer", "Instruksi, sumber, pertanyaan, dan jawaban"), L("Only the sources", "Hanya sumber"), L("Only the question", "Hanya pertanyaan"), L("The whole document", "Seluruh dokumen")],
      answer: 0, why: L("The answer is generated inside the same window, so it needs room too.", "Jawaban dibuat di jendela yang sama, jadi juga perlu ruang.") },
    { q: L("Why number the sources in the prompt?", "Mengapa sumber di prompt diberi nomor?"),
      options: [L("So the answer can cite them and readers can check each claim", "Agar jawaban bisa menyitasinya dan pembaca bisa memeriksa setiap klaim"), L("Models need numbers to read text", "Model butuh angka untuk membaca teks"), L("It saves tokens", "Menghemat token"), L("To sort them alphabetically", "Untuk mengurutkannya secara abjad")],
      answer: 0, why: L("Citations turn an answer from \"trust me\" into \"check here\".", "Sitasi mengubah jawaban dari \"percayalah\" menjadi \"periksa di sini\".") },
    { q: L("Chunks don't all fit. Which ones should be dropped first?", "Tidak semua potongan muat. Mana yang dibuang lebih dulu?"),
      options: [L("The lowest-scoring ones", "Yang skornya paling rendah"), L("The first ones", "Yang pertama"), L("The longest ones", "Yang paling panjang"), L("Random ones", "Secara acak")],
      answer: 0, why: L("Keep what is most likely to contain the answer.", "Pertahankan yang paling mungkin berisi jawaban.") },
  ],
};
