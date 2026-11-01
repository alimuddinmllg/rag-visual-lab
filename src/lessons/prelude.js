// Python from earlier lessons, loaded before a lesson's own code when it runs in the browser.
import rag from "./06-rag-pipeline/rag_from_scratch.py?raw";
import tinyLm from "./01-llm/ngram.py?raw";
import bm25 from "./13-bm25/bm25.py?raw";
import fusion from "./14-hybrid/fusion.py?raw";
import metrics from "./20-metrics/metrics.py?raw";
import rewrite from "./16-rewrite/rewrite.py?raw";
import chunkers from "./08-chunking/chunkers.py?raw";
import STOPWORDS from "../rag/stopwords.json";
import { stripLocalImports } from "../toolkit/pyodide.js";

const strip = (src) => stripLocalImports(src).replace(/^if __name__ == "__main__":[\s\S]*$/m, "");
export const PRE = { rag: strip(rag), tinyLm: strip(tinyLm), bm25: strip(bm25), fusion: strip(fusion), metrics: strip(metrics), rewrite: strip(rewrite), chunkers: strip(chunkers) };
export const prelude = (...names) => names.map((n) => PRE[n]).join("\n\n");
export const stopList = (lang) => STOPWORDS[lang] || STOPWORDS.en;
