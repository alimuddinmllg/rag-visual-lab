# NalarNusa RAG Visual Lab · Lesson 16 · Query rewriting, multi-query and HyDE
# A synonym table stands in for an LLM that rewrites questions; the tiny model from
# lesson 1 writes the HyDE fake answer. The LLM version is in the "With libraries" tab.
import re
from tiny_lm import train_lm, lm_tokens, generate, detok        # lesson 1
from bm25 import index, vector_scores, rank                      # lesson 13
from fusion import rrf                                           # lesson 14

SYNONYMS = {
    "en": {
        "price": ["cost","costs"], "fee": ["cost","charged"], "fine": ["charged","late"],
        "penalty": ["charged","late"], "hours": ["open","closed"], "open": ["opening"],
        "borrow": ["loan","borrow"], "loan": ["borrow"], "rules": ["must","required"],
        "close": ["closed","closes"], "shut": ["closed","closes"], "weekend": ["saturday","sunday"],
        "computer": ["workstation","workstations"], "pc": ["workstation"], "phone": ["whatsapp"],
        "contact": ["front desk","whatsapp"], "battery": ["lithium","batteries"], "charge": ["charged","charging"],
        "member": ["membership"], "join": ["membership"], "print": ["printing","prints"],
    },
    "id": {
        "harga": ["biaya"], "tarif": ["biaya"], "ongkos": ["biaya"],
        "denda": ["dikenakan","terlambat"], "pinjam": ["meminjam"], "tutup": ["tutup","jam buka"],
        "buka": ["jam buka"], "aturan": ["wajib"], "akhir": ["sabtu","minggu"],
        "pekan": ["sabtu","minggu"], "komputer": ["komputer kerja"], "kontak": ["meja depan","whatsapp"],
        "hubungi": ["whatsapp","meja depan"], "baterai": ["litium"], "anggota": ["keanggotaan"],
        "daftar": ["keanggotaan"], "cetak": ["cetak","printer"],
    },
}


def search(chunks, query, stop, lang):
    return rank(vector_scores(chunks, query, stop, lang))       # TF-IDF ranking, best first


# @stage original
# ranking = search(chunks, question, stop, lang)
# @end


# @stage multi
def rewrite_query(question, lang):
    """Versions of the question in the document's vocabulary."""
    table = SYNONYMS.get(lang, SYNONYMS["en"])
    words = re.findall(r"[a-z0-9]+", question.lower())
    variants = [question]
    swap = [w for w in words if w in table]
    if swap:
        variants.append(" ".join(table[w][0] if w in table else w for w in words))
        extra = list(dict.fromkeys(x for w in swap for x in table[w]))
        variants.append(question + " " + " ".join(extra))
    return variants


def multi_query(chunks, question, stop, lang):
    return rrf([search(chunks, v, stop, lang) for v in rewrite_query(question, lang)])
# @end


# @stage hyde
def hyde(question, model):
    """Write a fake answer, search with it. Its facts may be wrong; it only has to SOUND like the documents."""
    seed = [t for t in lm_tokens(question) if re.search(r"[a-z]", t)][-2:]
    return question + " " + detok(seed + generate(model, seed, 14, 0.7, 5))
# @end


# @stage evaluate
def norm(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()).strip() + " "


def demo(document, general, question, paraphrases, lang, stop, k=1):
    stop = set(stop)
    chunks, _ = index(document, lang, stop)
    model = train_lm(lm_tokens(general))
    fake = hyde(question, model)
    print("versions:", rewrite_query(question, lang))
    print("fake answer:", fake)
    orig, multi, hy = search(chunks, question, stop, lang), multi_query(chunks, question, stop, lang), search(chunks, fake, stop, lang)
    print("top 3  original", [i + 1 for i in orig[:3]], " multi-query", [i + 1 for i in multi[:3]], " HyDE", [i + 1 for i in hy[:3]])
    if not paraphrases:
        return {"orig": orig[:3], "multi": multi[:3], "hyde": hy[:3], "rates": None}
    s = {"original": 0, "multi": 0, "hyde": 0}
    for q, e in paraphrases:
        rel = {i for i, c in enumerate(chunks) if norm(e) in norm(c["text"])}
        s["original"] += any(i in rel for i in search(chunks, q, stop, lang)[:k])
        s["multi"] += any(i in rel for i in multi_query(chunks, q, stop, lang)[:k])
        s["hyde"] += any(i in rel for i in search(chunks, hyde(q, model), stop, lang)[:k])
    rates = {n: v / len(paraphrases) for n, v in s.items()}
    print(f"hit@{k} on {len(paraphrases)} paraphrased questions:", "  ".join(f"{n} {r:.0%}" for n, r in rates.items()))
    return {"orig": orig[:3], "multi": multi[:3], "hyde": hy[:3], "rates": rates}
# @end
