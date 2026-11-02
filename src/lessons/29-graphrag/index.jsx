// Lesson 29: GraphRAG. The same sentences searched as a vector list and walked as an entity graph;
// a multi-hop question needs the walk. Twin: ./graphrag.py
import * as rag from "../../rag/core.js";
import { L, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./graphrag.py?raw";
import libSource from "./with_libraries.py?raw";

const E = (name, type, aliases) => ({ name, type, aliases });
export const DATA = {
  en: {
    sentences: ["Ms Rahma coordinates the NusaBot Robotics Lab.", "Dr Bayu leads the Drone Project.", "Sari works on the Drone Project.", "The Drone Project runs its tests in the Wind Tunnel.", "The Wind Tunnel is in Building C.", "Building C is next to the main library.", "Dr Bayu teaches the Control Systems course.", "The Control Systems course meets in Building A.", "Building A has the soldering stations.", "Sari also builds the Sensor Kit.", "The Sensor Kit gets its funding from the Rural Grant.", "Ms Rahma manages the Rural Grant.", "The NusaBot Robotics Lab opens every weekday."],
    entities: [E("Ms Rahma", "person", ["ms rahma", "rahma"]), E("Dr Bayu", "person", ["dr bayu", "bayu"]), E("Sari", "person", ["sari"]), E("NusaBot Robotics Lab", "lab", ["nusabot robotics lab"]), E("Drone Project", "project", ["drone project", "drone"]), E("Wind Tunnel", "facility", ["wind tunnel"]), E("Building C", "building", ["building c"]), E("main library", "facility", ["main library"]), E("Control Systems course", "course", ["control systems course", "control systems"]), E("Building A", "building", ["building a"]), E("soldering stations", "facility", ["soldering stations"]), E("Sensor Kit", "project", ["sensor kit", "sensor"]), E("Rural Grant", "grant", ["rural grant"])],
    questions: [["In which building does Dr Bayu's project run its tests?", "building", "Building C"], ["Who manages the funding for Sari's sensor project?", "person", "Ms Rahma"], ["Who leads the Drone Project?", "person", "Dr Bayu"]],
  },
  id: {
    sentences: ["Bu Rahma mengoordinasikan NusaBot Robotics Lab.", "Dr Bayu memimpin Proyek Drone.", "Sari bekerja di Proyek Drone.", "Proyek Drone menjalankan uji cobanya di Terowongan Angin.", "Terowongan Angin berada di Gedung C.", "Gedung C bersebelahan dengan perpustakaan utama.", "Dr Bayu mengajar mata kuliah Sistem Kendali.", "Mata kuliah Sistem Kendali diadakan di Gedung A.", "Gedung A memiliki stasiun solder.", "Sari juga membangun Kit Sensor.", "Kit Sensor mendapat pendanaan dari Hibah Desa.", "Bu Rahma mengelola Hibah Desa.", "NusaBot Robotics Lab buka setiap hari kerja."],
    entities: [E("Bu Rahma", "person", ["bu rahma", "rahma"]), E("Dr Bayu", "person", ["dr bayu", "bayu"]), E("Sari", "person", ["sari"]), E("NusaBot Robotics Lab", "lab", ["nusabot robotics lab"]), E("Proyek Drone", "project", ["proyek drone", "drone"]), E("Terowongan Angin", "facility", ["terowongan angin"]), E("Gedung C", "building", ["gedung c"]), E("perpustakaan utama", "facility", ["perpustakaan utama"]), E("Sistem Kendali", "course", ["mata kuliah sistem kendali", "sistem kendali"]), E("Gedung A", "building", ["gedung a"]), E("stasiun solder", "facility", ["stasiun solder"]), E("Kit Sensor", "project", ["kit sensor", "sensor"]), E("Hibah Desa", "grant", ["hibah desa"])],
    questions: [["Di gedung mana proyek Dr Bayu menjalankan uji cobanya?", "building", "Gedung C"], ["Siapa yang mengelola pendanaan proyek sensor milik Sari?", "person", "Bu Rahma"], ["Siapa yang memimpin Proyek Drone?", "person", "Dr Bayu"]],
  },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mentions(text, entities) {
  const low = text.toLowerCase(), found = [];
  for (const e of entities) {
    const pos = e.aliases.flatMap((a) => [...low.matchAll(new RegExp(`(?<![a-z])${esc(a)}(?![a-z])`, "g"))].map((m) => m.index));
    if (pos.length) found.push([Math.min(...pos), e.name]);
  }
  return found.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map((x) => x[1]);
}
export function buildGraph(sentences, entities) {
  const edges = [];
  sentences.forEach((s, i) => { const n = mentions(s, entities); for (let j = 0; j + 1 < n.length; j++) edges.push([n[j], n[j + 1], i]); });
  return edges;
}
function paths(edges, start, hops) {
  const nbrs = new Map(), add = (a, b, i) => { if (!nbrs.has(a)) nbrs.set(a, []); nbrs.get(a).push([b, i]); };
  for (const [a, b, i] of edges) { add(a, b, i); add(b, a, i); }
  let out = [], frontier = [[[start, null]]];
  for (let h = 0; h < hops; h++) {
    const nxt = [];
    for (const p of frontier) { const seen = new Set(p.map((x) => x[0])); for (const [n, i] of nbrs.get(p[p.length - 1][0]) || []) if (!seen.has(n)) nxt.push([...p, [n, i]]); }
    out = out.concat(nxt); frontier = nxt;
  }
  return out;
}
export function bestPath(edges, starts, target, types, sentences, question, hops, stop, lang) {
  const q = new Set(rag.tokenize(question, stop, lang));
  let best = null;
  for (const s of starts) for (const p of paths(edges, s, hops)) {
    const end = p[p.length - 1][0];
    if (types[end] !== target || starts.includes(end)) continue;
    const words = new Set(p.slice(1).flatMap(([, i]) => rag.tokenize(sentences[i], stop, lang)));
    const key = [[...q].filter((t) => words.has(t)).length, -(p.length - 1)];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { key, p };
  }
  return best ? best.p : null;
}
function vectorRag(sentences, question, k, stop, lang) {
  const chunks = sentences.map((text) => ({ text })), emb = rag.embedChunks(chunks, stop, lang);
  const qv = rag.vectorize(rag.tokenize(question, stop, lang), emb.idf);
  const scores = emb.vectors.map((v) => (qv.size ? rag.cosine(qv, v) : 0));
  const top = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, k);
  const known = rag.tokenize(question, stop, lang).filter((t) => emb.idf.has(t));
  return { top: top.map((x) => x.i), answer: rag.extractAnswer(top, chunks, known, emb.idf, stop, lang).text };
}

const stages = [
  { id: "vector", label: L("Vector search", "Pencarian vektor"), desc: L("Plain RAG first: the top-k sentences by similarity, then an answer from them.", "RAG biasa dulu: top-k kalimat menurut kemiripan, lalu jawaban darinya."),
    run: ({ inputs }) => {
      const lang = inputs.uiLang, d = DATA[lang], stop = rag.stopwordsFor(lang), [q, target, expected] = d.questions[+inputs.qi];
      const v = vectorRag(d.sentences, q, inputs.k, stop, lang);
      return { lang, d, stop, q, target, expected, vtop: v.top, vAnswer: v.answer, vOk: v.answer.includes(expected) };
    },
    log: (c) => ({ text: `vector: ${c.vAnswer.slice(0, 70)}`, warn: c.vOk ? null : "the answer is not in the top sentences" }), live: (c) => (c.vOk ? "right" : "wrong") },
  { id: "extract", label: L("Build graph", "Bangun graf"), desc: L("Find the entities in each sentence and link entities named together. The sentence is the evidence on the link.", "Temukan entitas di setiap kalimat dan hubungkan entitas yang disebut bersama. Kalimatnya menjadi bukti pada tautan itu."),
    run: (c) => ({ edges: buildGraph(c.d.sentences, c.d.entities), types: Object.fromEntries(c.d.entities.map((e) => [e.name, e.type])) }),
    log: (c) => ({ text: `${c.d.entities.length} entities, ${c.edges.length} links` }), live: (c) => `${c.edges.length} links` },
  { id: "seed", label: L("Find seeds", "Cari benih"), desc: L("Which entities does the question name? The walk starts there.", "Entitas mana yang disebut pertanyaan? Penelusuran dimulai dari sana."),
    run: (c) => ({ seeds: mentions(c.q, c.d.entities) }), log: (c) => ({ text: `seeds: ${c.seeds.join(", ") || "none"}` }), live: (c) => c.seeds.join(", ") },
  { id: "walk", label: L("Walk", "Telusuri"), desc: L("Follow links up to the hop limit, keep paths that end at the kind of thing asked for, and pick the one whose evidence covers most of the question.", "Ikuti tautan sampai batas lompatan, simpan jalur yang berakhir pada jenis yang ditanyakan, lalu pilih yang buktinya paling banyak mencakup pertanyaan."),
    run: (c) => ({ path: bestPath(c.edges, c.seeds, c.target, c.types, c.d.sentences, c.q, c.inputs.hops, c.stop, c.lang) }),
    log: (c) => ({ text: c.path ? c.path.map((x) => x[0]).join(" → ") : "no path within the hop limit", warn: c.path ? null : "raise the hop limit" }), live: (c) => (c.path ? `${c.path.length - 1} hops` : "none") },
  { id: "answer", label: L("Answer", "Jawab"), desc: L("The end of the path is the answer, and the sentences along it are the citations.", "Ujung jalur adalah jawabannya, dan kalimat di sepanjang jalur adalah sitasinya."),
    run: (c) => { const g = c.path ? c.path[c.path.length - 1][0] : null; return { gAnswer: g, gOk: g === c.expected, evidence: c.path ? c.path.slice(1).map((x) => x[1]) : [] }; },
    log: (c) => ({ text: `graph: ${c.gAnswer || "no answer"}`, warn: c.gOk ? null : "wrong or missing" }), live: (c) => (c.gOk ? "right" : "wrong") },
];

const TYPE_COLOR = { person: "#d9705f", project: "#7a5cc2", building: "#2f8f9d", facility: "#7aa6c2", course: "#e0a35c", grant: "#5c9a7a", lab: "#8a8a8a" };

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, d = ctx.d;
  if (!d) return null;
  const W = 600, H = 370, cx = W / 2, cy = H / 2, RX = 165, RY = 140;
  const pos = Object.fromEntries(d.entities.map((e, i) => [e.name, [cx + RX * Math.cos((2 * Math.PI * i) / d.entities.length - Math.PI / 2), cy + RY * Math.sin((2 * Math.PI * i) / d.entities.length - Math.PI / 2)]]));
  const pathEdges = new Set((ctx.path || []).slice(1).map((x, k) => [ctx.path[k][0], x[0]].sort().join("|")));
  const onPath = new Set((ctx.path || []).map((x) => x[0]));
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("A list of sentences vs a graph of things", "Daftar kalimat vs graf hal-hal"))}</h2><span className="sub">top-k {ctx.inputs.k} · {tr(L("hops", "lompatan"))} {ctx.inputs.hops}</span></div>
      <div className="plain" style={{ fontSize: 13.5 }}><b>{ctx.q}</b></div>
      <div>
        <div className="plain" style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <h4 style={{ margin: 0 }}>{tr(L("Vector search", "Pencarian vektor"))}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>{(ctx.vtop || []).map((i, r) => <div key={i} className="colcard" style={{ fontSize: 12.5 }}><h4 style={{ fontSize: 11 }}>#{r + 1}</h4>{d.sentences[i]}</div>)}</div>
          {ctx.vAnswer && <div className="answer" style={{ borderLeft: `4px solid ${ctx.vOk ? "var(--good)" : "var(--warn)"}`, fontSize: 13 }}><b style={{ color: ctx.vOk ? "var(--good)" : "var(--warn)" }}>{ctx.vOk ? tr(L("Right", "Benar")) : tr(L("Wrong", "Salah"))}:</b> {ctx.vAnswer}</div>}
          {ctx.vAnswer && !ctx.vOk && <p className="note" style={{ margin: 0 }}>{tr(L("Each step of the chain is in a different sentence, and no single sentence looks like the question.", "Setiap langkah rantai ada di kalimat yang berbeda, dan tidak ada satu kalimat pun yang mirip pertanyaannya."))}</p>}
        </div>
        <div className="plain">
          <h4 style={{ margin: "0 0 4px" }}>{tr(L("Entity graph", "Graf entitas"))}</h4>
          {ph >= 2 ? <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={tr(L("entity graph", "graf entitas"))}>
            {ctx.edges.map(([a, b, i], k) => { const on = ph >= 4 && pathEdges.has([a, b].sort().join("|")); return <line key={k} x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} stroke={on ? "var(--query)" : "var(--line)"} strokeWidth={on ? 3.5 : 1.4}><title>{d.sentences[i]}</title></line>; })}
            {d.entities.map((e) => { const [x, y] = pos[e.name], seed = ph >= 3 && ctx.seeds?.includes(e.name), end = ph >= 5 && ctx.gAnswer === e.name;
              const anchor = x < cx - 20 ? "end" : x > cx + 20 ? "start" : "middle", dx = anchor === "end" ? -10 : anchor === "start" ? 10 : 0, dy = y < cy ? -10 : 18;
              return <g key={e.name} opacity={ph >= 4 && ctx.path && !onPath.has(e.name) ? 0.45 : 1}>
                {seed && <circle cx={x} cy={y} r={12} fill="none" stroke="var(--query)" strokeWidth={2.5} />}
                <circle cx={x} cy={y} r={end ? 9 : 6.5} fill={TYPE_COLOR[e.type]} stroke={end ? "var(--ink)" : "var(--panel)"} strokeWidth={end ? 2.5 : 1.5} />
                <text x={x + dx} y={y + dy} textAnchor={anchor} style={{ font: `${end ? 700 : 500} 11px var(--body)`, fill: "var(--ink)" }}>{e.name}</text></g>; })}
          </svg> : <p className="note">{tr(L("Run to the Build graph step.", "Jalankan sampai langkah Bangun graf."))}</p>}
          {ph >= 5 && <div className="answer" style={{ borderLeft: `4px solid ${ctx.gOk ? "var(--good)" : "var(--warn)"}`, fontSize: 13 }}>
            <b style={{ color: ctx.gOk ? "var(--good)" : "var(--warn)" }}>{ctx.gOk ? tr(L("Right", "Benar")) : tr(L("Wrong", "Salah"))}:</b> {ctx.path ? ctx.path.map((x) => x[0]).join(" → ") : tr(L("no path within the hop limit", "tidak ada jalur dalam batas lompatan"))}
            {ctx.evidence.length > 0 && <div className="sub" style={{ marginTop: 4 }}>{ctx.evidence.map((i, n) => <div key={n}>[{n + 1}] {d.sentences[i]}</div>)}</div>}
          </div>}
        </div>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Some questions need a **chain** of facts: Dr Bayu leads a project, the project tests in a facility, the facility is in a building. Each link is a different sentence, and none of them looks much like the question, so plain vector search returns pieces and misses the end of the chain." },
      { p: "**GraphRAG** turns the text into a graph first: things (people, projects, places) become **nodes**, and two things named in the same sentence get a **link** that keeps the sentence as evidence. A question then starts at the things it names and **walks** link by link." },
      { p: "Ask the two multi-hop questions with both methods, then the single-hop one. Change the **hop limit** and watch which building the walk reaches." },
    ],
    id: [
      { p: "Sebagian pertanyaan butuh **rantai** fakta: Dr Bayu memimpin proyek, proyek itu diuji di sebuah fasilitas, fasilitas itu ada di sebuah gedung. Setiap mata rantai ada di kalimat yang berbeda, dan tidak satu pun mirip pertanyaannya, sehingga pencarian vektor biasa mengembalikan potongan dan melewatkan ujung rantai." },
      { p: "**GraphRAG** mengubah teks menjadi graf dulu: hal-hal (orang, proyek, tempat) menjadi **simpul**, dan dua hal yang disebut dalam kalimat yang sama mendapat **tautan** yang menyimpan kalimat itu sebagai bukti. Pertanyaan lalu dimulai dari hal-hal yang disebutnya dan **menelusuri** tautan demi tautan." },
      { p: "Ajukan dua pertanyaan multi-langkah dengan kedua metode, lalu pertanyaan satu langkah. Ubah **batas lompatan** dan lihat gedung mana yang dicapai penelusuran." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Not deep enough", "First question, hop limit 2: the walk reaches Building A through Dr Bayu's course. It is a building, it is two hops away, and it is wrong. Allow 3 hops."] },
      { exp: ["More chunks don't help", "Raise vector top-k to 4 on the first question. More sentences arrive, but the answer is built from the best-matching ones, which are about the project, not the building."] },
      { exp: ["When vectors are enough", "The third question is one hop. Both methods get it right, and the vector one is far cheaper. Use a graph when your questions follow relationships."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Kurang dalam", "Pertanyaan pertama, batas lompatan 2: penelusuran mencapai Gedung A lewat mata kuliah Dr Bayu. Itu gedung, dua lompatan jauhnya, dan salah. Izinkan 3 lompatan."] },
      { exp: ["Lebih banyak potongan tidak membantu", "Naikkan top-k vektor ke 4 pada pertanyaan pertama. Lebih banyak kalimat datang, tetapi jawaban dibuat dari yang paling cocok, yaitu tentang proyek, bukan gedung."] },
      { exp: ["Saat vektor sudah cukup", "Pertanyaan ketiga hanya satu langkah. Kedua metode benar, dan metode vektor jauh lebih murah. Pakai graf jika pertanyaan Anda mengikuti hubungan."] }],
  },
  specs: {
    en: [{ dl: [["Entities and links", "Given here as a list, matched by name. Real GraphRAG asks an LLM to extract entities and relations from every chunk, which is the expensive part."], ["Path score", "Question words covered by the sentences along the path; ties go to the shorter path."], ["Answer type", "Each question says what kind of thing it wants (a building, a person). An LLM usually decides this."], ["Other GraphRAG styles", "Community summaries (cluster the graph and summarise each cluster) answer broad questions like \"what are the main themes?\"."]] }],
    id: [{ dl: [["Entitas dan tautan", "Diberikan di sini sebagai daftar, dicocokkan menurut nama. GraphRAG sungguhan meminta LLM mengekstrak entitas dan relasi dari setiap potongan, dan itulah bagian yang mahal."], ["Skor jalur", "Kata pertanyaan yang tercakup oleh kalimat di sepanjang jalur; jika seri, jalur yang lebih pendek menang."], ["Jenis jawaban", "Setiap pertanyaan menyebut jenis hal yang dicari (gedung, orang). Biasanya LLM yang memutuskan ini."], ["Gaya GraphRAG lain", "Ringkasan komunitas (kelompokkan graf lalu ringkas setiap kelompok) menjawab pertanyaan luas seperti \"apa tema utamanya?\"."]] }],
  },
};

export default {
  n: 29, stages, text, Board,
  controls: [
    { id: "qi", type: "select", default: "0", label: L("Question", "Pertanyaan"), options: DATA.en.questions.map(([q], i) => ({ value: String(i), label: L(q, DATA.id.questions[i][0]) })) },
    { id: "k", label: L("Vector top-k", "Top-k vektor"), min: 1, max: 4, step: 1, default: 2 },
    { id: "hops", label: L("Hop limit", "Batas lompatan"), min: 1, max: 3, step: 1, default: 2 },
  ],
  code: [
    { id: "graph", label: L("Entity graph and walk (runs here)", "Graf entitas dan penelusuran (bisa dijalankan)"), source: pySource, runnable: true, filename: "graphrag.py" },
    { id: "libs", label: L("With an LLM and networkx", "Dengan LLM dan networkx"), source: libSource, runnable: false, filename: "graphrag_libraries.py", note: L("Runs on your computer after: pip install networkx openai", "Jalankan di komputer Anda setelah: pip install networkx openai") },
  ],
  variables: (c) => [["seeds", c.seeds ? JSON.stringify(c.seeds) : "—"], ["path", c.path ? c.path.map((x) => x[0]).join(" → ") : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang, d = DATA[lang], [q, target, expected] = d.questions[+I.qi];
    return {
      prelude: prelude("rag"),
      globals: { SENTENCES: d.sentences, ENTITIES: d.entities, QUESTION: q, TARGET: target, EXPECTED: expected, K: I.k, HOPS: I.hops, LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(SENTENCES, ENTITIES, QUESTION, TARGET, EXPECTED, K, HOPS, LANG, STOPWORDS)",
      compare: (res) => {
        let ctx = { inputs: I };
        for (const st of stages) ctx = { ...ctx, ...st.run(ctx) };
        return JSON.stringify(res.top) === JSON.stringify(ctx.vtop) && res.vector === ctx.vAnswer && JSON.stringify(res.edges) === JSON.stringify(ctx.edges)
          && JSON.stringify(res.seeds) === JSON.stringify(ctx.seeds) && JSON.stringify(res.path) === JSON.stringify(ctx.path ? ctx.path.map((x) => x[0]) : [])
          && JSON.stringify(res.evidence) === JSON.stringify(ctx.evidence) && res.graph === ctx.gAnswer && res.vector_ok === ctx.vOk && res.graph_ok === ctx.gOk;
      },
    };
  },
  challenges: [
    { id: "short", text: L("Make the graph walk confidently reach the wrong building.", "Buat penelusuran graf dengan yakin mencapai gedung yang salah."), check: (c) => +c.inputs.qi === 0 && c.gAnswer && !c.gOk },
    { id: "chain", text: L("Answer both multi-hop questions correctly with the graph while vector search gets them wrong.", "Jawab kedua pertanyaan multi-langkah dengan benar memakai graf sementara pencarian vektor salah."), check: (c) => [0, 1].includes(+c.inputs.qi) && c.gOk && c.vOk === false },
    { id: "enough", text: L("Find a question where plain vector search is already right.", "Temukan pertanyaan yang sudah benar dijawab pencarian vektor biasa."), check: (c) => c.vOk === true },
  ],
  quiz: [
    quizQ(L("Why does vector search struggle with multi-hop questions?", "Mengapa pencarian vektor kesulitan dengan pertanyaan multi-langkah?"), [L("The facts are in different sentences, and the last one doesn't look like the question", "Faktanya ada di kalimat berbeda, dan yang terakhir tidak mirip pertanyaannya"), L("Vectors can't store names", "Vektor tidak bisa menyimpan nama"), L("The index is too small", "Indeksnya terlalu kecil"), L("It needs a bigger model", "Perlu model yang lebih besar")], 0, L("Similarity finds text like the question; a chain needs text that is only linked to it.", "Kemiripan menemukan teks yang mirip pertanyaan; rantai butuh teks yang hanya terhubung dengannya.")),
    quizQ(L("In GraphRAG, what does a link between two entities keep?", "Dalam GraphRAG, apa yang disimpan tautan antara dua entitas?"), [L("The sentence that names both, as evidence and citation", "Kalimat yang menyebut keduanya, sebagai bukti dan sitasi"), L("Their embeddings", "Embedding keduanya"), L("A random weight", "Bobot acak"), L("Nothing", "Tidak ada")], 0, L("The answer can cite the sentences along the path.", "Jawaban bisa mengutip kalimat di sepanjang jalur.")),
    quizQ(L("What is usually the most expensive part of GraphRAG?", "Apa bagian GraphRAG yang biasanya paling mahal?"), [L("Extracting entities and relations from every chunk with an LLM", "Mengekstrak entitas dan relasi dari setiap potongan dengan LLM"), L("Drawing the graph", "Menggambar graf"), L("Walking one path", "Menelusuri satu jalur"), L("Storing the nodes", "Menyimpan simpul")], 0, L("It is one LLM call per chunk at indexing time.", "Itu satu panggilan LLM per potongan saat pengindeksan.")),
  ],
};
