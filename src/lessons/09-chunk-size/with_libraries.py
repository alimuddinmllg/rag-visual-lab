# NalarNusa RAG Visual Lab · Lesson 9 · Chunk-size sweep with LangChain + sentence-transformers
# pip install langchain-text-splitters sentence-transformers
import json
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer, util

# @stage testset
text = open("nusabot_handbook.txt", encoding="utf-8").read()
tests = json.load(open("test_set.json", encoding="utf-8"))        # [[question, expected], ...], see lesson 19
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
q_emb = model.encode([q for q, _ in tests], normalize_embeddings=True)
# @end

# @stage sweep
results = {}
for size in (100, 200, 300, 500, 800):                              # characters this time
    chunks = RecursiveCharacterTextSplitter(chunk_size=size, chunk_overlap=size // 10).split_text(text)
    c_emb = model.encode(chunks, normalize_embeddings=True)
    top = util.semantic_search(q_emb, c_emb, top_k=2)
# @end
# @stage score
    hits = sum(any(e.lower() in chunks[h["corpus_id"]].lower() for h in hits_q)
               for (_, e), hits_q in zip(tests, top))
    results[size] = hits / len(tests)
    print(f"size {size:4d}: hit rate {results[size]:.0%}")
# @end

# @stage best
print("best:", max(results, key=lambda s: (results[s], -s)))
# @end
