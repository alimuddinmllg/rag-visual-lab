# NalarNusa RAG Visual Lab · Lesson 31 · Monitoring in production: a 30-day query log, daily metrics, alerts, drill-down
# The log is simulated (seeded, so it is the same every run), but every query really goes through retrieval.
import math
import re
from rag_from_scratch import parse_document, chunk_document, embed_chunks, tokenize, vectorize, cosine   # lesson 6


def rng(seed):
    s = seed % 2147483646 + 1
    def rand():
        nonlocal s
        s = s * 16807 % 2147483647
        return s / 2147483647
    return rand


# @stage log
def without_section(document, title):
    """The incident: a sync bug drops one page from the index (lesson 26)."""
    return "\n".join(p for p in re.split(r"\n(?=## )", document) if not p.startswith("## " + title))


def make_index(document, stop, lang):
    _, words = parse_document(document)
    chunks = chunk_document(words, 40, 8)
    idf, _, vectors = embed_chunks(chunks, stop, lang)
    return chunks, idf, vectors


def coverage(question, index, stop, lang):
    """Share of the question's words found in the best chunk. Under half = an empty retrieval."""
    chunks, idf, vectors = index
    words = list(dict.fromkeys(tokenize(question, stop, lang)))
    qv = vectorize(words, idf)
    scores = [cosine(qv, v) if qv else 0.0 for v in vectors]
    best = min(range(len(scores)), key=lambda i: (-scores[i], i))
    have = set(tokenize(chunks[best]["text"], stop, lang))
    return sum(t in have for t in words) / max(1, len(words))


def simulate(document, pools, broken_title, stop, lang, days=30, seed=11, min_cover=0.5):
    """Each day: a number of queries, each with a retrieval score, a latency and maybe a thumbs up/down.
    Planted problems: a slow model provider on days 6-8, the 3D printing page missing on days 13-16,
    and from day 22 users asking about a new machine the documents don't cover."""
    r = rng(seed)
    indexes = {"ok": make_index(document, stop, lang), "broken": make_index(without_section(document, broken_title), stop, lang)}
    cache, log = {}, []
    answerable = pools["answerable"] + pools["printing"]               # printing questions are asked twice as often
    for day in range(1, days + 1):
        version = "broken" if 13 <= day <= 16 else "ok"
        weekend = day % 7 in (6, 0)
        n = math.floor(40 * (0.6 if weekend else 1) * (1 + 0.01 * day) + 0.5) + math.floor(r() * 8)
        for _ in range(n):
            u, new_share = r(), (0.18 if day >= 22 else 0.0)
            if u < new_share:
                pool = pools["new"]
            elif u < new_share + 0.06:
                pool = pools["unanswerable"]
            else:
                pool = answerable
            q = pool[math.floor(r() * len(pool))]
            if (version, q) not in cache:
                cache[(version, q)] = coverage(q, indexes[version], stop, lang)
            cover = cache[(version, q)]
            empty = cover < min_cover
            ms = (700 + r() * 600) * (2.5 if 6 <= day <= 8 else 1)
            gives, down = r() < 0.3, r() < (0.8 if empty else 0.08)
            log.append({"day": day, "q": q, "cover": cover, "empty": empty, "ms": ms, "feedback": ("down" if down else "up") if gives else None})
    return log
# @end


# @stage aggregate
def daily(log, days=30):
    out = []
    for d in range(1, days + 1):
        rows = [x for x in log if x["day"] == d]
        fb = [x for x in rows if x["feedback"]]
        ms = sorted(x["ms"] for x in rows)
        out.append({"day": d, "volume": len(rows), "empty": sum(x["empty"] for x in rows) / len(rows),
                    "down": sum(x["feedback"] == "down" for x in fb) / len(fb) if fb else 0.0,
                    "p95": ms[math.ceil(0.95 * len(ms)) - 1]})
    return out
# @end


# @stage alert
def alerts(days, rules, window):
    """A rule fires when its metric is over the threshold for `window` days in a row; one alert per episode."""
    fired = []
    for metric, limit in rules.items():
        run, on = 0, False
        for d in days:
            run = run + 1 if d[metric] > limit else 0
            if run >= window and not on:
                fired.append({"metric": metric, "day": d["day"]})
            on = run >= window
    return sorted(fired, key=lambda a: (a["day"], a["metric"]))
# @end


# @stage drill
def drill(log, day, top=5):
    """What did people ask, and not get, on the alert day?"""
    counts = {}
    for x in log:
        if x["day"] == day and x["empty"]:
            counts[x["q"]] = counts.get(x["q"], 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top]


def demo(document, pools, broken_title, rules, window, lang, stop):
    stop = set(stop)
    log = simulate(document, pools, broken_title, stop, lang)
    days = daily(log)
    fired = alerts(days, rules, window)
    empty_alerts = [a["day"] for a in fired if a["metric"] == "empty"]
    drilled = {d: drill(log, d) for d in empty_alerts}
    print(f"{len(log)} queries over {len(days)} days")
    for a in fired:
        print(f"day {a['day']:2d}: ALERT {a['metric']}")
    for d, rows in drilled.items():
        print(f"day {d} empty retrievals:", rows)
    return {"n": len(log), "days": days, "alerts": fired, "drill": {str(d): rows for d, rows in drilled.items()}}
# @end
