// Golden test, step 1: run the JavaScript pipeline (what the visual shows)
// on a fixed set of cases and save the results for the Python check.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// stopwords.json is imported by core.js; Node needs the JSON import attribute,
// so load core through a tiny shim.
const require = createRequire(import.meta.url);
const STOP = JSON.parse(readFileSync(new URL("../src/rag/stopwords.json", import.meta.url)));
const src = readFileSync(new URL("../src/rag/core.js", import.meta.url), "utf8")
  .replace('import STOPWORDS from "./stopwords.json";', `const STOPWORDS = ${JSON.stringify(STOP)};`);
const core = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const docsSrc = readFileSync(new URL("../src/documents/nusabot.js", import.meta.url), "utf8");
const docs = await import("data:text/javascript;base64," + Buffer.from(docsSrc).toString("base64"));

const CASES = [
  ["en", "How much does PLA printing cost?", 40, 8, 3, 0.1],
  ["en", "Can I borrow the oscilloscope?", 15, 0, 5, 0.1],
  ["en", "When is the lab open on Saturday?", 120, 30, 8, 0.0],
  ["en", "What is the price of PLA printing?", 40, 8, 3, 0.1],
  ["en", "What is the capital of France?", 40, 8, 3, 0.1],
  ["en", "Who is the lab coordinator?", 60, 10, 2, 0.2],
  ["id", "Berapa biaya cetak PLA?", 40, 8, 3, 0.1],
  ["id", "Apa yang terjadi jika saya terlambat mengembalikan alat?", 25, 4, 4, 0.05],
  ["id", "Apa ibu kota Prancis?", 40, 8, 3, 0.1],
];

const out = CASES.map(([lang, question, size, overlap, topK, minSim]) => ({
  input: { lang, question, size, overlap, topK, minSim },
  output: core.runPipeline({
    document: lang === "id" ? docs.NUSABOT_ID : docs.NUSABOT_EN,
    question, size, overlap, topK, minSim, lang,
  }),
}));

// Lesson 1 (n-gram LM) and lesson 3 (BPE) twins
const load = async (rel) => import("data:text/javascript;base64," + Buffer.from(readFileSync(new URL(rel, import.meta.url), "utf8")).toString("base64"));
const ng = await load("../src/rag/ngram.js");
const bpe = await load("../src/rag/bpe.js");
const lmCases = [["en", "PLA prints cost", 20, 0.8, 3], ["en", "the lab", 25, 1.5, 11], ["id", "cetak pla", 15, 0.3, 7]].map(([lang, prompt, steps, temp, seed]) => {
  const doc = lang === "id" ? docs.NUSABOT_ID : docs.NUSABOT_EN;
  const lm = ng.trainLM(ng.lmTokens(doc));
  return { input: { lang, prompt, steps, temp, seed }, words: ng.generate(lm, ng.lmTokens(prompt), steps, temp, seed).map((x) => x.w) };
});
const bpeCases = [["en", "How much does PLA printing cost?", 0, 2048], ["en", "Soldering stations and microcontroller boards", 120, 256], ["id", "Mahasiswa meminjam osiloskop", 300, 512]].map(([lang, text, merges, window]) => {
  const doc = lang === "id" ? docs.NUSABOT_ID : docs.NUSABOT_EN;
  const m = bpe.trainBPE(bpe.wordFreqs(doc), merges);
  return { input: { lang, text, merges, window }, tokens: bpe.tokenizeBPE(text, m), n_merges: m.length, doc_tokens: bpe.tokenizeBPE(doc, m).length };
});

const annSrc = readFileSync(new URL("../src/rag/ann.js", import.meta.url), "utf8")
  .replace('import { rng } from "./ngram.js";', readFileSync(new URL("../src/rag/ngram.js", import.meta.url), "utf8").match(/export function rng[\s\S]*?\n}\n/)[0]);
const ann = await import("data:text/javascript;base64," + Buffer.from(annSrc).toString("base64"));
const annCases = [[300, 7, 4, 8, 0.3, 0.7], [600, 3, 2, 1, 0.9, 0.1], [200, 11, 8, 20, 0.5, 0.5]].map(([n, seed, M, ef, qx, qy]) => {
  const pts = ann.makePoints(n, seed), nb = ann.buildNSW(pts, M);
  const b = ann.bruteForce(pts, [qx, qy], 5), g = ann.searchNSW(pts, nb, [qx, qy], 5, ef);
  return { input: { n, seed, M, ef, qx, qy }, exact: b.top, found: g.top, brute: b.comparisons, graph: g.comparisons };
});

// Phase 2: BM25, RRF and metrics on the built-in test sets
const coreUrl = "data:text/javascript;base64," + Buffer.from(src).toString("base64");
const ret = await import("data:text/javascript;base64," + Buffer.from(readFileSync(new URL("../src/rag/retrieval.js", import.meta.url), "utf8").replace('import * as rag from "./core.js";', `import * as rag from "${coreUrl}";`)).toString("base64"));
const docsUrl = "data:text/javascript;base64," + Buffer.from(docsSrc).toString("base64");
const TS = (await import("data:text/javascript;base64," + Buffer.from(readFileSync(new URL("../src/rag/testsets.js", import.meta.url), "utf8").replace('from "../documents/nusabot.js"', `from "${docsUrl}"`)).toString("base64"))).TEST_SET;
const retCases = ["en", "id"].map((lang) => {
  const idx = ret.buildIndex(lang === "id" ? docs.NUSABOT_ID : docs.NUSABOT_EN, lang, 40, 8);
  return TS[lang].map(([q, exp]) => {
    const qt = core.tokenize(q, idx.stop, lang);
    const bm = ret.rankBy(ret.bm25Scores(idx.bm25, qt));
    const vec = ret.rankBy(ret.tfidfScores(idx, q));
    const fused = ret.rrf([bm, vec]);
    const rel = ret.relevantFor(idx.chunks, exp);
    return { lang, q, exp, bm25: bm.map((x) => x.i), bm25s: bm.map((x) => x.s), vec: vec.map((x) => x.i), rrf: fused.map((x) => x.i), m: ret.metricsAt(fused, rel, 3) };
  });
}).flat();

mkdirSync(new URL("../python/fixtures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../python/fixtures/js_lessons.json", import.meta.url), JSON.stringify({ lm: lmCases, bpe: bpeCases, ann: annCases, ret: retCases }, null, 1));
writeFileSync(new URL("../python/fixtures/js_output.json", import.meta.url), JSON.stringify(out, null, 1));
writeFileSync(new URL("../python/fixtures/documents.json", import.meta.url),
  JSON.stringify({ en: docs.NUSABOT_EN, id: docs.NUSABOT_ID, stopwords: STOP }));
console.log(`JS pipeline: ${out.length} cases written`);
void require;
