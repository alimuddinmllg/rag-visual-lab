# NalarNusa RAG Visual Lab · Lesson 14 · Hybrid search with LangChain's EnsembleRetriever
# pip install langchain langchain-community langchain-huggingface rank-bm25 faiss-cpu
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

chunks = [p.strip() for p in open("nusabot_handbook.txt", encoding="utf-8").read().split("\n\n") if p.strip()]

# @stage keyword
keyword = BM25Retriever.from_texts(chunks, k=10)
# @end

# @stage vector
emb = HuggingFaceEmbeddings(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
vector = FAISS.from_texts(chunks, emb).as_retriever(search_kwargs={"k": 10})
# @end

# @stage fuse
hybrid = EnsembleRetriever(retrievers=[keyword, vector], weights=[0.5, 0.5], c=60)   # weighted RRF, k = 60
for d in hybrid.invoke("What is the price per gram for PLA?")[:3]:
    print(d.page_content[:80])
# @end

# @stage evaluate
# Run your test set (lesson 19) through keyword, vector and hybrid; keep hybrid only if it wins.
# @end
