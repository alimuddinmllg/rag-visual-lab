# NalarNusa RAG Visual Lab · Lesson 4 · Sentences as points in space
# Two ways to turn text into vectors: TF-IDF (shared words) and a neural model (meaning).
# pip install sentence-transformers numpy   (for the neural part)
import re
import numpy as np


# @stage split
def split_sentences(document, limit=80):
    sentences = []
    for line in document.split("\n"):
        if line.strip() and not line.startswith("## "):
            sentences += [s for s in re.split(r"(?<=[.!?])\s+", line.strip()) if len(s.split()) >= 3]
    return sentences[:limit]
# @end


# @stage vectorize
def tfidf_vectors(texts):
    """Each text becomes a vector with one number per word in the vocabulary."""
    docs = [re.findall(r"[a-z0-9]+", t.lower()) for t in texts]
    vocab = sorted({w for d in docs for w in d})
    idf = {w: np.log((len(docs) + 1) / (sum(w in d for d in docs) + 1)) + 1 for w in vocab}
    X = np.array([[d.count(w) * idf[w] for w in vocab] for d in docs], dtype=float)
    return X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-12)


def neural_vectors(texts):
    """Each text becomes 384 numbers that capture meaning, in 50+ languages."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    return model.encode(texts, normalize_embeddings=True)
# @end


# @stage map
def to_2d(X):
    """PCA: the two directions along which the points spread out the most."""
    Xc = X - X.mean(axis=0)
    _, _, vt = np.linalg.svd(Xc, full_matrices=False)
    return Xc @ vt[:2].T
# @end


# @stage neighbours
def nearest(X, probe_vec, k=3):
    scores = X @ probe_vec                  # cosine similarity (rows have length 1)
    order = np.argsort(-scores)[:k]
    return [(int(i), float(scores[i])) for i in order]
# @end


if __name__ == "__main__":
    doc = open("handbook.txt", encoding="utf-8").read()
    sents = split_sentences(doc)
    probe = "How much does it cost to print something?"
    X = neural_vectors(sents + [probe])
    for i, s in nearest(X[:-1], X[-1]):
        print(f"{s:.2f}  {sents[i]}")
