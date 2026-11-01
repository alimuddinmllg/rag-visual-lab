# NalarNusa RAG Visual Lab · Lesson 10 · Metadata and filtering
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, embed_question, cosine


# @stage chunk
def chunks_with_sections(document, size=40, overlap=8):
    sections, words = parse_document(document)
    return sections, chunk_document(words, size, overlap)
# @end


# @stage tag
def tag(chunk, sections):
    """Metadata = facts about a chunk that you can filter on exactly."""
    text = chunk["text"]
    kinds = []
    if re.search(r"\bRp\s?[0-9]", text): kinds.append("price")
    if re.search(r"\b[0-9]{1,2}[:.][0-9]{2}\b", text): kinds.append("time")
    if re.search(r"\b(must|never|required|wajib|jangan|harus)\b", text, re.I): kinds.append("rule")
    return {"section": sections[chunk["sec"]], "kinds": kinds}
# @end


# @stage filter
def allowed(meta, section=None, kind=None):
    return (section is None or meta["section"] == section) and (kind is None or kind in meta["kinds"])
# @end


# @stage retrieve
def search(question, chunks, metas, vectors, idf, stop, lang, top_k=3, section=None, kind=None):
    qv, _ = embed_question(question, idf, stop, lang)
    candidates = [i for i, m in enumerate(metas) if allowed(m, section, kind)]   # filter FIRST
    scored = sorted(((i, cosine(qv, vectors[i])) for i in candidates), key=lambda x: -x[1])
    return scored[:top_k]
# @end
