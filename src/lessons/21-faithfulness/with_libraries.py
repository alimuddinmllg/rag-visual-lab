# NalarNusa RAG Visual Lab · Lesson 21 · Faithfulness with an LLM judge (the idea behind RAGAS)
# pip install openai
# Libraries such as ragas and deepeval package this; this file shows what they do inside.
import os
import json
from openai import OpenAI

# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
client = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))   # any OpenAI-compatible server
MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct")
ask = lambda p: client.chat.completions.create(model=MODEL, temperature=0,
                                               messages=[{"role": "user", "content": p}]).choices[0].message.content

# @stage retrieve
sources = ["PLA prints cost Rp 2.000 per gram.", "Resin prints cost Rp 5.000 per millilitre."]   # your top-k chunks
# @end

# @stage answer
answer = "PLA printing costs Rp 2.000 per gram. Students get a 50% discount on Fridays."
# @end

# @stage claims
claims = json.loads(ask(f"Split this answer into short standalone factual claims. Reply with a JSON list of strings only.\n{answer}"))
# @end

# @stage check
verdicts = [ask(f"Sources:\n{chr(10).join(sources)}\n\nCan this claim be inferred from the sources alone? Reply yes or no.\nClaim: {c}")
            .strip().lower().startswith("yes") for c in claims]
# @end

# @stage score
for c, ok in zip(claims, verdicts):
    print("✓" if ok else "✗", c)
print(f"faithfulness {sum(verdicts) / len(claims):.0%}")    # a judge model can be wrong too: spot-check it
# @end
