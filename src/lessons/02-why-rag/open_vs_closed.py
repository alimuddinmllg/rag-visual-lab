# NalarNusa RAG Visual Lab · Lesson 2 · Closed book vs open book
# Uses the tiny language model from lesson 1 and the retrieval pipeline from lesson 6.
from tiny_lm import train_lm, lm_tokens, generate, detok      # lesson 1
from rag_from_scratch import run_pipeline                    # lesson 6

HANDBOOK = open("nusabot_handbook.txt", encoding="utf-8").read()
GENERAL = open("general_knowledge.txt", encoding="utf-8").read()   # other labs, NOT the handbook
QUESTION = "How much does PLA printing cost?"
STEM = "PLA prints cost"            # how the model starts its answer
EXPECT = "2 000 per gram"           # the true fact, from the handbook


def norm(s):
    import re
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


# @stage ask
closed_model = train_lm(lm_tokens(GENERAL))   # like an LLM: trained on public text, never saw your file
# @end

# @stage closed
answer = detok(lm_tokens(STEM) + generate(closed_model, lm_tokens(STEM), 10, 1.0, seed=1))
print("Closed book:", answer, "->", "correct" if " " + EXPECT + " " in norm(answer) else "wrong")
# @end

# @stage repeat
right = sum(" " + EXPECT + " " in norm(detok(lm_tokens(STEM) + generate(closed_model, lm_tokens(STEM), 10, 1.0, seed=s)))
            for s in range(1, 21))
print(f"Closed book correct in {right} of 20 tries")
# @end

# @stage retrieve
result = run_pipeline(HANDBOOK, QUESTION, 40, 8, 3, 0.1, "en", stop=set())   # retrieve + extract
# @end

# @stage open
print("Open book:", result["answer"], "->", "correct" if " " + EXPECT + " " in norm(result["answer"]) else "wrong")
# @end
