# NalarNusa RAG Visual Lab · Lesson 15 · Re-ranking with a cross-encoder
# pip install sentence-transformers
from sentence_transformers import CrossEncoder, SentenceTransformer, util

chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
question = "Where do I charge a battery?"

# @stage first
embedder = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
hits = util.semantic_search(embedder.encode(question), embedder.encode(chunks), top_k=10)[0]
candidates = [h["corpus_id"] for h in hits]                  # fast first stage: top 10
# @end

# @stage pairs
reranker = CrossEncoder("cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")    # multilingual
pairs = [(question, chunks[i]) for i in candidates]
# @end

# @stage score
scores = reranker.predict(pairs)          # reads question and chunk TOGETHER: slower, sharper
# @end

# @stage reorder
reranked = [i for _, i in sorted(zip(scores, candidates), key=lambda x: -x[0])]
print("before:", candidates[:3], " after:", reranked[:3])
# @end

# @stage evaluate
# Compare hit@1 before and after on your test set (lessons 19 and 20) before you keep it.
# @end
