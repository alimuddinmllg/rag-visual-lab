# NalarNusa RAG Visual Lab · Lesson 14 · Hybrid search with reciprocal rank fusion (RRF)
import re
from rag_from_scratch import tokenize                           # lesson 6
from bm25 import index, bm25_scores, vector_scores, rank        # lesson 13


# @stage keyword
def keyword_ranking(chunks, toks, question, stop, lang):
    return rank(bm25_scores(toks, tokenize(question, stop, lang)))
# @end


# @stage vector
def vector_ranking(chunks, question, stop, lang):
    return rank(vector_scores(chunks, question, stop, lang))
# @end


# @stage fuse
def rrf(rankings, k=60, depth=20):
    """Each list votes 1 / (k + rank) for its items. Agreement between lists wins;
    raw scores are ignored, so BM25 and cosine never need to be on the same scale."""
    score = {}
    for r in rankings:
        for pos, i in enumerate(r[:depth]):
            score[i] = score.get(i, 0.0) + 1 / (k + pos + 1)
    return sorted(score, key=lambda i: (-score[i], i))
# @end


# @stage evaluate
def hit_rate(rankings_per_question, relevant_per_question, k):
    hits = sum(any(i in rel for i in r[:k]) for r, rel in zip(rankings_per_question, relevant_per_question))
    return hits / len(relevant_per_question)


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


def demo(document, question, tests, lang, stop, rrf_k=60, k=1):
    stop = set(stop)
    chunks, toks = index(document, lang, stop)
    kw, vec = keyword_ranking(chunks, toks, question, stop, lang), vector_ranking(chunks, question, stop, lang)
    fused = rrf([kw, vec], rrf_k)
    print("keyword:", [i + 1 for i in kw[:5]], " vector:", [i + 1 for i in vec[:5]], " fused:", [i + 1 for i in fused[:5]])
    if not tests:
        print("No test set for this document: build one in lesson 19.")
        return {"fused": fused[:5], "rates": None}
    rel = [{i for i, c in enumerate(chunks) if norm(e) in norm(c["text"])} for _, e in tests]
    runs = {"bm25": [], "vector": [], "hybrid": []}
    for q, _ in tests:
        b, v = keyword_ranking(chunks, toks, q, stop, lang), vector_ranking(chunks, q, stop, lang)
        runs["bm25"].append(b); runs["vector"].append(v); runs["hybrid"].append(rrf([b, v], rrf_k))
    rates = {name: hit_rate(rs, rel, k) for name, rs in runs.items()}
    print(f"hit@{k} over {len(tests)} questions:", "  ".join(f"{n} {r:.0%}" for n, r in rates.items()))
    return {"fused": fused[:5], "rates": rates}
# @end
