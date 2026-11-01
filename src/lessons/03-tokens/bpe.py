# NalarNusa RAG Visual Lab · Lesson 3 · Byte-pair encoding (BPE)
# The tokenizer family used by GPT-style models: start from characters,
# then repeatedly merge the most frequent neighbouring pair.
import re

END = "▁"   # marks the end of a word


# @stage chars
def word_freqs(text):
    body = " ".join(l for l in text.split("\n") if not l.strip().startswith("## "))
    freq = {}
    for w in re.findall(r"[a-z0-9]+|[^\sa-z0-9]", body.lower()):
        freq[w] = freq.get(w, 0) + 1
    return freq
# @end


# @stage merge
def train_bpe(freq, num_merges):
    words = [(list(w) + [END], c) for w, c in freq.items()]
    merges = []
    for _ in range(num_merges):
        pairs = {}
        for syms, c in words:
            for a, b in zip(syms, syms[1:]):
                pairs[a + " " + b] = pairs.get(a + " " + b, 0) + c
        best, best_c = None, 1            # only merge pairs seen at least twice
        for k, c in pairs.items():
            if c > best_c or (c == best_c and best is not None and k < best):
                best, best_c = k, c
        if best is None:
            break
        a, b = best.split(" ")
        merges.append((a, b, best_c))
        new_words = []
        for syms, c in words:
            out, i = [], 0
            while i < len(syms):
                if i < len(syms) - 1 and syms[i] == a and syms[i + 1] == b:
                    out.append(a + b); i += 2
                else:
                    out.append(syms[i]); i += 1
            new_words.append((out, c))
        words = new_words
    return merges
# @end


# @stage tokenize
def tokenize(text, merges):
    rank = {a + " " + b: i for i, (a, b, _) in enumerate(merges)}
    out = []
    for w in re.findall(r"[a-z0-9]+|[^\sa-z0-9]", text.lower()):
        syms = list(w) + [END]
        while True:
            best_i, best_r = -1, float("inf")
            for i in range(len(syms) - 1):
                r = rank.get(syms[i] + " " + syms[i + 1])
                if r is not None and r < best_r:
                    best_r, best_i = r, i
            if best_i < 0:
                break
            syms = syms[:best_i] + [syms[best_i] + syms[best_i + 1]] + syms[best_i + 2:]
        out.extend(syms)
    return out
# @end


# @stage window
def fits(n_tokens, window):
    return n_tokens <= window, max(0, n_tokens - window)
# @end


def run(document, text, num_merges, window):
    merges = train_bpe(word_freqs(document), num_merges)
    toks = tokenize(text, merges)
    doc_toks = tokenize(document, merges)
    print(f"{len(merges)} merges learned; text -> {len(toks)} tokens; whole document -> {len(doc_toks)} tokens")
    print(" | ".join(toks))
    return {"tokens": toks, "n_merges": len(merges), "doc_tokens": len(doc_toks)}
