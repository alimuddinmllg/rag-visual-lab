# NalarNusa RAG Visual Lab · Lesson 2 · Closed book vs open book, with a real LLM
# pip install openai sentence-transformers
# Works with any OpenAI-compatible server. For Ollama:  ollama pull qwen2.5:7b-instruct
from openai import OpenAI
from sentence_transformers import SentenceTransformer, util

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL = "qwen2.5:7b-instruct"
QUESTION = "How much does PLA printing cost in the NusaBot Robotics Lab?"


def ask(messages):
    r = client.chat.completions.create(model=MODEL, messages=messages, temperature=0)
    return r.choices[0].message.content


# @stage closed
closed = ask([{"role": "user", "content": QUESTION}])          # memory only
print("Closed book:", closed)
# @end

# @stage retrieve
handbook = open("nusabot_handbook.txt", encoding="utf-8").read()
passages = [p.strip() for p in handbook.split("\n\n") if p.strip()]
embedder = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
scores = util.cos_sim(embedder.encode(QUESTION), embedder.encode(passages))[0]
best = passages[int(scores.argmax())]
# @end

# @stage open
open_book = ask([
    {"role": "system", "content": "Answer ONLY from the context. If it is not there, say you don't know."},
    {"role": "user", "content": f"Context:\n{best}\n\nQuestion: {QUESTION}"},
])
print("Open book:  ", open_book)
# @end
