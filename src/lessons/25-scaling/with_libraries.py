# NalarNusa RAG Visual Lab · Lesson 25 · IVF with FAISS: the nprobe curve on embedding-sized data, and int8 storage
# pip install faiss-cpu numpy
import time
import faiss
import numpy as np

# @stage points
rng = np.random.default_rng(7)
D, N = 384, 200_000
centres = rng.normal(size=(500, D)).astype(np.float32)             # real embeddings form topic clusters
X = centres[rng.integers(0, 500, N)] + 0.45 * rng.normal(size=(N, D)).astype(np.float32)
faiss.normalize_L2(X)
Q = X[rng.integers(0, N, 50)] + 0.1 * rng.normal(size=(50, D)).astype(np.float32)
faiss.normalize_L2(Q)
flat = faiss.IndexFlatL2(D); flat.add(X)
t = time.perf_counter(); _, exact = flat.search(Q, 10); t_exact = (time.perf_counter() - t) / len(Q)
# @end

# @stage train
nlist = int(np.sqrt(N))                                            # rule of thumb: about sqrt(N) cells
quantizer = faiss.IndexFlatL2(D)                                  # finds the nearest cell centres
ivf = faiss.IndexIVFFlat(quantizer, D, nlist)
ivf.train(X[:50_000])                                              # k-means on a sample is enough
# @end

# @stage assign
ivf.add(X)                                                         # every vector goes into its nearest cell's list
# @end

# @stage sweep
for nprobe in (1, 2, 4, 8, 16, 32, 64):
    ivf.nprobe = nprobe
    t = time.perf_counter(); _, found = ivf.search(Q, 10); ms = (time.perf_counter() - t) / len(Q) * 1e3
    recall = np.mean([len(set(a) & set(b)) / 10 for a, b in zip(found, exact)])
    print(f"nprobe {nprobe:2d}: recall@10 {recall:.0%}  {ms:.2f} ms/query  (exact {t_exact * 1e3:.2f} ms)")
# @end

# @stage scale
# Same index, vectors stored as 8-bit integers: about 4x less memory, a little less accurate.
quantizer8 = faiss.IndexFlatL2(D)
sq = faiss.IndexIVFScalarQuantizer(quantizer8, D, nlist, faiss.ScalarQuantizer.QT_8bit)
sq.train(X[:50_000]); sq.add(X); sq.nprobe = 16
_, found = sq.search(Q, 10)
print(f"int8 recall@10 at nprobe 16: {np.mean([len(set(a) & set(b)) / 10 for a, b in zip(found, exact)]):.0%}")
print(f"memory for the vectors: float32 {N * D * 4 / 1e6:.0f} MB, int8 {N * D / 1e6:.0f} MB")
# @end
