# NalarNusa RAG Visual Lab · Lesson 27 · Measure a real pipeline: milliseconds per step, real token counts, cost per query
# pip install openai tiktoken sentence-transformers numpy
# Works with any OpenAI-compatible endpoint, e.g. Ollama: base_url="http://localhost:11434/v1", api_key="ollama"
import os
import time
import numpy as np
import tiktoken
from openai import OpenAI
from sentence_transformers import SentenceTransformer

PRICE = {"in": 0.15, "out": 0.60}            # USD per million tokens: put YOUR provider's prices here
# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))
MODEL = os.environ.get("LLM_MODEL", "llama3.2")
enc = tiktoken.get_encoding("cl100k_base")    # close enough for budgeting; use the model's own tokenizer if you have it
timings = {}


class timer:
    def __init__(self, name): self.name = name
    def __enter__(self): self.t = time.perf_counter()
    def __exit__(self, *a): timings[self.name] = (time.perf_counter() - self.t) * 1000


# @stage retrieve
chunks = [p.strip() for p in open("handbook.md", encoding="utf-8").read().split("\n\n") if p.strip()]
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
C = model.encode(chunks, normalize_embeddings=True)
question = "How much does PLA printing cost?"
with timer("embed"):
    q = model.encode([question], normalize_embeddings=True)[0]
with timer("search"):
    top = np.argsort(-(C @ q))[:4]
# @end

# @stage prompt
prompt = "Answer only from the context and cite [n].\n\n" + "\n\n".join(f"[{r + 1}] {chunks[i]}" for r, i in enumerate(top)) + f"\n\nQuestion: {question}\nAnswer:"
n_in = len(enc.encode(prompt))
# @end

# @stage latency
start = time.perf_counter(); first = None; answer = ""
stream = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": prompt}], stream=True, max_tokens=250)
for part in stream:
    delta = part.choices[0].delta.content or ""
    if delta and first is None:
        first = time.perf_counter()
    answer += delta
end = time.perf_counter()
timings["first token"] = (first - start) * 1000 if first else 0
timings["generate"] = (end - (first or start)) * 1000
# @end

# @stage cost
n_out = len(enc.encode(answer))
usd = n_in * PRICE["in"] / 1e6 + n_out * PRICE["out"] / 1e6
# @end

# @stage budget
for name, ms in timings.items():
    print(f"{name:12s} {ms:8.1f} ms")
print(f"total {sum(timings.values()):.0f} ms; {n_in} tokens in, {n_out} out; ${usd:.6f} per query, ${usd * 1000 * 30:.2f} per month at 1,000/day")
# @end
