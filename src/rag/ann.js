// Lesson 11: exact (brute-force) search vs a navigable small-world graph (NSW),
// the single-layer idea behind HNSW. Twin: src/lessons/11-indexes/ann.py
import { rng } from "./ngram.js";

export function makePoints(n, seed, clusters = 6) {
  const r = rng(seed);
  const centers = Array.from({ length: clusters }, () => [0.12 + r() * 0.76, 0.12 + r() * 0.76]);
  return Array.from({ length: n }, (_, i) => {
    const c = centers[i % clusters];
    const jx = (r() + r() + r()) / 3 - 0.5, jy = (r() + r() + r()) / 3 - 0.5;
    return [Math.min(1, Math.max(0, c[0] + jx * 0.4)), Math.min(1, Math.max(0, c[1] + jy * 0.4))];
  });
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const byDist = (a, b) => a[0] - b[0] || a[1] - b[1];

/** Insert points one by one; connect each to its M nearest already-inserted points (both directions). */
export function buildNSW(points, M) {
  const nbrs = points.map(() => []);
  for (let i = 1; i < points.length; i++) {
    const cand = [];
    for (let j = 0; j < i; j++) cand.push([d2(points[i], points[j]), j]);
    cand.sort(byDist);
    for (const [, j] of cand.slice(0, M)) { nbrs[i].push(j); nbrs[j].push(i); }
  }
  return nbrs;
}

export function bruteForce(points, q, k) {
  const all = points.map((p, i) => [d2(p, q), i]).sort(byDist);
  return { top: all.slice(0, k).map((x) => x[1]), comparisons: points.length };
}

/** Greedy best-first search over the graph, keeping the ef best found so far. */
export function searchNSW(points, nbrs, q, k, ef, entry = 0) {
  let comparisons = 0;
  const dist = (i) => { comparisons++; return d2(points[i], q); };
  const visited = new Set([entry]);
  const d0 = dist(entry);
  let cand = [[d0, entry]], res = [[d0, entry]];
  const expanded = [];
  const width = Math.max(ef, k);
  while (cand.length) {
    cand.sort(byDist);
    const [d, c] = cand.shift();
    if (res.length >= width && d > res[res.length - 1][0]) break;
    expanded.push(c);
    for (const nb of nbrs[c]) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      const dn = dist(nb);
      if (res.length < width || dn < res[res.length - 1][0]) {
        cand.push([dn, nb]);
        res.push([dn, nb]);
        res.sort(byDist);
        if (res.length > width) res.pop();
      }
    }
  }
  return { top: res.slice(0, k).map((x) => x[1]), comparisons, expanded };
}
