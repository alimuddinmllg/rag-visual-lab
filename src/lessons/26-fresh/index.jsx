// Lesson 26: keeping the index fresh. Content hashes, duplicate detection, and four ways to sync
// a changing folder of documents. Twin: ./fresh.py
import * as rag from "../../rag/core.js";
import { HANDBOOK } from "../../rag/testsets.js";
import { recursiveChunks } from "../../rag/chunkers.js";
import { BarList } from "../../toolkit/charts.jsx";
import { L, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./fresh.py?raw";
import libSource from "./with_libraries.py?raw";

export const STRATEGIES = ["none", "add-only", "full", "incremental"];
const CHANGES = {
  en: { edits: [[2, "opening-hours", "Saturday from 10:00 to 16:00", "Saturday from 9:00 to 15:00"], [3, "3d-printing", "Rp 2.000 per gram", "Rp 2.500 per gram"]],
    copies: [[2, "opening-hours-copy", "opening-hours", "\n", "\n\n"], [3, "safety-rules-old", "safety-rules", "Closed shoes are required", "Closed shoes are recommended"]], deletes: [[4, "wi-fi-and-computers"]] },
  id: { edits: [[2, "jam-buka", "Sabtu pukul 10.00 sampai 16.00", "Sabtu pukul 09.00 sampai 15.00"], [3, "cetak-3d", "Rp 2.000 per gram", "Rp 2.500 per gram"]],
    copies: [[2, "jam-buka-salinan", "jam-buka", "\n", "\n\n"], [3, "aturan-keselamatan-lama", "aturan-keselamatan", "Sepatu tertutup wajib dipakai", "Sepatu tertutup sebaiknya dipakai"]], deletes: [[4, "wi-fi-dan-komputer"]] },
};
const FACTS = {
  en: [{ day: 2, old: "10:00 to 16:00", new: "9:00 to 15:00" }, { day: 3, old: "2.000 per gram", new: "2.500 per gram" }, { day: 4, old: "KiCad", new: "KiCad", deleted: true }],
  id: [{ day: 2, old: "10.00 sampai 16.00", new: "09.00 sampai 15.00" }, { day: 3, old: "2.000 per gram", new: "2.500 per gram" }, { day: 4, old: "KiCad", new: "KiCad", deleted: true }],
};
const QS = { en: ["When is the lab open on Saturday?", "How much does PLA printing cost?", "What software is installed on the workstations?"], id: ["Jam berapa lab buka hari Sabtu?", "Berapa biaya cetak PLA?", "Perangkat lunak apa yang terpasang di komputer kerja?"] };
const EVENTS = {
  en: { 2: "Saturday hours change; someone re-uploads the hours page", 3: "PLA price changes; an old copy of the safety rules appears", 4: "The Wi-Fi and computers page is deleted" },
  id: { 2: "Jam Sabtu berubah; seseorang mengunggah ulang halaman jam buka", 3: "Harga PLA berubah; salinan lama aturan keselamatan muncul", 4: "Halaman Wi-Fi dan komputer dihapus" },
};

// ---- the algorithm (mirrors fresh.py line for line) ----
export function documents(handbook) {
  return handbook.trim().split(/\n(?=## )/).map((part) => {
    const title = part.split("\n")[0].replace(/^#+\s*/, "").trim();
    return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), text: part };
  });
}
export function snapshot(docs, day, ch) {
  const out = docs.map((d) => ({ ...d }));
  for (const d of out) for (const [when, id, a, b] of ch.edits) if (day >= when && d.id === id) d.text = d.text.split(a).join(b);
  for (const [when, id, src, a, b] of ch.copies) if (day >= when) { const base = out.find((d) => d.id === src); out.push({ id, text: base.text.split(a).join(b) }); }
  return out.filter((d) => !ch.deletes.some(([when, x]) => day >= when && d.id === x));
}
const normalize = (t) => t.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
export function fnv1a(text) { let h = 0x811c9dc5; for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, "0"); }
const chunkAndHash = (docs, size = 50) => docs.flatMap((d) => recursiveChunks(d.text, size).map((c) => ({ doc: d.id, text: c.text, hash: fnv1a(normalize(c.text)) })));
function shingles(text) { const w = normalize(text).split(" "); const s = new Set(); for (let i = 0; i < Math.max(1, w.length - 2); i++) s.add(w.slice(i, i + 3).join(" ")); return s; }
function jaccard(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); }
export function dedup(chunks, threshold) {
  const kept = [], dropped = [];
  for (const c of chunks) {
    const twin = kept.find((k) => k.hash === c.hash);
    if (twin) { dropped.push({ ...c, why: "exact", of: twin.doc }); continue; }
    const s = shingles(c.text);
    let best = 0, of = null;
    for (const k of kept) { const j = jaccard(s, shingles(k.text)); if (j > best) { best = j; of = k.doc; } }
    if (best >= threshold) dropped.push({ ...c, why: "near", of, sim: best }); else kept.push(c);
  }
  return { kept, dropped };
}
const wanted = (docs, day, ch, th) => new Map(dedup(chunkAndHash(snapshot(docs, day, ch)), th).kept.map((c) => [c.hash, c]));
export function sync(docs, day, ch, th, strategy) {
  let index = new Map(), embedded = 0, prev = new Map();
  for (let t = 1; t <= day; t++) {
    const want = wanted(docs, t, ch, th);
    if (strategy === "none") { if (t === 1) { index = new Map(want); embedded = want.size; } }
    else if (strategy === "full") { index = new Map(want); embedded += want.size; }
    else if (strategy === "add-only") { for (const [h, c] of want) if (!index.has(h)) { embedded++; index.set(h, c); } }
    else { for (const h of want.keys()) if (!prev.has(h)) embedded++; index = new Map(want); }
    prev = want;
  }
  return { index: [...index.values()], embedded };
}
function ask(index, question, lang, stop, minSim = 0.2) {
  const emb = rag.embedChunks(index, stop, lang);
  const qv = rag.vectorize(rag.tokenize(question, stop, lang), emb.idf);
  const scores = emb.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
  const top = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3);
  const known = rag.tokenize(question, stop, lang).filter((t) => emb.idf.has(t));
  const used = top.filter((x) => x.s >= minSim);
  return { top, used, answer: rag.extractAnswer(used, index, known, emb.idf, stop, lang).text };
}
function verdict(used, index, answer, fact) {
  if (fact.deleted) return !used.length ? "refused" : answer.includes(fact.new) ? "served-deleted" : "missed";
  const ctx = used.map((x) => index[x.i].text).join(" ");
  const old = fact.old !== fact.new ? fact.old : null;
  if (old && ctx.includes(old) && ctx.includes(fact.new)) return "conflict";
  if (old && answer.includes(old)) return "stale";
  return answer.includes(fact.new) ? "current" : "missed";
}
const factOn = (f, day) => ({ old: f.old, new: day >= f.day ? f.new : f.old, deleted: !!f.deleted && day >= f.day });

const stages = [
  { id: "snapshot", label: L("Snapshot", "Potret"), desc: L("The folder on the chosen day. Each section of the handbook is one document; things change from day 2.", "Folder pada hari yang dipilih. Setiap bagian buku panduan adalah satu dokumen; ada perubahan mulai hari ke-2."),
    run: ({ inputs }) => {
      const lang = inputs.uiLang, docs = documents(HANDBOOK[lang]), today = snapshot(docs, inputs.day, CHANGES[lang]);
      const before = inputs.day > 1 ? snapshot(docs, inputs.day - 1, CHANGES[lang]) : [];
      const status = (d) => { const b = before.find((x) => x.id === d.id); return inputs.day === 1 ? "same" : !b ? "new" : b.text !== d.text ? "changed" : "same"; };
      const gone = before.filter((b) => !today.some((d) => d.id === b.id)).map((b) => b.id);
      return { lang, stop: rag.stopwordsFor(lang), docs, today: today.map((d) => ({ ...d, status: status(d) })), gone };
    },
    log: (c) => ({ text: `day ${c.inputs.day}: ${c.today.length} documents${c.gone.length ? `, ${c.gone.length} deleted` : ""}` }), live: (c) => `${c.today.length} docs` },
  { id: "hash", label: L("Chunk & hash", "Potong & hash"), desc: L("Chunk every document and give each chunk a hash of its normalised text. Same text, same hash.", "Potong setiap dokumen dan beri setiap potongan hash dari teksnya yang dinormalisasi. Teks sama, hash sama."),
    run: (c) => ({ chunks: chunkAndHash(c.today) }), log: (c) => ({ text: `${c.chunks.length} chunks hashed` }), live: (c) => `${c.chunks.length} chunks` },
  { id: "dedup", label: L("Deduplicate", "Hapus duplikat"), desc: L("Drop exact copies (same hash) and near copies (most three-word phrases shared).", "Buang salinan persis (hash sama) dan salinan mirip (sebagian besar frasa tiga kata sama)."),
    run: (c) => dedup(c.chunks, c.inputs.threshold), log: (c) => ({ text: `${c.dropped.length} duplicate chunk(s) dropped` }), live: (c) => `${c.dropped.length} dropped` },
  { id: "sync", label: L("Sync", "Sinkron"), desc: L("Replay every day with the chosen strategy. Count how many chunks had to be embedded.", "Ulangi setiap hari dengan strategi yang dipilih. Hitung berapa potongan yang harus di-embed."),
    run: (c) => { const ch = CHANGES[c.lang], th = c.inputs.threshold; const s = sync(c.docs, c.inputs.day, ch, th, c.inputs.strategy); return { index: s.index, embedded: s.embedded, cost: Object.fromEntries(STRATEGIES.map((k) => [k, sync(c.docs, c.inputs.day, ch, th, k).embedded])) }; },
    log: (c) => ({ text: `${c.inputs.strategy}: index ${c.index.length} chunks, ${c.embedded} embedded so far` }), live: (c) => `${c.embedded} embedded` },
  { id: "answer", label: L("Answer", "Jawab"), desc: L("Ask the index. Is the answer today's truth, yesterday's, both, or a page that no longer exists?", "Tanyai indeksnya. Apakah jawabannya kebenaran hari ini, kemarin, keduanya, atau halaman yang sudah tidak ada?"),
    run: (c) => { const q = QS[c.lang][+c.inputs.qi]; const a = ask(c.index, q, c.lang, c.stop); return { q, ...a, verdict: verdict(a.used, c.index, a.answer, factOn(FACTS[c.lang][+c.inputs.qi], c.inputs.day)) }; },
    log: (c) => ({ text: `${c.verdict}: ${c.answer.slice(0, 80)}`, warn: ["stale", "conflict", "served-deleted"].includes(c.verdict) ? c.verdict : null }), live: (c) => c.verdict },
];

const VERDICT = {
  current: [L("Current: today's fact", "Mutakhir: fakta hari ini"), "var(--good)"],
  refused: [L("Correctly refused: the page is gone", "Menolak dengan benar: halamannya sudah dihapus"), "var(--good)"],
  stale: [L("Stale: yesterday's fact", "Basi: fakta kemarin"), "var(--warn)"],
  conflict: [L("Conflict: old and new versions both in the context", "Konflik: versi lama dan baru sama-sama di konteks"), "var(--warn)"],
  "served-deleted": [L("Served a deleted page", "Menyajikan halaman yang sudah dihapus"), "var(--warn)"],
  missed: [L("Missed", "Meleset"), "var(--muted)"],
};
const BADGE = { new: L("new", "baru"), changed: L("changed", "berubah"), same: L("same", "sama") };

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, day = ctx.inputs.day, lang = ctx.inputs.uiLang;
  const dropped = new Map((ctx.dropped || []).map((d) => [d.doc + d.hash, d.why]));
  const v = ctx.verdict && VERDICT[ctx.verdict];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("A folder that keeps changing", "Folder yang terus berubah"))}</h2><span className="sub">{tr(L("strategy", "strategi"))}: {ctx.inputs.strategy}</span></div>
      <div className="plain">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
          {[1, 2, 3, 4].map((d) => <div key={d} className="colcard" style={{ opacity: d > day ? 0.4 : 1, borderTop: `3px solid ${d === day ? "var(--query)" : "var(--line)"}` }}>
            <h4>{tr(L("Day", "Hari"))} {d}</h4><div style={{ fontSize: 12 }}>{d === 1 ? tr(L("First index build", "Indeks pertama dibangun")) : EVENTS[lang][d]}</div></div>)}
        </div>
      </div>
      <div className="split">
        <div className="plain">
          <h4 style={{ margin: "0 0 6px" }}>{tr(L("Documents today", "Dokumen hari ini"))}</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13, display: "grid", gap: 3 }}>
            {(ctx.today || []).map((d) => {
              const chunks = (ctx.chunks || []).filter((c) => c.doc === d.id);
              const drop = chunks.filter((c) => dropped.has(c.doc + c.hash));
              return <li key={d.id}><span className="mono">{d.id}</span> {d.status !== "same" && <b style={{ color: d.status === "new" ? "var(--query)" : "var(--warn)" }}>· {tr(BADGE[d.status])}</b>}
                {ph >= 2 && <span className="sub"> · {chunks.length} {chunks.length === 1 ? tr(L("chunk", "potongan")) : tr(L("chunks", "potongan"))}{ph >= 3 && drop.length ? ` · ${drop.length} ${tr(L("duplicate", "duplikat"))} (${[...new Set(drop.map((c) => (dropped.get(c.doc + c.hash) === "exact" ? tr(L("exact", "persis")) : tr(L("near", "mirip")))))].join(", ")})` : ""}</span>}</li>;
            })}
            {(ctx.gone || []).map((id) => <li key={id} style={{ textDecoration: "line-through", color: "var(--muted)" }}><span className="mono">{id}</span> · {tr(L("deleted", "dihapus"))}</li>)}
          </ul>
          {ph >= 2 && ctx.chunks?.[0] && <p className="note">{tr(L("Example hash", "Contoh hash"))}: <span className="mono">{ctx.chunks[0].hash}</span> ← “{ctx.chunks[0].text.slice(0, 48)}…”</p>}
        </div>
        <div className="plain">
          <h4 style={{ margin: "0 0 6px" }}>{tr(L("Chunks embedded so far, by strategy", "Potongan yang sudah di-embed, per strategi"))}</h4>
          {ctx.cost ? <BarList fmt={(x) => String(Math.round(x))} max={Math.max(...Object.values(ctx.cost))} items={STRATEGIES.map((s) => ({ label: s, value: ctx.cost[s], hl: s === ctx.inputs.strategy }))} /> : <p className="note">{tr(L("Run to the Sync step.", "Jalankan sampai langkah Sinkron."))}</p>}
          {ctx.index && <p className="note">{tr(L("The index now holds", "Indeks kini berisi"))} {ctx.index.length} {tr(L("chunks", "potongan"))}.</p>}
        </div>
      </div>
      {ctx.verdict && <div className="plain" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13 }}><b>{ctx.q}</b></div>
        {ctx.used.map((x, r) => <div key={x.i} className="colcard" style={{ fontSize: 12.5 }}><h4>[{r + 1}] <span className="mono">{ctx.index[x.i].doc}</span><span className="sub">{x.s.toFixed(2)}</span></h4>{ctx.index[x.i].text}</div>)}
        <div className="answer" style={{ borderLeft: `4px solid ${v[1]}` }}><b style={{ color: v[1] }}>{tr(v[0])}.</b> {ctx.answer}</div>
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Documents change after you index them: prices go up, pages get deleted, someone uploads the same file twice. If the index does not follow, RAG answers confidently from **yesterday's** text." },
      { p: "The fix is cheap bookkeeping. Give every chunk a **hash** of its text. On each sync, chunks whose hash is new get embedded, chunks whose hash disappeared get deleted, and the rest are left alone. Hashes also catch **exact duplicates**; comparing shared phrases catches **near duplicates**." },
      { p: "Move the **day** slider and compare the four strategies on the same three questions." },
    ],
    id: [
      { p: "Dokumen berubah setelah diindeks: harga naik, halaman dihapus, seseorang mengunggah file yang sama dua kali. Jika indeks tidak mengikuti, RAG menjawab dengan yakin dari teks **kemarin**." },
      { p: "Perbaikannya adalah pencatatan yang murah. Beri setiap potongan **hash** dari teksnya. Setiap sinkronisasi, potongan dengan hash baru di-embed, potongan yang hash-nya hilang dihapus, dan sisanya dibiarkan. Hash juga menangkap **duplikat persis**; membandingkan frasa yang sama menangkap **duplikat mirip**." },
      { p: "Geser slider **hari** dan bandingkan keempat strategi pada tiga pertanyaan yang sama." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Never re-index", "Strategy none, day 2, Saturday question: the old hours come back. The index was right on day 1 and nobody touched it since."] },
      { exp: ["Add-only is a trap", "Strategy add-only, day 3, PLA question: both prices are in the context. Day 4, software question: the deleted page still answers. Adding without deleting is the most common bug."] },
      { exp: ["Same result, less work", "Compare full and incremental on day 4: identical answers, but full re-embeds every chunk every day. On a million chunks, that is the difference between minutes and days."] },
      { exp: ["Too strict, too loose", "Set the duplicate threshold to 100%: the old safety rules are indexed next to the new ones. At 50%, does anything legitimate get dropped?"] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Tidak pernah indeks ulang", "Strategi none, hari 2, pertanyaan Sabtu: jam lama muncul kembali. Indeksnya benar pada hari 1 dan tidak ada yang menyentuhnya sejak itu."] },
      { exp: ["Hanya-tambah adalah jebakan", "Strategi add-only, hari 3, pertanyaan PLA: kedua harga ada di konteks. Hari 4, pertanyaan perangkat lunak: halaman yang sudah dihapus masih menjawab. Menambah tanpa menghapus adalah bug yang paling umum."] },
      { exp: ["Hasil sama, kerja lebih sedikit", "Bandingkan full dan incremental pada hari 4: jawabannya sama, tetapi full meng-embed ulang setiap potongan setiap hari. Pada sejuta potongan, itulah bedanya menit dan hari."] },
      { exp: ["Terlalu ketat, terlalu longgar", "Atur ambang duplikat ke 100%: aturan keselamatan lama diindeks di samping yang baru. Pada 50%, adakah yang sah ikut terbuang?"] }],
  },
  specs: {
    en: [{ dl: [["Content hash", "A short fingerprint of the normalised text (FNV-1a here; SHA-256 in production). Store it with each vector as its id."], ["Exact duplicate", "Same hash. Free to detect."], ["Near duplicate", "Jaccard similarity of three-word phrases (shingles). At scale, MinHash estimates the same number without comparing every pair."], ["Incremental sync", "Embed new hashes, delete missing ones. Deletions matter as much as additions: a deleted page must stop answering."], ["Embedding cost", "The bars count chunks embedded since day 1, the work you pay for in time or money."]] }],
    id: [{ dl: [["Hash konten", "Sidik jari pendek dari teks yang dinormalisasi (FNV-1a di sini; SHA-256 di produksi). Simpan bersama setiap vektor sebagai id-nya."], ["Duplikat persis", "Hash sama. Gratis dideteksi."], ["Duplikat mirip", "Kemiripan Jaccard dari frasa tiga kata (shingle). Pada skala besar, MinHash memperkirakan angka yang sama tanpa membandingkan setiap pasangan."], ["Sinkronisasi inkremental", "Embed hash baru, hapus yang hilang. Penghapusan sama pentingnya dengan penambahan: halaman yang dihapus harus berhenti menjawab."], ["Biaya embedding", "Batang menghitung potongan yang di-embed sejak hari 1, pekerjaan yang Anda bayar dengan waktu atau uang."]] }],
  },
};

export default {
  n: 26, stages, text, Board,
  controls: [
    { id: "day", label: L("Day", "Hari"), min: 1, max: 4, step: 1, default: 2 },
    { id: "strategy", type: "select", default: "none", label: L("Sync strategy", "Strategi sinkron"), options: [
      { value: "none", label: L("none (built once)", "none (dibangun sekali)") }, { value: "add-only", label: L("add-only", "add-only (hanya tambah)") },
      { value: "full", label: L("full rebuild", "full (bangun ulang)") }, { value: "incremental", label: L("incremental (hashes)", "incremental (hash)") }] },
    { id: "qi", type: "select", default: "0", label: L("Question", "Pertanyaan"), options: QS.en.map((q, i) => ({ value: String(i), label: L(q, QS.id[i]) })) },
    { id: "threshold", label: L("Near-duplicate threshold", "Ambang duplikat mirip"), min: 0.5, max: 1, step: 0.05, default: 0.8, format: (v) => `${Math.round(v * 100)}%` },
  ],
  code: [
    { id: "fresh", label: L("Hashes and sync (runs here)", "Hash dan sinkron (bisa dijalankan)"), source: pySource, runnable: true, filename: "fresh.py" },
    { id: "libs", label: L("With a vector database", "Dengan database vektor"), source: libSource, runnable: false, filename: "fresh_chromadb.py", note: L("Runs on your computer after: pip install chromadb", "Jalankan di komputer Anda setelah: pip install chromadb") },
  ],
  variables: (c) => [["dropped", c.dropped ? String(c.dropped.length) : "—"], ["index", c.index ? String(c.index.length) : "—"], ["embedded", c.embedded != null ? String(c.embedded) : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang;
    return {
      prelude: prelude("rag", "chunkers"),
      globals: { HANDBOOK: HANDBOOK[lang], CHANGES: CHANGES[lang], FACTS: FACTS[lang], DAY: I.day, STRATEGY: I.strategy, THRESHOLD: I.threshold, QI: +I.qi, QUESTION: QS[lang][+I.qi], LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(HANDBOOK, CHANGES, FACTS, DAY, STRATEGY, THRESHOLD, QI, QUESTION, LANG, STOPWORDS)",
      compare: (res) => {
        let ctx = { inputs: I };
        for (const st of stages) ctx = { ...ctx, ...st.run(ctx) };
        return JSON.stringify(res.dropped) === JSON.stringify(ctx.dropped.map((d) => d.hash)) && JSON.stringify(res.index) === JSON.stringify(ctx.index.map((x) => x.hash).sort())
          && STRATEGIES.every((s) => res.cost[s] === ctx.cost[s]) && res.answer === ctx.answer && res.verdict === ctx.verdict;
      },
    };
  },
  challenges: [
    { id: "stale", text: L("Get a stale answer: yesterday's fact, said with confidence.", "Dapatkan jawaban basi: fakta kemarin, diucapkan dengan yakin."), check: (c) => c.verdict === "stale" },
    { id: "ghost", text: L("Make the index serve the deleted page on day 4.", "Buat indeks menyajikan halaman yang sudah dihapus pada hari 4."), check: (c) => c.inputs.day === 4 && c.verdict === "served-deleted" },
    { id: "cheap", text: L("On day 4, answer all three questions correctly while embedding fewer than 20 chunks in total.", "Pada hari 4, jawab ketiga pertanyaan dengan benar sambil meng-embed kurang dari 20 potongan secara total."), check: (c) => c.inputs.day === 4 && c.inputs.strategy === "incremental" && c.embedded < 20 && ["current", "refused"].includes(c.verdict) },
  ],
  quiz: [
    quizQ(L("Why store a content hash with every chunk?", "Mengapa menyimpan hash konten bersama setiap potongan?"), [L("To skip chunks that did not change and find the ones that disappeared", "Untuk melewati potongan yang tidak berubah dan menemukan yang hilang"), L("To make retrieval more accurate", "Agar retrieval lebih akurat"), L("To encrypt the documents", "Untuk mengenkripsi dokumen"), L("Because the LLM needs it", "Karena LLM membutuhkannya")], 0, L("Same text, same hash: only new hashes need embedding, and missing hashes must be deleted.", "Teks sama, hash sama: hanya hash baru yang perlu di-embed, dan hash yang hilang harus dihapus.")),
    quizQ(L("An index adds new chunks but never deletes. What goes wrong?", "Indeks menambah potongan baru tetapi tidak pernah menghapus. Apa yang salah?"), [L("Old and new versions compete, and deleted pages keep answering", "Versi lama dan baru bersaing, dan halaman yang dihapus terus menjawab"), L("Nothing, it is just bigger", "Tidak ada, hanya lebih besar"), L("It becomes slower to embed", "Embedding jadi lebih lambat"), L("The hashes collide", "Hash-nya bertabrakan")], 0, L("Removal is half of freshness.", "Penghapusan adalah separuh dari kemutakhiran.")),
    quizQ(L("Two files differ only in line breaks. How are they caught?", "Dua file hanya berbeda pada jeda baris. Bagaimana ketahuan?"), [L("Normalise whitespace before hashing: the hashes become equal", "Normalisasi spasi sebelum hashing: hash-nya jadi sama"), L("They can't be", "Tidak bisa"), L("By the LLM", "Oleh LLM"), L("By file name", "Lewat nama file")], 0, L("Normalising first turns trivial differences into exact duplicates.", "Normalisasi lebih dulu mengubah perbedaan sepele menjadi duplikat persis.")),
  ],
};
