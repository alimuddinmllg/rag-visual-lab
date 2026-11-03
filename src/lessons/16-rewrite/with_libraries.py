# NalarNusa RAG Visual Lab · Lesson 16 · Multi-query and HyDE with a real LLM
# pip install openai sentence-transformers
import os
from openai import OpenAI
from sentence_transformers import SentenceTransformer, util

# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))   # any OpenAI-compatible server
MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct")
llm = lambda prompt: client.chat.completions.create(
    model=MODEL, messages=[{"role": "user", "content": prompt}], temperature=0.3).choices[0].message.content

chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
emb = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
C = emb.encode(chunks, normalize_embeddings=True)
search = lambda q: [h["corpus_id"] for h in util.semantic_search(emb.encode(q, normalize_embeddings=True), C, top_k=10)[0]]
question = "What is the fee to join as a student?"

# @stage original
ranking = search(question)
# @end

# @stage multi
variants = llm(f"Rewrite this question 3 ways using formal handbook wording, one per line:\n{question}").splitlines()
rankings = [search(v) for v in [question] + [v for v in variants if v.strip()]]
score = {}
for r in rankings:                                   # reciprocal rank fusion (lesson 14)
    for pos, i in enumerate(r):
        score[i] = score.get(i, 0) + 1 / (60 + pos + 1)
fused = sorted(score, key=lambda i: -score[i])
# @end

# @stage hyde
fake_answer = llm(f"Write two sentences from a lab handbook that answer: {question}")   # facts may be wrong
hyde = search(fake_answer)
# @end

# @stage evaluate
print("original", ranking[:3], " multi-query", fused[:3], " HyDE", hyde[:3])
# Measure hit@k of all three on questions phrased the way your users talk.
# @end
