# NalarNusa RAG Visual Lab · Lesson 23 · Refusal threshold with neural scores (sentence-transformers)
# pip install sentence-transformers numpy
import json
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
C = model.encode(chunks, normalize_embeddings=True)

# @stage questions
answerable = json.load(open("test_set.json", encoding="utf-8"))          # [[question, expected], ...]
unanswerable = ["What is the capital of France?", "How do I renew my passport?", "Who won the 2022 World Cup?"]
# @end

# @stage sweep
def scores(q):
    return C @ model.encode(q, normalize_embeddings=True)

good = [max([0] + [s for s, c in zip(scores(q), chunks) if e.lower() in c.lower()]) for q, e in answerable]
top_un = [scores(q).max() for q in unanswerable]
for th in np.arange(0, 1.0, 0.05):           # neural scores live higher than TF-IDF: sweep further
    right = np.mean([g >= th for g in good]); refused = np.mean([s < th for s in top_un])
    print(f"{th:.2f}  answered right {right:.0%}  refused {refused:.0%}")
# @end

# @stage pick
# Pick for YOUR risk: a clinic or a law office would rather refuse too often than answer wrongly.
# @end
