# NalarNusa RAG Visual Lab · Lesson 17 · Small-to-big retrieval
# Search small (sentences) for precision, answer big (their surrounding passage) for context.
import math
import re
from rag_from_scratch import embed_chunks, tokenize, vectorize, cosine     # lesson 6
from bm25 import index, vector_scores, rank                                 # lesson 13

tokens = lambda t: math.floor(len(re.split(r"\s+", t)) * 1.33 + 0.5)


# @stage small
def sentence_index(document, stop, lang):
    sents, sec = [], -1
    for line in document.split("\n"):
        t = line.strip()
        if not t:
            continue
        if t.startswith("## "):
            sec += 1
            continue
        sents += [{"text": s, "sec": max(0, sec)} for s in re.split(r"(?<=[.!?])\s+", t) if s]
    idf, _, vectors = embed_chunks(sents, stop, lang)          # one TF-IDF vector per SENTENCE
    return sents, idf, vectors


def search_sentences(question, idf, vectors, stop, lang):
    qv = vectorize(tokenize(question, stop, lang), idf)
    return rank([cosine(qv, v) if qv else 0.0 for v in vectors])
# @end


# @stage expand
def parent(sents, i, window):
    """The matched sentence plus `window` sentences each side, inside its section (4 = whole section)."""
    same = [j for j, s in enumerate(sents) if s["sec"] == sents[i]["sec"]]
    pos = same.index(i)
    return same if window >= 4 else same[max(0, pos - window): pos + window + 1]
# @end


# @stage compare
def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


def demo(document, question, tests, lang, stop, window=1, top_k=2):
    stop = set(stop)
    sents, idf, vectors = sentence_index(document, stop, lang)
    top = search_sentences(question, idf, vectors, stop, lang)[:top_k]
    for i in top:
        ids = parent(sents, i, window)
        print(f"match: {sents[i]['text'][:60]}…  -> parent of {len(ids)} sentences, {tokens(' '.join(sents[j]['text'] for j in ids))} tokens")
    if not tests:
        return {"top": top, "rates": None}
    big_chunks, _ = index(document, lang, stop, 80, 0)          # 80-word chunks, for comparison
    r = {"small": 0, "big": 0, "s2b": 0}
    t = {"small": 0, "big": 0, "s2b": 0}
    for q, e in tests:
        hit = search_sentences(q, idf, vectors, stop, lang)[:top_k]
        texts = {
            "small": " ".join(sents[i]["text"] for i in hit),
            "s2b": " ".join(sents[j]["text"] for j in dict.fromkeys(j for i in hit for j in parent(sents, i, window))),
            "big": " ".join(big_chunks[i]["text"] for i in rank(vector_scores(big_chunks, q, stop, lang))[:top_k]),
        }
        for k, txt in texts.items():
            r[k] += norm(e) in norm(txt)
            t[k] += tokens(txt)
    n = len(tests)
    for k in r:
        print(f"{k:6s} answer in context {r[k] / n:4.0%}   ~{t[k] / n:4.0f} tokens")
    return {"top": top, "rates": {k: v / n for k, v in r.items()}, "tokens": {k: v / n for k, v in t.items()}}
# @end
