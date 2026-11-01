# NalarNusa RAG Visual Lab · Lesson 12 · Prompt assembly with real token counts and a chat API
# pip install openai tiktoken
import tiktoken
from openai import OpenAI

enc = tiktoken.get_encoding("cl100k_base")
tokens = lambda s: len(enc.encode(s))
SYSTEM = ("Answer ONLY using the numbered sources and cite them like [1]. "
          "If the answer is not in the sources, say you don't know.")

# @stage retrieve
question = "How much does PLA printing cost?"
top = search(question, k=5)          # [(text, score)], from your retriever (lesson 6, 13 or 14)
# @end

# @stage order
ordered = top[0::2] + top[1::2][::-1]             # "edges": strongest at the start and the end
# @end

# @stage budget
room = 4096 - tokens(SYSTEM) - tokens(question) - 500  # 500 tokens reserved for the answer
kept = []
for text, score in ordered:
    if tokens(text) <= room:
        kept.append(text); room -= tokens(text)
# @end

# @stage assemble
sources = "\n\n".join(f"[{n}] {t}" for n, t in enumerate(kept, 1))
messages = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Sources:\n{sources}\n\nQuestion: {question}"}]
# @end

# @stage cite
client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")   # any OpenAI-compatible server
print(client.chat.completions.create(model="qwen2.5:7b-instruct", messages=messages, max_tokens=500).choices[0].message.content)
# @end
