// Lesson 25: scaling. An IVF index (cluster, then probe the nearest cells), its recall/latency curve,
// and what memory and time look like at millions of vectors. Twin: ./ivf.py
import * as ann from "../../rag/ann.js";
import { rng } from "../../rag/ngram.js";
import { LineChart } from "../../toolkit/charts.jsx";
import { L, pct, quizQ } from "../shared.js";
import { prelude } from "../prelude.js";
import pySource from "./ivf.py?raw";
import libSource from "./with_libraries.py?raw";

const K = 10, SEED = 7;
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const byDist = (a, b) => a[0] - b[0] || a[1] - b[1];

export function makeQueries(points, seed, count = 40) {
  const r = rng(seed + 99);
  return Array.from({ length: count }, (_, j) => { const [x, y] = points[(j * 37) % points.length]; return [x + (r() - 0.5) * 0.2, y + (r() - 0.5) * 0.2]; });
}
const bruteForce = (points, q, k) => points.map((p, i) => [d2(p, q), i]).sort(byDist).slice(0, k).map((x) => x[1]);
function nearest(cs, p) { let best = 0, bd = d2(cs[0], p); for (let c = 1; c < cs.length; c++) { const d = d2(cs[c], p); if (d < bd) { best = c; bd = d; } } return best; }
export function kmeans(points, nlist, iters = 8) {
  let cs = Array.from({ length: nlist }, (_, i) => points[Math.floor((i * points.length) / nlist)]);
  for (let it = 0; it < iters; it++) {
    const sx = new Array(nlist).fill(0), sy = new Array(nlist).fill(0), cnt = new Array(nlist).fill(0);
    for (const p of points) { const c = nearest(cs, p); sx[c] += p[0]; sy[c] += p[1]; cnt[c]++; }
    cs = cs.map((old, c) => (cnt[c] ? [sx[c] / cnt[c], sy[c] / cnt[c]] : old));
  }
  return cs;
}
export function invertedLists(points, cs) { const lists = cs.map(() => []); points.forEach((p, i) => lists[nearest(cs, p)].push(i)); return { lists, cell: points.map((p) => nearest(cs, p)) }; }
const probeOrder = (cs, q) => cs.map((c, i) => [d2(c, q), i]).sort(byDist).map((x) => x[1]);
export function sweep(points, cs, lists, queries, exact, k) {
  const nl = cs.length, recall = new Array(nl).fill(0), comps = new Array(nl).fill(0);
  queries.forEach((q, j) => {
    const order = probeOrder(cs, q), truth = new Set(exact[j]);
    let best = [], scanned = 0;
    for (let p = 0; p < nl; p++) {
      const cell = lists[order[p]]; scanned += cell.length;
      best = best.concat(cell.map((i) => [d2(points[i], q), i])).sort(byDist).slice(0, k);
      recall[p] += best.filter((x) => truth.has(x[1])).length / k;
      comps[p] += nl + scanned;
    }
  });
  return recall.map((r, p) => [p + 1, r / queries.length, comps[p] / queries.length]);
}
export function choose(curve, target, n) { const hit = curve.find((c) => c[1] >= target) || curve[curve.length - 1]; return { nprobe: hit[0], recall: hit[1], comps: hit[2], speedup: n / hit[2] }; }
export function atScale(millions, dims, precision, fraction) {
  const N = millions * 1_000_000, gb = (N * dims * (precision === "float32" ? 4 : 1)) / 1e9, exactMs = ((N * dims) / 1e10) * 1000;
  return { gb, exactMs, ivfMs: exactMs * fraction };
}

const cache = new Map();
function built(n, nlist) {
  const key = `${n}|${nlist}`;
  if (!cache.has(key)) {
    if (cache.size > 12) cache.clear();
    const pts = ann.makePoints(n, SEED), queries = makeQueries(pts, SEED), exact = queries.map((q) => bruteForce(pts, q, K));
    const cs = kmeans(pts, nlist), { lists, cell } = invertedLists(pts, cs);
    cache.set(key, { pts, queries, exact, cs, lists, cell, curve: sweep(pts, cs, lists, queries, exact, K) });
  }
  return cache.get(key);
}

const stages = [
  { id: "points", label: L("Vectors", "Vektor"), desc: L("Stored vectors and 40 test queries. Brute force gives the true 10 nearest for each query: the answer key.", "Vektor tersimpan dan 40 kueri uji. Brute force memberi 10 terdekat yang sebenarnya untuk setiap kueri: kunci jawabannya."),
    run: ({ inputs }) => { const b = built(inputs.n, inputs.nlist); return { pts: b.pts, queries: b.queries, exact: b.exact }; },
    log: (c) => ({ text: `${c.pts.length} vectors, ${c.queries.length} queries` }), live: (c) => `${c.pts.length} vectors` },
  { id: "train", label: L("Train cells", "Latih sel"), desc: L("k-means splits the space into nlist cells; each cell has a centre. This is done once, before searching.", "k-means membagi ruang menjadi nlist sel; setiap sel punya pusat. Ini dilakukan sekali, sebelum pencarian."),
    run: (c) => ({ cs: built(c.inputs.n, c.inputs.nlist).cs }), log: (c) => ({ text: `${c.cs.length} cells` }), live: (c) => `${c.cs.length} cells` },
  { id: "assign", label: L("Fill lists", "Isi daftar"), desc: L("Every vector goes into the list of its nearest centre. A search will only open a few lists.", "Setiap vektor masuk ke daftar pusat terdekatnya. Pencarian hanya akan membuka beberapa daftar."),
    run: (c) => { const b = built(c.inputs.n, c.inputs.nlist); return { lists: b.lists, cell: b.cell }; },
    log: (c) => { const s = c.lists.map((l) => l.length); return { text: `cells hold ${Math.min(...s)}–${Math.max(...s)} vectors` }; }, live: (c) => `${Math.round(c.pts.length / c.lists.length)} per cell` },
  { id: "sweep", label: L("Sweep nprobe", "Sapu nprobe"), desc: L("Search again and again, opening 1, 2, 3… nearest cells (nprobe). More cells: higher recall, more comparisons. That is the curve.", "Cari berulang kali, membuka 1, 2, 3… sel terdekat (nprobe). Lebih banyak sel: recall lebih tinggi, perbandingan lebih banyak. Itulah kurvanya."),
    run: (c) => ({ curve: built(c.inputs.n, c.inputs.nlist).curve }), log: (c) => ({ text: `nprobe 1: recall ${pct(c.curve[0][1])}; all cells: ${pct(c.curve[c.curve.length - 1][1])}` }), live: (c) => `${c.curve.length} points` },
  { id: "scale", label: L("Pick & scale", "Pilih & skala"), desc: L("Pick the cheapest nprobe that meets your recall target, then project memory and time to millions of vectors.", "Pilih nprobe termurah yang memenuhi target recall, lalu proyeksikan memori dan waktu ke jutaan vektor."),
    run: (c) => { const ch = choose(c.curve, c.inputs.target, c.pts.length); return { choice: ch, scale: atScale(+c.inputs.millions, +c.inputs.dims, c.inputs.precision, ch.comps / c.pts.length) }; },
    log: (c) => ({ text: `nprobe ${c.choice.nprobe}: recall ${pct(c.choice.recall)}, ${c.choice.speedup.toFixed(1)}× fewer comparisons; ${c.scale.gb.toFixed(1)} GB`, warn: c.choice.recall < c.inputs.target ? "target not reachable" : null }), live: (c) => `nprobe ${c.choice.nprobe}` },
];

const hue = (i, n) => `hsl(${Math.round((i * 360) / n + (i % 2) * 17)} 55% 52%)`;

function Board({ ctx, runner, tr }) {
  const W = 420, P = 12, X = (v) => P + v * (W - 2 * P), Y = (v) => W - P - v * (W - 2 * P);
  const ph = runner.phase, pts = ctx.pts || [], q = ctx.queries?.[0];
  const probed = new Set(ctx.choice && q ? probeOrder(ctx.cs, q).slice(0, ctx.choice.nprobe) : []);
  const n = pts.length;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Cells, probes and the trade-off", "Sel, probe, dan tarik-ulurnya"))}</h2><span className="sub">{n} {tr(L("vectors", "vektor"))} · nlist {ctx.inputs.nlist}</span></div>
      <div className="split">
        <svg viewBox={`0 0 ${W} ${W}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={tr(L("vectors grouped into cells", "vektor dikelompokkan ke sel"))}>
          {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={1.8} fill={ph >= 3 ? hue(ctx.cell[i], ctx.cs.length) : "var(--muted)"} opacity={ph >= 5 && probed.size && !probed.has(ctx.cell[i]) ? 0.22 : 0.8} />)}
          {ph >= 2 && ctx.cs.map((c, i) => <g key={"c" + i} transform={`translate(${X(c[0])} ${Y(c[1])})`}><path d="M-5 -5L5 5M5 -5L-5 5" stroke="var(--ink)" strokeWidth={2} /></g>)}
          {q && <path d={`M${X(q[0])} ${Y(q[1]) - 11}l3.2 7.6 8.2.6-6.3 5.2 2 8-7.1-4.4-7.1 4.4 2-8-6.3-5.2 8.2-.6z`} fill="var(--query)" stroke="var(--panel)" strokeWidth={1.5} />}
        </svg>
        <div className="plain" style={{ alignSelf: "start" }}>
          <dl className="kv" style={{ fontSize: 14 }}>
            <dt>{tr(L("vectors", "vektor"))}</dt><dd>{n}</dd>
            <dt>{tr(L("cells", "sel"))}</dt><dd>{ctx.cs ? ctx.cs.length : "…"}</dd>
            <dt>nprobe</dt><dd>{ctx.choice ? ctx.choice.nprobe : "…"}</dd>
            <dt>recall@{K}</dt><dd style={{ color: ctx.choice ? (ctx.choice.recall >= ctx.inputs.target ? "var(--good)" : "var(--warn)") : "inherit" }}>{ctx.choice ? pct(ctx.choice.recall) : "…"}</dd>
            <dt>{tr(L("speed-up", "percepatan"))}</dt><dd>{ctx.choice ? `${ctx.choice.speedup.toFixed(1)}×` : "…"}</dd>
          </dl>
          {ctx.scale && <p style={{ fontSize: 13.5, margin: "10px 0 0" }}><b>{ctx.inputs.millions} {tr(L("million", "juta"))} × {ctx.inputs.dims} {tr(L("dims", "dimensi"))}</b><br />
            {tr(L("memory", "memori"))}: {ctx.scale.gb.toFixed(1)} GB ({ctx.inputs.precision})<br />
            {tr(L("per query", "per kueri"))}: {tr(L("exact", "pasti"))} {Math.round(ctx.scale.exactMs)} ms · IVF {ctx.scale.ivfMs.toFixed(1)} ms</p>}
          {ph >= 5 && <p className="note">{tr(L("Faded dots are in cells the first query never opens. That is where the speed comes from, and where a miss can hide.", "Titik pudar ada di sel yang tidak pernah dibuka kueri pertama. Dari situlah kecepatannya, dan di situ pula kesalahan bisa bersembunyi."))}</p>}
        </div>
      </div>
      <div className="plain">
        {ctx.curve ? <LineChart W={640} H={260} yMax={1} xLabel={tr(L("comparisons per query (less is faster)", "perbandingan per kueri (lebih sedikit = lebih cepat)"))} yLabel={`recall@${K}`} fmtY={(v) => pct(v)} fmtX={(v) => Math.round(v)}
          series={[{ name: "ivf", points: ctx.curve.map((c) => [c[2], c[1]]) }]}
          best={ctx.choice ? Object.assign([ctx.choice.comps, ctx.choice.recall], { label: `nprobe ${ctx.choice.nprobe}` }) : null} />
          : <p className="note">{tr(L("Run to the Sweep step to draw the recall/speed curve.", "Jalankan sampai langkah Sapu untuk menggambar kurva recall/kecepatan."))}</p>}
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Lesson 11 used a graph index. The other big family is **IVF** (inverted file): split the vectors into **cells** with k-means, and at search time open only the **nprobe** cells whose centres are nearest the query." },
      { p: "Every approximate index has a dial like nprobe. Turn it up: more vectors scanned, higher **recall**, slower. Turn it down: faster, and some true neighbours are missed. The curve on the right is that trade-off, measured on 40 queries against the exact answer." },
      { p: "At millions of vectors, memory matters as much as speed. A float32 number is 4 bytes; storing each as **int8** (1 byte, \"quantisation\") cuts memory by 4× for a small loss in accuracy." },
      { h: "Try" },
      { ol: ["Press **Play** and watch the cells appear.", "Raise **cells (nlist)** to 64: each cell is smaller, so nprobe 1 is cheaper but misses more.", "Set the scale to 100 million × 768 and switch to int8."] },
    ],
    id: [
      { p: "Pelajaran 11 memakai indeks graf. Keluarga besar lainnya adalah **IVF** (inverted file): bagi vektor menjadi **sel** dengan k-means, lalu saat mencari buka hanya **nprobe** sel yang pusatnya paling dekat dengan kueri." },
      { p: "Setiap indeks perkiraan punya pengatur seperti nprobe. Naikkan: lebih banyak vektor dipindai, **recall** lebih tinggi, lebih lambat. Turunkan: lebih cepat, dan sebagian tetangga sebenarnya terlewat. Kurva di kanan adalah tarik-ulur itu, diukur pada 40 kueri terhadap jawaban pasti." },
      { p: "Pada jutaan vektor, memori sama pentingnya dengan kecepatan. Angka float32 berukuran 4 byte; menyimpannya sebagai **int8** (1 byte, \"kuantisasi\") memangkas memori 4× dengan sedikit kehilangan akurasi." },
      { h: "Coba" },
      { ol: ["Tekan **Putar** dan lihat sel-selnya muncul.", "Naikkan **sel (nlist)** ke 64: setiap sel lebih kecil, jadi nprobe 1 lebih murah tetapi lebih sering meleset.", "Atur skala ke 100 juta × 768 dan ganti ke int8."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Cheap and wrong", "nlist 64, target 70%: nprobe 1 is picked. Look at the faded dots: whole regions are never searched. Now raise the target to 99%."] },
      { exp: ["The rule of thumb", "Real systems use nlist around √N (about 1,000 cells for a million vectors) and tune nprobe until recall is good enough. Try nlist 32 and 64 with 5,000 vectors and compare how many comparisons 99% costs."] },
      { exp: ["Will it fit?", "100 million × 1536 dims as float32 is over 600 GB. Switch to int8, then lower the dimensions. Which change saves more?"] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Murah tapi salah", "nlist 64, target 70%: nprobe 1 yang dipilih. Lihat titik-titik pudar: seluruh wilayah tidak pernah dicari. Sekarang naikkan target ke 99%."] },
      { exp: ["Aturan praktis", "Sistem sungguhan memakai nlist sekitar √N (sekitar 1.000 sel untuk sejuta vektor) lalu menyetel nprobe sampai recall cukup. Coba nlist 32 dan 64 dengan 5.000 vektor dan bandingkan berapa perbandingan yang dibutuhkan untuk 99%."] },
      { exp: ["Muatkah?", "100 juta × 1536 dimensi sebagai float32 lebih dari 600 GB. Ganti ke int8, lalu kecilkan dimensinya. Perubahan mana yang lebih hemat?"] }],
  },
  specs: {
    en: [{ dl: [["nlist", "Number of cells. More cells: each probe is cheaper, but you need more probes for the same recall."], ["nprobe", "Cells opened per query. The speed/recall dial at search time; it can change per request without rebuilding."], ["Comparisons", "Centre comparisons plus vectors scanned. A stand-in for latency that does not depend on your computer."], ["Time at scale", "Assumes about 10 billion multiply-adds per second on one CPU core. Measure your own hardware; the ratio between exact and IVF is what matters."], ["2D vs real", "The curve's shape depends on how clustered the vectors are, so measure on your own data. The Code tab runs the same sweep with FAISS on 200,000 vectors of 384 dimensions."]] }],
    id: [{ dl: [["nlist", "Jumlah sel. Lebih banyak sel: setiap probe lebih murah, tetapi perlu lebih banyak probe untuk recall yang sama."], ["nprobe", "Sel yang dibuka per kueri. Pengatur kecepatan/recall saat pencarian; bisa berubah per permintaan tanpa membangun ulang."], ["Perbandingan", "Perbandingan pusat ditambah vektor yang dipindai. Pengganti latensi yang tidak bergantung pada komputer Anda."], ["Waktu pada skala besar", "Mengasumsikan sekitar 10 miliar perkalian-penjumlahan per detik pada satu inti CPU. Ukur perangkat Anda sendiri; rasio antara pasti dan IVF yang penting."], ["2D vs nyata", "Bentuk kurva bergantung pada seberapa mengelompok vektornya, jadi ukur pada data Anda sendiri. Tab Kode menjalankan sapuan yang sama dengan FAISS pada 200.000 vektor berdimensi 384."]] }],
  },
};

export default {
  n: 25, stages, text, Board,
  controls: [
    { id: "n", label: L("Vectors", "Jumlah vektor"), min: 1000, max: 5000, step: 1000, default: 2000 },
    { id: "nlist", label: L("Cells (nlist)", "Sel (nlist)"), min: 4, max: 64, step: 4, default: 16 },
    { id: "target", label: L("Recall target", "Target recall"), min: 0.7, max: 1, step: 0.01, default: 0.95, format: (v) => pct(v) },
    { id: "millions", type: "select", default: "10", label: L("Scale (vectors)", "Skala (vektor)"), options: ["1", "10", "100"].map((v) => ({ value: v, label: L(`${v} million`, `${v} juta`) })) },
    { id: "dims", type: "select", default: "768", label: L("Dimensions", "Dimensi"), options: ["384", "768", "1536"].map((v) => ({ value: v, label: L(v, v) })) },
    { id: "precision", type: "select", default: "float32", label: L("Stored as", "Disimpan sebagai"), options: [{ value: "float32", label: L("float32 (4 bytes)", "float32 (4 byte)") }, { value: "int8", label: L("int8 (1 byte)", "int8 (1 byte)") }] },
  ],
  code: [
    { id: "ivf", label: L("IVF from scratch (runs here)", "IVF dari nol (bisa dijalankan)"), source: pySource, runnable: true, filename: "ivf.py" },
    { id: "libs", label: L("With FAISS", "Dengan FAISS"), source: libSource, runnable: false, filename: "ivf_faiss.py", note: L("Runs on your computer after: pip install faiss-cpu numpy", "Jalankan di komputer Anda setelah: pip install faiss-cpu numpy") },
  ],
  variables: (c) => [["nprobe", c.choice ? String(c.choice.nprobe) : "—"], ["recall", c.choice ? pct(c.choice.recall) : "—"], ["memory", c.scale ? `${c.scale.gb.toFixed(1)} GB` : "—"]],
  python: (c) => {
    const I = c.inputs;
    return {
      prelude: prelude("ann"),
      globals: { N: I.n, NLIST: I.nlist, TARGET: I.target, MILLIONS: +I.millions, DIMS: +I.dims, PRECISION: I.precision },
      call: "demo(N, NLIST, TARGET, MILLIONS, DIMS, PRECISION)",
      compare: (res) => {
        const b = built(I.n, I.nlist), ch = choose(b.curve, I.target, I.n), s = atScale(+I.millions, +I.dims, I.precision, ch.comps / I.n);
        const close = (a, x) => Math.abs(a - x) < 1e-9 * Math.max(1, Math.abs(x));
        return JSON.stringify(res.sizes) === JSON.stringify(b.lists.map((l) => l.length)) && res.nprobe === ch.nprobe
          && res.curve.every((p, i) => p[0] === b.curve[i][0] && close(p[1], b.curve[i][1]) && close(p[2], b.curve[i][2]))
          && close(res.gb, s.gb) && close(res.exact_ms, s.exactMs) && close(res.ivf_ms, s.ivfMs);
      },
    };
  },
  challenges: [
    { id: "miss", text: L("Make a single probe miss more than 20% of the true neighbours (nprobe 1 recall below 80%).", "Buat satu probe melewatkan lebih dari 20% tetangga sebenarnya (recall nprobe 1 di bawah 80%)."), check: (c) => c.curve && c.curve[0][1] < 0.8 },
    { id: "fast", text: L("With 5,000 vectors, reach 99% recall using under 10% of brute-force comparisons.", "Dengan 5.000 vektor, capai recall 99% dengan kurang dari 10% perbandingan brute force."), check: (c) => c.choice && c.inputs.n >= 5000 && c.inputs.target >= 0.99 && c.choice.recall >= 0.99 && c.choice.comps / c.inputs.n < 0.1 },
    { id: "fit", text: L("Store 100 million 768-dimension vectors in under 100 GB.", "Simpan 100 juta vektor 768 dimensi dalam kurang dari 100 GB."), check: (c) => c.scale && +c.inputs.millions === 100 && +c.inputs.dims >= 768 && c.scale.gb < 100 },
  ],
  quiz: [
    quizQ(L("What does raising nprobe do in an IVF index?", "Apa efek menaikkan nprobe pada indeks IVF?"), [L("Opens more cells: higher recall, slower", "Membuka lebih banyak sel: recall lebih tinggi, lebih lambat"), L("Retrains the cells", "Melatih ulang sel"), L("Makes vectors smaller", "Membuat vektor lebih kecil"), L("Changes the embedding model", "Mengganti model embedding")], 0, L("nprobe is a search-time dial; the index itself does not change.", "nprobe adalah pengatur saat pencarian; indeksnya sendiri tidak berubah.")),
    quizQ(L("How much memory do 10 million 768-dimension float32 vectors need?", "Berapa memori untuk 10 juta vektor float32 berdimensi 768?"), [L("About 31 GB", "Sekitar 31 GB"), L("About 3 GB", "Sekitar 3 GB"), L("About 300 GB", "Sekitar 300 GB"), L("About 768 MB", "Sekitar 768 MB")], 0, L("10,000,000 × 768 × 4 bytes ≈ 30.7 GB, before any index overhead.", "10.000.000 × 768 × 4 byte ≈ 30,7 GB, sebelum tambahan indeks.")),
    quizQ(L("Your recall is 85% and users miss answers. What do you try first?", "Recall Anda 85% dan pengguna tidak menemukan jawaban. Apa yang dicoba pertama?"), [L("Raise nprobe (or ef) and measure again", "Naikkan nprobe (atau ef) lalu ukur lagi"), L("Buy a bigger LLM", "Membeli LLM yang lebih besar"), L("Lower the chunk size to 5 words", "Kecilkan ukuran potongan jadi 5 kata"), L("Remove the index", "Hapus indeksnya")], 0, L("The search dial is the cheapest fix; check the latency budget after.", "Pengatur pencarian adalah perbaikan termurah; periksa anggaran latensi sesudahnya.")),
  ],
};
