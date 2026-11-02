# NalarNusa RAG Visual Lab · Lesson 29 · GraphRAG: the same sentences as a vector list and as an entity graph
import re
from rag_from_scratch import embed_chunks, tokenize, vectorize, cosine, extract_answer   # lesson 6


# @stage vector
def vector_rag(sentences, question, k, stop, lang):
    """Plain RAG over the sentences: top k by TF-IDF cosine, then the extractive answer."""
    chunks = [{"text": s} for s in sentences]
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    qv = vectorize(tokenize(question, stop, lang), idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    top = sorted(range(len(scores)), key=lambda i: (-scores[i], i))[:k]
    known = [t for t in tokenize(question, stop, lang) if t in idf]
    return top, extract_answer([(i, scores[i]) for i in top], chunks, known, idf, stop, lang)
# @end


# @stage extract
def mentions(text, entities):
    """Entities named in a text, in order of appearance (aliases matched as whole words)."""
    low, found = text.lower(), []
    for e in entities:
        pos = [m.start() for a in e["aliases"] for m in re.finditer(r"(?<![a-z])" + re.escape(a) + r"(?![a-z])", low)]
        if pos:
            found.append((min(pos), e["name"]))
    return [n for _, n in sorted(found)]


def build_graph(sentences, entities):
    """An edge between entities named in the same sentence; the sentence is the edge's evidence.
    Real GraphRAG asks an LLM to extract entities and relations; here the entity list is given."""
    edges = []
    for i, s in enumerate(sentences):
        names = mentions(s, entities)
        for a, b in zip(names, names[1:]):
            edges.append((a, b, i))
    return edges
# @end


# @stage seed
def seeds(question, entities):
    return mentions(question, entities)
# @end


# @stage walk
def paths(edges, start, hops):
    """Every simple path of 1..hops edges from start. A path is [(node, sentence index), ...]."""
    nbrs = {}
    for a, b, i in edges:
        nbrs.setdefault(a, []).append((b, i))
        nbrs.setdefault(b, []).append((a, i))
    out, frontier = [], [[(start, None)]]
    for _ in range(hops):
        nxt = []
        for p in frontier:
            seen = {n for n, _ in p}
            for n, i in nbrs.get(p[-1][0], []):
                if n not in seen:
                    nxt.append(p + [(n, i)])
        out += nxt
        frontier = nxt
    return out


def best_path(edges, starts, target, types, sentences, question, hops, stop, lang):
    """Paths ending at an entity of the wanted type, scored by how many question words their evidence covers."""
    q = set(tokenize(question, stop, lang))
    best = None
    for s in starts:
        for p in paths(edges, s, hops):
            end = p[-1][0]
            if types[end] != target or end in starts:
                continue
            words = set()
            for _, i in p[1:]:
                words |= set(tokenize(sentences[i], stop, lang))
            key = (len(q & words), -(len(p) - 1))
            if best is None or key > best[0]:
                best = (key, p)
    return best[1] if best else None
# @end


# @stage answer
def explain(path, sentences):
    return " → ".join(n for n, _ in path), [i for _, i in path[1:]]


def demo(sentences, entities, question, target, expected, k, hops, lang, stop):
    stop = set(stop)
    top, v_answer = vector_rag(sentences, question, k, stop, lang)
    edges = build_graph(sentences, entities)
    types = {e["name"]: e["type"] for e in entities}
    starts = seeds(question, entities)
    path = best_path(edges, starts, target, types, sentences, question, hops, stop, lang)
    chain, evidence = explain(path, sentences) if path else ("", [])
    g_answer = path[-1][0] if path else None
    print("vector:", v_answer, "| correct" if expected in v_answer else "| wrong")
    print(f"graph: {len(edges)} edges; seeds {starts}; path {chain or 'none'} -> {g_answer}")
    return {"top": top, "vector": v_answer, "edges": [list(e) for e in edges], "seeds": starts, "path": [n for n, _ in path] if path else [],
            "evidence": evidence, "graph": g_answer, "vector_ok": expected in v_answer, "graph_ok": g_answer == expected}
# @end
