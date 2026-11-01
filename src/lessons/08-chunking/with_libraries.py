# NalarNusa RAG Visual Lab · Lesson 8 · Chunking with LangChain text splitters
# pip install langchain-text-splitters langchain-experimental langchain-huggingface
from langchain_text_splitters import CharacterTextSplitter, RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

text = open("nusabot_handbook.txt", encoding="utf-8").read()
words = lambda s: len(s.split())                    # measure size in words, like the lab

# @stage fixed
fixed = CharacterTextSplitter(separator=" ", chunk_size=50, chunk_overlap=0, length_function=words).split_text(text)
# @end

# @stage sentence
sentence = RecursiveCharacterTextSplitter(separators=[". ", "? ", "! "], keep_separator="end",
                                          chunk_size=50, chunk_overlap=0, length_function=words).split_text(text)
# @end

# @stage recursive
# section -> paragraph -> sentence -> word: the biggest unit that fits wins
recursive = RecursiveCharacterTextSplitter(separators=["\n## ", "\n\n", ". ", " "],
                                           chunk_size=50, chunk_overlap=0, length_function=words).split_text(text)
# @end

# @stage semantic
emb = HuggingFaceEmbeddings(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
semantic = SemanticChunker(emb, breakpoint_threshold_type="percentile").split_text(text)
# @end

# @stage compare
for name, chunks in [("fixed", fixed), ("sentence", sentence), ("recursive", recursive), ("semantic", semantic)]:
    mid = sum(not c.rstrip().endswith((".", "!", "?")) for c in chunks)
    print(f"{name:10s} {len(chunks):4d} chunks, {mid} end mid-sentence")
# @end
