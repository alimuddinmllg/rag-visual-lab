# NalarNusa RAG Visual Lab · Lesson 11 · Approximate nearest-neighbour search with FAISS (HNSW)
# pip install faiss-cpu numpy
import time
import faiss
import numpy as np

# @stage points
rng = np.random.default_rng(7)
centres = rng.normal(size=(200, 384)).astype(np.float32)          # real embeddings form topic clusters
X = centres[rng.integers(0, 200, 100_000)] + 0.35 * rng.normal(size=(100_000, 384)).astype(np.float32)
faiss.normalize_L2(X)                                             # 100k vectors, embedding-sized, length 1
Q = X[:20] + 0.05 * rng.normal(size=(20, 384)).astype(np.float32)
faiss.normalize_L2(Q)                                             # 20 queries
# @end

# @stage build
hnsw = faiss.IndexHNSWFlat(384, 16)         # M = 16 links per vector; L2 on length-1 vectors ranks like cosine
hnsw.add(X)                                 # the graph is built once, here
# @end

# @stage brute
flat = faiss.IndexFlatL2(384); flat.add(X)  # exact: compares the query with every vector
t = time.perf_counter(); _, exact = flat.search(Q, 5); t_flat = (time.perf_counter() - t) / len(Q)
# @end

# @stage search
for ef in (16, 32, 128):                    # search width (ef): wider = slower, finds more
    hnsw.hnsw.efSearch = ef
    t = time.perf_counter(); _, found = hnsw.search(Q, 5); t_hnsw = (time.perf_counter() - t) / len(Q)
# @end
# @stage compare
    recall = np.mean([len(set(a) & set(b)) / 5 for a, b in zip(found, exact)])
    print(f"ef {ef:3d}: recall@5 {recall:.0%}   graph {t_hnsw * 1e3:.2f} ms vs exact {t_flat * 1e3:.2f} ms per query")
# @end
