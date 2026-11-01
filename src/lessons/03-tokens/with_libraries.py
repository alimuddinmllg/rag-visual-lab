# NalarNusa RAG Visual Lab · Lesson 3 · Real tokenizers
# pip install tiktoken tokenizers
import tiktoken
from tokenizers import Tokenizer, models, pre_tokenizers, trainers

# @stage chars
text = "Mahasiswa meminjam osiloskop dari lab."
# @end

# @stage merge
# Train your own BPE tokenizer, like the lab does, on your document.
bpe = Tokenizer(models.BPE(unk_token="[UNK]"))
bpe.pre_tokenizer = pre_tokenizers.Whitespace()
bpe.train(["nusabot_handbook.txt"], trainers.BpeTrainer(vocab_size=500, special_tokens=["[UNK]"]))
# @end

# @stage tokenize
print("own BPE:", bpe.encode(text).tokens)
enc = tiktoken.get_encoding("cl100k_base")       # a tokenizer used by large commercial models
print("cl100k :", [enc.decode([t]) for t in enc.encode(text)])
# @end

# @stage window
def fits(text, window=4096):
    return len(enc.encode(text)) <= window          # count real tokens before you build a prompt
# @end
