# NalarNusa RAG Visual Lab · Lesson 22 · Failure clinic: debug RAG stage by stage, not by guessing
import re
from rag_from_scratch import embed_chunks, tokenize, extract_answer   # lesson 6
from bm25 import index, vector_scores, rank                            # lesson 13
from fusion import rrf                                                 # lesson 14
from rewrite import rewrite_query                                      # lesson 16

# Six broken pipelines. Each has one faulty setting and its fix.
CASES = [
    {"id": 1, "cause": "chunking", "q": {"en": "How much does PLA printing cost?", "id": "Berapa biaya cetak PLA?"},
     "expect": {"en": "2.000 per gram", "id": "2.000 per gram"}, "broken": {"size": 6, "overlap": 0, "top_k": 1}, "fixed": {"size": 40, "overlap": 8, "top_k": 3}},
    {"id": 2, "cause": "threshold", "q": {"en": "When is the lab open on Saturday?", "id": "Kapan lab buka hari Sabtu?"},
     "expect": {"en": "Saturday from 10:00", "id": "Sabtu pukul 10.00"}, "broken": {"min_sim": 0.6}, "fixed": {"min_sim": 0.1}},
    {"id": 3, "cause": "filter", "q": {"en": "Where must lithium batteries be charged?", "id": "Di mana baterai litium harus diisi?"},
     "expect": {"en": "fireproof charging bags", "id": "kantong pengisian tahan api"}, "broken": {"filter": 2}, "fixed": {"filter": None}},
    {"id": 4, "cause": "topk", "q": {"en": "How much does printing cost?", "id": "Berapa biaya mencetak?"}, "in_chunks": True,
     "expect": {"en": "500 per page", "id": "2.000 per gram"}, "broken": {"top_k": 1}, "fixed": {"top_k": 3}},
    {"id": 5, "cause": "language", "q": {"en": "When does the lab close during exam weeks?", "id": "When does the lab close during exam weeks?"},
     "expect": {"en": "18:00", "id": "18.00"}, "broken": {"doc_lang": "other"}, "fixed": {"doc_lang": "same"}},
    {"id": 6, "cause": "wording", "q": {"en": "What is the fee to join as a student?", "id": "Berapa ongkos daftar anggota mahasiswa?"},
     "expect": {"en": "50.000 per semester", "id": "50.000 per semester"}, "broken": {"rewrite": False}, "fixed": {"rewrite": True}},
]


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


# @stage observe
def run_case(case, lang, which, handbook, stopwords):
    """Run the whole pipeline with this case's settings and log every stage."""
    p = {"size": 40, "overlap": 8, "top_k": 3, "min_sim": 0.1, "filter": None, "doc_lang": "same", "rewrite": False, **case[which]}
    doc_lang = ("en" if p["doc_lang"] == "same" else "id") if case["id"] == 5 else lang
    question = case["q"]["en"] if case["id"] == 5 else case["q"][lang]
    stop = set(stopwords[doc_lang])
    chunks, _ = index(handbook[doc_lang], doc_lang, stop, p["size"], p["overlap"])
    idf, _, _ = embed_chunks(chunks, stop, doc_lang)
# @end
# @stage inspect
    variants = rewrite_query(question, doc_lang) if p["rewrite"] else [question]
    cos = vector_scores(chunks, question, stop, doc_lang)
    if len(variants) > 1:
        ranking = rrf([rank(vector_scores(chunks, v, stop, doc_lang)) for v in variants])
    else:
        ranking = rank(cos)
    if p["filter"] is not None:
        ranking = [i for i in ranking if chunks[i]["sec"] == p["filter"]]
    top = [(i, max(cos[i], 0.11) if len(variants) > 1 else cos[i]) for i in ranking[:p["top_k"]]]
    used = [(i, s) for i, s in top if s >= p["min_sim"]]
    known = [t for v in variants for t in tokenize(v, stop, doc_lang) if t in idf]
    answer = extract_answer(used, chunks, known, idf, stop, doc_lang)
    expect = ("18:00" if doc_lang == "en" else "18.00") if case["id"] == 5 else case["expect"][lang]
    in_prompt = any(norm(expect) in norm(chunks[i]["text"]) for i, _ in used)
    ok = in_prompt if case.get("in_chunks") else norm(expect) in norm(answer)
    return {"question": question, "settings": p, "top": top, "used": [i for i, _ in used],
            "answer_in_prompt": in_prompt, "answer": answer, "ok": ok}
# @end


# @stage diagnose
def diagnose(r):
    """Work backwards from the answer."""
    if r["answer_in_prompt"] and not r["ok"]:
        return "generation: the answer was in the prompt; check the prompt or the model (lesson 21)"
    if not r["used"] and r["top"]:
        return "retrieved but dropped: similarity threshold, top-k or token budget"
    return "not retrieved: chunking, a metadata filter, the question's wording, or the document's language"
# @end


# @stage fix
# Change ONE thing, run again, and keep it only if the test set (lesson 20) agrees.
# @end


# @stage verify
def demo(case_index, lang, handbook, stopwords):
    case = CASES[case_index]
    for which in ("broken", "fixed"):
        r = run_case(case, lang, which, handbook, stopwords)
        print(f"{which:6s} {'✓' if r['ok'] else '✗'}  top {[(i + 1, round(s, 2)) for i, s in r['top']]}  used {len(r['used'])}  -> {r['answer'][:70]}")
        if which == "broken":
            print("        diagnosis:", diagnose(r))
    print("\nall cases:", " ".join(f"{c['id']}:{'✓' if run_case(c, lang, 'fixed', handbook, stopwords)['ok'] else '✗'}" for c in CASES))
    return {w: run_case(case, lang, w, handbook, stopwords)["ok"] for w in ("broken", "fixed")} | {
        "answers": [run_case(case, lang, w, handbook, stopwords)["answer"] for w in ("broken", "fixed")]}
# @end
