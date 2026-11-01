# NalarNusa RAG Visual Lab · Lesson 1 · Next-token prediction with a real (small) LLM
# pip install torch transformers
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

name = "Qwen/Qwen2.5-0.5B-Instruct"          # small, multilingual, runs on a laptop CPU
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(name)

# @stage read
# Training already happened on billions of tokens. We only use the result.
# Note: this model never read the NusaBot handbook.
# @end

# @stage predict
ids = tok("PLA prints cost", return_tensors="pt").input_ids
with torch.no_grad():
    logits = model(ids).logits[0, -1]          # one score per token in the vocabulary
probs = torch.softmax(logits, dim=-1)
top = torch.topk(probs, 5)
for p, i in zip(top.values, top.indices):
    print(f"{p:.3f}  {tok.decode(i)!r}")
# @end

# @stage sample
next_id = torch.multinomial(torch.softmax(logits / 1.0, dim=-1), 1)   # temperature 1.0
# @end

# @stage repeat
out = model.generate(ids, max_new_tokens=15, do_sample=True, temperature=1.0)
text = tok.decode(out[0], skip_special_tokens=True)
print(text)
# @end

# @stage check
print("fluent, but is the price right? Only the handbook can say.")   # no step checks facts
# @end
