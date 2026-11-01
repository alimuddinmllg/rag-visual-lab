# NalarNusa RAG Visual Lab · Lesson 8 · Four ways to chunk a document
# Sizes are counted in words. Uses tokenize/vectorize/embed_chunks/cosine from lesson 6.
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, cosine


def sentences_of(text):
    out, sec = [], -1
    for line in text.split("\n"):
        t = line.strip()
        if not t:
            continue
        if t.startswith("## "):
            sec += 1
            continue
        for s in re.split(r"(?<=[.!?])\s+", t):
            if s:
                out.append({"text": s, "words": len(s.split()), "sec": max(0, sec)})
    return out


def pack(sents, size):
    """Greedily fill chunks with whole sentences up to `size` words."""
    out, cur, n = [], [], 0
    def flush():
        nonlocal cur, n
        if cur:
            out.append({"text": " ".join(s["text"] for s in cur), "words": n, "sec": cur[0]["sec"]})
            cur, n = [], 0
    for s in sents:
        if s["words"] > size:                       # one long sentence: cut into fixed pieces
            flush()
            w = s["text"].split()
            for i in range(0, len(w), size):
                out.append({"text": " ".join(w[i:i + size]), "words": min(size, len(w) - i), "sec": s["sec"]})
            continue
        if n + s["words"] > size:
            flush()
        cur.append(s); n += s["words"]
    flush()
    return out


# @stage fixed
def fixed_chunks(text, size):
    """Every `size` words, no matter where sentences end."""
    _, words = parse_document(text)
    return [{"text": c["text"], "sec": c["sec"]} for c in chunk_document(words, size, 0)]
# @end


# @stage sentence
def sentence_chunks(text, size):
    """Never cut a sentence: pack whole sentences."""
    return pack(sentences_of(text), size)
# @end


# @stage recursive
def recursive_chunks(text, size):
    """Try the biggest natural unit first: whole section, then sentences, then fixed pieces."""
    sents, out = sentences_of(text), []
    for sec in dict.fromkeys(s["sec"] for s in sents):
        ss = [s for s in sents if s["sec"] == sec]
        n = sum(s["words"] for s in ss)
        if n <= size:
            out.append({"text": " ".join(s["text"] for s in ss), "words": n, "sec": sec})
        else:
            out.extend(pack(ss, size))
    return out
# @end


# @stage semantic
def semantic_chunks(text, size, threshold, lang, stop):
    """Start a new chunk where the topic changes: next sentence too different from the last."""
    sents = sentences_of(text)
    _, _, vectors = embed_chunks(sents, stop, lang)
    out, cur, n = [], [], 0
    for i, s in enumerate(sents):
        sim = cosine(vectors[i - 1], vectors[i]) if i else 1.0
        if cur and (sim < threshold or n + s["words"] > size):
            out.append({"text": " ".join(x["text"] for x in cur), "words": n, "sec": cur[0]["sec"]})
            cur, n = [], 0
        cur.append(s); n += s["words"]
    if cur:
        out.append({"text": " ".join(x["text"] for x in cur), "words": n, "sec": cur[0]["sec"]})
    return out
# @end
