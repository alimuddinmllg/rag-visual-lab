# NalarNusa RAG Visual Lab · Lesson 13 · BM25 keyword search vs vector search
import math
from rag_from_scratch import parse_document, chunk_document, tokenize, embed_chunks, embed_question, cosine


# @stage tokens
def index(document, lang, stop, size=40, overlap=8):
    _, words = parse_document(document)
    chunks = chunk_document(words, size, min(overlap, size - 6))
    toks = [tokenize(c["text"], stop, lang) for c in chunks]
    return chunks, toks
# @end


# @stage bm25
def bm25_scores(toks, q_tokens, k1=1.2, b=0.75):
    """Rewards rare query words that appear often in a chunk, with diminishing returns (k1)
    and a penalty for long chunks (b)."""
    N = len(toks)
    df = {}
    for ts in toks:
        for t in set(ts):
            df[t] = df.get(t, 0) + 1
    avgdl = sum(len(t) for t in toks) / max(1, N)
    scores = []
    for ts in toks:
        tf = {}
        for t in ts:
            tf[t] = tf.get(t, 0) + 1
        s = 0.0
        for t in dict.fromkeys(q_tokens):
            f = tf.get(t)
            if not f:
                continue
            idf = math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
            s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len(ts) / avgdl))
        scores.append(s)
    return scores
# @end


# @stage vector
def vector_scores(chunks, question, stop, lang):
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    qv, _ = embed_question(question, idf, stop, lang)
    return [cosine(qv, v) if qv else 0.0 for v in vectors]
# @end


# @stage compare
def rank(scores):
    return sorted(range(len(scores)), key=lambda i: (-scores[i], i))
# @end
