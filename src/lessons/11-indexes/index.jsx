// Lesson 11: vector indexes. Brute force compares with everything; a graph index walks to the answer.
import * as ann from "../../rag/ann.js";
import pySource from "./ann.py?raw";
import libSource from "./with_libraries.py?raw";

const L = (en, id) => ({ en, id });
const K = 5;
const cache = new Map();
function graph(n, seed, M) {
  const key = `${n}|${seed}|${M}`;
  if (!cache.has(key)) { if (cache.size > 20) cache.clear(); const pts = ann.makePoints(n, seed); cache.set(key, { pts, nbrs: ann.buildNSW(pts, M) }); }
  return cache.get(key);
}

const stages = [
  { id: "points", label: L("Vectors", "Vektor"), desc: L("A collection of stored vectors (2D here so we can see them; real ones have hundreds of dimensions).", "Kumpulan vektor tersimpan (2D di sini agar terlihat; yang sungguhan punya ratusan dimensi)."),
    run: ({ inputs }) => ({ pts: graph(inputs.n, inputs.seed, inputs.M).pts, q: [inputs.qx, inputs.qy] }),
    log: (c) => ({ text: `${c.pts.length} vectors stored` }), live: (c) => `${c.pts.length} vectors` },
  { id: "build", label: L("Build graph", "Bangun graf"), desc: L("Link every vector to its M nearest neighbours, once, when it is added. This is the index.", "Hubungkan setiap vektor ke M tetangga terdekatnya, sekali, saat ditambahkan. Inilah indeksnya."),
    run: (c) => { const nbrs = graph(c.inputs.n, c.inputs.seed, c.inputs.M).nbrs; return { nbrs, edges: nbrs.reduce((a, l) => a + l.length, 0) / 2 }; },
    log: (c) => ({ text: `${c.edges} links (M=${c.inputs.M})` }), live: (c) => `${c.edges} links` },
  { id: "brute", label: L("Brute force", "Brute force"), desc: L("Exact search: measure the distance from the query to every vector and sort.", "Pencarian pasti: ukur jarak dari kueri ke setiap vektor lalu urutkan."),
    run: (c) => ({ exact: ann.bruteForce(c.pts, c.q, K) }), log: (c) => ({ text: `${c.exact.comparisons} comparisons` }), live: (c) => `${c.exact.comparisons} comparisons` },
  { id: "search", label: L("Graph search", "Cari di graf"), desc: L("Start at one vector and keep hopping to whichever neighbour is closer to the query. Stop when nothing closer is left.", "Mulai dari satu vektor lalu terus melompat ke tetangga yang lebih dekat ke kueri. Berhenti saat tidak ada yang lebih dekat."),
    run: (c) => ({ found: ann.searchNSW(c.pts, c.nbrs, c.q, K, c.inputs.ef) }), log: (c) => ({ text: `${c.found.comparisons} comparisons, ${c.found.expanded.length} hops` }), live: (c) => `${c.found.comparisons} comparisons` },
  { id: "compare", label: L("Compare", "Bandingkan"), desc: L("Did the graph find the true nearest vectors? Recall@5 = how many of the true top 5 it found.", "Apakah graf menemukan vektor terdekat yang sebenarnya? Recall@5 = berapa banyak dari top 5 sebenarnya yang ditemukan."),
    run: (c) => { const hit = c.found.top.filter((i) => c.exact.top.includes(i)).length; return { recall: hit / K, speedup: c.exact.comparisons / c.found.comparisons }; },
    log: (c) => ({ text: `recall@5 = ${Math.round(c.recall * 100)}%, ${c.speedup.toFixed(1)}× fewer comparisons`, warn: c.recall < 1 ? "missed some" : null }), live: (c) => `recall ${Math.round(c.recall * 100)}%` },
];

function Board({ ctx, runner, tr }) {
  const W = 520, P = 14, X = (v) => P + v * (W - 2 * P), Y = (v) => W - P - v * (W - 2 * P);
  const pts = ctx.pts || [];
  const ph = runner.phase;
  const exact = new Set(ctx.exact?.top || []), found = new Set(ctx.found?.top || []);
  const exp = ctx.found?.expanded || [];
  const drawAll = ctx.nbrs && pts.length <= 400;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Finding the nearest vectors", "Mencari vektor terdekat"))}</h2>
        <span className="sub">{tr(L("drag the query with the X/Y sliders", "geser kueri dengan slider X/Y"))}</span></div>
      <div className="split">
        <svg viewBox={`0 0 ${W} ${W}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="vector index">
          {drawAll && ctx.nbrs.map((l, i) => l.filter((j) => j > i).map((j) => <line key={i + "-" + j} x1={X(pts[i][0])} y1={Y(pts[i][1])} x2={X(pts[j][0])} y2={Y(pts[j][1])} stroke="var(--line)" strokeWidth={0.6} />))}
          {ph >= 4 && exp.slice(1).map((n, k) => <line key={"p" + k} x1={X(pts[exp[k]][0])} y1={Y(pts[exp[k]][1])} x2={X(pts[n][0])} y2={Y(pts[n][1])} stroke="var(--query)" strokeWidth={2} />)}
          {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={2.4} fill={ph >= 3 && exact.has(i) ? "var(--good)" : "var(--muted)"} opacity={0.75} />)}
          {ph >= 4 && exp.map((n, k) => <circle key={"e" + k} cx={X(pts[n][0])} cy={Y(pts[n][1])} r={3.6} fill="var(--query)" />)}
          {ph >= 3 && [...exact].map((i) => <circle key={"x" + i} cx={X(pts[i][0])} cy={Y(pts[i][1])} r={8} fill="none" stroke="var(--good)" strokeWidth={2} />)}
          {ph >= 4 && [...found].map((i) => <circle key={"f" + i} cx={X(pts[i][0])} cy={Y(pts[i][1])} r={11} fill="none" stroke="var(--query)" strokeWidth={2} strokeDasharray="3 2" />)}
          {ph >= 4 && exp[0] != null && <text x={X(pts[exp[0]][0]) + 8} y={Y(pts[exp[0]][1]) - 6} style={{ font: "600 11px var(--body)", fill: "var(--query)" }}>{tr(L("start", "mulai"))}</text>}
          {ctx.q && <path d={`M${X(ctx.q[0])} ${Y(ctx.q[1]) - 11}l3.2 7.6 8.2.6-6.3 5.2 2 8-7.1-4.4-7.1 4.4 2-8-6.3-5.2 8.2-.6z`} fill="var(--query)" stroke="var(--panel)" strokeWidth={1.5} />}
        </svg>
        <div className="plain">
          <dl className="kv" style={{ fontSize: 14 }}>
            <dt>{tr(L("vectors", "vektor"))}</dt><dd>{pts.length}</dd>
            <dt>{tr(L("brute force", "brute force"))}</dt><dd>{ctx.exact ? `${ctx.exact.comparisons} ${tr(L("comparisons", "perbandingan"))}` : "…"}</dd>
            <dt>{tr(L("graph search", "cari di graf"))}</dt><dd>{ctx.found ? `${ctx.found.comparisons} ${tr(L("comparisons", "perbandingan"))}` : "…"}</dd>
            <dt>recall@5</dt><dd style={{ color: ctx.recall == null ? "inherit" : ctx.recall === 1 ? "var(--good)" : "var(--warn)" }}>{ctx.recall != null ? `${Math.round(ctx.recall * 100)}%` : "…"}</dd>
            <dt>{tr(L("speed-up", "percepatan"))}</dt><dd>{ctx.speedup ? `${ctx.speedup.toFixed(1)}×` : "…"}</dd>
          </dl>
          <div className="legend2" style={{ borderTop: 0, padding: "12px 0 0", display: "grid", gap: 6 }}>
            <span><i style={{ border: "2px solid var(--good)", borderRadius: "50%" }} />{tr(L("true 5 nearest (brute force)", "5 terdekat sebenarnya (brute force)"))}</span>
            <span><i style={{ border: "2px dashed var(--query)", borderRadius: "50%" }} />{tr(L("found by the graph", "ditemukan graf"))}</span>
            <span><i style={{ background: "var(--query)" }} />{tr(L("path the search walked", "jalur yang ditempuh pencarian"))}</span>
          </div>
          {!drawAll && ctx.nbrs && <p className="note">{tr(L("Links are hidden above 400 vectors to keep the picture readable.", "Tautan disembunyikan di atas 400 vektor agar gambar tetap terbaca."))}</p>}
        </div>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Retrieval needs the stored vectors nearest to the query. With a few hundred chunks, comparing against **every** vector (brute force) is instant. With ten million, it is too slow." },
      { p: "**Vector indexes** trade a little accuracy for a lot of speed. The most popular, **HNSW**, builds a graph: each vector links to its nearest neighbours. A search starts somewhere and keeps hopping to whichever neighbour is closer to the query." },
      { p: "This lesson builds the single-layer version of that graph (NSW). Green rings are the true nearest vectors; dashed orange rings are what the graph found." },
      { h: "Try" },
      { ol: ["Press **Play** and compare the two comparison counts.", "Set **ef** to 1 and **links per vector** to 2. Does the graph still find the right ones?", "Raise the number of vectors to 1,000: brute force grows, graph search barely does."] },
    ],
    id: [
      { p: "Retrieval membutuhkan vektor tersimpan yang paling dekat dengan kueri. Dengan beberapa ratus potongan, membandingkan dengan **setiap** vektor (brute force) itu instan. Dengan sepuluh juta, terlalu lambat." },
      { p: "**Indeks vektor** menukar sedikit akurasi dengan kecepatan yang besar. Yang paling populer, **HNSW**, membangun graf: setiap vektor terhubung ke tetangga terdekatnya. Pencarian dimulai dari satu titik lalu terus melompat ke tetangga yang lebih dekat ke kueri." },
      { p: "Pelajaran ini membangun versi satu lapis dari graf tersebut (NSW). Cincin hijau adalah vektor terdekat yang sebenarnya; cincin oranye putus-putus adalah yang ditemukan graf." },
      { h: "Coba" },
      { ol: ["Tekan **Putar** dan bandingkan kedua jumlah perbandingan.", "Atur **ef** ke 1 dan **tautan per vektor** ke 2. Apakah graf masih menemukan yang benar?", "Naikkan jumlah vektor ke 1.000: brute force bertambah, pencarian graf hampir tidak."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Break it", "M = 2, ef = 1, and move the query to the far corner. The search can get stuck in the wrong cluster: recall drops below 100%."] }, { exp: ["Fix it", "Raise ef: the search keeps more candidates and recovers, at the cost of more comparisons. This dial exists in every real vector database."] },
      { exp: ["More links, bigger index", "Raise M from 4 to 12 and watch the build step: many more lines. Recall rarely misses now, but every extra link is memory. Real indexes pick M between 8 and 64."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Rusak", "M = 2, ef = 1, lalu pindahkan kueri ke pojok jauh. Pencarian bisa terjebak di kelompok yang salah: recall turun di bawah 100%."] }, { exp: ["Perbaiki", "Naikkan ef: pencarian menyimpan lebih banyak kandidat dan pulih, dengan biaya lebih banyak perbandingan. Pengatur ini ada di setiap vector database sungguhan."] },
      { exp: ["Tautan lebih banyak, indeks lebih besar", "Naikkan M dari 4 ke 12 dan lihat langkah Bangun graf: garisnya jauh lebih banyak. Recall jarang meleset sekarang, tetapi setiap tautan tambahan memakan memori. Indeks sungguhan memakai M antara 8 dan 64."] }],
  },
  specs: {
    en: [{ dl: [["Links per vector (M)", "How many neighbours each vector is linked to when inserted. More links: better recall, more memory."], ["ef", "How many candidates the search keeps while walking. Higher: better recall, slower."], ["HNSW", "Adds layers: a sparse top layer for long jumps and denser layers below. Used by FAISS, pgvector, Qdrant, Weaviate, Milvus and others."], ["When to skip the index", "Below about 10,000 chunks, brute force is fast enough and always exact."]] }],
    id: [{ dl: [["Tautan per vektor (M)", "Berapa tetangga yang dihubungkan ke setiap vektor saat dimasukkan. Lebih banyak: recall lebih baik, memori lebih besar."], ["ef", "Berapa kandidat yang disimpan pencarian selama berjalan. Lebih tinggi: recall lebih baik, lebih lambat."], ["HNSW", "Menambahkan lapisan: lapisan atas yang jarang untuk lompatan jauh dan lapisan bawah yang lebih padat. Dipakai FAISS, pgvector, Qdrant, Weaviate, Milvus, dan lainnya."], ["Kapan tanpa indeks", "Di bawah sekitar 10.000 potongan, brute force cukup cepat dan selalu pasti."]] }],
  },
};

export default {
  n: 11,
  stages, text, Board,
  controls: [
    { id: "n", label: L("Vectors", "Jumlah vektor"), min: 100, max: 1000, step: 100, default: 300 },
    { id: "M", label: L("Links per vector (M)", "Tautan per vektor (M)"), min: 2, max: 12, step: 1, default: 4 },
    { id: "ef", label: L("Search width (ef)", "Lebar pencarian (ef)"), min: 1, max: 40, step: 1, default: 8 },
    { id: "seed", label: L("Layout", "Tata letak"), min: 1, max: 12, step: 1, default: 7 },
    { id: "qx", label: L("Query X", "Kueri X"), min: 0, max: 1, step: 0.02, default: 0.3, format: (v) => v.toFixed(2) },
    { id: "qy", label: L("Query Y", "Kueri Y"), min: 0, max: 1, step: 0.02, default: 0.7, format: (v) => v.toFixed(2) },
  ],
  code: [{ id: "ann", label: L("Brute force vs graph (runs here)", "Brute force vs graf (bisa dijalankan)"), source: pySource, runnable: true, filename: "ann.py" },
    { id: "libs", label: L("With FAISS", "Dengan FAISS"), source: libSource, runnable: false, filename: "ann_faiss.py", note: L("Runs on your computer after: pip install faiss-cpu numpy", "Jalankan di komputer Anda setelah: pip install faiss-cpu numpy") }],
  variables: (c) => [["exact", c.exact ? JSON.stringify(c.exact.top) : "—"], ["found", c.found ? JSON.stringify(c.found.top) : "—"], ["comparisons", c.found ? `${c.found.comparisons} vs ${c.exact.comparisons}` : "—"]],
  python: (c) => ({
    globals: { N: c.inputs.n, SEED: c.inputs.seed, M: c.inputs.M, EF: c.inputs.ef, QX: c.inputs.qx, QY: c.inputs.qy },
    call: "run(N, SEED, M, EF, QX, QY)",
    compare: (res) => {
      const g = graph(c.inputs.n, c.inputs.seed, c.inputs.M);
      const f = ann.searchNSW(g.pts, g.nbrs, [c.inputs.qx, c.inputs.qy], K, c.inputs.ef);
      return JSON.stringify(res.found) === JSON.stringify(f.top) && res.graph === f.comparisons;
    },
  }),
  challenges: [
    { id: "miss", text: L("Make the graph search miss: recall below 100%.", "Buat pencarian graf meleset: recall di bawah 100%."), check: (c) => c.recall != null && c.recall < 1 },
    { id: "fast", text: L("With 1,000 vectors, get 100% recall using at least 10× fewer comparisons than brute force.", "Dengan 1.000 vektor, dapatkan recall 100% dengan perbandingan paling sedikit 10× lebih sedikit dari brute force."), check: (c) => c.inputs.n >= 1000 && c.recall === 1 && c.speedup >= 10 },
    { id: "fix", text: L("With M = 2, raise ef until recall@5 is 100% again.", "Dengan M = 2, naikkan ef sampai recall@5 kembali 100%."), check: (c) => c.inputs.M === 2 && c.recall === 1 && c.inputs.ef > 1 },
  ],
  quiz: [
    { q: L("Why do large RAG systems use an approximate index like HNSW?", "Mengapa sistem RAG besar memakai indeks perkiraan seperti HNSW?"),
      options: [L("Comparing with every vector gets too slow with millions of chunks", "Membandingkan dengan setiap vektor menjadi terlalu lambat untuk jutaan potongan"), L("It gives more accurate results than brute force", "Hasilnya lebih akurat dari brute force"), L("It makes embeddings smaller", "Membuat embedding lebih kecil"), L("The model requires it", "Model mengharuskannya")],
      answer: 0, why: L("It trades a small chance of missing a neighbour for a huge speed-up.", "Indeks menukar sedikit peluang melewatkan tetangga dengan percepatan yang sangat besar.") },
    { q: L("What does raising ef do?", "Apa efek menaikkan ef?"),
      options: [L("Better recall, more comparisons", "Recall lebih baik, perbandingan lebih banyak"), L("Fewer comparisons, better recall", "Perbandingan lebih sedikit, recall lebih baik"), L("Changes the embeddings", "Mengubah embedding"), L("Nothing", "Tidak ada")],
      answer: 0, why: L("The search keeps more candidates, so it explores more and misses less.", "Pencarian menyimpan lebih banyak kandidat, sehingga menjelajah lebih luas dan lebih jarang meleset.") },
    { q: L("You have 2,000 chunks. Do you need HNSW?", "Anda punya 2.000 potongan. Apakah perlu HNSW?"),
      options: [L("Probably not: brute force is fast enough and exact", "Kemungkinan tidak: brute force cukup cepat dan pasti"), L("Yes, always", "Ya, selalu"), L("Only for Indonesian text", "Hanya untuk teks bahasa Indonesia"), L("Only with neural embeddings", "Hanya dengan embedding neural")],
      answer: 0, why: L("Indexes pay off at scale; for small collections they add complexity for no gain.", "Indeks bermanfaat pada skala besar; untuk koleksi kecil hanya menambah kerumitan tanpa manfaat.") },
  ],
};
