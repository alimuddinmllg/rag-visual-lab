# NalarNusa RAG Visual Lab · Lesson 18 · Context compression, and the position test
import math
import re
from rag_from_scratch import tokenize                  # lesson 6
from bm25 import index, vector_scores, rank            # lesson 13

tokens = lambda t: math.floor(len(re.split(r"\s+", t)) * 1.33 + 0.5)


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


# @stage retrieve
def top_chunks(chunks, question, stop, lang, k):
    return rank(vector_scores(chunks, question, stop, lang))[:k]
# @end


# @stage compress
def compress(text, q_tokens, stop, lang):
    """Keep only sentences that share a word with the question."""
    keep = [s for s in re.split(r"(?<=[.!?])\s+", text) if any(t in q_tokens for t in tokenize(s, stop, lang))]
    return " ".join(keep)
# @end


# @stage measure
def measure(chunks, tests, stop, lang, k):
    """Tokens saved, and how often the answer phrase survives compression."""
    kept = kept_c = t_full = t_comp = 0
    for q, e in tests:
        qt = tokenize(q, stop, lang)
        top = top_chunks(chunks, q, stop, lang, k)
        full = " ".join(chunks[i]["text"] for i in top)
        comp = " ".join(compress(chunks[i]["text"], qt, stop, lang) for i in top)
        kept += norm(e) in norm(full); kept_c += norm(e) in norm(comp)
        t_full += tokens(full); t_comp += tokens(comp or " ")
    n = len(tests)
    return {"kept": kept / n, "kept_compressed": kept_c / n, "saved": 1 - t_comp / t_full}


def position_test(llm, chunks, question, expected, answer_chunk, n=7):
    """Lost in the middle: put the answer passage at position 1..n among distractors, ask each time.
    `llm(prompt) -> str` is any model call (see the With libraries tab)."""
    distract = [i for i in range(len(chunks)) if i != answer_chunk][:n - 1]
    results = []
    for p in range(n):
        order = distract[:p] + [answer_chunk] + distract[p:]
        passages = "\n\n".join(f"[{k + 1}] {chunks[i]['text']}" for k, i in enumerate(order))
        a = llm(f"Answer using only the numbered passages.\n\n{passages}\n\nQuestion: {question}\nAnswer briefly:")
        results.append(norm(expected) in norm(a))
    return results


def demo(document, question, tests, lang, stop, k=4):
    stop = set(stop)
    chunks, _ = index(document, lang, stop)
    qt = tokenize(question, stop, lang)
    top = top_chunks(chunks, question, stop, lang, k)
    full = " ".join(chunks[i]["text"] for i in top)
    comp = " ".join(filter(None, (compress(chunks[i]["text"], qt, stop, lang) for i in top)))
    print(f"full context {tokens(full)} tokens -> compressed {tokens(comp or ' ')} tokens")
    print("compressed:", comp or "(nothing left)")
    if not tests:
        return {"top": top, "comp": comp, "evaluation": None}
    ev = measure(chunks, tests, stop, lang, k)
    print(f"test set: saved {ev['saved']:.0%} tokens, answer kept {ev['kept']:.0%} -> {ev['kept_compressed']:.0%}")
    return {"top": top, "comp": comp, "evaluation": ev}
# @end
