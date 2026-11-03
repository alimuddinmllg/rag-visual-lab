# NalarNusa RAG Visual Lab · Lesson 17 · Sentence-window retrieval with LlamaIndex
# pip install llama-index llama-index-embeddings-huggingface
from llama_index.core import Document, VectorStoreIndex, Settings
from llama_index.core.node_parser import SentenceWindowNodeParser
from llama_index.core.postprocessor import MetadataReplacementPostProcessor
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

Settings.embed_model = HuggingFaceEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
Settings.llm = None                       # this lesson only retrieves; no LLM (and no OpenAI key) needed
text = open("nusabot_handbook.txt", encoding="utf-8").read()

# @stage small
# One node per sentence; each node remembers the sentences around it in its metadata.
nodes = SentenceWindowNodeParser.from_defaults(window_size=1, window_metadata_key="window").get_nodes_from_documents([Document(text=text)])
retriever = VectorStoreIndex(nodes).as_retriever(similarity_top_k=2)
hits = retriever.retrieve("How long can a print run before it needs an overnight slot?")
# @end

# @stage expand
# Swap each matched sentence for its window: search small, read big.
hits = MetadataReplacementPostProcessor(target_metadata_key="window").postprocess_nodes(hits)
for h in hits:
    print(f"{h.score:.2f}  {h.node.get_content()[:120]}")
# @end

# @stage compare
# Measure: is the answer phrase in the context, and how many tokens did it cost? (lesson 20)
# @end
