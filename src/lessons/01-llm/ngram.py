# NalarNusa RAG Visual Lab · Lesson 1 · A tiny language model
# It predicts the next word from the two words before it, by counting.
# Real LLMs do the same job (predict the next token) with a neural network
# trained on trillions of tokens, but the loop is identical.
import re


# @stage read
def lm_tokens(text):
    body = " ".join(l for l in text.split("\n") if not l.strip().startswith("## "))
    return re.findall(r"[a-z0-9]+(?:[.,][0-9]+)*|[.,!?]", body.lower())


def train_lm(tokens):
    uni, bi, tri = {}, {}, {}
    for i, w in enumerate(tokens):
        uni[w] = uni.get(w, 0) + 1
        if i >= 1:
            bi.setdefault(tokens[i - 1], {}).setdefault(w, 0)
            bi[tokens[i - 1]][w] += 1
        if i >= 2:
            k = tokens[i - 2] + " " + tokens[i - 1]
            tri.setdefault(k, {}).setdefault(w, 0)
            tri[k][w] += 1
    return uni, bi, tri
# @end


# @stage predict
def next_dist(lm, context):
    """Probability of every possible next word, using the longest context seen in training."""
    uni, bi, tri = lm
    if len(context) >= 2 and context[-2] + " " + context[-1] in tri:
        counts, order = tri[context[-2] + " " + context[-1]], "trigram"
    elif context and context[-1] in bi:
        counts, order = bi[context[-1]], "bigram"
    else:
        counts, order = uni, "unigram"
    total = sum(counts.values())
    dist = sorted(((w, c / total) for w, c in counts.items()), key=lambda x: (-x[1], x[0]))
    return dist, order
# @end


# @stage sample
def rng(seed):
    """Park-Miller random numbers, identical to the JavaScript version."""
    s = seed % 2147483646 + 1
    def rand():
        nonlocal s
        s = s * 16807 % 2147483647
        return s / 2147483647
    return rand


def sample(dist, temperature, rand):
    """Low temperature: almost always the top word. High: riskier choices."""
    t = max(temperature, 0.05)
    weights = [p ** (1 / t) for _, p in dist]
    r = rand() * sum(weights)
    acc = 0.0
    for i, w in enumerate(weights):
        acc += w
        if r <= acc:
            return i
    return len(dist) - 1
# @end


# @stage repeat
def generate(lm, prompt_tokens, steps, temperature, seed):
    rand = rng(seed)
    ctx, out = list(prompt_tokens), []
    for _ in range(steps):
        dist, order = next_dist(lm, ctx)
        i = sample(dist, temperature, rand)
        out.append(dist[i][0])
        ctx.append(dist[i][0])
    return out


def detok(words):
    s = ""
    for w in words:
        s = s + w if re.fullmatch(r"[.,!?]", w) else (s + " " + w if s else w)
    return s
# @end


# @stage check
def seams(doc_tokens, prompt_tokens, words, n=5):
    """Positions where the model glued together two different parts of the document:
    the last n words never appear together in the training text."""
    seen = {tuple(doc_tokens[i:i + n]) for i in range(len(doc_tokens) - n + 1)}
    seq = list(prompt_tokens) + list(words)
    start = len(prompt_tokens)
    return [k - start for k in range(max(start, n - 1), len(seq)) if tuple(seq[k - n + 1:k + 1]) not in seen]
# @end


def run(document, prompt, steps, temperature, seed):
    lm = train_lm(lm_tokens(document))
    p = lm_tokens(prompt)
    words = generate(lm, p, steps, temperature, seed)
    print(detok(p + words))
    bad = seams(lm_tokens(document), p, words)
    print("seams (word positions not found in the document):", bad or "none")
    return {"words": words, "seams": bad}
