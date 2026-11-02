# NalarNusa RAG Visual Lab · Lesson 26 · Keeping the index fresh: content hashes, duplicates and four sync strategies
import re
from rag_from_scratch import embed_chunks, tokenize, vectorize, cosine, extract_answer   # lesson 6
from chunkers import recursive_chunks                                                 # lesson 8

STRATEGIES = ["none", "add-only", "full", "incremental"]


# @stage snapshot
def documents(handbook):
    """One document per section, keyed by a slug of its title."""
    docs = []
    for part in re.split(r"\n(?=## )", handbook.strip()):
        title = part.split("\n", 1)[0].lstrip("# ").strip()
        docs.append({"id": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-"), "text": part})
    return docs


def snapshot(docs, day, changes):
    """The folder as it looks on a given day: edits, a re-uploaded copy, an old version, a deletion."""
    out = [dict(d) for d in docs]
    for d in out:
        for when, doc_id, old, new in changes["edits"]:
            if day >= when and d["id"] == doc_id:
                d["text"] = d["text"].replace(old, new)
    for when, doc_id, src, old, new in changes["copies"]:
        if day >= when:
            base = next(d for d in out if d["id"] == src)
            out.append({"id": doc_id, "text": base["text"].replace(old, new)})
    return [d for d in out if not any(day >= when and d["id"] == x for when, x in changes["deletes"])]
# @end


# @stage hash
def normalize(text):
    return " ".join(text.lower().split())


def fnv1a(text):
    """A 32-bit content hash: same text, same hash, so an unchanged chunk is never embedded twice."""
    h = 0x811C9DC5
    for ch in text:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return format(h, "08x")


def chunk_and_hash(docs, size=50):
    return [{"doc": d["id"], "text": c["text"], "hash": fnv1a(normalize(c["text"]))}
            for d in docs for c in recursive_chunks(d["text"], size)]
# @end


# @stage dedup
def shingles(text):
    w = normalize(text).split()
    return {" ".join(w[i:i + 3]) for i in range(max(1, len(w) - 2))}


def dedup(chunks, threshold):
    """Drop exact copies (same hash) and near copies (word-shingle Jaccard >= threshold)."""
    kept, dropped = [], []
    for c in chunks:
        if any(k["hash"] == c["hash"] for k in kept):
            dropped.append({**c, "why": "exact"})
            continue
        s = shingles(c["text"])
        best = max((len(s & shingles(k["text"])) / len(s | shingles(k["text"])) for k in kept), default=0.0)
        if best >= threshold:
            dropped.append({**c, "why": "near"})
        else:
            kept.append(c)
    return kept, dropped
# @end


# @stage sync
def wanted(docs, day, changes, threshold):
    kept, _ = dedup(chunk_and_hash(snapshot(docs, day, changes)), threshold)
    return {c["hash"]: c for c in kept}


def sync(docs, day, changes, threshold, strategy):
    """Replay days 1..day. Returns the index on that day and how many chunks were embedded in total."""
    index, embedded, prev = {}, 0, {}
    for t in range(1, day + 1):
        want = wanted(docs, t, changes, threshold)
        if strategy == "none":                    # built once on day 1, never touched again
            if t == 1:
                index, embedded = dict(want), len(want)
        elif strategy == "full":                  # throw it away and re-embed everything
            index, embedded = dict(want), embedded + len(want)
        elif strategy == "add-only":              # embeds what is new, never deletes
            embedded += sum(h not in index for h in want)
            index.update({h: c for h, c in want.items() if h not in index})
        else:                                     # incremental: add new hashes, delete missing ones
            embedded += sum(h not in prev for h in want)
            index = dict(want)
        prev = want
    return list(index.values()), embedded
# @end


# @stage answer
def ask(index, question, lang, stop, min_sim=0.2):
    idf, _, vectors = embed_chunks(index, stop, lang)
    qv = vectorize(tokenize(question, stop, lang), idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    top = sorted(range(len(scores)), key=lambda i: (-scores[i], i))[:3]
    known = [t for t in tokenize(question, stop, lang) if t in idf]
    used = [(i, scores[i]) for i in top if scores[i] >= min_sim]
    return used, extract_answer(used, index, known, idf, stop, lang)


def verdict(used, index, answer, fact):
    """current, stale, conflict (old and new both in the context), served-deleted, refused or missed."""
    if fact["deleted"]:
        return "refused" if not used else "served-deleted" if fact["new"] in answer else "missed"
    ctx = " ".join(index[i]["text"] for i, _ in used)
    old = fact["old"] if fact["old"] != fact["new"] else None
    if old and old in ctx and fact["new"] in ctx:
        return "conflict"
    if old and old in answer:
        return "stale"
    return "current" if fact["new"] in answer else "missed"


def demo(handbook, changes, facts, day, strategy, threshold, qi, question, lang, stop):
    stop = set(stop)
    docs = documents(handbook)
    today = chunk_and_hash(snapshot(docs, day, changes))
    kept, dropped = dedup(today, threshold)
    index, embedded = sync(docs, day, changes, threshold, strategy)
    cost = {s: sync(docs, day, changes, threshold, s)[1] for s in STRATEGIES}
    used, answer = ask(index, question, lang, stop)
    f = facts[qi]
    fact = {"old": f["old"], "new": f["new"] if day >= f["day"] else f["old"], "deleted": f.get("deleted", False) and day >= f["day"]}
    v = verdict(used, index, answer, fact)
    print(f"day {day}: {len(today)} chunks, {len(dropped)} duplicates dropped; index holds {len(index)}")
    print("embedded so far:", ", ".join(f"{s} {n}" for s, n in cost.items()))
    print(question, "->", answer, f"[{v}]")
    return {"dropped": [c["hash"] for c in dropped], "index": sorted(c["hash"] for c in index), "cost": cost, "answer": answer, "verdict": v}
# @end
