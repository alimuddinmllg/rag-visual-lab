// Builds a self-contained Jupyter notebook for a lesson:
//   data (the lab's documents and settings) → earlier lessons' files → this lesson's from-scratch code → run it
//   → the "with libraries" version (needs pip installs).
// Used by the Code tab's "Download notebook" button (current settings) and by scripts/notebooks.mjs
// (default settings, committed to notebooks/ so "Open in Colab" works).
import { parseStages } from "./CodeView.jsx";
import { stripLocalImports } from "./pyodide.js";
import { HANDBOOK, TEST_SET } from "../rag/testsets.js";
import { GENERAL_EN, GENERAL_ID } from "../documents/general.js";
import STOPWORDS from "../rag/stopwords.json";

export const REPO = "alimuddinmllg/rag-visual-lab";
export const LAB_URL = "https://lab.nalarnusa.id";
export const notebookName = (n, lang) => `lesson-${String(n).padStart(2, "0")}-${lang}.ipynb`;
export const colabUrl = (n, lang) => `https://colab.research.google.com/github/${REPO}/blob/main/notebooks/${notebookName(n, lang)}`;

const T = {
  en: {
    intro: (n, title) => `# NalarNusa RAG Visual Lab · Lesson ${n}: ${title}\n\nThe same code as the lab's Code tab, in one notebook. [Open the lesson in the lab](${LAB_URL}/#lesson-${String(n).padStart(2, "0")}).\n\n- **Part 1** runs as it is: plain Python and numpy, with the settings shown below. It gives the same results as the visual.\n- **Part 2** is the same idea with common libraries. It installs packages first, and some parts call an LLM.`,
    data: "## Data\n\nThe lab's sample documents and your settings. Change the values here and run the notebook again.",
    part1: "## Part 1 · From scratch",
    from: (lesson, file) => `Code from lesson ${lesson} (\`${file}\`), which this lesson builds on.`,
    own: (file) => `This lesson's code (\`${file}\`).`,
    run: "Run it with the settings from the Data cell:",
    part2: "## Part 2 · With libraries",
    part2note: "Installs the packages, then runs the library version. The first cell picks the LLM: in Colab it uses the lab's free model (a daily limit applies); on your own computer, Ollama at `http://localhost:11434/v1`. Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` to use another OpenAI-compatible service.",
    pdfNote: "This part reads `handbook.pdf` and `handbook.docx`. Without files of your own it makes sample ones from the handbook; to use yours, upload them with those names first (in Colab: the folder icon on the left).",
  },
  id: {
    intro: (n, title) => `# NalarNusa RAG Visual Lab · Pelajaran ${n}: ${title}\n\nKode yang sama dengan tab Kode di lab, dalam satu notebook. [Buka pelajaran ini di lab](${LAB_URL}/#lesson-${String(n).padStart(2, "0")}).\n\n- **Bagian 1** langsung berjalan: Python biasa dan numpy, dengan pengaturan di bawah. Hasilnya sama dengan visual.\n- **Bagian 2** adalah ide yang sama dengan pustaka umum. Bagian ini memasang paket dulu, dan sebagian memanggil LLM.`,
    data: "## Data\n\nDokumen contoh dari lab dan pengaturan Anda. Ubah nilainya di sini lalu jalankan notebook lagi.",
    part1: "## Bagian 1 · Dari nol",
    from: (lesson, file) => `Kode dari pelajaran ${lesson} (\`${file}\`), dasar pelajaran ini.`,
    own: (file) => `Kode pelajaran ini (\`${file}\`).`,
    run: "Jalankan dengan pengaturan dari sel Data:",
    part2: "## Bagian 2 · Dengan pustaka",
    part2note: "Memasang paket, lalu menjalankan versi pustaka. Sel pertama memilih LLM: di Colab memakai model gratis dari lab (ada batas harian); di komputer Anda sendiri, Ollama di `http://localhost:11434/v1`. Atur `LLM_BASE_URL`, `LLM_API_KEY`, dan `LLM_MODEL` untuk memakai layanan lain yang kompatibel dengan OpenAI.",
    pdfNote: "Bagian ini membaca `handbook.pdf` dan `handbook.docx`. Tanpa file Anda sendiri, dibuatkan file contoh dari buku panduan; untuk memakai file Anda, unggah dengan nama itu dulu (di Colab: ikon folder di kiri).",
  },
};

// Part 2's first cell: which LLM the "with libraries" code calls.
const LLM_SETUP = [
  "import os, sys",
  "# In Colab: the lab's free model (OpenAI-compatible, daily limit). On your own computer: Ollama.",
  "# To use another service, set these three yourself before running the next cells.",
  "if \"google.colab\" in sys.modules and \"LLM_BASE_URL\" not in os.environ:",
  `    os.environ.update(LLM_BASE_URL="${LAB_URL}/api/llm", LLM_API_KEY="lab", LLM_MODEL="lab")`,
  "print(\"LLM:\", os.environ.get(\"LLM_BASE_URL\", \"http://localhost:11434/v1 (Ollama)\"))",
].join("\n");

const lines = (s) => { const a = s.replace(/\s+$/, "").split("\n"); return a.map((l, i) => (i < a.length - 1 ? l + "\n" : l)); };
const md = (s) => ({ cell_type: "markdown", metadata: {}, source: lines(s) });
const code = (s) => ({ cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: lines(s) });
const clean = (src) => stripLocalImports(parseStages(src).code).replace(/^if __name__ == "__main__":[\s\S]*$/m, "").replace(/\n{3,}/g, "\n\n").trim();
// A Python string literal: JSON escapes (\n \" \\ \uXXXX) are valid Python escapes.
const pyStr = (s) => JSON.stringify(s);

/**
 * n, title (string), lang ("en" | "id"), files (lesson.code), python ({ prelude, globals, call } from lesson.python(ctx))
 * Returns the notebook as a JSON string.
 */
export function buildNotebook({ n, title, lang, files, python }) {
  const t = T[lang] || T.en;
  const own = files.find((f) => f.runnable), libs = files.find((f) => !f.runnable);
  // The document and test set the learner had in the lab (their own upload, if any), so Part 2 uses them too.
  const g = python?.globals || {};
  const docLang = g.LANG === "id" || g.LANG === "en" ? g.LANG : lang === "id" ? "id" : "en";
  const docText = [g.DOCUMENT, g.TEXT, g.HANDBOOK].find((x) => typeof x === "string") || HANDBOOK[docLang];
  const tests = [g.TESTS, g.ANSWERABLE].find((x) => Array.isArray(x) && x.length) || TEST_SET[docLang];
  const dataFiles = {
    "nusabot_handbook.txt": docText, "handbook.txt": docText,
    "general_knowledge.txt": docLang === "id" ? GENERAL_ID : GENERAL_EN,
    "stopwords.json": JSON.stringify({ en: STOPWORDS.en, id: STOPWORDS.id }),
    "test_set.json": JSON.stringify(tests, null, 1),
    // names some "with libraries" files use for the same document and test set
    "handbook.md": docText, "my_document.txt": docText, "my_tests.json": JSON.stringify(tests, null, 1),
  };
  const cells = [md(t.intro(n, title)), md(t.data)];
  cells.push(code([
    "import json",
    "",
    "# Files the code reads: the document you used in the lab (saved as handbook.txt, nusabot_handbook.txt, handbook.md, my_document.txt), its test set, stopwords.",
    `for name, text in json.loads(${pyStr(JSON.stringify(dataFiles))}).items():`,
    "    with open(name, \"w\", encoding=\"utf-8\") as f:",
    "        f.write(text)",
    "",
    "# Settings from the lab",
    `SETTINGS = json.loads(${pyStr(JSON.stringify(python?.globals || {}))})`,
    "globals().update(SETTINGS)",
    "for k, v in SETTINGS.items():",
    "    print(k, \"=\", repr(v)[:70])",
  ].join("\n")));
  if (own && python) {
    cells.push(md(t.part1));
    for (const p of python.prelude?.parts || []) { cells.push(md(t.from(p.lesson, p.file))); cells.push(code(clean(p.code))); }
    cells.push(md(t.own(own.filename || "lesson.py")));
    cells.push(code(clean(own.source)));
    cells.push(md(t.run));
    cells.push(code(`result = ${python.call}`));
  }
  if (libs) {
    // the package list only: anything after two spaces or a "(" on that line is a comment
    const pip = ((libs.source.match(/^# pip install (.+)$/m) || [])[1] || "").split(/\s{2,}|\s\(/)[0].trim();
    cells.push(md(t.part2 + "\n\n" + t.part2note + (/handbook\.pdf/.test(libs.source) ? "\n\n" + t.pdfNote : "")));
    cells.push(code(LLM_SETUP));
    if (pip) cells.push(code(`%pip install -q ${pip}`));
    cells.push(code(parseStages(libs.source).code.trim()));
  }
  const nb = {
    cells,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" }, colab: { provenance: [] } },
    nbformat: 4, nbformat_minor: 5,
  };
  return JSON.stringify(nb, null, 1) + "\n";
}
