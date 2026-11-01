# NalarNusa RAG Visual Lab · Lesson 19 · Let an LLM reword the drafts, then review them yourself
# pip install openai
import json
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")   # any OpenAI-compatible server

# @stage facts
drafts = json.load(open("test_set.json", encoding="utf-8"))   # from test_set.py: [[draft question, fact], ...]
# @end

# @stage draft
def reword(draft, fact):
    sentence = draft.split(": ", 1)[-1].replace("___", fact)
    r = client.chat.completions.create(model="qwen2.5:7b-instruct", temperature=0.7, messages=[{"role": "user", "content":
        "Write one short, natural question that a student would ask and that this sentence answers. "
        "Use different words from the sentence where you can. Reply with the question only, in the same "
        f"language as the sentence.\nSentence: {sentence}"}])
    return r.choices[0].message.content.strip()
# @end

# @stage review
reviewed = []
for q, fact in drafts:
    new = reword(q, fact)
    ok = input(f"{new}\n  expected: {fact}\n  keep? [y/n/edit] ")   # a person decides, every time
    if ok == "y":
        reviewed.append([new, fact])
    elif ok not in ("n", ""):
        reviewed.append([ok, fact])
reviewed += [["How do I renew my passport?", None]]               # unanswerable: the system should refuse
# @end

# @stage save
json.dump(reviewed, open("test_set.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# @end
