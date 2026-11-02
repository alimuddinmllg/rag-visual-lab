// Loads Python (Pyodide) in the browser on first use. ~15 MB including numpy.
const PYODIDE_VERSION = "0.26.4";
const BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load Python runtime. Check your connection."));
    document.head.appendChild(s);
  });
}

export function getPyodide() {
  if (!loading) {
    loading = (async () => {
      if (!window.loadPyodide) await loadScript(BASE + "pyodide.js");
      const py = await window.loadPyodide({ indexURL: BASE });
      await py.loadPackage("numpy");
      return py;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

// Run `source`, then `call`; returns { stdout, result } where result is a JS object.
export async function runPython(source, globals, call) {
  const py = await getPyodide();
  const out = [];
  py.setStdout({ batched: (s) => out.push(s) });
  py.setStderr({ batched: (s) => out.push(s) });
  const ns = py.globals.get("dict")();
  try {
    ns.set("__name__", "lab");
    for (const [k, v] of Object.entries(globals)) ns.set(k, py.toPy(v));
    py.runPython(source, { globals: ns });
    const res = py.runPython(call, { globals: ns });
    const result = res?.toJs ? res.toJs({ dict_converter: Object.fromEntries }) : res;
    res?.destroy?.();
    return { stdout: out.join("\n"), result };
  } finally {
    ns.destroy();
  }
}

// Files from earlier lessons are loaded first in the browser ("prelude"), so a lesson's
// imports of those local files are removed before it runs. Handles "from x import (a,\n b)".
const LOCAL = "(?:rag_from_scratch|tiny_lm|bm25|fusion|metrics|rewrite|chunkers|ann)";
export const stripLocalImports = (src) =>
  src.replace(new RegExp(`^from ${LOCAL} import \\([^)]*\\).*$`, "gm"), "").replace(new RegExp(`^from ${LOCAL} import .*$`, "gm"), "");
