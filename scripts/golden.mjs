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

mkdirSync(new URL("../python/fixtures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../python/fixtures/js_output.json", import.meta.url), JSON.stringify(out, null, 1));
writeFileSync(new URL("../python/fixtures/documents.json", import.meta.url),
  JSON.stringify({ en: docs.NUSABOT_EN, id: docs.NUSABOT_ID, stopwords: STOP }));
console.log(`JS pipeline: ${out.length} cases written`);
void require;
