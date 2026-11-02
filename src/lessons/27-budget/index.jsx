// Lesson 27: cost and latency budgets. A waterfall of milliseconds per step, tokens and money per query,
// and a check against three budgets: time, money and quality. Twin: ./budget.py
import * as rag from "../../rag/core.js";
import { HANDBOOK, TEST_SET } from "../../rag/testsets.js";
import { L, pct, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./budget.py?raw";
import libSource from "./with_libraries.py?raw";

export const STEPS = { embed_ms: 20, search_ms: 5, rerank_ms_per_doc: 10, cache_ms: 2, embed_usd_per_m: 0.02 };
export const MODELS = {
  small: { ttft: 200, prefill: 0.15, gen: 12, usd_in: 0.15, usd_out: 0.6 },
  large: { ttft: 400, prefill: 0.5, gen: 35, usd_in: 3.0, usd_out: 15.0 },
};
const norm = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
const embedQ = (q, idf, stop, lang) => rag.vectorize(rag.tokenize(q, stop, lang), idf);

const idxCache = new Map();
function index(lang, size) {
  const k = `${lang}|${size}`;
  if (!idxCache.has(k)) {
    const stop = rag.stopwordsFor(lang), { sections, words } = rag.parseDocument(HANDBOOK[lang]);
    const chunks = rag.chunkDocument(words, size, 8), emb = rag.embedChunks(chunks, stop, lang);
    idxCache.set(k, { stop, sections, chunks, idf: emb.idf, vectors: emb.vectors });
  }
  return idxCache.get(k);
}
export function hitRate(tests, ix, topK, lang) {
  let hits = 0;
  for (const [q, exp] of tests) { const { top } = rag.retrieve(embedQ(q, ix.idf, ix.stop, lang), ix.vectors, topK); if (top.some((t) => norm(ix.chunks[t.i].text).includes(norm(exp)))) hits++; }
  return hits / tests.length;
}
export function waterfall(tok, topK, rerank, model) {
  const m = MODELS[model];
  const steps = [["embed", STEPS.embed_ms], ["search", STEPS.search_ms]];
  if (rerank) steps.push(["rerank", STEPS.rerank_ms_per_doc * topK * 3]);
  steps.push(["first token", m.ttft + m.prefill * tok.prompt], ["generate", m.gen * tok.answer]);
  let t = 0; const out = [];
  for (const [name, ms] of steps) { out.push([name, t, ms]); t += ms; }
  return { steps: out, total: t };
}
export function cost(tok, model, cacheRate, perDay) {
  const m = MODELS[model], embed = (tok.query * STEPS.embed_usd_per_m) / 1e6;
  const miss = embed + (tok.prompt * m.usd_in) / 1e6 + (tok.answer * m.usd_out) / 1e6;
  const avg = (1 - cacheRate) * miss + cacheRate * embed;
  return { miss, avg, month: avg * perDay * 30 };
}

const stages = [
  { id: "retrieve", label: L("Retrieve", "Ambil"), desc: L("Chunk, index and retrieve. The quality guard: hit@k on the 10-question test set must stay at 80% or more.", "Potong, indeks, dan ambil. Penjaga kualitas: hit@k pada set uji 10 pertanyaan harus tetap 80% atau lebih."),
    run: ({ inputs }) => { const lang = inputs.uiLang, ix = index(lang, inputs.size); return { lang, ix, hit: hitRate(TEST_SET[lang], ix, inputs.topK, lang) }; },
    log: (c) => ({ text: `hit@${c.inputs.topK} ${pct(c.hit)}`, warn: c.hit < 0.8 ? "quality below 80%" : null }), live: (c) => `hit ${pct(c.hit)}` },
  { id: "prompt", label: L("Count tokens", "Hitung token"), desc: L("Tokens drive both time and money: the question, the whole prompt with its chunks, and the answer.", "Token menentukan waktu dan uang: pertanyaan, seluruh prompt dengan potongannya, dan jawaban."),
    run: (c) => {
      const q = TEST_SET[c.lang][+c.inputs.qi][0], { top } = rag.retrieve(embedQ(q, c.ix.idf, c.ix.stop, c.lang), c.ix.vectors, c.inputs.topK);
      const prompt = rag.buildPrompt(q, top, c.ix.chunks, c.ix.sections, c.lang);
      return { q, prompt, tok: { query: rag.countTokens(q), prompt: rag.countTokens(prompt), answer: +c.inputs.answer } };
    },
    log: (c) => ({ text: `${c.tok.prompt} prompt tokens, ${c.tok.answer} answer tokens` }), live: (c) => `${c.tok.prompt} + ${c.tok.answer}` },
  { id: "latency", label: L("Latency", "Latensi"), desc: L("Each step waits for the previous one. The model's steps are usually most of the bar, and generation grows with every token it writes.", "Setiap langkah menunggu langkah sebelumnya. Langkah model biasanya sebagian besar batang, dan generasi bertambah dengan setiap token yang ditulis."),
    run: (c) => waterfall(c.tok, c.inputs.topK, c.inputs.rerank === "on", c.inputs.model), log: (c) => ({ text: `${Math.round(c.total)} ms`, warn: c.total > c.inputs.budgetMs ? "over the time budget" : null }), live: (c) => `${Math.round(c.total)} ms` },
  { id: "cost", label: L("Cost", "Biaya"), desc: L("Price per query and per month. Cached answers skip retrieval and the model, so they cost almost nothing.", "Harga per kueri dan per bulan. Jawaban dari cache melewati retrieval dan model, jadi hampir gratis."),
    run: (c) => cost(c.tok, c.inputs.model, c.inputs.cache, +c.inputs.perDay), log: (c) => ({ text: `$${c.month.toFixed(2)} per month`, warn: c.month > c.inputs.budgetUsd ? "over the money budget" : null }), live: (c) => `$${c.month.toFixed(2)}/mo` },
  { id: "budget", label: L("Budget check", "Cek anggaran"), desc: L("All three must pass: time on a cache miss, money per month, and quality.", "Ketiganya harus lolos: waktu saat cache meleset, uang per bulan, dan kualitas."),
    run: (c) => ({ ok: { latency: c.total <= c.inputs.budgetMs, cost: c.month <= c.inputs.budgetUsd, quality: c.hit >= 0.8 } }),
    log: (c) => ({ text: Object.entries(c.ok).map(([k, v]) => `${k} ${v ? "✓" : "✗"}`).join(" · "), warn: Object.values(c.ok).every(Boolean) ? null : "over budget" }), live: (c) => (Object.values(c.ok).every(Boolean) ? "within" : "over") },
];

const COLORS = { embed: "#7aa6c2", search: "#5c9a7a", rerank: "#b58bd6", "first token": "#e0a35c", generate: "#d9705f" };
const NAMES = { embed: L("embed question", "embed pertanyaan"), search: L("vector search", "pencarian vektor"), rerank: L("re-rank", "re-rank"), "first token": L("read prompt → first token", "baca prompt → token pertama"), generate: L("write the answer", "tulis jawaban") };

function Board({ ctx, tr }) {
  const W = 640, Lp = 170, R = 70, rowH = 30;
  const steps = ctx.steps || [], total = ctx.total || 0, budget = ctx.inputs.budgetMs;
  const span = Math.max(total, budget) * 1.05 || 1, X = (ms) => Lp + (ms / span) * (W - Lp - R);
  const H = steps.length * rowH + 52, top = 18;
  const pass = (k) => (ctx.ok ? (ctx.ok[k] ? "var(--good)" : "var(--warn)") : "var(--muted)");
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Where the time and money go", "Ke mana waktu dan uang pergi"))}</h2><span className="sub">{ctx.inputs.model} · {ctx.tok ? `${ctx.tok.prompt} + ${ctx.tok.answer} ${tr(L("tokens", "token"))}` : ""}</span></div>
      <div className="plain">
        {steps.length ? <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={tr(L("latency waterfall", "air terjun latensi"))}>
          {steps.map(([name, start, ms], i) => <g key={name} transform={`translate(0 ${top + i * rowH + 6})`}>
            <text x={Lp - 8} y={17} textAnchor="end" style={{ font: "12px var(--body)", fill: "var(--ink)" }}>{tr(NAMES[name])}</text>
            <rect x={X(start)} y={4} width={Math.max(2, X(start + ms) - X(start))} height={18} rx={3} fill={COLORS[name]} />
            <text x={X(start + ms) + 5} y={17} style={{ font: "11px var(--mono)", fill: "var(--muted)" }}>{Math.round(ms)} ms</text>
          </g>)}
          <line x1={X(budget)} x2={X(budget)} y1={top - 2} y2={H - 24} stroke="var(--warn)" strokeDasharray="4 3" strokeWidth={2} />
          <text x={X(budget)} y={12} textAnchor="middle" style={{ font: "600 11px var(--body)", fill: "var(--warn)" }}>{tr(L("budget", "anggaran"))} {budget} ms</text>
          <text x={Lp - 8} y={H - 8} textAnchor="end" style={{ font: "600 12px var(--body)", fill: "var(--ink)" }}>{tr(L("total", "total"))}</text>
          <text x={Lp} y={H - 8} style={{ font: "600 12px var(--mono)", fill: total > budget ? "var(--warn)" : "var(--good)" }}>{Math.round(total)} ms</text>
        </svg> : <p className="note">{tr(L("Run to the Latency step.", "Jalankan sampai langkah Latensi."))}</p>}
      </div>
      <div className="plain" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
        <div className="colcard" style={{ borderTop: `3px solid ${pass("latency")}` }}><h4>{tr(L("Time (cache miss)", "Waktu (cache meleset)"))}</h4><b>{ctx.total != null ? `${Math.round(ctx.total)} ms` : "…"}</b><div className="sub">{tr(L("hit", "kena"))}: {STEPS.embed_ms + STEPS.cache_ms} ms</div></div>
        <div className="colcard" style={{ borderTop: `3px solid ${pass("cost")}` }}><h4>{tr(L("Money per month", "Uang per bulan"))}</h4><b>{ctx.month != null ? `$${ctx.month.toFixed(2)}` : "…"}</b><div className="sub">{ctx.miss != null ? `$${(ctx.miss * 1000).toFixed(3)} / 1000 ${tr(L("uncached", "tanpa cache"))}` : ""}</div></div>
        <div className="colcard" style={{ borderTop: `3px solid ${pass("quality")}` }}><h4>{tr(L("Quality", "Kualitas"))}</h4><b>hit@{ctx.inputs.topK} {ctx.hit != null ? pct(ctx.hit) : "…"}</b><div className="sub">{tr(L("needs 80%", "perlu 80%"))}</div></div>
      </div>
      <p className="note plain" style={{ margin: 0 }}>{tr(L("Times and prices are example numbers (see Specs). The shape is what transfers: measure your own and put them in the code.", "Waktu dan harga adalah angka contoh (lihat Spesifikasi). Yang berlaku umum adalah polanya: ukur angka Anda sendiri dan masukkan ke kode."))}</p>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "A RAG answer has a **price** and a **wait**. Both are set by a handful of choices: how many chunks go into the prompt, which model reads them, how long the answer is, and how often you can answer from a **cache** instead." },
      { p: "The waterfall shows each step in order. Embedding and vector search take milliseconds. The model takes most of the time: reading the prompt, then writing the answer **one token at a time**. Money follows tokens too, and output tokens usually cost several times more than input tokens." },
      { p: "Set your three budgets (time, money, quality) and find a setup that passes all three." },
    ],
    id: [
      { p: "Jawaban RAG punya **harga** dan **waktu tunggu**. Keduanya ditentukan oleh beberapa pilihan: berapa potongan masuk ke prompt, model mana yang membacanya, seberapa panjang jawabannya, dan seberapa sering Anda bisa menjawab dari **cache**." },
      { p: "Air terjun menunjukkan setiap langkah secara berurutan. Embedding dan pencarian vektor hanya milidetik. Model memakan sebagian besar waktu: membaca prompt, lalu menulis jawaban **satu token demi satu token**. Uang juga mengikuti token, dan token keluaran biasanya beberapa kali lebih mahal dari token masukan." },
      { p: "Tetapkan tiga anggaran Anda (waktu, uang, kualitas) dan temukan pengaturan yang lolos ketiganya." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["The answer is the bill", "Switch the answer from long to short and watch the generate bar. Then double top-k: the prompt grows, but the bar barely moves. Output tokens dominate."] },
      { exp: ["Big model, small budget", "Keep the large model at 1,000 queries a day and raise the cache rate. Every cached answer is one the model never reads."] },
      { exp: ["Cheap but wrong", "Size 20, top-k 1 is the cheapest prompt, and the quality guard fails. The budget check stops you from saving money by losing answers."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Jawaban adalah tagihannya", "Ubah jawaban dari panjang ke pendek dan lihat batang tulis jawaban. Lalu gandakan top-k: prompt membesar, tetapi batangnya hampir tidak bergerak. Token keluaran mendominasi."] },
      { exp: ["Model besar, anggaran kecil", "Pertahankan model besar pada 1.000 kueri per hari dan naikkan tingkat cache. Setiap jawaban dari cache adalah satu jawaban yang tidak pernah dibaca model."] },
      { exp: ["Murah tapi salah", "Ukuran 20, top-k 1 adalah prompt termurah, dan penjaga kualitas gagal. Cek anggaran mencegah Anda berhemat dengan kehilangan jawaban."] }],
  },
  specs: {
    en: [{ dl: [["Example numbers", "Embedding 20 ms, search 5 ms, re-rank 10 ms per candidate (3× top-k candidates). Small model: 200 ms + 0.15 ms per prompt token to the first token, 12 ms per answer token, $0.15 / $0.60 per million tokens in/out. Large model: 400 ms, 0.5 ms, 35 ms, $3 / $15. Not a quote from any provider."], ["Time to first token", "What a user feels first when answers stream. It grows with the prompt."], ["Cache", "Answers stored by question (exact or by meaning). A hit costs one embedding and a lookup. Clear it when documents change (lesson 26)."], ["Month", "30 days × queries per day × average cost per query."]] }],
    id: [{ dl: [["Angka contoh", "Embedding 20 ms, pencarian 5 ms, re-rank 10 ms per kandidat (3× kandidat top-k). Model kecil: 200 ms + 0,15 ms per token prompt sampai token pertama, 12 ms per token jawaban, $0,15 / $0,60 per juta token masuk/keluar. Model besar: 400 ms, 0,5 ms, 35 ms, $3 / $15. Bukan harga dari penyedia mana pun."], ["Waktu sampai token pertama", "Yang pertama dirasakan pengguna saat jawaban dialirkan. Bertambah seiring panjang prompt."], ["Cache", "Jawaban disimpan per pertanyaan (persis atau menurut makna). Kena cache hanya perlu satu embedding dan satu pencarian. Kosongkan saat dokumen berubah (pelajaran 26)."], ["Bulan", "30 hari × kueri per hari × biaya rata-rata per kueri."]] }],
  },
};

export default {
  n: 27, stages, text, Board,
  controls: [
    { id: "qi", type: "select", default: "0", label: L("Question", "Pertanyaan"), options: TEST_SET.en.slice(0, 5).map(([q], i) => ({ value: String(i), label: L(q, TEST_SET.id[i][0]) })) },
    { id: "size", label: L("Chunk size (words)", "Ukuran potongan (kata)"), min: 20, max: 120, step: 20, default: 40 },
    { id: "topK", label: L("Chunks in prompt (top-k)", "Potongan di prompt (top-k)"), min: 1, max: 8, step: 1, default: 4 },
    { id: "rerank", type: "select", default: "off", label: L("Re-ranker", "Re-ranker"), options: [{ value: "off", label: L("off", "mati") }, { value: "on", label: L("on", "aktif") }] },
    { id: "model", type: "select", default: "large", label: L("Model", "Model"), options: [{ value: "small", label: L("small and fast", "kecil dan cepat") }, { value: "large", label: L("large and slow", "besar dan lambat") }] },
    { id: "answer", type: "select", default: "250", label: L("Answer length", "Panjang jawaban"), options: [{ value: "60", label: L("short (60 tokens)", "pendek (60 token)") }, { value: "250", label: L("long (250 tokens)", "panjang (250 token)") }] },
    { id: "cache", label: L("Cache hit rate", "Tingkat kena cache"), min: 0, max: 0.6, step: 0.1, default: 0, format: (v) => pct(v) },
    { id: "perDay", type: "select", default: "1000", label: L("Queries per day", "Kueri per hari"), options: ["100", "1000", "10000"].map((v) => ({ value: v, label: L(Number(v).toLocaleString("en"), Number(v).toLocaleString("id")) })) },
    { id: "budgetMs", label: L("Time budget (ms)", "Anggaran waktu (ms)"), min: 500, max: 5000, step: 250, default: 2000 },
    { id: "budgetUsd", label: L("Money budget ($/month)", "Anggaran uang ($/bulan)"), min: 10, max: 300, step: 10, default: 100 },
  ],
  code: [
    { id: "budget", label: L("Budget calculator (runs here)", "Kalkulator anggaran (bisa dijalankan)"), source: pySource, runnable: true, filename: "budget.py" },
    { id: "libs", label: L("Measuring a real pipeline", "Mengukur pipeline sungguhan"), source: libSource, runnable: false, filename: "budget_measure.py", note: L("Runs on your computer after: pip install openai tiktoken sentence-transformers numpy", "Jalankan di komputer Anda setelah: pip install openai tiktoken sentence-transformers numpy") },
  ],
  variables: (c) => [["prompt tokens", c.tok ? String(c.tok.prompt) : "—"], ["total ms", c.total != null ? String(Math.round(c.total)) : "—"], ["month $", c.month != null ? c.month.toFixed(2) : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang;
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: HANDBOOK[lang], TESTS: TEST_SET[lang], QUESTION: TEST_SET[lang][+I.qi][0], SIZE: I.size, TOP_K: I.topK, RERANK: I.rerank === "on", MODEL: I.model, ANSWER_TOKENS: +I.answer, CACHE: I.cache, PER_DAY: +I.perDay, BUDGET_MS: I.budgetMs, BUDGET_USD: I.budgetUsd, LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(DOCUMENT, TESTS, QUESTION, SIZE, TOP_K, RERANK, MODEL, ANSWER_TOKENS, CACHE, PER_DAY, BUDGET_MS, BUDGET_USD, LANG, STOPWORDS)",
      compare: (res) => {
        let ctx = { inputs: I };
        for (const st of stages) ctx = { ...ctx, ...st.run(ctx) };
        const close = (a, b) => Math.abs(a - b) <= 1e-12 + 1e-9 * Math.abs(b);
        return close(res.hit, ctx.hit) && JSON.stringify(res.tokens) === JSON.stringify(ctx.tok) && close(res.total, ctx.total) && close(res.month, ctx.month)
          && res.steps.every((s, i) => s[0] === ctx.steps[i][0] && close(s[1], ctx.steps[i][1]) && close(s[2], ctx.steps[i][2])) && JSON.stringify(res.ok) === JSON.stringify(ctx.ok);
      },
    };
  },
  challenges: [
    { id: "fit", text: L("Pass all three budgets: under 2 s, under $100 a month at 1,000 queries a day, and hit@k of 80% or more.", "Lolos ketiga anggaran: di bawah 2 detik, di bawah $100 per bulan pada 1.000 kueri per hari, dan hit@k 80% atau lebih."), check: (c) => c.ok && +c.inputs.perDay >= 1000 && c.inputs.budgetMs <= 2000 && c.inputs.budgetUsd <= 100 && Object.values(c.ok).every(Boolean) },
    { id: "cache", text: L("Keep the large model at 1,000 queries a day and fit a $30 monthly budget with quality of 80% or more.", "Pertahankan model besar pada 1.000 kueri per hari dan muat dalam anggaran $30 per bulan dengan kualitas 80% atau lebih."), check: (c) => c.ok && c.inputs.model === "large" && +c.inputs.perDay >= 1000 && c.month <= 30 && c.ok.quality },
    { id: "rerank", text: L("Turn the re-ranker on with top-k 8 and still answer in under 1.5 seconds.", "Aktifkan re-ranker dengan top-k 8 dan tetap menjawab dalam kurang dari 1,5 detik."), check: (c) => c.total != null && c.inputs.rerank === "on" && c.inputs.topK >= 8 && c.total < 1500 },
  ],
  quiz: [
    quizQ(L("Which change usually cuts latency the most?", "Perubahan mana yang biasanya paling memangkas latensi?"), [L("A shorter answer, or a faster model", "Jawaban lebih pendek, atau model lebih cepat"), L("A faster vector search", "Pencarian vektor lebih cepat"), L("Fewer stopwords", "Lebih sedikit stopword"), L("A different chunk overlap", "Overlap potongan yang berbeda")], 0, L("Generation is token by token; search is a few milliseconds.", "Generasi berjalan token demi token; pencarian hanya beberapa milidetik.")),
    quizQ(L("Why can a cache save so much money?", "Mengapa cache bisa sangat menghemat uang?"), [L("A hit skips the model call entirely", "Kena cache melewati panggilan model sepenuhnya"), L("It makes tokens cheaper", "Membuat token lebih murah"), L("It shortens the documents", "Memendekkan dokumen"), L("It improves recall", "Meningkatkan recall")], 0, L("Most of the cost is the model; a hit only pays for one embedding.", "Sebagian besar biaya adalah model; kena cache hanya membayar satu embedding.")),
    quizQ(L("Why keep a quality guard in the budget check?", "Mengapa ada penjaga kualitas dalam cek anggaran?"), [L("The cheapest setup can stop finding the answers", "Pengaturan termurah bisa berhenti menemukan jawaban"), L("Providers require it", "Penyedia mewajibkannya"), L("It makes the model faster", "Membuat model lebih cepat"), L("It is not needed", "Tidak diperlukan")], 0, L("Cutting chunks saves tokens until the right chunk is cut too.", "Memangkas potongan menghemat token sampai potongan yang benar ikut terpangkas.")),
  ],
};
