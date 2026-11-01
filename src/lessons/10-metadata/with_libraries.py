# NalarNusa RAG Visual Lab · Lesson 10 · Metadata filters in a vector database (Chroma)
# pip install chromadb sentence-transformers
import re
import chromadb
from chromadb.utils import embedding_functions

# @stage chunk
text = open("nusabot_handbook.txt", encoding="utf-8").read()
chunks = []
for part in text.split("\n## ")[1:]:                     # one section per heading
    title, body = part.split("\n", 1)
    chunks += [{"text": p.strip(), "section": title.strip()} for p in body.split("\n\n") if p.strip()]
# @end

# @stage tag
def kinds(t):
    return {"price": bool(re.search(r"\bRp\s?\d", t)), "time": bool(re.search(r"\b\d{1,2}[:.]\d{2}\b", t))}
# @end

# @stage embed
ef = embedding_functions.SentenceTransformerEmbeddingFunction("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
db = chromadb.Client().create_collection("handbook", embedding_function=ef, metadata={"hnsw:space": "cosine"})
db.add(ids=[str(i) for i in range(len(chunks))], documents=[c["text"] for c in chunks],
       metadatas=[{"section": c["section"], **kinds(c["text"])} for c in chunks])
# @end

# @stage filter
where = {"$and": [{"section": "3D printing"}, {"price": True}]}   # exact, applied inside the search
# @end

# @stage retrieve
hits = db.query(query_texts=["How much does it cost?"], n_results=3, where=where)
# @end

# @stage generate
for doc, meta, dist in zip(hits["documents"][0], hits["metadatas"][0], hits["distances"][0]):
    print(f"{1 - dist:.2f}  [{meta['section']}]  {doc[:80]}")
# @end
