# NalarNusa RAG Visual Lab · Lesson 6 · A RAG pipeline from scratch
# Only Python + numpy. Each stage below is the code the visual runs.
import math
import re
import numpy as np


# @stage chunk
def parse_document(text):
    """Split the document into words and remember which section each word is in."""
    sections, words = [], []
    for line in text.split("\n"):
        t = line.strip()
        if not t:
            continue
        if t.startswith("## "):
            sections.append(t[3:])
            continue
        for w in t.split():
            words.append((w, max(0, len(sections) - 1)))
    if not sections:
        sections.append("Document")
    return sections, words


def chunk_document(words, size, overlap):
    """Cut the word list into chunks of `size` words that overlap by `overlap` words."""
    step = max(5, size - overlap)
    chunks = []
    start = 0
    while start < len(words):
        ws = words[start:start + size]
        counts = {}
        for _, sec in ws:
            counts[sec] = counts.get(sec, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        mixed = len(ranked) > 1 and ranked[0][1] / len(ws) < 0.75
        chunks.append({
            "id": len(chunks),
            "text": " ".join(w for w, _ in ws),
            "sec": ranked[0][0],
            "sec2": ranked[1][0] if mixed else None,
        })
        if start + size >= len(words):
            break
        start += step
    return chunks
# @end


# @stage embed
def stem(w, lang):
    """A tiny English stemmer: printing -> print, prints -> print."""
    if lang != "en":
        return w
    if len(w) > 5 and w.endswith("ing"):
        return w[:-3]
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def tokenize(text, stop, lang):
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [stem(t, lang) for t in words if len(t) > 1 and t not in stop]


def vectorize(tokens, idf):
    """TF-IDF vector, scaled to length 1. Stored as {word: weight}."""
    tf = {}
    for t in tokens:
        if t in idf:
            tf[t] = tf.get(t, 0) + 1
    v = {t: (1 + math.log(c)) * idf[t] for t, c in tf.items()}
    norm = math.sqrt(sum(w * w for w in v.values())) or 1
    return {t: w / norm for t, w in v.items()}


def embed_chunks(chunks, stop, lang):
    toks = [tokenize(c["text"], stop, lang) for c in chunks]
    df = {}
    for ts in toks:
        for t in dict.fromkeys(ts):          # each word once per chunk
            df[t] = df.get(t, 0) + 1
    n = len(chunks)
    idf = {t: math.log((n + 1) / (d + 1)) + 1 for t, d in df.items()}
    vocab = list(idf.keys())
    vectors = [vectorize(ts, idf) for ts in toks]
    return idf, vocab, vectors


def pca_2d(vectors, vocab):
    """Squash the vectors to 2D for the map (PCA by power iteration)."""
    index = {t: i for i, t in enumerate(vocab)}
    X = np.zeros((len(vectors), len(vocab)))
    for i, v in enumerate(vectors):
        for t, w in v.items():
            X[i, index[t]] = w
    mean = X.mean(axis=0)
    Xc = X - mean
    K = Xc @ Xc.T
    comps = []
    for c in range(2):
        v = np.array([1 + ((i * 7 + c * 3) % 5) * 0.13 for i in range(len(vectors))])
        lam = 0.0
        for _ in range(150):
            w = K @ v
            nm = np.linalg.norm(w) or 1
            v, lam = w / nm, nm
        if v[np.argmax(np.abs(v))] < 0:
            v = -v
        comps.append((v, lam))
        K = K - lam * np.outer(v, v)
    coords = np.stack([v * math.sqrt(max(lam, 1e-12)) for v, lam in comps], axis=1)
    axes = [Xc.T @ (v / math.sqrt(max(lam, 1e-12))) for v, lam in comps]
    return coords, mean, axes, index
# @end


# @stage query
def embed_question(question, idf, stop, lang):
    q_tokens = tokenize(question, stop, lang)
    qv = vectorize(q_tokens, idf)
    known = list(dict.fromkeys(t for t in q_tokens if t in idf))
    return qv, known
# @end


# @stage retrieve
def cosine(a, b):
    """Both vectors have length 1, so cosine similarity is just the dot product."""
    if len(a) > len(b):
        a, b = b, a
    return sum(w * b[t] for t, w in a.items() if t in b)


def retrieve(qv, vectors, top_k):
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    return scores, [(i, scores[i]) for i in order[:top_k]]
# @end


# @stage generate
PROMPT = {
    "en": dict(
        system="You are a helpful assistant for the NusaBot Robotics Lab.\n"
               "Answer ONLY using the context below and cite sources like [1].\n"
               "If the answer is not in the context, say you don't know.",
        context="Context:", none="(no relevant chunks found)", question="Question:", answer="Answer:",
        refuse="I don't know. The document doesn't contain anything about this question."),
    "id": dict(
        system="Anda adalah asisten untuk NusaBot Robotics Lab.\n"
               "Jawab HANYA berdasarkan konteks di bawah dan sebutkan sumber seperti [1].\n"
               "Jika jawabannya tidak ada di konteks, katakan Anda tidak tahu.",
        context="Konteks:", none="(tidak ada potongan yang relevan)", question="Pertanyaan:", answer="Jawaban:",
        refuse="Saya tidak tahu. Dokumen tidak berisi informasi tentang pertanyaan ini."),
}


def build_prompt(question, used, chunks, sections, lang):
    T = PROMPT.get(lang, PROMPT["en"])
    ctx = "\n\n".join(f"[{r + 1}] ({sections[chunks[i]['sec']]}) {chunks[i]['text']}"
                      for r, (i, _) in enumerate(used))
    return f"{T['system']}\n\n{T['context']}\n{ctx or T['none']}\n\n{T['question']} {question}\n{T['answer']}"


def extract_answer(used, chunks, known, idf, stop, lang):
    """Stand-in for an LLM: pick the best-matching sentences and cite them."""
    T = PROMPT.get(lang, PROMPT["en"])
    if not used:
        return T["refuse"]
    qset = set(known)
    cands = []
    for r, (i, _) in enumerate(used):
        for sent in re.split(r"(?<=[.!?])\s+", chunks[i]["text"]):
            sc = sum(idf.get(x, 0) for x in dict.fromkeys(tokenize(sent, stop, lang)) if x in qset)
            if sc > 0:
                cands.append((sent, sc, r))
    cands.sort(key=lambda c: -c[1])
    picks = []
    for sent, sc, r in cands:
        if len(picks) >= 2:
            break
        if len(re.split(r"\s+", sent)) < 5:
            continue
        if any(sent[:40] in p[0] or p[0][:40] in sent for p in picks):   # overlap repeats text
            continue
        if picks and sc < picks[0][1] * 0.6:
            break
        picks.append((sent, sc, r))
    if not picks:
        return T["refuse"]
    fmt = lambda s: ("" if re.match(r"[A-Z0-9]", s) else "…") + s + ("" if re.search(r"[.!?]$", s) else "…")
    return " ".join(f"{fmt(s)} [{r + 1}]" for s, _, r in picks)
# @end


def run_pipeline(document, question, size, overlap, top_k, min_sim, lang, stop, verbose=False):
    log = print if verbose else (lambda *a: None)
    sections, words = parse_document(document)
    chunks = chunk_document(words, size, overlap)
    log(f"chunk    size={size} overlap={overlap} -> {len(chunks)} chunks")

    idf, vocab, vectors = embed_chunks(chunks, stop, lang)
    coords, mean, axes, _ = pca_2d(vectors, vocab)
    log(f"embed    TF-IDF, {len(vocab)} terms -> {len(vectors)} vectors")

    qv, known = embed_question(question, idf, stop, lang)
    log(f"query    known words: {', '.join(known) or '(none)'}")

    scores, top = retrieve(qv, vectors, top_k)
    used = [(i, s) for i, s in top if s >= min_sim and known]
    log("retrieve " + ", ".join(f"#{i + 1} {s:.2f}" for i, s in top))

    prompt = build_prompt(question, used, chunks, sections, lang)
    answer = extract_answer(used, chunks, known, idf, stop, lang)
    log(f"generate {len(used)} chunks in prompt\n\nAnswer: {answer}")

    query_xy = None
    if known:
        q = np.zeros(len(vocab))
        for t, w in qv.items():
            q[vocab.index(t)] = w
        query_xy = [float((q - mean) @ a) for a in axes]
    return {
        "n_chunks": len(chunks),
        "vocab_size": len(vocab),
        "known": known,
        "top": [[i, s] for i, s in top],
        "used": [i for i, _ in used],
        "coords": coords.tolist(),
        "query_xy": query_xy,
        "prompt": prompt,
        "answer": answer,
    }
