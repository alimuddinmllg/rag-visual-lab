# NalarNusa RAG Visual Lab · Lesson 10 · Metadata and filtering
import re
from rag_from_scratch import (parse_document, chunk_document, embed_chunks,          # lesson 6
                              embed_question, cosine, extract_answer)


# @stage chunk
def chunks_with_sections(document, size, overlap):
    sections, words = parse_document(document)
    return sections, chunk_document(words, size, overlap)
# @end


# @stage tag
def tag(chunk):
    """Metadata = facts about a chunk that you can filter on exactly."""
    text, kinds = chunk["text"], []
    if re.search(r"\bRp\s?[0-9]", text): kinds.append("price")
    if re.search(r"\b[0-9]{1,2}[:.][0-9]{2}\b", text): kinds.append("time")
    if re.search(r"\b(must|never|required|wajib|jangan|harus)\b", text, re.I): kinds.append("rule")
    return {"section": chunk["sec"], "kinds": kinds}
# @end


# @stage embed
# embed_chunks() from lesson 6: one TF-IDF vector per chunk
# @end


# @stage filter
def allowed(meta, section=None, kind=None):
    """An exact rule, not a similarity guess."""
    return (section is None or meta["section"] == section) and (kind is None or kind in meta["kinds"])
# @end


# @stage retrieve
def search(qv, metas, vectors, top_k, section=None, kind=None):
    candidates = [i for i, m in enumerate(metas) if allowed(m, section, kind)]   # filter FIRST
    scored = sorted(((i, cosine(qv, vectors[i]) if qv else 0.0) for i in candidates), key=lambda x: -x[1])
    return candidates, scored[:top_k]
# @end


# @stage generate
def demo(document, question, size, overlap, top_k, min_sim, lang, stop, section=None, kind=None):
    stop = set(stop)
    sections, chunks = chunks_with_sections(document, size, overlap)
    metas = [tag(c) for c in chunks]
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    qv, known = embed_question(question, idf, stop, lang)
    candidates, top = search(qv, metas, vectors, top_k, section, kind)
    used = [(i, s) for i, s in top if s >= min_sim and known]
    answer = extract_answer(used, chunks, known, idf, stop, lang)
    print(f"filter: section={sections[section] if section is not None else 'all'}, kind={kind or 'all'}")
    print(f"{len(candidates)} of {len(chunks)} chunks pass the filter")
    print("top:", ", ".join(f"#{i + 1} {s:.2f}" for i, s in top) or "nothing")
    print("answer:", answer)
    return {"top": [[i, s] for i, s in top], "answer": answer}
# @end


if __name__ == "__main__":
    import json
    doc = open("nusabot_handbook.txt", encoding="utf-8").read()
    stop = json.load(open("stopwords.json", encoding="utf-8"))["en"]
    demo(doc, "How much does it cost?", 40, 8, 3, 0.1, "en", stop, section=None, kind="price")
