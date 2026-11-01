# NalarNusa RAG Visual Lab · Lesson 21 · Faithfulness: is every claim supported by the sources?
import re
from tiny_lm import train_lm, lm_tokens, generate, detok                         # lesson 1
from rag_from_scratch import embed_chunks, tokenize, vectorize, cosine, extract_answer   # lesson 6
from bm25 import index, vector_scores, rank                                       # lesson 13


def sentences(text):
    return re.split(r"(?<=[.!?])\s+", text)


# @stage retrieve
def sources_for(chunks, question, stop, lang, k=3):
    top = rank(vector_scores(chunks, question, stop, lang))[:k]
    return top, [chunks[i]["text"] for i in top]
# @end


# @stage answer
def closed_book(question, general):
    """The lesson 2 model: fluent, never saw the handbook."""
    seed = [t for t in lm_tokens(question) if re.search(r"[a-z]", t)][-2:]
    s = detok(seed + generate(train_lm(lm_tokens(general)), seed, 16, 0.8, 3))
    return s[:1].upper() + s[1:]


def answer_from(source, question, top, chunks, idf, stop, lang, general, llm_answer=None):
    known = [t for t in tokenize(question, stop, lang) if t in idf]
    ext = re.sub(r"\s*\[\d\]", "", extract_answer([(i, 0) for i in top], chunks, known, idf, stop, lang))
    if source == "closed":
        return closed_book(question, general)
    if source == "mixed":                     # one true claim + one invented claim
        return ext + " " + closed_book(question, general)
    if source == "llm":
        return llm_answer or "(no LLM answer)"
    return ext
# @end


# @stage claims
def split_claims(answer):
    return [s.strip() for s in sentences(answer) if len(s.strip().split()) >= 3]
# @end


# @stage check
def numbers(s):
    return [re.sub(r"[.,:]", "", x) for x in re.findall(r"[0-9]+(?:[.,:][0-9]+)*", s)]


def check_claim(claim, sources, stop, lang, threshold):
    """Supported = some source sentence covers enough of the claim's words,
    AND every number in the claim appears in the sources."""
    words = list(dict.fromkeys(tokenize(claim, stop, lang)))
    best, best_sentence = 0.0, ""
    for s in (x for src in sources for x in sentences(src)):
        st = set(tokenize(s, stop, lang))
        ratio = sum(t in st for t in words) / len(words) if words else 0.0
        if ratio > best:
            best, best_sentence = ratio, s
    src_nums = {n for src in sources for n in numbers(src)}
    bad = [n for n in numbers(claim) if n not in src_nums]
    return {"claim": claim, "ratio": best, "sentence": best_sentence, "bad_numbers": bad,
            "supported": best >= threshold and not bad}
# @end


# @stage score
def demo(document, general, question, source, threshold, lang, stop, llm_answer=None):
    stop = set(stop)
    chunks, _ = index(document, lang, stop)
    idf, _, _ = embed_chunks(chunks, stop, lang)
    top, srcs = sources_for(chunks, question, stop, lang)
    answer = answer_from(source, question, top, chunks, idf, stop, lang, general, llm_answer)
    checks = [check_claim(c, srcs, stop, lang, threshold) for c in split_claims(answer)]
    faith = sum(c["supported"] for c in checks) / len(checks) if checks else 0.0
    v = lambda t: vectorize(tokenize(t, stop, lang), idf)
    relevance = cosine(v(question), v(answer))
    print("answer:", answer)
    for c in checks:
        mark = "✓" if c["supported"] else "✗"
        print(f" {mark} {c['ratio']:.0%} covered{' · numbers not in sources: ' + ', '.join(c['bad_numbers']) if c['bad_numbers'] else ''}  {c['claim']}")
    print(f"faithfulness {faith:.0%}   relevance {relevance:.2f}")
    return {"answer": answer, "supported": [c["supported"] for c in checks], "faith": faith, "relevance": relevance}
# @end
