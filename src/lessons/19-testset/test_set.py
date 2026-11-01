# NalarNusa RAG Visual Lab · Lesson 19 · Draft a test set from your own document
# A test set is just data: questions plus a phrase the right answer must contain.
import json
import re

# @stage facts
FACT = re.compile(
    r"(Rp\s?[0-9][0-9.,]*(?:\s+per\s+\w+)?"                       # prices
    r"|\b[0-9]{1,2}[:.][0-9]{2}\b"                                 # times
    r"|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+\w+"
    r"|\b[0-9]+(?:[.,][0-9]+)?\s*(?:%|days?|hours?|weeks?|pages?|credits?|hari|jam|minggu|halaman|sks)\b)",
    re.I | re.A)


def find_facts(text, limit=15):
    out = []
    for line in text.split("\n"):
        t = line.strip()
        if not t or t.startswith("## "):
            continue
        for s in re.split(r"(?<=[.!?])\s+", t):
            m = FACT.search(s)
            if m and len(s.split()) >= 5:
                out.append((s, m.group(0)))
    return out[:limit]
# @end


# @stage draft
def draft(facts, lang):
    head = "Menurut dokumen: " if lang == "id" else "According to the document: "
    return [[head + s.replace(f, "___", 1), f] for s, f in facts]
# @end


# @stage review
# Rewrite each draft the way a real person asks: "How much is a PLA print?" not
# "According to the document: PLA prints cost ___". Add questions the document can't answer.
# (The "With libraries" tab asks an LLM for a first rewrite; a person still checks it.)
# @end


# @stage save
def demo(text, lang, limit=15):
    drafts = draft(find_facts(text, limit), lang)
    print(json.dumps(drafts, ensure_ascii=False, indent=1))      # on your computer: json.dump(..., open("test_set.json", "w"))
    return {"drafts": drafts}
# @end


if __name__ == "__main__":
    doc = open("nusabot_handbook.txt", encoding="utf-8").read()
    json.dump(draft(find_facts(doc), "en"), open("test_set.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
