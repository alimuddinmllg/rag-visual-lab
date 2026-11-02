# NalarNusa RAG Visual Lab · Lesson 30 · Agentic RAG: a loop that plans, searches, checks what it read, retries, and knows when to stop
# The "agent" here is a few rules standing in for an LLM's decisions, so every run is the same and you can read why.
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, tokenize, vectorize, cosine, extract_answer   # lesson 6

SAY = {"en": {"missing": "I couldn't find this in the document: {}.", "steps": "I ran out of steps before checking: {}."},
       "id": {"missing": "Saya tidak menemukan ini di dokumen: {}.", "steps": "Langkah habis sebelum saya memeriksa: {}."}}


def rewrite(part, synonyms):
    """Lesson 16's trick: swap the user's words for the document's words (an LLM would do this in a real agent)."""
    words = re.findall(r"[a-z0-9]+", part.lower())
    if not any(w in synonyms for w in words):
        return None
    return " ".join(synonyms[w][0] if w in synonyms else w for w in words)


# @stage plan
def plan(question, lang):
    """Split a compound question into parts the agent can look up one by one."""
    sep = r",\s+and\s+" if lang == "en" else r",\s+dan\s+"
    return [p.strip().rstrip("?") for p in re.split(sep, question) if p.strip()]
# @end


# @stage search
def tool_search(query, idf, vectors, stop, lang, k=3):
    """The agent's only tool: top k chunks for a query."""
    qv = vectorize(tokenize(query, stop, lang), idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    return [(i, scores[i]) for i in sorted(range(len(scores)), key=lambda i: (-scores[i], i))[:k]]
# @end


# @stage check
def enough(part, query, top, chunks, idf, stop, lang):
    """Did what I read answer this part? Every word of my query must exist in the document,
    and the best chunk must contain most of the part's words."""
    q = list(dict.fromkeys(tokenize(query, stop, lang)))
    unknown = [t for t in q if t not in idf]
    words = list(dict.fromkeys(tokenize(part, stop, lang)))
    have = set(tokenize(chunks[top[0][0]]["text"], stop, lang))
    known_words = [t for t in words if t in idf]
    cover = sum(t in have for t in known_words) / max(1, len(words))
    return not unknown and cover >= 0.6 and top[0][1] >= 0.15, unknown, cover
# @end


# @stage loop
def agent(question, chunks, idf, vectors, max_steps, synonyms, stop, lang):
    parts = plan(question, lang)
    trace, found, status = [("plan", parts)], {}, {}
    steps = 0
    for p, part in enumerate(parts):
        queries = [part]
        retry = rewrite(part, synonyms)
        if retry:
            queries.append(retry)                           # second try: the document's own words
        for attempt, query in enumerate(queries):
            if steps >= max_steps:
                status[p] = "steps"
                break
            steps += 1
            top = tool_search(query, idf, vectors, stop, lang)
            ok, unknown, cover = enough(part, query, top, chunks, idf, stop, lang)
            trace.append(("search", p, query, top[0][0], top[0][1], ok, unknown, cover))
            if ok:
                found[p], status[p] = top[0], "found"
                break
            if attempt + 1 < len(queries):
                trace.append(("rewrite", p, queries[attempt + 1]))
            else:
                status[p] = "missing"
        if p not in status:
            status[p] = "steps"
    return parts, found, status, trace, steps
# @end


# @stage answer
def compose(parts, found, status, chunks, idf, stop, lang):
    out, cites = [], []
    for p, part in enumerate(parts):
        if status[p] == "found":
            i, s = found[p]
            cites.append(i)
            known = [t for t in tokenize(part, stop, lang) if t in idf]
            out.append(extract_answer([(i, s)], chunks, known, idf, stop, lang).replace("[1]", f"[{len(cites)}]"))
        else:
            out.append(SAY[lang][status[p]].format(part))
    return " ".join(out), cites


def one_shot(question, chunks, idf, vectors, stop, lang):
    """Classic RAG for comparison: one search with the whole question, answer from the top 3."""
    top = tool_search(question, idf, vectors, stop, lang)
    known = [t for t in tokenize(question, stop, lang) if t in idf]
    return extract_answer(top, chunks, known, idf, stop, lang), [i for i, _ in top]


def grade(answer, expected, parts, status):
    """A part is right if its fact is in the answer, or, when the document can't answer it, if the agent says so."""
    return [(e in answer) if e else (status is not None and status.get(p) == "missing") for p, e in enumerate(expected)]


def demo(document, question, expected, mode, max_steps, synonyms, lang, stop):
    stop = set(stop)
    _, words = parse_document(document)
    chunks = chunk_document(words, 40, 8)
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    if mode == "one-shot":
        answer, used = one_shot(question, chunks, idf, vectors, stop, lang)
        trace, steps, status = [("search", 0, question, used[0], None, None, [], None)], 1, None
        parts = plan(question, lang)
    else:
        parts, found, status, trace, steps = agent(question, chunks, idf, vectors, max_steps, synonyms, stop, lang)
        answer, used = compose(parts, found, status, chunks, idf, stop, lang)
    right = grade(answer, expected, parts, status)
    for t in trace:
        print(*t)
    print(f"{steps} search(es) -> {answer}  {sum(right)}/{len(right)} parts right")
    return {"answer": answer, "used": used, "steps": steps, "right": right, "trace": [list(t) for t in trace]}
# @end
