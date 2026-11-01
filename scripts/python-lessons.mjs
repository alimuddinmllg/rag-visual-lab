// Runs every lesson's runnable Python file (with its prelude) on this computer's Python,
// with the lesson's default settings in both languages, and checks the result against
// the lesson's own JavaScript compare(). Same code path as the "Run Python" button.
//   npm run pylessons            (needs python3 / python / py with numpy)
//   INPUTS='{"k":5}' node scripts/python-lessons.mjs 20     (other settings, some lessons)
import { createServer } from "vite";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = globalThis;

const PY = ["python3", "python", "py"].find((c) => spawnSync(c, ["-c", "import numpy"], { stdio: "ignore" }).status === 0);
if (!PY) { console.error("No Python with numpy found."); process.exit(1); }

const server = await createServer({ logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const { LESSONS } = await server.ssrLoadModule("/src/lessons/index.js");
const { DOCUMENTS } = await server.ssrLoadModule("/src/documents/nusabot.js");
const { parseStages } = await server.ssrLoadModule("/src/toolkit/CodeView.jsx");
const { stripLocalImports } = await server.ssrLoadModule("/src/toolkit/pyodide.js");
const dir = mkdtempSync(join(tmpdir(), "pylessons-"));
const only = process.argv.slice(2).map(Number);

let pass = 0, fail = 0, skipped = [];
for (const [n, lesson] of Object.entries(LESSONS)) {
  if (only.length && !only.includes(+n)) continue;
  const file = (lesson.code || []).find((f) => f.runnable);
  if (!file || !lesson.python) { skipped.push(n); continue; }
  for (const lang of ["en", "id"]) {
    const doc = { id: `nusabot-${lang}`, ...DOCUMENTS[`nusabot-${lang}`], user: false };
    const values = { ...(lesson.extraValues || {}), ...Object.fromEntries((lesson.controls || []).map((c) => [c.id, c.default])) };
    const question = lesson.defaultQuestion ? lesson.defaultQuestion[lang] || lesson.defaultQuestion.en : "";
    const inputs = { ...values, question, doc, lang: lesson.inputs?.document ? doc.lang : lang, uiLang: lang, neural: null, ...JSON.parse(process.env.INPUTS || "{}") };
    const py = lesson.python({ inputs });
    const own = stripLocalImports(parseStages(file.source).code);
    const script = join(dir, `l${n}_${lang}.py`);
    writeFileSync(script, [
      "import json, sys",
      `__G = json.loads(${JSON.stringify(JSON.stringify(py.globals))})`,
      "globals().update(__G)",
      "__name__ = 'lab'",
      py.prelude || "",
      own,
      `__R = ${py.call}`,
      "print('\\n@@RESULT@@' + json.dumps(__R, default=lambda o: sorted(o) if isinstance(o, set) else str(o)))",
    ].join("\n"));
    const r = spawnSync(PY, [script], { encoding: "utf8", maxBuffer: 64 << 20 });
    const label = `lesson ${n.padStart(2)} ${lang}`;
    const at = r.stdout.lastIndexOf("@@RESULT@@");
    if (r.status !== 0 || at < 0) { fail++; console.log(`FAIL ${label}: python error\n${(r.stderr || r.stdout).slice(-1500)}`); continue; }
    const res = JSON.parse(r.stdout.slice(at + 10));
    const ok = py.compare ? py.compare(res) : null;
    if (ok === false) { fail++; console.log(`FAIL ${label}: Python and JavaScript differ\n${r.stdout.slice(0, at).slice(-800)}`); continue; }
    pass++;
    if (process.env.VERBOSE) console.log(`---- ${label}\n${r.stdout.slice(0, at).trim()}`);
    console.log(`ok   ${label}${ok === null ? " (output only)" : ""}`);
  }
}
await server.close();
console.log(`\n${pass} passed, ${fail} failed${skipped.length ? `, no runnable Python yet: lessons ${skipped.join(", ")}` : ""}`);
process.exit(fail ? 1 : 0);
