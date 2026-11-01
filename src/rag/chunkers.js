// Lesson 8: four chunking strategies. Twin: src/lessons/08-chunking/chunkers.py
// Every chunker returns [{ text, words, sec }]; sizes are counted in words.
import * as rag from "./core.js";

export function sentencesOf(text) {
  const out = [];
  let sec = -1;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("## ")) { sec++; continue; }
    for (const s of t.split(/(?<=[.!?])\s+/)) if (s) out.push({ text: s, words: s.split(/\s+/).length, sec: Math.max(0, sec) });
  }
  return out;
}

const pack = (sents, size) => {
  const out = [];
  let cur = [];
  let n = 0;
  const flush = () => { if (cur.length) { out.push({ text: cur.map((s) => s.text).join(" "), words: n, sec: cur[0].sec }); cur = []; n = 0; } };
  for (const s of sents) {
    if (s.words > size) {               // a single long sentence: cut it into fixed pieces
      flush();
      const w = s.text.split(/\s+/);
      for (let i = 0; i < w.length; i += size) out.push({ text: w.slice(i, i + size).join(" "), words: Math.min(size, w.length - i), sec: s.sec });
      continue;
    }
    if (n + s.words > size) flush();
    cur.push(s); n += s.words;
  }
  flush();
  return out;
};

export function fixedChunks(text, size) {
  const { words } = rag.parseDocument(text);
  return rag.chunkDocument(words, size, 0).map((c) => ({ text: c.text, words: c.words, sec: c.sec }));
}

export function sentenceChunks(text, size) {
  return pack(sentencesOf(text), size);
}

export function recursiveChunks(text, size) {
  // section -> (if too big) sentences -> (if one sentence is too big) fixed pieces
  const sents = sentencesOf(text);
  const out = [];
  const secs = [...new Set(sents.map((s) => s.sec))];
  for (const sec of secs) {
    const ss = sents.filter((s) => s.sec === sec);
    const n = ss.reduce((a, s) => a + s.words, 0);
    if (n <= size) out.push({ text: ss.map((s) => s.text).join(" "), words: n, sec });
    else out.push(...pack(ss, size));
  }
  return out;
}

export function semanticChunks(text, size, threshold, lang) {
  // start a new chunk when the next sentence is too different from the previous one
  const sents = sentencesOf(text);
  const stop = rag.stopwordsFor(lang);
  const emb = rag.embedChunks(sents, stop, lang);
  const out = [];
  let cur = [], n = 0;
  const sims = [];
  const flush = () => { if (cur.length) { out.push({ text: cur.map((s) => s.text).join(" "), words: n, sec: cur[0].sec }); cur = []; n = 0; } };
  sents.forEach((s, i) => {
    const sim = i ? rag.cosine(emb.vectors[i - 1], emb.vectors[i]) : 1;
    sims.push(sim);
    if (cur.length && (sim < threshold || n + s.words > size)) flush();
    cur.push(s); n += s.words;
  });
  flush();
  return { chunks: out, sims };
}

export function quality(chunks) {
  const mid = chunks.filter((c) => !/[.!?]$/.test(c.text)).length;
  const mixed = 0;
  const avg = chunks.reduce((a, c) => a + c.words, 0) / Math.max(1, chunks.length);
  return { n: chunks.length, avg, midCut: mid, mixed };
}
