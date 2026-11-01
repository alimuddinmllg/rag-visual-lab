# NalarNusa RAG Visual Lab · Lesson 12 · Assembling the prompt within a token budget
def count_tokens(text):
    return round(len(text.split()) * 1.33)          # rough: 1 word ≈ 1.33 tokens


# @stage retrieve
# top = [(chunk_index, score), ...] from retrieve() in lesson 6, best first
# @end


# @stage order
def order(top, how):
    if how == "score":
        return list(top)
    if how == "document":                            # reading order of the source
        return sorted(top, key=lambda t: t[0])
    if how == "edges":                               # best at the start AND the end, weakest in the middle
        front, back = top[0::2], top[1::2]
        return front + back[::-1]
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
    return kept, dropped
# @end


# @stage assemble
def assemble(kept, chunks, system, question):
    ctx = "\n\n".join(f"[{n + 1}] {chunks[i]['text']}" for n, (i, _) in enumerate(kept))
    return f"{system}\n\nContext:\n{ctx}\n\nQuestion: {question}\nAnswer:"
# @end


# @stage cite
# The model answers with markers like [2]. Map each marker back to its chunk:
def citations(answer, kept, chunks):
    import re
    return {int(n): chunks[kept[int(n) - 1][0]]["text"] for n in re.findall(r"\[(\d+)\]", answer)
            if 0 < int(n) <= len(kept)}
# @end
