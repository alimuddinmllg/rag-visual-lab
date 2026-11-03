# NalarNusa RAG Visual Lab · Lesson 30 · An agent with a real LLM: the model decides when to call the search tool
# pip install openai numpy sentence-transformers
# Needs a model that supports tool calling, e.g. Ollama with llama3.1 or qwen2.5, or any hosted OpenAI-compatible API.
import os
import json
import numpy as np
from openai import OpenAI
from sentence_transformers import SentenceTransformer

# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))
MODEL = os.environ.get("LLM_MODEL", "qwen2.5")
MAX_STEPS = 4                                                     # the step budget

# @stage plan
chunks = [p.strip() for p in open("handbook.md", encoding="utf-8").read().split("\n\n") if p.strip()]
emb = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
C = emb.encode(chunks, normalize_embeddings=True)
SYSTEM = ("Answer questions about the lab handbook. Use the search tool for every fact; you may search several times "
          "with different words. Cite the chunk numbers you used. If the handbook doesn't say, answer that it doesn't.")
TOOLS = [{"type": "function", "function": {"name": "search", "description": "Search the lab handbook",
          "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]
# @end


# @stage search
def search(query, k=3):
    q = emb.encode([query], normalize_embeddings=True)[0]
    top = np.argsort(-(C @ q))[:k]
    return "\n\n".join(f"[{i}] {chunks[i]}" for i in top)
# @end


def ask(question):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]
    # @stage loop
    for step in range(MAX_STEPS):
        reply = client.chat.completions.create(model=MODEL, messages=messages, tools=TOOLS).choices[0].message
        if not reply.tool_calls:                                  # the model decided it has enough
            return reply.content
        messages.append(reply)
        for call in reply.tool_calls:
            query = json.loads(call.function.arguments)["query"]
            print(f"step {step + 1}: search({query!r})")
            # @stage check
            messages.append({"role": "tool", "tool_call_id": call.id, "content": search(query)})
            # @end
    # @end
    # @stage answer
    messages.append({"role": "user", "content": "Step budget reached. Answer now with what you found, and say what is missing."})
    return client.chat.completions.create(model=MODEL, messages=messages).choices[0].message.content
    # @end


print(ask("What is the penalty for late returns, and what is the Wi-Fi password?"))
