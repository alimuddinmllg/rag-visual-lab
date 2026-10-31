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

print(f"\n{len(cases) - failures}/{len(cases)} cases match")
sys.exit(1 if failures else 0)
