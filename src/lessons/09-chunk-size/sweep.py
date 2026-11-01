# NalarNusa RAG Visual Lab · Lesson 9 · Choose chunk size with a test set, not a guess
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, embed_question, retrieve   # lesson 6

# @stage testset
TEST_SET = [   # (question, a phrase the right chunk must contain); the lab passes all 10
    ("How much does PLA printing cost?", "2.000 per gram"),
    ("When is the lab open on Saturday?", "Saturday from 10:00 to 16:00"),
    ("How much does a gold card cost?", "250.000 per year"),
    ("Can the drone kit leave the lab?", "drone kit cannot leave the lab"),
]
SIZES = (15, 20, 30, 40, 50, 60, 80, 100, 120)


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "
# @end


# @stage sweep
def hit_rate(document, tests, size, overlap, top_k, lang, stop):
    _, words = parse_document(document)
    chunks = chunk_document(words, size, min(overlap, size - 6))
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    hits, tokens = 0, 0.0
    for question, expected in tests:
        qv, _ = embed_question(question, idf, stop, lang)
        _, top = retrieve(qv, vectors, top_k)
# @end
# @stage score
        hits += any(norm(expected) in norm(chunks[i]["text"]) for i, _ in top)
        tokens += sum(len(chunks[i]["text"].split()) for i, _ in top) * 1.33
    return hits / len(tests), tokens / len(tests)
# @end


# @stage best
def best_size(document, tests, overlap, top_k, lang, stop, sizes=SIZES):
    stop = set(stop)
    results = {s: hit_rate(document, tests, s, overlap, top_k, lang, stop) for s in sizes}
    for s, (rate, tok) in results.items():
        print(f"size {s:3d}: hit rate {rate:4.0%}   ~{tok:4.0f} prompt tokens")
    # highest hit rate; among ties, the smallest (cheapest) chunks
    best = max(sizes, key=lambda s: (results[s][0], -s))
    print("best size:", best)
    return {"best": best, "rates": [results[s][0] for s in sizes]}
# @end


if __name__ == "__main__":
    import json
    doc = open("nusabot_handbook.txt", encoding="utf-8").read()
    stop = json.load(open("stopwords.json", encoding="utf-8"))["en"]
    best_size(doc, TEST_SET, 0, 2, "en", stop)
