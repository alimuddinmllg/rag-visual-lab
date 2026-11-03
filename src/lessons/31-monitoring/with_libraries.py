# NalarNusa RAG Visual Lab · Lesson 31 · Production logging and alerting with JSON lines and pandas
# pip install pandas
import json
import time
import pandas as pd

LOG = "rag_queries.jsonl"


# @stage log
def log_query(question, chunks_used, best_cover, ms, answer):
    """Call this once per answered question. One JSON object per line is easy to append and to load."""
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "q": question, "chunks": chunks_used, "cover": best_cover,
                            "empty": best_cover < 0.5, "ms": ms, "answer": answer, "feedback": None}) + "\n")
# @end


# @stage aggregate
def daily(path=LOG):
    df = pd.read_json(path, lines=True)
    df["day"] = pd.to_datetime(df["ts"], unit="s").dt.date
    return df.groupby("day").agg(volume=("q", "size"), empty=("empty", "mean"), p95=("ms", lambda s: s.quantile(0.95)),
                                 down=("feedback", lambda s: (s == "down").sum() / max(1, s.notna().sum())))
# @end


# @stage alert
RULES = {"empty": 0.15, "p95": 2500, "down": 0.25}


def check(days, window=2):
    """Fire when a metric is over its threshold for `window` days in a row. Send these to chat or email."""
    out = []
    for metric, limit in RULES.items():
        over = (days[metric] > limit).astype(int)
        streak = over.groupby((over == 0).cumsum()).cumsum()
        for day in days.index[(streak == window)]:
            out.append((day, metric, float(days.loc[day, metric])))
    return sorted(out)
# @end


# @stage drill
def drill(day, path=LOG):
    df = pd.read_json(path, lines=True)
    df["day"] = pd.to_datetime(df["ts"], unit="s").dt.date
    return df[(df["day"] == day) & df["empty"]]["q"].value_counts().head(5)


if __name__ == "__main__":
    import os, random
    if not os.path.exists(LOG):                     # no real log yet: two weeks of example traffic, with two bad days
        r = random.Random(7); now = time.time()
        for d in range(14):
            for _ in range(r.randint(20, 40)):
                cover = r.random() * 0.6 if d in (9, 10) else 0.47 + r.random() * 0.53
                with open(LOG, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"ts": now - (13 - d) * 86400 + r.random() * 3600, "q": r.choice(["PLA price?", "Saturday hours?", "CNC machine?"]),
                                        "chunks": [1], "cover": cover, "empty": cover < 0.5, "ms": r.uniform(600, 1400), "answer": "",
                                        "feedback": r.choice([None, None, "up", "down" if cover < 0.5 else "up"])}) + "\n")
    days = daily()
    print(days.tail(7))
    for day, metric, value in check(days):
        print(f"ALERT {day} {metric} = {value:.2f}")
        if metric == "empty":
            print(drill(day))
# @end
