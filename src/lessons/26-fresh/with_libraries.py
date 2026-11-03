# NalarNusa RAG Visual Lab · Lesson 26 · Incremental sync of a folder into a vector database, with content hashes as ids
# pip install chromadb
# Uses Chroma's built-in small embedding model (downloaded on first use).
import hashlib
import pathlib
import chromadb

FOLDER = pathlib.Path("docs")                 # your documents, as .md or .txt files
client = chromadb.PersistentClient(path="index")
col = client.get_or_create_collection("handbook")


# @stage snapshot
def read_folder(folder):
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(folder.glob("*.*")) if p.suffix in (".md", ".txt")}
# @end


# @stage hash
def chunks_of(text, size=120):
    words = text.split()
    return [" ".join(words[i:i + size]) for i in range(0, len(words), size)]


def content_id(text):
    """The id IS the hash of the normalised text: same text, same id."""
    return hashlib.sha256(" ".join(text.lower().split()).encode()).hexdigest()[:16]
# @end


def sync(folder):
    # @stage dedup
    wanted = {}
    for name, text in read_folder(folder).items():
        for piece in chunks_of(text):
            wanted.setdefault(content_id(piece), (piece, name))   # an exact copy has the same id: kept once
    # @end
    # @stage sync
    existing = set(col.get(include=[])["ids"])
    new = [h for h in wanted if h not in existing]
    gone = [h for h in existing if h not in wanted]
    if new:
        col.add(ids=new, documents=[wanted[h][0] for h in new], metadatas=[{"source": wanted[h][1]} for h in new])
    if gone:
        col.delete(ids=gone)                                       # deletions matter as much as additions
    print(f"{len(new)} embedded, {len(gone)} deleted, {len(wanted) - len(new)} unchanged")
    # @end


# @stage answer
if __name__ == "__main__":
    FOLDER.mkdir(exist_ok=True)
    if not any(FOLDER.iterdir()) and pathlib.Path("handbook.txt").exists():     # no documents yet: one file per handbook section
        for n, part in enumerate(open("handbook.txt", encoding="utf-8").read().split("\n## ")):
            (FOLDER / f"section_{n + 1:02d}.md").write_text("## " + part.lstrip("# "), encoding="utf-8")
    sync(FOLDER)                                                   # run it again after editing files: only changes are embedded
    res = col.query(query_texts=["When is the lab open on Saturday?"], n_results=3)
    for doc, meta in zip(res["documents"][0], res["metadatas"][0]):
        print(meta["source"], "|", doc[:100])
# @end
