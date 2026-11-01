# NalarNusa RAG Visual Lab · Lesson 9 · Choose chunk size with a test set, not a guess
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, embed_question, retrieve

# @stage testset
TEST_SET = [   # (question, a phrase the right chunk must contain)
    ("How much does PLA printing cost?", "2.000 per gram"),
    ("When is the lab open on Saturday?", "Saturday from 10:00 to 16:00"),
    ("How much does a gold card cost?", "250.000 per year"),
    ("Can the drone kit leave the lab?", "drone kit cannot leave the lab"),
    # ... 10 questions in the lab
]
norm = lambda s: " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "
# @end


# @stage sweep
def hit_rate(document, size, overlap, top_k, lang, stop):
    _, words = parse_document(document)
    chunks = chunk_document(words, size, overlap)
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    hits, tokens = 0, 0
    for question, expected in TEST_SET:
        qv, _ = embed_question(question, idf, stop, lang)
        _, top = retrieve(qv, vectors, top_k)
# @end
# @stage score
        found = any(norm(expected) in norm(chunks[i]["text"]) for i, _ in top)
        hits += found
        tokens += sum(len(chunks[i]["text"].split()) for i, _ in top) * 1.33
    return hits / len(TEST_SET), tokens / len(TEST_SET)
# @end


# @stage best
def best_size(document, overlap, top_k, lang, stop, sizes=(15, 20, 30, 40, 50, 60, 80, 100, 120)):
    results = {s: hit_rate(document, s, overlap, top_k, lang, stop) for s in sizes}
    for s, (rate, tok) in results.items():
        print(f"size {s:3d}: hit rate {rate:.0%}, ~{tok:.0f} prompt tokens")
    # highest hit rate; among ties, the smallest (cheapest) chunks
    return max(sizes, key=lambda s: (results[s][0], -s))
# @end
