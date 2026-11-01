# NalarNusa RAG Visual Lab · Lesson 4 · Neural sentence embeddings with sentence-transformers
# pip install sentence-transformers scikit-learn
import re
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import PCA

# @stage split
doc = open("nusabot_handbook.txt", encoding="utf-8").read()
sentences = [s for line in doc.splitlines() if line.strip() and not line.startswith("## ")
             for s in re.split(r"(?<=[.!?])\s+", line.strip()) if len(s.split()) >= 3]
# @end

# @stage vectorize
# The same model the lab loads in your browser: 384 numbers per sentence, 50+ languages.
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
X = model.encode(sentences, normalize_embeddings=True)          # shape (n, 384), each row length 1
# @end

# @stage map
xy = PCA(n_components=2).fit_transform(X)                       # for drawing only
# @end

# @stage neighbours
probe = model.encode(["What is the price of printing?"], normalize_embeddings=True)[0]
scores = X @ probe                                               # cosine, because rows have length 1
for i in scores.argsort()[::-1][:3]:
    print(f"{scores[i]:.2f}  {sentences[i]}")
# @end
