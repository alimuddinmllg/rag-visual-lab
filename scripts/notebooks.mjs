// Builds notebooks/lesson-NN-<lang>.ipynb for every lesson (default settings), so "Open in Colab" works.
//   npm run notebooks            write the notebooks (commit the notebooks/ folder)
//   npm run notebooks -- --check  check they are up to date, and run Part 1 of each one with Python
//                                 through the lesson's own compare() (needs python3 / python / py with numpy)
import { createServer } from "vite";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = globalThis;
const CHECK = process.argv.includes("--check");

const server = await createServer({ logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const { LESSONS } = await server.ssrLoadModule("/src/lessons/index.js");
const { CURRICULUM } = await server.ssrLoadModule("/src/engine/registry.js");
const { DOCUMENTS } = await server.ssrLoadModule("/src/documents/nusabot.js");
const { buildNotebook, notebookName } = await server.ssrLoadModule("/src/toolkit/notebook.js");

const PY = CHECK && ["python3", "python", "py"].find((c) => spawnSync(c, ["-c", "import numpy"], { stdio: "ignore" }).status === 0);
if (CHECK && !PY) { console.error("No Python with numpy found."); process.exit(1); }
const out = "notebooks", tmp = mkdtempSync(join(tmpdir(), "nb-"));
mkdirSync(out, { recursive: true });

let bad = 0, n = 0;
for (const [num, lesson] of Object.entries(LESSONS)) {
  for (const lang of ["en", "id"]) {
    const doc = { id: `nusabot-${lang}`, ...DOCUMENTS[`nusabot-${lang}`], user: false };
    const values = { ...(lesson.extraValues || {}), ...Object.fromEntries((lesson.controls || []).map((c) => [c.id, c.default])) };
    const question = lesson.defaultQuestion ? lesson.defaultQuestion[lang] || lesson.defaultQuestion.en : "";
    const inputs = { ...values, question, doc, lang: lesson.inputs?.document ? doc.lang : lang, uiLang: lang, neural: null };
    const python = lesson.python ? lesson.python({ inputs }) : null;
    const title = CURRICULUM.find((l) => l.n === +num).title[lang];
    const text = buildNotebook({ n: +num, title, lang, files: lesson.code, python });
    const path = join(out, notebookName(+num, lang));
    n++;
    if (!CHECK) { writeFileSync(path, text); continue; }
    const label = `lesson ${num.padStart(2)} ${lang}`;
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) { bad++; console.log(`FAIL ${label}: ${path} is out of date (run npm run notebooks)`); continue; }
    // Part 1 = every code cell before the first "%pip" cell.
    const cells = JSON.parse(text).cells.filter((c) => c.cell_type === "code").map((c) => c.source.join(""));
    const stop = cells.findIndex((c) => c.startsWith("%pip"));
    const part1 = stop < 0 ? cells : cells.slice(0, stop);
    const script = join(tmp, `nb${num}_${lang}.py`);
    writeFileSync(script, part1.join("\n\n") + "\nimport json as __j\nprint('\\n@@RESULT@@' + __j.dumps(result, default=lambda o: sorted(o) if isinstance(o, set) else str(o)))\n");
    const r = spawnSync(PY, [script], { encoding: "utf8", cwd: tmp, maxBuffer: 64 << 20 });
    const at = r.stdout.lastIndexOf("@@RESULT@@");
    if (r.status !== 0 || at < 0) { bad++; console.log(`FAIL ${label}: notebook error\n${(r.stderr || r.stdout).slice(-1200)}`); continue; }
    const ok = python.compare ? python.compare(JSON.parse(r.stdout.slice(at + 10))) : null;
    if (ok === false) { bad++; console.log(`FAIL ${label}: notebook result differs from the lesson`); continue; }
    console.log(`ok   ${label}`);
  }
}
await server.close();
console.log(CHECK ? `\n${n - bad} of ${n} notebooks up to date and matching` : `wrote ${n} notebooks to ${out}/`);
process.exit(bad ? 1 : 0);
