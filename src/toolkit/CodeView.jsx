// Code view: shows the real code behind the visual, highlights the lines of
// the stage that is running, lists live values, and can run Python in the browser.
//
// Source files mark stages with comment lines:
//   # @stage embed
//   ...code...
//   # @end
// The markers are removed before display; the line ranges drive highlighting.
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.js";
import { runPython } from "./pyodide.js";

export function parseStages(source) {
  const lines = [], ranges = {};
  let open = null;
  for (const raw of source.replace(/\s+$/, "").split("\n")) {
    const m = raw.match(/^\s*#\s*@stage\s+(\S+)/);
    if (m) { open = m[1]; (ranges[open] ||= []).push([lines.length, lines.length]); continue; }
    if (/^\s*#\s*@end\b/.test(raw)) { open = null; continue; }
    if (open) { const r = ranges[open]; r[r.length - 1][1] = lines.length; }
    lines.push(raw);
  }
  return { code: lines.join("\n"), lines, ranges };
}

const KW = new Set("def return if else elif for while in not and or is None True False import from as lambda with try except finally class pass break continue yield global".split(" "));
function highlight(line) {
  const out = [];
  const re = /(#.*$)|("""[^]*?"""|f?"(?:[^"\\]|\\.)*"|f?'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
  let last = 0, m, prev = "";
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok] = m;
    if (m[1]) out.push(<span key={m.index} className="c">{tok}</span>);
    else if (m[2]) out.push(<span key={m.index} className="s">{tok}</span>);
    else if (m[3]) out.push(<span key={m.index} className="n">{tok}</span>);
    else if (KW.has(tok)) out.push(<span key={m.index} className="k">{tok}</span>);
    else if (prev === "def") out.push(<span key={m.index} className="f">{tok}</span>);
    else out.push(tok);
    if (m[4]) prev = tok;
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/**
 * props:
 *  files: [{ id, label:{en,id}, source, runnable, note? }]
 *  stageOrder: [stage ids]
 *  active: stage id to highlight strongly
 *  doneUpTo: number of stages already run (lighter highlight)
 *  variables: [[name, value]]
 *  python: { globals, call, compare(result) => bool }   for runnable files
 */
export default function CodeView({ files, stageOrder, active, doneUpTo, variables, python }) {
  const { t, tr } = useT();
  const [fileId, setFileId] = useState(files[0].id);
  const file = files.find((f) => f.id === fileId) || files[0];
  const parsed = useMemo(() => parseStages(file.source), [file]);
  const pre = useRef(null);
  const [copied, setCopied] = useState(false);
  const [py, setPy] = useState({ state: "idle" });

  const lineClass = useMemo(() => {
    const cls = new Array(parsed.lines.length).fill("");
    stageOrder.forEach((id, i) => {
      for (const [a, b] of parsed.ranges[id] || []) {
        for (let l = a; l <= b; l++) {
          if (id === active) cls[l] = "hl";
          else if (i < doneUpTo && !cls[l]) cls[l] = "dn";
        }
      }
    });
    return cls;
  }, [parsed, stageOrder, active, doneUpTo]);

  // Scroll the active stage into view inside the code box.
  useEffect(() => {
    const r = parsed.ranges[active]?.[0];
    if (!r || !pre.current) return;
    const el = pre.current.children[r[0]];
    if (el) pre.current.scrollTo({ top: el.offsetTop - 12, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [active, parsed]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(parsed.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([parsed.code], { type: "text/x-python" }));
    a.download = file.filename || "lesson.py";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const run = async () => {
    setPy({ state: "loading" });
    try {
      const timer = setTimeout(() => setPy((p) => (p.state === "loading" ? { state: "running" } : p)), 400);
      const { stdout, result } = await runPython(parsed.code, python.globals, python.call);
      clearTimeout(timer);
      setPy({ state: "done", stdout, match: python.compare ? python.compare(result) : null });
    } catch (e) {
      setPy({ state: "error", stdout: String(e.message || e) });
    }
  };

  return (
    <div>
      <div className="codebar">
        <div className="seg" role="group">
          {files.map((f) => (
            <button key={f.id} aria-pressed={f.id === file.id} onClick={() => { setFileId(f.id); setPy({ state: "idle" }); }}>{tr(f.label)}</button>
          ))}
        </div>
        <span className="sp" />
        <button className="btn" onClick={copy}>{copied ? t("copied") : t("copy")}</button>
        <button className="btn" onClick={download}>{t("download")}</button>
        {file.runnable && python && (
          <button className="btn primary" onClick={run} disabled={py.state === "loading" || py.state === "running"}>
            ▶ {t("runPython")}
          </button>
        )}
      </div>
      <div className="codeview">
        <div>
          <pre className="code" ref={pre}>
            {parsed.lines.map((l, i) => <span key={i} className={`ln ${lineClass[i]}`}>{highlight(l)}{"\n"}</span>)}
          </pre>
          {!file.runnable && <div className="codenote">{file.note ? tr(file.note) : t("libsNote")}</div>}
          {file.runnable && py.state !== "idle" && (
            <div className="pyout">
              {py.state === "loading" && <span>{t("loadingPython")}</span>}
              {py.state === "running" && <span>{t("runningPython")}</span>}
              {py.state === "done" && py.match === null && <span className="ok">{t("output")}</span>}
              {py.state === "done" && py.match !== null && <span className={py.match ? "ok" : "bad"}>{py.match ? "✓ " + t("pythonMatches") : "✗ " + t("pythonDiffers")}</span>}
              {py.state === "error" && <span className="bad">✗ Error</span>}
              {py.stdout && <pre>{py.stdout}</pre>}
            </div>
          )}
        </div>
        <aside className="vars">
          <h3>{t("variables")}</h3>
          <dl>
            {!variables.length && <dd>—</dd>}
            {variables.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
