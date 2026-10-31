# NalarNusa RAG Visual Lab · Lesson 6 · The same pipeline with common libraries
# pip install sentence-transformers numpy ollama
# Runs on your own computer, no paid API: the answer comes from a local model via Ollama.
import re
import numpy as np
from sentence_transformers import SentenceTransformer
import ollama

DOCUMENT = open("handbook.txt", encoding="utf-8").read()
QUESTION = "How much does PLA printing cost?"
CHUNK_SIZE, OVERLAP, TOP_K, MIN_SIM = 40, 8, 3, 0.3


# @stage chunk
def chunk_words(text, size, overlap):
    words = re.sub(r"^## .*$", "", text, flags=re.M).split()
    step = max(5, size - overlap)
    return [" ".join(words[i:i + size]) for i in range(0, len(words), step)
            if i == 0 or i + overlap < len(words)]

chunks = chunk_words(DOCUMENT, CHUNK_SIZE, OVERLAP)
# @end

# @stage embed
# A neural model that understands meaning in 50+ languages, including Indonesian.
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
chunk_vectors = model.encode(chunks, normalize_embeddings=True)   # shape: (n_chunks, 384)
# @end

# @stage query
query_vector = model.encode([QUESTION], normalize_embeddings=True)[0]
# @end

# @stage retrieve
scores = chunk_vectors @ query_vector          # cosine similarity (vectors have length 1)
top = np.argsort(-scores)[:TOP_K]
used = [i for i in top if scores[i] >= MIN_SIM]
for rank, i in enumerate(top, 1):
    print(f"{rank}. chunk #{i + 1}  score={scores[i]:.2f}")
# @end

# @stage generate
context = "\n\n".join(f"[{r + 1}] {chunks[i]}" for r, i in enumerate(used))
prompt = (
    "Answer ONLY using the context below and cite sources like [1].\n"
    "If the answer is not in the context, say you don't know.\n\n"
    f"Context:\n{context or '(no relevant chunks found)'}\n\n"
    f"Question: {QUESTION}\nAnswer:"
)
reply = ollama.chat(model="llama3.2", messages=[{"role": "user", "content": prompt}])
print(reply["message"]["content"])
# @end
