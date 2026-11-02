# NalarNusa RAG Visual Lab · Lesson 28 · Tables, images and multimodal RAG: one page, three kinds of region
from rag_from_scratch import parse_document, chunk_document, embed_chunks, tokenize, vectorize, cosine, extract_answer   # lesson 6


# @stage layout
def regions(page):
    """A layout model (or the PDF's structure) splits the page into text, table and image regions."""
    out = [{"kind": "text", "id": f"p{i + 1}"} for i in range(len(page["paragraphs"]))]
    out.append({"kind": "table", "id": "table"})
    out.append({"kind": "image", "id": "figure"})
    return out
# @end


# @stage extract
def flat_text(page):
    """What plain text extraction gives you: table cells in reading order, no headers per row, and no picture."""
    t = page["table"]
    cells = " ".join(t["header"]) + " " + " ".join(" ".join(r) for r in t["rows"])
    return "\n".join([f"## {page['title']}", *page["paragraphs"], t["caption"], cells, page["image"]["caption"]])


def structured(page, describe):
    """Each region becomes chunks of its own kind: paragraphs, one chunk per table row WITH its headers, and the image."""
    chunks = [{"kind": "text", "region": f"p{i + 1}", "text": p} for i, p in enumerate(page["paragraphs"])]
    t = page["table"]
    for r in t["rows"]:
        row = "; ".join(f"{h}: {v}" for h, v in zip(t["header"], r))
        chunks.append({"kind": "table", "region": "table", "text": f"{t['caption']}. {row}."})
    img = page["image"]
    chunks.append({"kind": "image", "region": "figure", "text": img["caption"] + (". " + img["description"] if describe else "")})
    return chunks


def extract(page, strategy, describe):
    if strategy == "flat":
        _, words = parse_document(flat_text(page))
        return [{"kind": "mixed", "region": "flat", "text": c["text"]} for c in chunk_document(words, 40, 8)]
    return structured(page, describe)
# @end


# @stage index
def index(chunks, stop, lang):
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    return idf, vectors
# @end


# @stage retrieve
def search(question, idf, vectors, stop, lang, k=3):
    qv = vectorize(tokenize(question, stop, lang), idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    return [(i, scores[i]) for i in sorted(range(len(scores)), key=lambda i: (-scores[i], i))[:k]]
# @end


# @stage answer
def demo(page, question, expected, strategy, describe, lang, stop):
    stop = set(stop)
    chunks = extract(page, strategy, describe)
    idf, vectors = index(chunks, stop, lang)
    top = search(question, idf, vectors, stop, lang)
    known = [t for t in tokenize(question, stop, lang) if t in idf]
    answer = extract_answer([(i, s) for i, s in top if s >= 0.1], chunks, known, idf, stop, lang)
    found = expected in answer
    print(f"{strategy}{' + image descriptions' if describe and strategy != 'flat' else ''}: {len(chunks)} chunks")
    for i, s in top:
        print(f"  {s:.2f} [{chunks[i]['kind']}] {chunks[i]['text'][:70]}")
    print(question, "->", answer, "| found" if found else "| missed")
    return {"chunks": [c["text"] for c in chunks], "top": [i for i, _ in top], "answer": answer, "found": found}
# @end
