# NalarNusa RAG Visual Lab · Lesson 6 · The same pipeline with common libraries
# pip install sentence-transformers numpy openai
# No paid API: the answer comes from Ollama on your computer, or from the lab's free model when this runs in Colab.
import os
import re
import numpy as np
from sentence_transformers import SentenceTransformer
from openai import OpenAI

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
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))
reply = client.chat.completions.create(model=os.environ.get("LLM_MODEL", "llama3.2"), messages=[{"role": "user", "content": prompt}])
print(reply.choices[0].message.content)
# @end
