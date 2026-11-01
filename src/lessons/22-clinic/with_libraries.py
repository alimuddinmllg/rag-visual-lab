# NalarNusa RAG Visual Lab · Lesson 22 · Log every stage with Langfuse-style tracing (here: plain logging)
# Production tools (Langfuse, Phoenix, LangSmith) record the same things; the habit matters more than the tool.
import json
import logging
import time

logging.basicConfig(filename="rag_trace.jsonl", level=logging.INFO, format="%(message)s")


def trace(stage, **data):
    logging.info(json.dumps({"t": time.time(), "stage": stage, **data}, ensure_ascii=False))


# @stage observe
def rag(question, retriever, llm, top_k=3, min_sim=0.1):
    hits = retriever(question, k=top_k)                               # [(chunk_id, score, text)]
    trace("retrieve", question=question, hits=[(i, round(s, 3)) for i, s, _ in hits])
# @end
# @stage inspect
    used = [h for h in hits if h[1] >= min_sim]
    trace("filter", kept=[h[0] for h in used], dropped=[h[0] for h in hits if h not in used])
    prompt = "\n\n".join(f"[{n}] {t}" for n, (_, _, t) in enumerate(used, 1)) + f"\n\nQuestion: {question}"
    answer = llm(prompt)
    trace("generate", prompt_chars=len(prompt), answer=answer)
    return answer
# @end

# @stage diagnose
# Read rag_trace.jsonl for a wrong answer: was the expected text in "hits"? in "kept"? in the prompt?
# @end

# @stage fix
# @end

# @stage verify
# Try it with stand-ins, then plug in your real retriever and LLM.
fake_retriever = lambda q, k: [(7, 0.52, "Saturday from 10:00 to 16:00."), (3, 0.08, "Wear safety glasses.")][:k]
fake_llm = lambda prompt: "The lab is open on Saturday from 10:00 to 16:00 [1]."
print(rag("When is the lab open on Saturday?", fake_retriever, fake_llm))
print(open("rag_trace.jsonl", encoding="utf-8").read())
# Re-run the whole test set after each fix and compare the scores (lesson 20).
# @end
