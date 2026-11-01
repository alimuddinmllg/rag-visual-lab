// Lesson 6: the full RAG pipeline.
// A lesson = stages (pure functions over a context) + controls + a board + text.
// The engine (src/engine) runs the stages; the toolkit (src/toolkit) draws them.
import * as rag from "../../rag/core.js";
import STOPWORDS from "../../rag/stopwords.json";
import * as S from "../../rag/stages.js";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import { LLMAnswerBox } from "../../toolkit/LLMSettings.jsx";
import { useLLMAnswer } from "../../rag/llm.js";
import DocumentSpace from "../../toolkit/DocumentSpace.jsx";
import { ChunkList, AnswerPanel } from "../../toolkit/TextPanels.jsx";
import * as C from "./content.js";
import pySource from "./rag_from_scratch.py?raw";
import pyLibSource from "./rag_with_libraries.py?raw";

const fmt2 = (x) => x.toFixed(2);
const words = { en: "words", id: "kata" };

const stages = [
  {
    id: "chunk",
    label: { en: "Chunk", id: "Potong" },
    desc: { en: "Split the document into overlapping pieces of a fixed number of words.", id: "Membagi dokumen menjadi potongan dengan jumlah kata tetap yang saling tumpang tindih." },
    run: S.chunkStage,
    log: (c) => ({ text: `size=${c.inputs.size} overlap=${c.inputs.overlap} → ${c.chunks.length} chunks` }),
    live: (c) => c.chunks && `${c.chunks.length} chunks · ${c.inputs.size}w · overlap ${c.inputs.overlap}`,
  },
  {
    id: "embed",
    label: { en: "Embed", id: "Embed" },
    desc: { en: "Turn every chunk into a vector: a list of numbers describing its words. Similar chunks get similar vectors.", id: "Mengubah setiap potongan menjadi vektor: deretan angka yang menggambarkan kata-katanya. Potongan yang mirip mendapat vektor yang mirip." },
    run: S.embedStage,
    log: (c) => ({ text: `${c.method === "neural" ? "neural" : "TF-IDF"}, ${c.dims} dims → ${c.chunks.length} vectors` }),
    live: (c) => c.map && `${c.chunks.length} vectors × ${c.dims} dims (${c.method})`,
  },
  {
    id: "query",
    label: { en: "Query", id: "Kueri" },
    desc: { en: "Turn the question into a vector the same way, so it lands in the same space.", id: "Mengubah pertanyaan menjadi vektor dengan cara yang sama, sehingga berada di ruang yang sama." },
    run: S.queryStage,
    log: (c) => ({
      text: c.method === "neural" ? `embedded with the neural model (${c.qTokens.length} content words)`
        : `${c.qTokens.length} terms, ${c.known.length} known${c.known.length ? ` (${c.known.join(", ")})` : ""}`,
      warn: c.hasQuery ? null : "nothing to match",
    }),
    live: (c) => c.qv && (c.method === "neural" ? "neural vector" : c.known.length ? c.known.join(", ") : "—"),
  },
  {
    id: "retrieve",
    label: { en: "Retrieve", id: "Ambil" },
    desc: { en: "Score every chunk against the question with cosine similarity and keep the top-k.", id: "Memberi skor setiap potongan terhadap pertanyaan dengan cosine similarity dan menyimpan top-k." },
    run: (c) => S.retrieveStage(c),
    log: (c) => ({
      text: `top-${c.inputs.topK}: ${c.top.map((t) => `#${t.i + 1} ${fmt2(t.s)}`).join(", ")} · ${c.used.length} ≥ ${fmt2(c.inputs.minSim)}`,
      warn: c.used.length ? null : "nothing relevant",
    }),
    live: (c) => c.top && c.top.map((t) => `#${t.i + 1}=${fmt2(t.s)}`).join("  "),
  },
  {
    id: "generate",
    label: { en: "Generate", id: "Hasilkan" },
    desc: { en: "Paste the retrieved chunks into a prompt with the question. The model answers using only that context.", id: "Menempelkan potongan yang diambil ke prompt bersama pertanyaan. Model menjawab hanya dari konteks itu." },
    run: S.generateStage,
    log: (c) => ({
      text: `${c.used.length} chunks, ≈${c.promptTokens} tokens → ${c.answer.grounded ? "grounded answer" : "\"don't know\""}`,
      warn: c.answer.grounded ? null : "no context",
    }),
    live: (c) => c.answer && `≈${c.promptTokens} tokens · ${c.answer.grounded ? "grounded" : "refused"}`,
  },
];

const controls = [
  { id: "size", label: { en: "Chunk size", id: "Ukuran potongan" }, min: 15, max: 120, step: 5, default: 40, format: (v, tr) => `${v} ${tr(words)}` },
  { id: "overlap", label: { en: "Overlap", id: "Overlap" }, min: 0, max: 30, maxFrom: (v) => Math.min(30, v.size - 6), step: 2, default: 8, format: (v, tr) => `${v} ${tr(words)}` },
  { id: "topK", label: { en: "Top-k", id: "Top-k" }, min: 1, max: 8, step: 1, default: 3 },
  { id: "minSim", label: { en: "Min similarity", id: "Kemiripan minimum" }, min: 0, max: 0.8, step: 0.02, default: 0.1, format: fmt2 },
  S.methodControl,
];

function Board({ ctx, runner, hover, setHover, tr }) {
  return (
    <div className="card">
      <div className="card-h"><h2>{tr(C.ui.board.title)}</h2>
        <span className="sub">{ctx.map ? tr(C.ui.board.sub)(ctx.chunks.length, ctx.dims) : ""}</span>
      </div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      <DocumentSpace
        points={ctx.map ? ctx.map.coords : null}
        labels={ctx.chunks || []}
        sections={ctx.sections || []}
        query={{ show: !!ctx.qTokens, xy: ctx.qxy }}
        links={ctx.top || null}
        threshold={ctx.inputs.minSim}
        anim={runner.animStage} runKey={runner.runKey}
        hover={hover} onHover={setHover}
        text={C.ui.board}
      />
    </div>
  );
}

function DataPanel({ ctx, runner, hover, setHover }) {
  const llm = useLLMAnswer(ctx.prompt || "", ctx.prompt ? [{ role: "user", content: ctx.prompt }] : null, !!ctx.prompt);
  const ranks = ctx.top ? new Map(ctx.top.map((t, r) => [t.i, r])) : null;
  const retrieved = ctx.used ? new Set(ctx.used.map((t) => t.i)) : null;
  return (
    <div className="row2">
      <ChunkList chunks={ctx.chunks} sections={ctx.sections || []} title={C.ui.chunks}
        scores={ctx.scores && ctx.hasQuery ? ctx.scores : null} ranks={ranks} retrievedSet={retrieved}
        hover={hover} onHover={setHover} anim={runner.animStage} />
      <AnswerPanel answer={ctx.answer} prompt={ctx.prompt} promptTokens={ctx.promptTokens}
        usedCount={ctx.used ? ctx.used.length : 0} text={C.ui.answer} />
      <div style={{ gridColumn: "1 / -1", padding: "0 14px 12px" }}><LLMAnswerBox st={llm} /></div>
    </div>
  );
}

const dash = "—";
function variables(ctx) {
  const pyList = (a) => `[${a.map((x) => `'${x}'`).join(", ")}]`;
  return [
    ["CHUNK_SIZE, OVERLAP", `${ctx.inputs.size}, ${ctx.inputs.overlap}`],
    ["len(chunks)", ctx.chunks ? String(ctx.chunks.length) : dash],
    ["len(vocab)", ctx.tfidf ? String(ctx.tfidf.vocab.length) : dash],
    ["method", ctx.method || dash],
    ["known", ctx.known ? pyList(ctx.known) : dash],
    ["top  (i, score)", ctx.top ? ctx.top.map((t) => `(${t.i}, ${fmt2(t.s)})`).join(", ") + "\n# i is 0-based; #" + (ctx.top[0]?.i + 1) + " on screen" : dash],
    ["len(used)", ctx.used ? String(ctx.used.length) : dash],
    ["answer", ctx.answer ? ctx.answer.text : dash],
  ];
}

function python(ctx) {
  const doc = ctx.inputs.doc;
  return {
    globals: {
      DOCUMENT: doc.text,
      QUESTION: ctx.inputs.question,
      SIZE: ctx.inputs.size, OVERLAP: ctx.inputs.overlap, TOP_K: ctx.inputs.topK, MIN_SIM: ctx.inputs.minSim,
      LANG: doc.lang,
      STOPWORDS: STOPWORDS[doc.lang],
    },
    call: "run_pipeline(DOCUMENT, QUESTION, SIZE, OVERLAP, TOP_K, MIN_SIM, LANG, set(STOPWORDS), verbose=True)",
    compare: ctx.inputs.method === "neural" ? null : (res) => {
      // compare against a full JS run, whatever phase the board is at
      const js = rag.runPipeline({ document: doc.text, question: ctx.inputs.question,
        size: ctx.inputs.size, overlap: ctx.inputs.overlap, topK: ctx.inputs.topK, minSim: ctx.inputs.minSim,
        lang: doc.lang });
      const pt = res.top || [];
      return pt.length === js.top.length && pt.every(([i, s], k) => i === js.top[k][0] && Math.abs(s - js.top[k][1]) < 1e-6)
        && res.answer === js.answer;
    },
  };
}

export default {
  n: 6,
  stages,
  controls,
  inputs: { document: true, question: true },
  useExtra: S.useNeuralExtra,
  challenges: C.challenges,
  quiz: C.quiz,
  defaultQuestion: { en: C.examples.en[0], id: C.examples.id[0] },
  examples: C.examples,
  text: C,
  Board,
  DataPanel,
  variables,
  python,
  code: [
    { id: "scratch", label: { en: "From scratch (runs here)", id: "Dari nol (bisa dijalankan)" }, source: pySource, runnable: true, filename: "rag_from_scratch.py" },
    { id: "libs", label: { en: "With libraries", id: "Dengan pustaka" }, source: pyLibSource, runnable: false, filename: "rag_with_libraries.py" },
  ],
};
