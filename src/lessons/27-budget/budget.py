# NalarNusa RAG Visual Lab · Lesson 27 · Cost and latency budgets: where the milliseconds and the money go
# The numbers in MODELS and STEPS are examples. Replace them with your own measurements and your provider's prices.
import math
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, embed_question, retrieve, build_prompt   # lesson 6

STEPS = {"embed_ms": 20, "search_ms": 5, "rerank_ms_per_doc": 10, "cache_ms": 2, "embed_usd_per_m": 0.02}
MODELS = {   # time to first token (ms), ms per prompt token, ms per generated token, USD per million tokens in/out
    "small": {"ttft": 200, "prefill": 0.15, "gen": 12, "usd_in": 0.15, "usd_out": 0.60},
    "large": {"ttft": 400, "prefill": 0.5, "gen": 35, "usd_in": 3.0, "usd_out": 15.0},
}


def count_tokens(text):
    """Rough: 1 word ≈ 1.33 tokens (lesson 12)."""
    return math.floor(len(re.split(r"\s+", text)) * 1.33 + 0.5)


# @stage retrieve
def index(document, size, lang, stop):
    sections, words = parse_document(document)
    chunks = chunk_document(words, size, 8)
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    return sections, chunks, idf, vectors


def hit_rate(tests, chunks, idf, vectors, top_k, lang, stop):
    """Quality guard: share of test questions with a relevant chunk in the top k."""
    norm = lambda s: " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "
    hits = 0
    for q, expected in tests:
        qv, _ = embed_question(q, idf, stop, lang)
        _, top = retrieve(qv, vectors, top_k)
        hits += any(norm(expected) in norm(chunks[i]["text"]) for i, _ in top)
    return hits / len(tests)
# @end


# @stage prompt
def tokens(question, chunks, sections, idf, vectors, top_k, answer_tokens, lang, stop):
    qv, _ = embed_question(question, idf, stop, lang)
    _, top = retrieve(qv, vectors, top_k)
    prompt = build_prompt(question, top, chunks, sections, lang)
    return {"query": count_tokens(question), "prompt": count_tokens(prompt), "answer": answer_tokens}
# @end


# @stage latency
def waterfall(tok, top_k, rerank, model):
    """Each step starts when the previous one ends. Returns [(step, start_ms, ms)]."""
    m = MODELS[model]
    steps = [("embed", STEPS["embed_ms"]), ("search", STEPS["search_ms"])]
    if rerank:
        steps.append(("rerank", STEPS["rerank_ms_per_doc"] * top_k * 3))      # re-rank 3x more candidates than you keep
    steps += [("first token", m["ttft"] + m["prefill"] * tok["prompt"]), ("generate", m["gen"] * tok["answer"])]
    out, t = [], 0.0
    for name, ms in steps:
        out.append((name, t, ms))
        t += ms
    return out, t
# @end


# @stage cost
def cost(tok, model, cache_rate, per_day):
    """Per query and per 30-day month. A cache hit only pays for embedding the question."""
    m = MODELS[model]
    embed = tok["query"] * STEPS["embed_usd_per_m"] / 1e6
    miss = embed + tok["prompt"] * m["usd_in"] / 1e6 + tok["answer"] * m["usd_out"] / 1e6
    avg = (1 - cache_rate) * miss + cache_rate * embed
    return miss, avg, avg * per_day * 30
# @end


# @stage budget
def demo(document, tests, question, size, top_k, rerank, model, answer_tokens, cache_rate, per_day, budget_ms, budget_usd, lang, stop):
    stop = set(stop)
    sections, chunks, idf, vectors = index(document, size, lang, stop)
    hit = hit_rate(tests, chunks, idf, vectors, top_k, lang, stop)
    tok = tokens(question, chunks, sections, idf, vectors, top_k, answer_tokens, lang, stop)
    steps, total = waterfall(tok, top_k, rerank, model)
    hit_ms = STEPS["embed_ms"] + STEPS["cache_ms"]
    miss, avg, month = cost(tok, model, cache_rate, per_day)
    ok = {"latency": total <= budget_ms, "cost": month <= budget_usd, "quality": hit >= 0.8}
    for name, start, ms in steps:
        print(f"{name:12s} {start:7.0f} +{ms:7.1f} ms")
    print(f"total {total:.0f} ms on a cache miss, {hit_ms} ms on a hit; prompt {tok['prompt']} tokens")
    print(f"${miss:.6f} per uncached query, ${month:.2f} per month; hit@{top_k} {hit:.0%}; within budget: {ok}")
    return {"hit": hit, "tokens": tok, "steps": steps, "total": total, "miss": miss, "avg": avg, "month": month, "ok": ok}
# @end
