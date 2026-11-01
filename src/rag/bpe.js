// Byte-pair encoding (BPE), the tokenizer family used by GPT-style models, trained on one document.
// Start from single characters; repeatedly merge the most frequent neighbouring pair.
// Twin: src/lessons/03-tokens/bpe.py

const END = "▁"; // marks the end of a word, so "the" and "there" stay distinguishable

export function wordFreqs(text) {
  const body = text.split("\n").filter((l) => !l.trim().startsWith("## ")).join(" ");
  const freq = new Map();
  for (const w of body.toLowerCase().match(/[a-z0-9]+|[^\sa-z0-9]/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
  return freq;
}

export function trainBPE(freq, numMerges) {
  let words = [...freq.entries()].map(([w, c]) => ({ syms: [...w, END], c }));
  const merges = [];
  for (let m = 0; m < numMerges; m++) {
    const pairs = new Map();
    for (const { syms, c } of words) {
      for (let i = 0; i < syms.length - 1; i++) {
        const k = syms[i] + " " + syms[i + 1];
        pairs.set(k, (pairs.get(k) || 0) + c);
      }
    }
    let best = null, bestC = 1;               // only merge pairs seen at least twice
    for (const [k, c] of pairs) if (c > bestC || (c === bestC && best !== null && k < best)) { best = k; bestC = c; }
    if (!best) break;
    const [a, b] = best.split(" ");
    merges.push({ a, b, count: bestC });
    words = words.map(({ syms, c }) => {
      const out = [];
      for (let i = 0; i < syms.length; i++) {
        if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; } else out.push(syms[i]);
      }
      return { syms: out, c };
    });
  }
  return merges;
}

export function tokenizeBPE(text, merges) {
  const rank = new Map(merges.map((m, i) => [m.a + " " + m.b, i]));
  const out = [];
  for (const w of text.toLowerCase().match(/[a-z0-9]+|[^\sa-z0-9]/g) || []) {
    let syms = [...w, END];
    for (;;) {
      let bestI = -1, bestR = Infinity;
      for (let i = 0; i < syms.length - 1; i++) {
        const r = rank.get(syms[i] + " " + syms[i + 1]);
        if (r !== undefined && r < bestR) { bestR = r; bestI = i; }
      }
      if (bestI < 0) break;
      syms = [...syms.slice(0, bestI), syms[bestI] + syms[bestI + 1], ...syms.slice(bestI + 2)];
    }
    out.push(...syms);
  }
  return out;
}

export const END_MARK = END;
