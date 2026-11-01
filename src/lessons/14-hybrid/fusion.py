# NalarNusa RAG Visual Lab · Lesson 14 · Hybrid search with reciprocal rank fusion (RRF)
from bm25 import bm25_scores, vector_scores, rank        # lesson 13


# @stage keyword
# keyword_ranking = rank(bm25_scores(toks, q_tokens))
# @end

# @stage vector
# vector_ranking = rank(vector_scores(chunks, question, stop, lang))
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
# @end
