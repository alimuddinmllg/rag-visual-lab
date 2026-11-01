# NalarNusa RAG Visual Lab · Lesson 15 · Re-ranking: a second, more careful look at the top N
# This is the lab's word-level re-ranker. The cross-encoder version is in the "With libraries" tab.
import math
import re
from rag_from_scratch import tokenize                 # lesson 6
from bm25 import index, vector_scores, rank           # lesson 13


# @stage first
def first_stage(chunks, question, stop, lang, n):
    """Fast and rough: TF-IDF over every chunk, keep the top N candidates."""
    scores = vector_scores(chunks, question, stop, lang)
    return [(i, scores[i]) for i in rank(scores)[:n]]
# @end


# @stage pairs
def sentences_of(text):
    return re.split(r"(?<=[.!?])\s+", text)
# @end


# @stage score
def rerank(question, candidates, chunks, toks, stop, lang, k1=1.2):
    """Score each candidate by its best sentence: BM25-weighted word matches,
    and a match inside a short, focused sentence counts more."""
    N, df = len(toks), {}
    for ts in toks:
        for t in set(ts):
            df[t] = df.get(t, 0) + 1
    q = list(dict.fromkeys(tokenize(question, stop, lang)))
    out = []
    for i, _ in candidates:
        best, best_sentence = 0.0, ""
        for s in sentences_of(chunks[i]["text"]):
            st = tokenize(s, stop, lang)
            if not st:
                continue
            sc = 0.0
            for t in q:
                f = st.count(t)
                if f:
                    d = df.get(t, 0)
                    sc += math.log((N - d + 0.5) / (d + 0.5) + 1) * (f * (k1 + 1)) / (f + k1)
            sc /= math.sqrt(max(4, len(re.split(r"\s+", s))) / 12)
            if sc > best:
                best, best_sentence = sc, s
        out.append((i, best, best_sentence))
# @end
# @stage reorder
    return sorted(out, key=lambda x: (-x[1], x[0]))
# @end


# @stage evaluate
def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


def demo(document, question, tests, lang, stop, n=10, size=40):
    stop = set(stop)
    chunks, toks = index(document, lang, stop, size, 0)
    first = first_stage(chunks, question, stop, lang, n)
    again = rerank(question, first, chunks, toks, stop, lang)
    print("first stage:", [i + 1 for i, _ in first[:5]])
    print("re-ranked:  ", [i + 1 for i, _, _ in again[:5]], " best sentence:", again[0][2][:70] if again else "")
    before = after = 0
    for q, e in tests:                                 # never keep a re-ranker you haven't measured
        rel = {i for i, c in enumerate(chunks) if norm(e) in norm(c["text"])}
        f = first_stage(chunks, q, stop, lang, n)
        before += bool(f) and f[0][0] in rel
        r = rerank(q, f, chunks, toks, stop, lang)
        after += bool(r) and r[0][0] in rel
    if tests:
        print(f"hit@1 on {len(tests)} questions: {before / len(tests):.0%} -> {after / len(tests):.0%}")
    return {"first": [i for i, _ in first[:5]], "reranked": [i for i, _, _ in again[:5]],
            "before": before / len(tests) if tests else None, "after": after / len(tests) if tests else None}
# @end
