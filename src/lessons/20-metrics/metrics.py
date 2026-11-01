# NalarNusa RAG Visual Lab · Lesson 20 · Retrieval metrics
import math


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
