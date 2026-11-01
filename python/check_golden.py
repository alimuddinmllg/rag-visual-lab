"""Golden test, step 2: run the Python code shown in the Code tab on the same
cases and check it gives the same numbers as the JavaScript visual."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "src" / "lessons" / "06-rag-pipeline"))
from rag_from_scratch import run_pipeline  # noqa: E402

TOL = 1e-6
cases = json.loads((ROOT / "fixtures" / "js_output.json").read_text())
docs = json.loads((ROOT / "fixtures" / "documents.json").read_text())

failures = 0
for n, case in enumerate(cases, 1):
    inp, js = case["input"], case["output"]
    py = run_pipeline(docs[inp["lang"]], inp["question"], inp["size"], inp["overlap"],
                      inp["topK"], inp["minSim"], inp["lang"], set(docs["stopwords"][inp["lang"]]))
    problems = []
    for key in ("n_chunks", "vocab_size", "known", "used", "prompt", "answer"):
        if py[key] != js[key]:
            problems.append(f"{key}: py={py[key]!r} js={js[key]!r}")
    if [i for i, _ in py["top"]] != [i for i, _ in js["top"]]:
        problems.append(f"top ids differ: py={py['top']} js={js['top']}")
    elif any(abs(a[1] - b[1]) > TOL for a, b in zip(py["top"], js["top"])):
        problems.append("top scores differ")
    flat = lambda m: [x for row in m for x in row]
    if any(abs(a - b) > TOL for a, b in zip(flat(py["coords"]), flat(js["coords"]))):
        problems.append("map coordinates differ")
    if (py["query_xy"] is None) != (js["query_xy"] is None) or (
            py["query_xy"] and any(abs(a - b) > TOL for a, b in zip(py["query_xy"], js["query_xy"]))):
        problems.append("query position differs")
    status = "ok  " if not problems else "FAIL"
    print(f"{status} [{inp['lang']}] {inp['question']}  (size={inp['size']}, top-{inp['topK']})")
    for p in problems:
        print("      " + p[:300])
    failures += bool(problems)

# ---- lesson 1 (n-gram LM) and lesson 3 (BPE) ----
import importlib.util
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
LES = ROOT.parent / "src" / "lessons"
ng = load(LES / "01-llm" / "ngram.py", "ngram")
bp = load(LES / "03-tokens" / "bpe.py", "bpe")
extra = json.loads((ROOT / "fixtures" / "js_lessons.json").read_text())
total = len(cases)
for c in extra["lm"]:
    i = c["input"]; total += 1
    lm = ng.train_lm(ng.lm_tokens(docs[i["lang"]]))
    py = ng.generate(lm, ng.lm_tokens(i["prompt"]), i["steps"], i["temp"], i["seed"])
    ok = py == c["words"]
    print(f"{'ok  ' if ok else 'FAIL'} [lesson 1] {i['prompt']!r} t={i['temp']} seed={i['seed']}")
    if not ok: print("      py:", py, "\n      js:", c["words"])
    failures += not ok
for c in extra["bpe"]:
    i = c["input"]; total += 1
    m = bp.train_bpe(bp.word_freqs(docs[i["lang"]]), i["merges"])
    toks = bp.tokenize(i["text"], m)
    ok = toks == c["tokens"] and len(m) == c["n_merges"] and len(bp.tokenize(docs[i["lang"]], m)) == c["doc_tokens"]
    print(f"{'ok  ' if ok else 'FAIL'} [lesson 3] {i['text']!r} merges={i['merges']}")
    if not ok: print("      py:", toks[:20], len(m), "\n      js:", c["tokens"][:20], c["n_merges"])
    failures += not ok

an = load(LES / "11-indexes" / "ann.py", "ann")
for c in extra["ann"]:
    i = c["input"]; total += 1
    pts = an.make_points(i["n"], i["seed"]); nb = an.build_nsw(pts, i["M"])
    ex, c1 = an.brute_force(pts, (i["qx"], i["qy"]), 5)
    fo, c2 = an.search_nsw(pts, nb, (i["qx"], i["qy"]), 5, i["ef"])
    ok = ex == c["exact"] and fo == c["found"] and c1 == c["brute"] and c2 == c["graph"]
    print(f"{'ok  ' if ok else 'FAIL'} [lesson 11] n={i['n']} M={i['M']} ef={i['ef']}  graph {c2} vs brute {c1} comparisons")
    if not ok: print("      py:", ex, fo, c1, c2, "\n      js:", c["exact"], c["found"], c["brute"], c["graph"])
    failures += not ok

sys.path.insert(0, str(LES / "13-bm25")); sys.path.insert(0, str(LES / "14-hybrid")); sys.path.insert(0, str(LES / "20-metrics"))
import bm25 as B, fusion as F, metrics as M
from rag_from_scratch import tokenize as tok_py
idx = {}
for c in extra["ret"]:
    lang = c["lang"]; total += 1
    if lang not in idx:
        idx[lang] = B.index(docs[lang], lang, set(docs["stopwords"][lang]))
    chunks, toks = idx[lang]
    stop = set(docs["stopwords"][lang])
    sb = B.bm25_scores(toks, tok_py(c["q"], stop, lang))
    rb = B.rank(sb); rv = B.rank(B.vector_scores(chunks, c["q"], stop, lang)); rf = F.rrf([rb, rv])
    m = M.metrics_at(rf, M.relevant_for(chunks, c["exp"]), 3)
    ok = rb == c["bm25"] and all(abs(a - sb[i]) < 1e-9 for i, a in zip(rb, c["bm25s"])) and rv == c["vec"] and rf == c["rrf"] \
        and all(abs(m[k] - c["m"][k]) < 1e-9 for k in ("recall", "precision", "rr", "ndcg"))
    if not ok:
        print(f"FAIL [lessons 13/14/20] {c['q']}\n      py: {rb[:5]} {rv[:5]} {rf[:5]} {m}\n      js: {c['bm25'][:5]} {c['vec'][:5]} {c['rrf'][:5]} {c['m']}")
    failures += not ok
print(f"ok   [lessons 13/14/20] BM25, RRF and metrics on {len(extra['ret'])} test questions" if all(True for _ in [0]) else "")

print(f"\n{total - failures}/{total} cases match")
sys.exit(1 if failures else 0)
