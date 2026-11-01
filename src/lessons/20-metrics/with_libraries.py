# NalarNusa RAG Visual Lab · Lesson 20 · Retrieval metrics with ranx (and the same numbers by hand)
# pip install ranx
from ranx import Qrels, Run, evaluate

# @stage relevant
# Which chunks are relevant for each question: {question_id: {chunk_id: relevance}}
qrels = Qrels({"q1": {"c7": 1}, "q2": {"c3": 1, "c4": 1}})
# @end

# @stage scores
# What your retriever returned, with scores: {question_id: {chunk_id: score}}
run = Run({"q1": {"c2": 0.9, "c7": 0.8, "c5": 0.1}, "q2": {"c3": 0.7, "c9": 0.6, "c4": 0.5}})
# @end

# @stage recall
print(evaluate(qrels, run, ["recall@3", "precision@3"]))
# @end

# @stage mrr
print(evaluate(qrels, run, "mrr"))   # q1: first relevant at rank 2 -> 0.5; q2: rank 1 -> 1.0; MRR = 0.75
# @end

# @stage ndcg
print(evaluate(qrels, run, "ndcg@3"))
# @end
