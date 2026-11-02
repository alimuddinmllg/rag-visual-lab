// Lesson 31: monitoring in production. A simulated 30-day query log (every query really retrieved),
// daily metrics, threshold alerts, and drill-down to the questions behind an alert. Twin: ./monitor.py
import * as rag from "../../rag/core.js";
import { rng } from "../../rag/ngram.js";
import { HANDBOOK } from "../../rag/testsets.js";
import { L, pct, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./monitor.py?raw";
import libSource from "./with_libraries.py?raw";

export const POOLS = {
  en: { answerable: ["When is the lab open on Saturday?", "How much does a gold card cost?", "Can the drone kit leave the lab?", "What is the fine for late returns?", "Where must lithium batteries be charged?", "When are files on the workstations deleted?", "Who should I ask about urgent safety issues?", "What software is installed on the workstations?"],
    printing: ["How much does PLA filament cost per gram?", "What does resin cost per millilitre?", "How long can a print run before it needs an overnight slot?"],
    unanswerable: ["What is the capital of France?", "How do I renew my passport?", "What is the Wi-Fi password for the library?", "Who won the football match yesterday?", "How much does a laptop repair cost?"],
    new: ["How do I book the new CNC machine?", "Is there a training session for the CNC machine?", "What materials can the CNC machine cut?"] },
  id: { answerable: ["Jam berapa lab buka hari Sabtu?", "Berapa biaya kartu emas?", "Apakah kit drone boleh dibawa keluar lab?", "Berapa denda jika terlambat mengembalikan alat?", "Di mana baterai litium harus diisi?", "Kapan file di komputer kerja dihapus?", "Siapa yang dihubungi untuk masalah keselamatan mendesak?", "Perangkat lunak apa yang terpasang di komputer kerja?"],
    printing: ["Berapa biaya cetak PLA?", "Berapa lama cetakan boleh berjalan sebelum perlu slot malam?", "Berapa biaya cetak resin?"],
    unanswerable: ["Apa ibu kota Prancis?", "Bagaimana cara memperpanjang paspor?", "Apa kata sandi Wi-Fi perpustakaan?", "Siapa yang menang pertandingan sepak bola kemarin?", "Berapa biaya servis laptop?"],
    new: ["Bagaimana cara memesan mesin CNC yang baru?", "Apakah ada pelatihan untuk mesin CNC?", "Bahan apa saja yang bisa dipotong mesin CNC?"] },
};
const BROKEN = { en: "3D printing", id: "Cetak 3D" };
const DAYS = 30;

const withoutSection = (doc, title) => doc.split(/\n(?=## )/).filter((p) => !p.startsWith("## " + title)).join("\n");
function makeIndex(doc, stop, lang) { const chunks = rag.chunkDocument(rag.parseDocument(doc).words, 40, 8), emb = rag.embedChunks(chunks, stop, lang); return { chunks, idf: emb.idf, vectors: emb.vectors }; }
function coverage(q, ix, stop, lang) {
  const words = [...new Set(rag.tokenize(q, stop, lang))], qv = rag.vectorize(words, ix.idf);
  const scores = ix.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
  let best = 0; for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const have = new Set(rag.tokenize(ix.chunks[best].text, stop, lang));
  return words.filter((t) => have.has(t)).length / Math.max(1, words.length);
}
export function simulate(doc, pools, brokenTitle, stop, lang, seed = 11, minCover = 0.5) {
  const r = rng(seed), indexes = { ok: makeIndex(doc, stop, lang), broken: makeIndex(withoutSection(doc, brokenTitle), stop, lang) };
  const cache = new Map(), log = [], answerable = [...pools.answerable, ...pools.printing];
  for (let day = 1; day <= DAYS; day++) {
    const version = day >= 13 && day <= 16 ? "broken" : "ok", weekend = day % 7 === 6 || day % 7 === 0;
    const n = Math.floor(40 * (weekend ? 0.6 : 1) * (1 + 0.01 * day) + 0.5) + Math.floor(r() * 8);
    for (let k = 0; k < n; k++) {
      const u = r(), newShare = day >= 22 ? 0.18 : 0;
      const pool = u < newShare ? pools.new : u < newShare + 0.06 ? pools.unanswerable : answerable;
      const q = pool[Math.floor(r() * pool.length)], key = version + "|" + q;
      if (!cache.has(key)) cache.set(key, coverage(q, indexes[version], stop, lang));
      const cover = cache.get(key), empty = cover < minCover;
      const ms = (700 + r() * 600) * (day >= 6 && day <= 8 ? 2.5 : 1);
      const gives = r() < 0.3, down = r() < (empty ? 0.8 : 0.08);
      log.push({ day, q, cover, empty, ms, feedback: gives ? (down ? "down" : "up") : null });
    }
  }
  return log;
}
export function daily(log) {
  return Array.from({ length: DAYS }, (_, k) => {
    const d = k + 1, rows = log.filter((x) => x.day === d), fb = rows.filter((x) => x.feedback), ms = rows.map((x) => x.ms).sort((a, b) => a - b);
    return { day: d, volume: rows.length, empty: rows.filter((x) => x.empty).length / rows.length, down: fb.length ? fb.filter((x) => x.feedback === "down").length / fb.length : 0, p95: ms[Math.ceil(0.95 * ms.length) - 1] };
  });
}
export function alerts(days, rules, window) {
  const fired = [];
  for (const [metric, limit] of Object.entries(rules)) {
    let run = 0, on = false;
    for (const d of days) { run = d[metric] > limit ? run + 1 : 0; if (run >= window && !on) fired.push({ metric, day: d.day }); on = run >= window; }
  }
  return fired.sort((a, b) => a.day - b.day || (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0));
}
export function drill(log, day, top = 5) {
  const counts = new Map();
  for (const x of log) if (x.day === day && x.empty) counts.set(x.q, (counts.get(x.q) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top);
}

const logCache = {};
const getLog = (lang) => (logCache[lang] ||= simulate(HANDBOOK[lang], POOLS[lang], BROKEN[lang], rag.stopwordsFor(lang), lang));
const rulesOf = (I) => ({ empty: I.emptyLimit, p95: I.p95Limit, down: I.downLimit });

const stages = [
  { id: "log", label: L("Log", "Log"), desc: L("Every query is logged: the question, how well retrieval covered it, the latency, and the user's thumbs up or down when they give one.", "Setiap kueri dicatat: pertanyaannya, seberapa baik retrieval mencakupnya, latensinya, dan jempol naik atau turun dari pengguna bila diberikan."),
    run: ({ inputs }) => ({ log: getLog(inputs.uiLang) }), log: (c) => ({ text: `${c.log.length} queries over ${DAYS} days` }), live: (c) => `${c.log.length} queries` },
  { id: "aggregate", label: L("Daily metrics", "Metrik harian"), desc: L("Roll the log up per day: volume, share of empty retrievals, share of thumbs-down, and 95th-percentile latency.", "Ringkas log per hari: volume, bagian retrieval kosong, bagian jempol turun, dan latensi persentil ke-95."),
    run: (c) => ({ days: daily(c.log) }), log: (c) => ({ text: `${c.days.length} daily rows` }), live: () => `${DAYS} days` },
  { id: "alert", label: L("Alerts", "Peringatan"), desc: L("A rule fires when a metric stays over its threshold for the chosen number of days in a row.", "Aturan menyala saat metrik tetap di atas ambangnya selama jumlah hari berturut-turut yang dipilih."),
    run: (c) => ({ fired: alerts(c.days, rulesOf(c.inputs), c.inputs.window) }), log: (c) => ({ text: c.fired.map((a) => `day ${a.day} ${a.metric}`).join(" · ") || "no alerts", warn: c.fired.length > 4 ? "too many alerts: people will stop reading them" : null }), live: (c) => `${c.fired.length} alert(s)` },
  { id: "drill", label: L("Drill down", "Telusuri"), desc: L("For each empty-retrieval alert, list the questions that found nothing that day. The cause is usually obvious from the list.", "Untuk setiap peringatan retrieval kosong, daftarkan pertanyaan yang tidak menemukan apa-apa pada hari itu. Penyebabnya biasanya terlihat jelas dari daftar itu."),
    run: (c) => ({ drill: Object.fromEntries(c.fired.filter((a) => a.metric === "empty").map((a) => [String(a.day), drill(c.log, a.day)])) }), log: (c) => ({ text: `${Object.keys(c.drill).length} drill-down(s)` }), live: (c) => `${Object.keys(c.drill).length} drilled` },
];

const METRICS = [
  ["volume", L("Queries per day", "Kueri per hari"), (v) => String(v), null],
  ["empty", L("Empty retrievals", "Retrieval kosong"), (v) => pct(v), "emptyLimit"],
  ["down", L("Thumbs down", "Jempol turun"), (v) => pct(v), "downLimit"],
  ["p95", L("p95 latency (ms)", "Latensi p95 (ms)"), (v) => String(Math.round(v)), "p95Limit"],
];

function Spark({ days, metric, limit, fired, fmt, title, tr }) {
  const W = 300, H = 92, Lp = 8, R = 8, T = 18, B = 16;
  const vals = days.map((d) => d[metric]), max = Math.max(...vals, limit || 0) * 1.1 || 1;
  const X = (d) => Lp + ((d - 1) / (DAYS - 1)) * (W - Lp - R), Y = (v) => H - B - (v / max) * (H - T - B);
  const alertDays = fired.filter((a) => a.metric === metric).map((a) => a.day);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={tr(title)}>
      <text x={Lp} y={12} style={{ font: "600 11px var(--body)", fill: "var(--ink)" }}>{tr(title)}</text>
      <text x={W - R} y={12} textAnchor="end" style={{ font: "10px var(--mono)", fill: "var(--muted)" }}>{limit != null ? `> ${fmt(limit)}` : ""}</text>
      {limit != null && <line x1={Lp} x2={W - R} y1={Y(limit)} y2={Y(limit)} stroke="var(--warn)" strokeDasharray="4 3" />}
      <path d={vals.map((v, i) => `${i ? "L" : "M"}${X(i + 1)} ${Y(v)}`).join("")} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
      {vals.map((v, i) => limit != null && v > limit && <circle key={i} cx={X(i + 1)} cy={Y(v)} r={2.4} fill="var(--warn)" />)}
      {alertDays.map((d) => <g key={d}><line x1={X(d)} x2={X(d)} y1={T} y2={H - B} stroke="var(--query)" strokeWidth={1.5} /><path d={`M${X(d) - 5} ${T - 1}h10l-5 7z`} fill="var(--query)" /></g>)}
      {[1, 10, 20, 30].map((d) => <text key={d} x={X(d)} y={H - 3} textAnchor="middle" style={{ font: "9px var(--mono)", fill: "var(--muted)" }}>{d}</text>)}
    </svg>
  );
}

// [first day, last day, metrics this cause moves, explanation]
const CAUSE = [
  [6, 8, ["p95"], L("Days 6–8: the model provider was slow. Nothing in your pipeline changed; latency alone shows it.", "Hari 6–8: penyedia model lambat. Tidak ada yang berubah di pipeline Anda; hanya latensi yang menunjukkannya.")],
  [13, 16, ["empty", "down"], L("Days 13–16: a sync bug dropped the 3D printing page from the index (lesson 26). Fix: re-sync, and add a check that page counts don't drop.", "Hari 13–16: bug sinkronisasi membuang halaman cetak 3D dari indeks (pelajaran 26). Perbaikan: sinkron ulang, dan tambahkan pemeriksaan agar jumlah halaman tidak turun.")],
  [22, 30, ["empty", "down"], L("From day 22: people ask about a new CNC machine that no document covers. Retrieval works fine; the content is missing. Fix: write the CNC page.", "Mulai hari 22: orang bertanya tentang mesin CNC baru yang tidak ada di dokumen mana pun. Retrieval baik-baik saja; isinya yang tidak ada. Perbaikan: tulis halaman CNC.")],
];

const causeOf = (a) => CAUSE.find(([a0, b0, ms]) => a.day >= a0 && a.day <= b0 && ms.includes(a.metric));

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, days = ctx.days || [], fired = ctx.fired || [];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Thirty days in production", "Tiga puluh hari di produksi"))}</h2><span className="sub">{ctx.log ? `${ctx.log.length} ${tr(L("queries", "kueri"))}` : ""} · {tr(L("alert after", "peringatan setelah"))} {ctx.inputs.window} {tr(L("day(s) in a row", "hari berturut-turut"))}</span></div>
      <div className="plain">
        {ph >= 2 ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {METRICS.map(([m, title, fmt, limKey]) => <div key={m} className="colcard" style={{ padding: 6 }}><Spark days={days} metric={m} limit={limKey ? ctx.inputs[limKey] : null} fired={ph >= 3 ? fired : []} fmt={fmt} title={title} tr={tr} /></div>)}
        </div> : <p className="note">{tr(L("Run to the Daily metrics step.", "Jalankan sampai langkah Metrik harian."))}</p>}
      </div>
      {ph >= 3 && <div className="plain" style={{ display: "grid", gap: 6 }}>
        <h4 style={{ margin: 0 }}>{tr(L("Alerts", "Peringatan"))} ({fired.length})</h4>
        {!fired.length && <p className="note" style={{ margin: 0 }}>{tr(L("No alerts. Is that because nothing happened?", "Tidak ada peringatan. Apakah karena memang tidak terjadi apa-apa?"))}</p>}
        {fired.map((a, k) => <div key={k} className="colcard" style={{ fontSize: 12.5, borderLeft: "4px solid var(--query)" }}>
          <h4>{tr(L("Day", "Hari"))} {a.day} · {tr(METRICS.find((m) => m[0] === a.metric)[1])}</h4>
          {ph >= 4 && ctx.drill?.[String(a.day)] && <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{ctx.drill[String(a.day)].map(([q, n]) => <li key={q}>{q} <span className="sub">× {n}</span></li>)}</ul>}
          {ph >= 4 && (() => { const c = causeOf(a); return c ? <div className="sub" style={{ marginTop: 4 }}>{tr(L("What really happened", "Yang sebenarnya terjadi"))}: {tr(c[3])}</div> : <div className="sub" style={{ marginTop: 4, color: "var(--warn)" }}>{tr(L("Nothing was wrong on this day: a false alarm.", "Tidak ada yang salah pada hari ini: alarm palsu."))}</div>; })()}
        </div>)}
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Evaluation (Level 4) tells you the system worked on your test set. **Monitoring** tells you it is still working today, on real questions, after documents, providers and users have changed." },
      { p: "Log every query. Roll the log up into a few daily numbers: **volume**, **empty retrievals** (the best chunk covers under half of the question's words), **thumbs down**, and **p95 latency** (95% of answers were faster than this). An **alert** fires when a number stays over its threshold." },
      { p: "Three problems are hidden in this month. The thresholds start too sensitive, so too much fires. Tune them until each alert means something, then drill down to find out what happened." },
    ],
    id: [
      { p: "Evaluasi (Level 4) memberi tahu bahwa sistem berhasil pada set uji Anda. **Pemantauan** memberi tahu bahwa sistem masih berfungsi hari ini, pada pertanyaan nyata, setelah dokumen, penyedia, dan pengguna berubah." },
      { p: "Catat setiap kueri. Ringkas log menjadi beberapa angka harian: **volume**, **retrieval kosong** (potongan terbaik mencakup kurang dari separuh kata pertanyaan), **jempol turun**, dan **latensi p95** (95% jawaban lebih cepat dari ini). **Peringatan** menyala saat angka tetap di atas ambangnya." },
      { p: "Tiga masalah tersembunyi di bulan ini. Ambangnya mulai terlalu sensitif, sehingga terlalu banyak yang menyala. Setel sampai setiap peringatan bermakna, lalu telusuri untuk mengetahui apa yang terjadi." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Alert fatigue", "With the starting thresholds, count the alerts. When most alerts are false alarms, people stop reading them, and then miss the real one."] },
      { exp: ["Same symptom, different causes", "Drill into both empty-retrieval episodes. The first is a broken pipeline (a page vanished). The second is a content gap (a topic nobody wrote about). The fixes are completely different."] },
      { exp: ["What latency can't see", "The slow days show only on the p95 chart: answers stayed correct. The missing page shows on empty retrievals and thumbs down, while latency looks perfect. You need several metrics."] },
      { exp: ["Speed vs noise", "Window 1 catches problems on day one, with more false alarms. Window 3 is quiet, but the missing page may be fixed before anyone is told."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Kelelahan peringatan", "Dengan ambang awal, hitung peringatannya. Jika sebagian besar alarm palsu, orang berhenti membacanya, lalu melewatkan yang sungguhan."] },
      { exp: ["Gejala sama, penyebab berbeda", "Telusuri kedua episode retrieval kosong. Yang pertama pipeline rusak (sebuah halaman hilang). Yang kedua celah konten (topik yang belum ditulis siapa pun). Perbaikannya sama sekali berbeda."] },
      { exp: ["Yang tidak terlihat dari latensi", "Hari-hari lambat hanya terlihat di grafik p95: jawaban tetap benar. Halaman yang hilang terlihat di retrieval kosong dan jempol turun, sementara latensi tampak sempurna. Anda butuh beberapa metrik."] },
      { exp: ["Cepat vs bising", "Jendela 1 menangkap masalah di hari pertama, dengan lebih banyak alarm palsu. Jendela 3 tenang, tetapi halaman yang hilang mungkin sudah diperbaiki sebelum ada yang diberi tahu."] }],
  },
  specs: {
    en: [{ dl: [["Simulated log", "Seeded random traffic over the handbook, 25–60 queries a day. Each query really goes through retrieval, so empty retrievals are measured, not invented."], ["Empty retrieval", "The best chunk contains under half of the question's words (the check from lesson 30). A score threshold alone misses wrong-page answers."], ["p95", "Sort the day's latencies; the value 95% of the way up. Averages hide the slow tail that users feel."], ["Privacy", "Logs hold what users typed. Decide what you keep, for how long, and who can read it, before you collect it."]] }],
    id: [{ dl: [["Log simulasi", "Lalu lintas acak berbenih atas buku panduan, 25–60 kueri per hari. Setiap kueri benar-benar melewati retrieval, jadi retrieval kosong diukur, bukan dikarang."], ["Retrieval kosong", "Potongan terbaik berisi kurang dari separuh kata pertanyaan (pemeriksaan dari pelajaran 30). Ambang skor saja melewatkan jawaban dari halaman yang salah."], ["p95", "Urutkan latensi hari itu; ambil nilai di posisi 95%. Rata-rata menyembunyikan ekor lambat yang dirasakan pengguna."], ["Privasi", "Log menyimpan apa yang diketik pengguna. Putuskan apa yang disimpan, berapa lama, dan siapa yang boleh membaca, sebelum mengumpulkannya."]] }],
  },
};

export default {
  n: 31, stages, text, Board,
  controls: [
    { id: "emptyLimit", label: L("Empty retrievals over", "Retrieval kosong di atas"), min: 0.05, max: 0.4, step: 0.01, default: 0.08, format: (v) => pct(v) },
    { id: "downLimit", label: L("Thumbs down over", "Jempol turun di atas"), min: 0.1, max: 0.6, step: 0.05, default: 0.2, format: (v) => pct(v) },
    { id: "p95Limit", label: L("p95 latency over (ms)", "Latensi p95 di atas (ms)"), min: 1000, max: 4000, step: 100, default: 1250 },
    { id: "window", label: L("Days in a row", "Hari berturut-turut"), min: 1, max: 3, step: 1, default: 1 },
  ],
  code: [
    { id: "mon", label: L("Log, metrics, alerts (runs here)", "Log, metrik, peringatan (bisa dijalankan)"), source: pySource, runnable: true, filename: "monitor.py" },
    { id: "libs", label: L("Logging and alerting with pandas", "Log dan peringatan dengan pandas"), source: libSource, runnable: false, filename: "monitor_pandas.py", note: L("Runs on your computer after: pip install pandas", "Jalankan di komputer Anda setelah: pip install pandas") },
  ],
  variables: (c) => [["alerts", c.fired ? String(c.fired.length) : "—"], ["days", c.fired ? JSON.stringify(c.fired.map((a) => a.day)) : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang;
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: HANDBOOK[lang], POOLS: POOLS[lang], BROKEN: BROKEN[lang], RULES: rulesOf(I), WINDOW: I.window, LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(DOCUMENT, POOLS, BROKEN, RULES, WINDOW, LANG, STOPWORDS)",
      compare: (res) => {
        const log = getLog(lang), days = daily(log), fired = alerts(days, rulesOf(I), I.window), close = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
        const dr = Object.fromEntries(fired.filter((a) => a.metric === "empty").map((a) => [String(a.day), drill(log, a.day)]));
        return res.n === log.length && res.days.every((d, i) => d.volume === days[i].volume && close(d.empty, days[i].empty) && close(d.down, days[i].down) && close(d.p95, days[i].p95))
          && JSON.stringify(res.alerts) === JSON.stringify(fired) && JSON.stringify(res.drill) === JSON.stringify(dr);
      },
    };
  },
  challenges: [
    { id: "three", text: L("Tune the rules so you get exactly three alerts, one for each real problem, and no false alarms.", "Setel aturan sehingga muncul tepat tiga peringatan, satu untuk setiap masalah nyata, tanpa alarm palsu."),
      check: (c) => c.fired && c.fired.length === 3 && c.fired.every((a) => causeOf(a)) && CAUSE.every((cz) => c.fired.some((a) => causeOf(a) === cz)) },
    { id: "fast", text: L("Catch the missing page on the first day it happens (day 13).", "Tangkap halaman yang hilang pada hari pertama terjadinya (hari 13)."), check: (c) => c.fired && c.fired.some((a) => a.day === 13 && a.metric !== "p95") },
    { id: "gap", text: L("Drill into an alert that reveals the new topic users are asking about.", "Telusuri peringatan yang mengungkap topik baru yang ditanyakan pengguna."), check: (c) => c.drill && Object.values(c.drill).some((rows) => rows.some(([q]) => q.includes("CNC"))) },
  ],
  quiz: [
    quizQ(L("Why use p95 latency instead of the average?", "Mengapa memakai latensi p95, bukan rata-rata?"), [L("The average hides the slow answers some users get", "Rata-rata menyembunyikan jawaban lambat yang diterima sebagian pengguna"), L("p95 is easier to compute", "p95 lebih mudah dihitung"), L("The average is always higher", "Rata-rata selalu lebih tinggi"), L("Providers require it", "Penyedia mewajibkannya")], 0, L("One user in twenty waits at least this long; that tail is what people complain about.", "Satu dari dua puluh pengguna menunggu setidaknya selama ini; ekor itulah yang dikeluhkan orang.")),
    quizQ(L("Empty retrievals jump, but nothing in the pipeline changed. What is the likely cause?", "Retrieval kosong melonjak, tetapi tidak ada yang berubah di pipeline. Apa penyebab yang mungkin?"), [L("Users started asking about something the documents don't cover", "Pengguna mulai bertanya tentang sesuatu yang tidak ada di dokumen"), L("The embedding model got worse", "Model embedding memburuk"), L("Latency went up", "Latensi naik"), L("Too many alerts", "Terlalu banyak peringatan")], 0, L("Drill down: the questions themselves tell you it is a content gap.", "Telusuri: pertanyaan-pertanyaannya sendiri menunjukkan bahwa ini celah konten.")),
    quizQ(L("What is alert fatigue?", "Apa itu kelelahan peringatan?"), [L("So many false alarms that real ones get ignored", "Begitu banyak alarm palsu sehingga yang sungguhan diabaikan"), L("A slow alerting server", "Server peringatan yang lambat"), L("Too few metrics", "Terlalu sedikit metrik"), L("Users giving too much feedback", "Pengguna memberi terlalu banyak masukan")], 0, L("Thresholds and windows exist to keep every alert worth reading.", "Ambang dan jendela ada agar setiap peringatan layak dibaca.")),
  ],
};
