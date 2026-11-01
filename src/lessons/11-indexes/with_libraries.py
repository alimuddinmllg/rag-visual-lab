# NalarNusa RAG Visual Lab · Lesson 11 · Approximate nearest-neighbour search with FAISS (HNSW)
# pip install faiss-cpu numpy
import time
import faiss
import numpy as np

# @stage points
rng = np.random.default_rng(7)
X = rng.random((100_000, 384), dtype=np.float32)            # 100k vectors, embedding-sized
faiss.normalize_L2(X)
q = rng.random((1, 384), dtype=np.float32); faiss.normalize_L2(q)
# @end

# @stage build
hnsw = faiss.IndexHNSWFlat(384, 16, faiss.METRIC_INNER_PRODUCT)   # M = 16 links per vector
hnsw.add(X)                                                       # the graph is built once, here
# @end

# @stage brute
flat = faiss.IndexFlatIP(384); flat.add(X)                        # exact: compares with every vector
t = time.perf_counter(); _, exact = flat.search(q, 5); t_flat = time.perf_counter() - t
# @end

# @stage search
hnsw.hnsw.efSearch = 32                                           # search width (ef)
t = time.perf_counter(); _, found = hnsw.search(q, 5); t_hnsw = time.perf_counter() - t
# @end

# @stage compare
recall = len(set(exact[0]) & set(found[0])) / 5
print(f"recall@5 {recall:.0%}   exact {t_flat * 1e3:.1f} ms   graph {t_hnsw * 1e3:.2f} ms")
# @end
