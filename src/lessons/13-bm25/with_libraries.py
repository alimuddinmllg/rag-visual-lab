# NalarNusa RAG Visual Lab · Lesson 13 · BM25 with rank_bm25, next to vector search
# pip install rank-bm25 sentence-transformers
import re
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer, util

# @stage tokens
chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
words = lambda s: re.findall(r"[a-z0-9]+", s.lower())
bm25 = BM25Okapi([words(c) for c in chunks], k1=1.2, b=0.75)
question = "What software is on the workstations?"
# @end

# @stage bm25
bm_scores = bm25.get_scores(words(question))
# @end

# @stage vector
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
vec_scores = util.cos_sim(model.encode(question), model.encode(chunks))[0].tolist()
# @end

# @stage compare
top = lambda s: sorted(range(len(s)), key=lambda i: -s[i])[:5]
print("BM25  ", top(bm_scores))
print("vector", top(vec_scores))
# @end
