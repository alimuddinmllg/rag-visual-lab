# NalarNusa RAG Visual Lab · Lesson 4 · Sentences as points in space
# TF-IDF vectors from lesson 6 (shared words). The neural version is in the "With libraries" tab.
import re
from rag_from_scratch import embed_chunks, tokenize, vectorize, cosine, pca_2d   # lesson 6


# @stage split
def split_sentences(document, limit=80):
    """Every sentence with at least 3 words becomes one point; remember its section."""
    out, sec, seen = [], 0, 0
    for line in document.split("\n"):
        t = line.strip()
        if not t:
            continue
        if t.startswith("## "):
            sec, seen = seen, seen + 1
            continue
        for s in re.split(r"(?<=[.!?])\s+", t):
            if len(s.split()) >= 3:
                out.append({"text": s, "sec": max(0, sec)})
    return out[:limit]
# @end


# @stage vectorize
def sentence_vectors(sentences, stop, lang):
    """One TF-IDF vector per sentence: one dimension per word in the vocabulary."""
    idf, vocab, vectors = embed_chunks(sentences, stop, lang)
    return idf, vocab, vectors
# @end


# @stage map
def to_2d(vectors, vocab):
    """PCA: keep the two directions along which the points spread out the most."""
    coords, mean, axes, _ = pca_2d(vectors, vocab)
    return coords
# @end


# @stage neighbours
def nearest(probe, sentences, idf, vectors, stop, lang, k=3):
    qv = vectorize(tokenize(probe, stop, lang), idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    order = sorted(range(len(scores)), key=lambda i: -scores[i])[:k]
    return [(i, scores[i]) for i in order]


def demo(document, probe, lang, stop, k=3):
    stop = set(stop)
    sentences = split_sentences(document)
    idf, vocab, vectors = sentence_vectors(sentences, stop, lang)
    coords = to_2d(vectors, vocab)
    print(f"{len(sentences)} sentences -> {len(vocab)} dimensions -> 2D map")
    top = nearest(probe, sentences, idf, vectors, stop, lang, k)
    for i, s in top:
        print(f"#{i + 1}  {s:.2f}  {sentences[i]['text']}")
    if not top or top[0][1] == 0:
        print("No shared words: TF-IDF cannot place this sentence. Try the neural model.")
    return {"top": [[i, s] for i, s in top], "n": len(sentences)}
# @end


if __name__ == "__main__":
    import json
    doc = open("nusabot_handbook.txt", encoding="utf-8").read()
    stop = json.load(open("stopwords.json", encoding="utf-8"))["en"]
    demo(doc, "What is the price of printing?", "en", stop)
