// Lesson 5: dot product, length, cosine similarity and distance, drawn on a plane.
import pySource from "./similarity.py?raw";
import libSource from "./with_libraries.py?raw";

const L = (en, id) => ({ en, id });
const vec = (deg, len) => [len * Math.cos((deg * Math.PI) / 180), len * Math.sin((deg * Math.PI) / 180)];
const f3 = (x) => x.toFixed(3);

const stages = [
  { id: "vectors", label: L("Vectors", "Vektor"),
    desc: L("Two vectors, A and B. In real embeddings they have hundreds of numbers; here just two, so we can draw them.", "Dua vektor, A dan B. Embedding sungguhan punya ratusan angka; di sini hanya dua agar bisa digambar."),
    run: ({ inputs }) => ({ a: vec(inputs.angleA, inputs.lenA), b: vec(inputs.angleB, inputs.lenB) }),
    log: (c) => ({ text: `A = [${c.a.map((x) => x.toFixed(2)).join(", ")}], B = [${c.b.map((x) => x.toFixed(2)).join(", ")}]` }),
    live: (c) => `A=[${c.a.map((x) => x.toFixed(2))}] B=[${c.b.map((x) => x.toFixed(2))}]` },
  { id: "dot", label: L("Dot product", "Perkalian titik"),
    desc: L("Multiply matching numbers and add: A·B = a₁b₁ + a₂b₂. It grows when the vectors point the same way, and with their lengths.", "Kalikan angka yang berpasangan lalu jumlahkan: A·B = a₁b₁ + a₂b₂. Nilainya membesar jika arah vektor sama, dan seiring panjangnya."),
    run: (c) => ({ dot: c.a[0] * c.b[0] + c.a[1] * c.b[1] }), log: (c) => ({ text: `A·B = ${f3(c.dot)}` }), live: (c) => `A·B = ${f3(c.dot)}` },
  { id: "lengths", label: L("Lengths", "Panjang"),
    desc: L("The length of each arrow: √(x² + y²).", "Panjang setiap panah: √(x² + y²)."),
    run: (c) => ({ la: Math.hypot(...c.a), lb: Math.hypot(...c.b) }), log: (c) => ({ text: `|A| = ${f3(c.la)}, |B| = ${f3(c.lb)}` }), live: (c) => `|A|=${f3(c.la)} |B|=${f3(c.lb)}` },
  { id: "cosine", label: L("Cosine", "Cosine"),
    desc: L("Divide the dot product by both lengths. What's left is pure direction: 1 same, 0 unrelated, −1 opposite.", "Bagi perkalian titik dengan kedua panjang. Sisanya murni arah: 1 sama, 0 tidak berhubungan, −1 berlawanan."),
    run: (c) => ({ cos: c.dot / (c.la * c.lb) }), log: (c) => ({ text: `cos = ${f3(c.dot)} / (${f3(c.la)} × ${f3(c.lb)}) = ${f3(c.dot / (c.la * c.lb))}` }), live: (c) => `cosine = ${f3(c.cos)}` },
  { id: "distance", label: L("Distance", "Jarak"),
    desc: L("The straight line between the tips. Unlike cosine, it changes when one arrow just gets longer.", "Garis lurus antara kedua ujung. Berbeda dari cosine, jarak berubah walau satu panah hanya bertambah panjang."),
    run: (c) => ({ dist: Math.hypot(c.a[0] - c.b[0], c.a[1] - c.b[1]) }), log: (c) => ({ text: `distance = ${f3(c.dist)}` }), live: (c) => `distance = ${f3(c.dist)}` },
];

const controls = [
  { id: "angleA", label: L("A: angle", "A: sudut"), min: 0, max: 355, step: 5, default: 20, format: (v) => `${v}°` },
  { id: "lenA", label: L("A: length", "A: panjang"), min: 0.2, max: 2, step: 0.1, default: 1.5, format: (v) => v.toFixed(1) },
  { id: "angleB", label: L("B: angle", "B: sudut"), min: 0, max: 355, step: 5, default: 65, format: (v) => `${v}°` },
  { id: "lenB", label: L("B: length", "B: panjang"), min: 0.2, max: 2, step: 0.1, default: 1, format: (v) => v.toFixed(1) },
];

function Arrow({ x, y, color, label, S, O }) {
  const X = O + x * S, Y = O - y * S, ang = Math.atan2(O - Y, X - O), h = 12;
  const p1 = [X - h * Math.cos(ang - 0.4), Y + h * Math.sin(ang - 0.4)], p2 = [X - h * Math.cos(ang + 0.4), Y + h * Math.sin(ang + 0.4)];
  return (
    <g>
      <line x1={O} y1={O} x2={X} y2={Y} stroke={color} strokeWidth={4} strokeLinecap="round" />
      <path d={`M${X} ${Y}L${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}Z`} fill={color} />
      <text x={X + (X >= O ? 10 : -22)} y={Y + (Y > O ? 18 : -8)} style={{ font: "700 16px var(--body)", fill: color }}>{label}</text>
    </g>
  );
}

function Board({ ctx, runner, tr }) {
  const S = 85, O = 200, W = 400;
  const { a, b } = ctx;
  const p = runner.phase;
  const angA = Math.atan2(a?.[1] || 0, a?.[0] || 1), angB = Math.atan2(b?.[1] || 0, b?.[0] || 1);
  let d = angB - angA; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const r = 40, sweep = d > 0 ? 0 : 1;
  const arc = a && `M${O + r * Math.cos(angA)} ${O - r * Math.sin(angA)} A${r} ${r} 0 0 ${sweep} ${O + r * Math.cos(angA + d)} ${O - r * Math.sin(angA + d)}`;
  // projection of B onto A's direction
  const ua = a ? [a[0] / Math.hypot(...a), a[1] / Math.hypot(...a)] : [1, 0];
  const proj = b ? ua[0] * b[0] + ua[1] * b[1] : 0;
  const rows = [
    [1, "A", a && `[${a.map((x) => x.toFixed(2)).join(", ")}]`],
    [1, "B", b && `[${b.map((x) => x.toFixed(2)).join(", ")}]`],
    [2, "A·B", ctx.dot != null && f3(ctx.dot)],
    [3, "|A|, |B|", ctx.la != null && `${f3(ctx.la)}, ${f3(ctx.lb)}`],
    [4, tr(L("cosine", "cosine")), ctx.cos != null && f3(ctx.cos)],
    [4, tr(L("angle", "sudut")), ctx.cos != null && `${(Math.acos(Math.max(-1, Math.min(1, ctx.cos))) * 180 / Math.PI).toFixed(0)}°`],
    [5, tr(L("distance", "jarak")), ctx.dist != null && f3(ctx.dist)],
  ];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Two vectors on a plane", "Dua vektor di bidang"))}</h2><span className="sub">{tr(L("use the sliders in Try it yourself", "gunakan slider di Coba sendiri"))}</span></div>
      <div className="split">
        <div style={{ padding: 8 }}>
          <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label="vectors A and B" style={{ width: "100%", maxWidth: 420, display: "block", margin: "0 auto" }}>
            {[-2, -1, 0, 1, 2].map((k) => <g key={k}><line className="gridl" x1={O + k * S} x2={O + k * S} y1={0} y2={W} /><line className="gridl" y1={O + k * S} y2={O + k * S} x1={0} x2={W} /></g>)}
            <line x1={0} x2={W} y1={O} y2={O} stroke="var(--line)" /><line y1={0} y2={W} x1={O} x2={O} stroke="var(--line)" />
            {a && p >= 4 && <path d={arc} fill="none" stroke="var(--muted)" strokeWidth={2} />}
            {a && p >= 2 && <line x1={O} y1={O} x2={O + ua[0] * proj * S} y2={O - ua[1] * proj * S} stroke="var(--query)" strokeWidth={8} opacity={0.35} />}
            {a && p >= 2 && <line x1={O + b[0] * S} y1={O - b[1] * S} x2={O + ua[0] * proj * S} y2={O - ua[1] * proj * S} stroke="var(--query)" strokeDasharray="4 4" />}
            {a && p >= 5 && <line x1={O + a[0] * S} y1={O - a[1] * S} x2={O + b[0] * S} y2={O - b[1] * S} stroke="var(--warn)" strokeWidth={2.5} strokeDasharray="6 4" />}
            {a && <Arrow x={a[0]} y={a[1]} color="var(--accent)" label="A" S={S} O={O} />}
            {b && <Arrow x={b[0]} y={b[1]} color="#7a5cc2" label="B" S={S} O={O} />}
            {!a && <text className="hint" x={O} y={O - 20} textAnchor="middle">{tr(L("Press Play", "Tekan Putar"))}</text>}
          </svg>
        </div>
        <div className="plain">
          <dl className="kv" style={{ fontSize: 14 }}>
            {rows.map(([ph, k, v]) => <div key={k} style={{ display: "contents", opacity: p >= ph ? 1 : 0.35 }}><dt>{k}</dt><dd>{p >= ph && v ? v : "…"}</dd></div>)}
          </dl>
          {p >= 4 && <div style={{ marginTop: 14 }}>
            <div className="note" style={{ marginTop: 0 }}>cosine</div>
            <div style={{ position: "relative", height: 16, background: "linear-gradient(90deg, var(--warn), var(--grid) 50%, var(--good))", borderRadius: 8 }}>
              <span style={{ position: "absolute", left: `calc(${((ctx.cos + 1) / 2) * 100}% - 7px)`, top: -3, width: 14, height: 22, background: "var(--ink)", borderRadius: 4 }} />
            </div>
            <div className="note" style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}><span>−1</span><span>0</span><span>1</span></div>
          </div>}
          <p className="note">{tr(L("Orange band: how far B reaches along A (the dot product, divided by |A|). Red dashes: the distance.", "Pita oranye: seberapa jauh B menjangkau sepanjang A (perkalian titik dibagi |A|). Garis merah putus-putus: jarak."))}</p>
        </div>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Retrieval needs one number that says how similar two vectors are. This lesson builds that number step by step." },
      { ul: ["**Dot product**: multiply and add. Big when the arrows point the same way, but also big when they are just long.", "**Cosine similarity**: the dot product divided by both lengths. It only measures direction, so a short and a long sentence about the same thing still score 1.", "**Distance**: how far apart the tips are. It punishes differences in length."] },
      { p: "Most RAG systems use **cosine similarity**. Embedding models usually make every vector length 1, and then cosine and the dot product are the same number." },
      { h: "Try" },
      { ol: ["Press **Step** five times and watch each quantity appear.", "Make A and B point the same way but with different lengths: compare cosine and distance."] },
    ],
    id: [
      { p: "Retrieval membutuhkan satu angka yang menyatakan seberapa mirip dua vektor. Pelajaran ini membangun angka itu langkah demi langkah." },
      { ul: ["**Perkalian titik (dot product)**: kalikan lalu jumlahkan. Besar jika panah searah, tetapi juga besar jika panahnya sekadar panjang.", "**Cosine similarity**: perkalian titik dibagi kedua panjang. Hanya mengukur arah, sehingga kalimat pendek dan panjang tentang hal yang sama tetap bernilai 1.", "**Jarak**: seberapa jauh kedua ujung panah. Jarak menghukum perbedaan panjang."] },
      { p: "Sebagian besar sistem RAG memakai **cosine similarity**. Model embedding biasanya membuat setiap vektor sepanjang 1, sehingga cosine dan perkalian titik bernilai sama." },
      { h: "Coba" },
      { ol: ["Tekan **Langkah** lima kali dan lihat setiap besaran muncul.", "Buat A dan B searah tetapi panjangnya berbeda: bandingkan cosine dan jarak."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Same direction, different length", "Set both angles to 40°, A length 2.0 and B length 0.5. Cosine is 1.00, the distance is 1.50 and the dot product is 1.00. Only cosine says they mean the same thing."] },
      { exp: ["Right angle", "Set A to 0° and B to 90°. The dot product and cosine drop to 0: the vectors share nothing. In TF-IDF this is two sentences with no words in common."] },
      { exp: ["Opposite", "Set A to 0° and B to 180°. Cosine is −1. Text embeddings rarely go this far; most unrelated sentences sit near 0."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Searah, panjang berbeda", "Atur kedua sudut 40°, panjang A 2,0 dan panjang B 0,5. Cosine 1,00, jarak 1,50 dan perkalian titik 1,00. Hanya cosine yang menyatakan keduanya bermakna sama."] },
      { exp: ["Sudut siku-siku", "Atur A ke 0° dan B ke 90°. Perkalian titik dan cosine turun ke 0: kedua vektor tidak berbagi apa pun. Dalam TF-IDF ini adalah dua kalimat tanpa kata yang sama."] },
      { exp: ["Berlawanan", "Atur A ke 0° dan B ke 180°. Cosine −1. Embedding teks jarang sejauh ini; kalimat yang tidak berhubungan biasanya mendekati 0."] }],
  },
  specs: {
    en: [{ dl: [["Dot product", "A·B = Σ aᵢbᵢ"], ["Length", "|A| = √(Σ aᵢ²)"], ["Cosine similarity", "A·B / (|A| |B|), between −1 and 1"], ["Euclidean distance", "|A − B|"], ["Normalised vectors", "When |A| = |B| = 1, cosine = dot product, and distance² = 2 − 2·cosine. All three then rank results the same way."]] }],
    id: [{ dl: [["Perkalian titik", "A·B = Σ aᵢbᵢ"], ["Panjang", "|A| = √(Σ aᵢ²)"], ["Cosine similarity", "A·B / (|A| |B|), antara −1 dan 1"], ["Jarak Euclidean", "|A − B|"], ["Vektor ternormalisasi", "Jika |A| = |B| = 1, cosine = perkalian titik, dan jarak² = 2 − 2·cosine. Ketiganya lalu mengurutkan hasil dengan cara yang sama."]] }],
  },
};

export default {
  n: 5,
  stages, controls, text, Board,
  code: [{ id: "sim", label: L("Similarity (runs here)", "Kemiripan (bisa dijalankan)"), source: pySource, runnable: true, filename: "similarity.py" },
    { id: "libs", label: L("With libraries", "Dengan pustaka"), source: libSource, runnable: false, filename: "similarity_libraries.py", note: L("Runs on your computer after: pip install numpy scikit-learn sentence-transformers", "Jalankan di komputer Anda setelah: pip install numpy scikit-learn sentence-transformers") }],
  variables: (c) => [["dot(a, b)", c.dot != null ? f3(c.dot) : "—"], ["length(a), length(b)", c.la != null ? `${f3(c.la)}, ${f3(c.lb)}` : "—"], ["cosine(a, b)", c.cos != null ? f3(c.cos) : "—"], ["euclidean(a, b)", c.dist != null ? f3(c.dist) : "—"]],
  python: (c) => ({
    globals: { AA: c.inputs.angleA, LA: c.inputs.lenA, AB: c.inputs.angleB, LB: c.inputs.lenB },
    call: "run(AA, LA, AB, LB)",
    compare: (res) => {
      const a = vec(c.inputs.angleA, c.inputs.lenA), b = vec(c.inputs.angleB, c.inputs.lenB);
      const dot = a[0] * b[0] + a[1] * b[1], cos = dot / (Math.hypot(...a) * Math.hypot(...b));
      return Math.abs(res.dot - dot) < 1e-9 && Math.abs(res.cosine - cos) < 1e-9;
    },
  }),
  challenges: [
    { id: "same", text: L("Make cosine = 1.00 while the lengths differ by at least 0.8. What happens to the distance?", "Buat cosine = 1,00 sementara panjangnya berbeda paling sedikit 0,8. Apa yang terjadi pada jarak?"), check: (c) => c.cos > 0.9995 && Math.abs(c.inputs.lenA - c.inputs.lenB) >= 0.79 },
    { id: "perp", text: L("Make the vectors unrelated: cosine = 0.", "Buat vektor tidak berhubungan: cosine = 0."), check: (c) => c.cos != null && Math.abs(c.cos) < 0.005 },
    { id: "opp", text: L("Make them opposite: cosine = −1.", "Buat keduanya berlawanan: cosine = −1."), check: (c) => c.cos != null && c.cos < -0.9995 },
  ],
  quiz: [
    { q: L("Two sentences say the same thing, one short and one long. Which measure still calls them identical?", "Dua kalimat bermakna sama, satu pendek dan satu panjang. Ukuran mana yang tetap menganggapnya identik?"),
      options: [L("Cosine similarity", "Cosine similarity"), L("Euclidean distance", "Jarak Euclidean"), L("Dot product", "Perkalian titik"), L("None", "Tidak ada")],
      answer: 0, why: L("Cosine ignores length and keeps only direction.", "Cosine mengabaikan panjang dan hanya mempertahankan arah.") },
    { q: L("What does a cosine similarity of 0 mean?", "Apa arti cosine similarity bernilai 0?"),
      options: [L("Identical", "Identik"), L("Unrelated (90° apart)", "Tidak berhubungan (berselisih 90°)"), L("Opposite", "Berlawanan"), L("An error", "Kesalahan")],
      answer: 1, why: L("0 means the vectors are perpendicular: nothing in common.", "0 berarti vektor tegak lurus: tidak ada kesamaan.") },
    { q: L("If every vector has length 1, which two measures give the same number?", "Jika setiap vektor sepanjang 1, dua ukuran mana yang memberi angka sama?"),
      options: [L("Dot product and cosine", "Perkalian titik dan cosine"), L("Distance and dot product", "Jarak dan perkalian titik"), L("Length and cosine", "Panjang dan cosine"), L("None", "Tidak ada")],
      answer: 0, why: L("Cosine divides by both lengths; when they are 1, nothing changes.", "Cosine membagi dengan kedua panjang; jika keduanya 1, tidak ada yang berubah.") },
  ],
};
