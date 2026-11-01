# NalarNusa RAG Visual Lab · Lesson 12 · Assembling the prompt within a token budget
import math
import re
from rag_from_scratch import (parse_document, chunk_document, embed_chunks, embed_question,   # lesson 6
                              retrieve, build_prompt, extract_answer, PROMPT)


def count_tokens(text):
    """Rough: 1 word ≈ 1.33 tokens. Use the model's own tokenizer in production (lesson 3)."""
    return math.floor(len(re.split(r"\s+", text)) * 1.33 + 0.5)


# @stage retrieve
def top_chunks(document, question, top_k, lang, stop, size=40, overlap=8, min_sim=0.05):
    sections, words = parse_document(document)
    chunks = chunk_document(words, size, overlap)
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    qv, known = embed_question(question, idf, stop, lang)
    _, top = retrieve(qv, vectors, top_k)
    used = [(i, s) for i, s in top if s >= min_sim and known]
    return sections, chunks, idf, known, used
# @end


# @stage order
def order(top, how):
    if how == "document":                            # reading order of the source
        return sorted(top, key=lambda t: t[0])
    if how == "edges":                               # best at the start AND the end, weakest in the middle
        return top[0::2] + top[1::2][::-1]
    return list(top)                                 # "score": best first
# @end


# @stage budget
def fit(ordered, chunks, system, question, budget, reserve):
    """Keep chunks, in order, until the next one would overflow the budget."""
    room = budget - count_tokens(system) - count_tokens(question) - reserve
    kept, dropped = [], []
    for i, s in ordered:
        cost = count_tokens(chunks[i]["text"])
        if cost <= room:
            kept.append((i, s)); room -= cost
        else:
            dropped.append((i, s))
    return kept, dropped, room
# @end


# @stage assemble
# build_prompt() from lesson 6: instructions, numbered sources [1] [2] ..., the question
# @end


# @stage cite
def citations(answer, kept, chunks):
    """Map each [n] marker in the answer back to the chunk it points to."""
    return {int(n): chunks[kept[int(n) - 1][0]]["text"] for n in re.findall(r"\[(\d+)\]", answer)
            if 0 < int(n) <= len(kept)}


def demo(document, question, top_k, how, budget, reserve, lang, stop):
    stop = set(stop)
    sections, chunks, idf, known, used = top_chunks(document, question, top_k, lang, stop)
    ordered = order(used, how)
    system = PROMPT.get(lang, PROMPT["en"])["system"]
    kept, dropped, room = fit(ordered, chunks, system, question, budget, reserve)
    prompt = build_prompt(question, kept, chunks, sections, lang)
    answer = extract_answer(kept, chunks, known, idf, stop, lang)
    print(f"order {how}: {[i for i, _ in ordered]}  kept {[i for i, _ in kept]}  dropped {[i for i, _ in dropped]}")
    print(f"prompt: {count_tokens(prompt)} tokens of {budget} ({reserve} reserved for the answer)\n")
    print(prompt, "\n\n->", answer)
    for n, src in citations(answer, kept, chunks).items():
        print(f"[{n}] -> {src[:70]}…")
    return {"kept": [i for i, _ in kept], "dropped": [i for i, _ in dropped], "tokens": count_tokens(prompt), "answer": answer}
# @end


if __name__ == "__main__":
    import json
    doc = open("nusabot_handbook.txt", encoding="utf-8").read()
    stop = json.load(open("stopwords.json", encoding="utf-8"))["en"]
    demo(doc, "How much does PLA printing cost?", 5, "edges", 450, 100, "en", stop)
