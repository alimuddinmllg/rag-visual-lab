# NalarNusa RAG Visual Lab · Lesson 20 · Retrieval metrics
import math
from rag_from_scratch import tokenize               # lesson 6
from bm25 import index, bm25_scores, vector_scores, rank   # lesson 13
from fusion import rrf                              # lesson 14


# @stage relevant
def relevant_for(chunks, expected):
    """A chunk is relevant if it contains the expected answer phrase."""
    import re
    norm = lambda s: " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "
    return {i for i, c in enumerate(chunks) if norm(expected) in norm(c["text"])}
# @end


# @stage scores
def metrics_at(ranking, relevant, k):
    top = ranking[:k]
    hits = sum(i in relevant for i in top)
# @end
# @stage recall
    recall = hits / len(relevant) if relevant else 0.0          # how much of the answer did we find?
    precision = hits / k                                         # how much of what we found is useful?
# @end
# @stage mrr
    first = next((p for p, i in enumerate(ranking) if i in relevant), None)
    rr = 1 / (first + 1) if first is not None else 0.0          # how high is the first good result?
# @end
# @stage ndcg
    dcg = sum(1 / math.log2(p + 2) for p, i in enumerate(top) if i in relevant)
    idcg = sum(1 / math.log2(p + 2) for p in range(min(len(relevant), k)))
    ndcg = dcg / idcg if idcg else 0.0                           # are good results near the top?
    return {"recall": recall, "precision": precision, "rr": rr, "ndcg": ndcg}
# @end


def demo(document, tests, retriever, k, size, lang, stop):
    """Score a retriever on a test set (lesson 19). Retrievers come from lessons 6, 13 and 14."""
    stop = set(stop)
    chunks, toks = index(document, lang, stop, size, 8)                     # lesson 13
    per = []
    for q, expected in tests:
        v = rank(vector_scores(chunks, q, stop, lang))
        b = rank(bm25_scores(toks, tokenize(q, stop, lang)))
        ranking = {"tfidf": v, "bm25": b}.get(retriever) or rrf([b, v])      # hybrid: lesson 14
        per.append(metrics_at(ranking, relevant_for(chunks, expected), k))
    avg = {m: sum(p[m] for p in per) / max(1, len(per)) for m in ("recall", "precision", "rr", "ndcg")}
    print(f"{retriever}, k={k}, {len(tests)} questions")
    print(f"recall@{k} {avg['recall']:.2f}   precision@{k} {avg['precision']:.2f}   MRR {avg['rr']:.2f}   nDCG@{k} {avg['ndcg']:.2f}")
    return avg
