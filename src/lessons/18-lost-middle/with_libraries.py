# NalarNusa RAG Visual Lab · Lesson 18 · Position test with a real LLM, and LLM-based compression
# pip install openai
import os
from openai import OpenAI

# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))   # any OpenAI-compatible server
MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct")
llm = lambda prompt: client.chat.completions.create(
    model=MODEL, messages=[{"role": "user", "content": prompt}], temperature=0, max_tokens=80).choices[0].message.content

chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
question, expected = "When does the lab close during exam weeks?", "18:00"

# @stage retrieve
answer_chunk = next(i for i, c in enumerate(chunks) if expected in c)
distractors = [i for i in range(len(chunks)) if i != answer_chunk][:9]
# @end

# @stage compress
def compress(passage, question):
    """Ask the model to keep only what helps answer. Cheaper prompts later, one extra call now."""
    return llm(f"Copy only the sentences from the passage that help answer the question. Copy them exactly.\n"
               f"Question: {question}\nPassage: {passage}")
# @end

# @stage measure
for p in range(10):                                       # answer passage at position 1..10
    order = distractors[:p] + [answer_chunk] + distractors[p:]
    ctx = "\n\n".join(f"[{k + 1}] {chunks[i]}" for k, i in enumerate(order))
    a = llm(f"Answer using only the numbered passages.\n\n{ctx}\n\nQuestion: {question}\nAnswer briefly:")
    print(p + 1, "✓" if expected in a else "✗", a[:60])
# @end
