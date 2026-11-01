// Lesson 7: what PDF extraction typically gives you, and four cleaning steps.
// Twin of the cleaning steps: src/lessons/07-loading/clean.py

/** Simulate a typical PDF text extraction: hard line wraps, hyphenated words,
 *  running header/footer on every page, page numbers, stray double spaces. */
export function simulateExtraction(text, width = 60, linesPerPage = 14) {
  const out = [];
  let lineNo = 0, page = 1;
  const push = (l) => {
    if (lineNo % linesPerPage === 0) out.push("NusaBot Lab Handbook   v2.1");
    out.push(l);
    lineNo++;
    if (lineNo % linesPerPage === 0) { out.push(String(page)); page++; }
  };
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) { push(""); continue; }
    if (t.startsWith("## ")) { push(t); continue; }
    let line = "", k = 0;
    for (const w of t.split(/\s+/)) {
      k++;
      const sep = k % 9 === 0 ? "  " : " ";
      if (line && (line + " " + w).length > width) {
        if (w.length >= 9 && /^[A-Za-z]+[.,]?$/.test(w)) {
          const cut = Math.floor(w.length / 2);
          push(line + " " + w.slice(0, cut) + "-");
          line = w.slice(cut);
        } else { push(line); line = w; }
      } else line = line ? line + sep + w : w;
    }
    if (line) push(line);
  }
  return out.join("\n");
}

export function removeRepeatedLines(text, minRepeats = 3) {
  const lines = text.split("\n");
  const key = (l) => l.trim().replace(/[0-9]+/g, "#");
  const counts = new Map();
  for (const l of lines) if (l.trim()) counts.set(key(l), (counts.get(key(l)) || 0) + 1);
  const removed = [];
  const kept = lines.filter((l) => {
    const t = l.trim();
    const drop = t && !t.startsWith("## ") && (/^[0-9]+$/.test(t) || (counts.get(key(l)) >= minRepeats && t.length < 80));
    if (drop) removed.push(t);
    return !drop;
  });
  return { text: kept.join("\n"), removed };
}

export function joinHyphenated(text) {
  let n = 0;
  const out = text.replace(/([A-Za-z])-\n([a-z])/g, (_, a, b) => { n++; return a + b; });
  return { text: out, fixed: n };
}

export function joinLines(text) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(para.join(" ")); para = []; } };
  for (const l of text.split("\n")) {
    const t = l.trim();
    if (!t) { flush(); out.push(""); continue; }
    if (t.startsWith("## ")) { flush(); out.push(t); continue; }
    para.push(t);
  }
  flush();
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n") };
}

export function normaliseSpaces(text) {
  const out = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n");
  return { text: out };
}

export const stats = (t) => ({
  chars: t.length,
  lines: t.split("\n").length,
  words: (t.match(/\S+/g) || []).length,
});
