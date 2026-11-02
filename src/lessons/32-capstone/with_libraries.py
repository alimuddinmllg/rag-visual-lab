# NalarNusa RAG Visual Lab · Lesson 32 · Your RAG with production libraries: neural embeddings, BM25, fusion, evaluation, an LLM
# pip install sentence-transformers rank-bm25 numpy openai
# Put your document in my_document.txt and your test set (from lesson 19) in my_tests.json: [["question", "phrase"], ...]
import json
import re
import numpy as np
from openai import OpenAI
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

SIZE, K, MIN_SIM = 60, 3, 0.35          # neural cosine scores run higher than TF-IDF: re-tune the threshold
llm = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")    # or any OpenAI-compatible service
MODEL = "llama3.2"

# @stage load
text = open("my_document.txt", encoding="utf-8").read()
tests = json.load(open("my_tests.json", encoding="utf-8"))
# @end

# @stage chunk
words = text.split()
chunks = [" ".join(words[i:i + SIZE]) for i in range(0, len(words), SIZE - 8)]
# @end

# @stage index
emb = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
C = emb.encode(chunks, normalize_embeddings=True)
bm25 = BM25Okapi([re.findall(r"\w+", c.lower()) for c in chunks])


def search(q, k=K):
    qv = emb.encode([q], normalize_embeddings=True)[0]
    cos = C @ qv
    v = list(np.argsort(-cos))
    b = list(np.argsort(-bm25.get_scores(re.findall(r"\w+", q.lower()))))
    fused = {}
    for ranking in (b, v):                                          # reciprocal rank fusion (lesson 14)
        for pos, i in enumerate(ranking[:20]):
            fused[i] = fused.get(i, 0) + 1 / (60 + pos + 1)
    return sorted(fused, key=lambda i: -fused[i])[:k], cos
# @end

# @stage evaluate
norm = lambda s: " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "
hits = [any(norm(e) in norm(chunks[i]) for i in search(q)[0]) for q, e in tests]
print(f"hit@{K}: {np.mean(hits):.0%} on {len(tests)} questions")
for (q, _), h in zip(tests, hits):
    if not h:
        print("  missed:", q)
# @end


# @stage answer
def ask(q):
    top, cos = search(q)
    used = [i for i in top if cos[i] >= MIN_SIM]
    if not used:
        return "I don't know. The document doesn't cover this."
    ctx = "\n\n".join(f"[{r + 1}] {chunks[i]}" for r, i in enumerate(used))
    prompt = f"Answer ONLY from the context and cite like [1]. If it isn't there, say you don't know.\n\n{ctx}\n\nQuestion: {q}\nAnswer:"
    return llm.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": prompt}]).choices[0].message.content
# @end


# @stage report
for q, _ in tests[:3]:
    print("\nQ:", q, "\nA:", ask(q))
# @end
