# NalarNusa RAG Visual Lab · Lesson 5 · Similarity with numpy, scikit-learn and sentence-transformers
# pip install numpy scikit-learn sentence-transformers
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity, euclidean_distances
from sentence_transformers import SentenceTransformer, util

# @stage vectors
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
a, b = model.encode(["How much does printing cost?", "PLA prints cost Rp 2.000 per gram."])
# @end

# @stage dot
print("dot     ", float(np.dot(a, b)))
# @end

# @stage lengths
print("lengths ", float(np.linalg.norm(a)), float(np.linalg.norm(b)))
# @end

# @stage cosine
print("cosine  ", float(cosine_similarity([a], [b])[0, 0]), float(util.cos_sim(a, b)))
# @end

# @stage distance
print("distance", float(euclidean_distances([a], [b])[0, 0]))
# After normalize_embeddings=True all three rank results the same way.
# @end
