# NalarNusa RAG Visual Lab · Lesson 2 · Closed book vs open book
# Uses the tiny language model from lesson 1 and the retrieval pipeline from lesson 6.
# On your computer: keep tiny_lm.py and rag_from_scratch.py next to this file.
import re
from tiny_lm import train_lm, lm_tokens, generate, detok      # lesson 1
from rag_from_scratch import run_pipeline                    # lesson 6


def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


def is_correct(answer, expect):
    """'Correct' means the true fact appears in the answer text."""
    return " " + expect + " " in norm(answer)


# @stage ask
def closed_model(general_text):
    """Like an LLM: trained on public text. It never saw your handbook."""
    return train_lm(lm_tokens(general_text))
# @end


# @stage closed
def closed_book(model, stem, temperature, seed):
    p = lm_tokens(stem)
    return detok(p + generate(model, p, 10, temperature, seed))
# @end


# @stage repeat
def closed_book_many(model, stem, expect, temperature, tries):
    answers = [closed_book(model, stem, temperature, s) for s in range(1, tries + 1)]
    return sum(is_correct(a, expect) for a in answers), answers
# @end


# @stage retrieve
def open_book(handbook, question, lang, stop):
    # retrieve the most similar passages, then answer only from them
    return run_pipeline(handbook, question, 40, 8, 3, 0.1, lang, stop)
# @end


# @stage open
def demo(handbook, general, question, stem, expect, lang, stop, temperature=1.0, tries=20):
    model = closed_model(general)
    first = closed_book(model, stem, temperature, 1)
    right, _ = closed_book_many(model, stem, expect, temperature, tries)
    result = open_book(handbook, question, lang, set(stop))
    print("Question:   ", question)
    print("Closed book:", first, "->", "correct" if is_correct(first, expect) else "wrong")
    print(f"Closed book correct in {right} of {tries} tries")
    print("Open book:  ", result["answer"], "->", "correct" if is_correct(result["answer"], expect) else "wrong")
    return {"closed": first, "closed_right": right, "open": result["answer"]}
# @end


if __name__ == "__main__":
    import json
    handbook = open("nusabot_handbook.txt", encoding="utf-8").read()
    general = open("general_knowledge.txt", encoding="utf-8").read()     # other labs, NOT the handbook
    stop = json.load(open("stopwords.json", encoding="utf-8"))["en"]
    demo(handbook, general, "How much does PLA printing cost?", "PLA prints cost", "2 000 per gram", "en", stop)
