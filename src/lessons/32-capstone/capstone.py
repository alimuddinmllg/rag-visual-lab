# NalarNusa RAG Visual Lab · Lesson 32 · Capstone: your own RAG, end to end, with an evaluation report
# Everything here comes from earlier lessons. Download this as a notebook: it carries your document and test set.
from rag_from_scratch import parse_document, embed_chunks, embed_question, cosine, tokenize, extract_answer   # lesson 6
from bm25 import index, bm25_scores, vector_scores, rank                                                     # lesson 13
from fusion import rrf                                                                                        # lesson 14
from metrics import relevant_for, metrics_at                                                                  # lesson 20


# @stage load
def load(document):
    sections, words = parse_document(document)
    return len(sections), len(words)
# @end


# @stage chunk
def chunk(document, size, lang, stop):
    return index(document, lang, stop, size, 8)          # chunks and their tokens
# @end


# @stage index
def build(chunks, stop, lang):
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    return idf, vectors


def ranking(question, retriever, chunks, toks, stop, lang):
    v = rank(vector_scores(chunks, question, stop, lang))
    if retriever == "tfidf":
        return v
    b = rank(bm25_scores(toks, tokenize(question, stop, lang)))
    return b if retriever == "bm25" else rrf([b, v])
# @end


# @stage evaluate
def evaluate(tests, retriever, k, chunks, toks, stop, lang):
    """Your test set from lesson 19: hit rate, MRR and nDCG at k, plus which questions missed."""
    per = []
    for q, expected in tests:
        m = metrics_at(ranking(q, retriever, chunks, toks, stop, lang), relevant_for(chunks, expected), k)
        per.append({"q": q, "hit": m["precision"] > 0, "rr": m["rr"], "ndcg": m["ndcg"]})
    n = max(1, len(per))
    return {"hit": sum(p["hit"] for p in per) / n, "mrr": sum(p["rr"] for p in per) / n, "ndcg": sum(p["ndcg"] for p in per) / n, "per": per}
# @end


# @stage answer
def answer(question, retriever, k, min_sim, chunks, toks, idf, vectors, stop, lang):
    """Rank with your retriever, refuse when even the best chunk is too far from the question (lesson 23)."""
    qv, known = embed_question(question, idf, stop, lang)
    cos = [cosine(qv, v) if qv else 0.0 for v in vectors]
    top = ranking(question, retriever, chunks, toks, stop, lang)[:k]
    used = [(i, cos[i]) for i in top if cos[i] >= min_sim and known]
    return used, extract_answer(used, chunks, known, idf, stop, lang)
# @end


# @stage report
def demo(document, tests, question, retriever, size, k, min_sim, lang, stop):
    stop = set(stop)
    n_sections, n_words = load(document)
    chunks, toks = chunk(document, size, lang, stop)
    idf, vectors = build(chunks, stop, lang)
    ev = evaluate(tests, retriever, k, chunks, toks, stop, lang) if tests else None
    used, text = answer(question, retriever, k, min_sim, chunks, toks, idf, vectors, stop, lang)
    print(f"# RAG report\n{n_words} words, {n_sections} sections, {len(chunks)} chunks of {size} words, {len(idf)} terms")
    print(f"retriever {retriever}, top-k {k}, refuse below cosine {min_sim}")
    if ev:
        print(f"hit@{k} {ev['hit']:.0%}   MRR {ev['mrr']:.2f}   nDCG@{k} {ev['ndcg']:.2f}   on {len(tests)} test questions")
        for p in ev["per"]:
            if not p["hit"]:
                print("  missed:", p["q"])
    print(f"\nQ: {question}\nA: {text}")
    return {"chunks": len(chunks), "terms": len(idf), "eval": ev, "used": [i for i, _ in used], "answer": text}
# @end
