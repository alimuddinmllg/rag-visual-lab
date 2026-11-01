// A tiny word-level language model (trigram with back-off), trained on one document.
// It predicts the next word from the two before it, the way an LLM predicts the next token,
// just with counting instead of a neural network. Twin: src/lessons/01-llm/ngram.py

export function lmTokens(text) {
  const body = text.split("\n").filter((l) => !l.trim().startsWith("## ")).join(" ");
  return body.toLowerCase().match(/[a-z0-9]+(?:[.,][0-9]+)*|[.,!?]/g) || [];
}

export function trainLM(tokens) {
  const uni = new Map(), bi = new Map(), tri = new Map();
  const inc = (m, k, w) => { let d = m.get(k); if (!d) m.set(k, (d = new Map())); d.set(w, (d.get(w) || 0) + 1); };
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    uni.set(w, (uni.get(w) || 0) + 1);
    if (i >= 1) inc(bi, tokens[i - 1], w);
    if (i >= 2) inc(tri, tokens[i - 2] + " " + tokens[i - 1], w);
  }
  return { uni, bi, tri, size: tokens.length };
}

const byProb = (a, b) => b.p - a.p || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0);

/** Next-word distribution after `context`; uses the longest context that was seen in training. */
export function nextDist(lm, context) {
  const n = context.length;
  let counts = null, order = "unigram";
  if (n >= 2 && lm.tri.has(context[n - 2] + " " + context[n - 1])) { counts = lm.tri.get(context[n - 2] + " " + context[n - 1]); order = "trigram"; }
  else if (n >= 1 && lm.bi.has(context[n - 1])) { counts = lm.bi.get(context[n - 1]); order = "bigram"; }
  else counts = lm.uni;
  let total = 0;
  for (const c of counts.values()) total += c;
  const dist = [...counts.entries()].map(([w, c]) => ({ w, p: c / total })).sort(byProb);
  return { dist, order };
}

// Park–Miller random numbers: identical in JavaScript and Python, so runs are reproducible.
export function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function sample(dist, temperature, rand) {
  const t = Math.max(temperature, 0.05);
  const weights = dist.map((d) => Math.pow(d.p, 1 / t));
  let total = 0;
  for (const w of weights) total += w;
  const r = rand() * total;
  let acc = 0;
  for (let i = 0; i < dist.length; i++) { acc += weights[i]; if (r <= acc) return i; }
  return dist.length - 1;
}

/** Generate `steps` words after `prompt`. Returns each step with its distribution and choice. */
export function generate(lm, promptTokens, steps, temperature, seed) {
  const rand = rng(seed);
  const ctx = [...promptTokens];
  const out = [];
  for (let k = 0; k < steps; k++) {
    const { dist, order } = nextDist(lm, ctx);
    const i = sample(dist, temperature, rand);
    out.push({ w: dist[i].w, p: dist[i].p, rank: i, order, top: dist.slice(0, 8) });
    ctx.push(dist[i].w);
  }
  return out;
}

export function detok(words) {
  return words.reduce((s, w) => (/^[.,!?]$/.test(w) ? s + w : s ? s + " " + w : w), "");
}

/** Word positions (in `words`) where the last n words never occur together in the document:
 *  the model stitched two different passages, which is where wrong "facts" come from. */
export function seams(docTokens, promptTokens, words, n = 5) {
  const seen = new Set();
  for (let i = 0; i + n <= docTokens.length; i++) seen.add(docTokens.slice(i, i + n).join(" "));
  const seq = [...promptTokens, ...words], start = promptTokens.length, out = [];
  for (let k = Math.max(start, n - 1); k < seq.length; k++) if (!seen.has(seq.slice(k - n + 1, k + 1).join(" "))) out.push(k - start);
  return out;
}
