# NalarNusa RAG Visual Lab · Lesson 23 · Tune the refusal threshold with answerable AND unanswerable questions
import re
from bm25 import index, vector_scores, rank      # lesson 13

THRESHOLDS = [round(i * 0.02, 2) for i in range(31)]     # 0.00 ... 0.60


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


# @stage questions
# answerable: (question, expected phrase) from your test set (lesson 19)
# unanswerable: questions the document cannot answer, e.g. "How do I renew my passport?"
# @end


# @stage sweep
def sweep(chunks, answerable, unanswerable, stop, lang, top_k=3):
    a = []
    for q, e in answerable:
        sc = vector_scores(chunks, q, stop, lang)
        top = rank(sc)[:top_k]
        rel = {i for i, c in enumerate(chunks) if norm(e) in norm(c["text"])}
        a.append((sc[top[0]] if top else 0.0, max([0.0] + [sc[i] for i in top if i in rel])))
    u = []
    for q in unanswerable:
        sc = vector_scores(chunks, q, stop, lang)
        u.append(max(sc) if sc else 0.0)
    curve = []
    for th in THRESHOLDS:
        correct = sum(good >= th for _, good in a) / len(a)      # the right chunk still passes
        refused = sum(s < th for s in u) / len(u)                # nothing passes: "I don't know"
        answered = sum(top >= th for top, _ in a) / len(a)
        curve.append({"th": th, "answered": answered, "correct": correct, "refused": refused, "balanced": (correct + refused) / 2})
    return curve
# @end


# @stage pick
def pick(curve):
    """Best balance; among ties the lowest threshold. Your risk may call for another point."""
    return sorted(curve, key=lambda p: (-p["balanced"], p["th"]))[0]


def demo(document, answerable, unanswerable, lang, stop, top_k=3, threshold=0.1):
    stop = set(stop)
    chunks, _ = index(document, lang, stop)
    curve = sweep(chunks, answerable, unanswerable, stop, lang, top_k)
    for p in curve[::5]:
        print(f"{p['th']:.2f}  answered right {p['correct']:4.0%}   refused {p['refused']:4.0%}")
    best = pick(curve)
    at = next(p for p in curve if abs(p["th"] - threshold) < 1e-9)
    print(f"best balance at {best['th']:.2f}: right {best['correct']:.0%}, refused {best['refused']:.0%}")
    print(f"your threshold {threshold:.2f}: right {at['correct']:.0%}, refused {at['refused']:.0%}")
    return {"best": best["th"], "curve": [[p["correct"], p["refused"]] for p in curve]}
# @end
