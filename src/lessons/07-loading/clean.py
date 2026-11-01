# NalarNusa RAG Visual Lab · Lesson 7 · Cleaning text extracted from a PDF
import re


# @stage extract
def extract(pdf_path):
    """Real extraction, e.g. with pypdf: pip install pypdf"""
    from pypdf import PdfReader
    return "\n".join(page.extract_text() for page in PdfReader(pdf_path).pages)
# @end


# @stage headers
def remove_repeated_lines(text, min_repeats=3):
    """Running headers/footers repeat on every page; page numbers are bare digits."""
    lines = text.split("\n")
    key = lambda l: re.sub(r"[0-9]+", "#", l.strip())
    counts = {}
    for l in lines:
        if l.strip():
            counts[key(l)] = counts.get(key(l), 0) + 1
    kept, removed = [], []
    for l in lines:
        t = l.strip()
        drop = bool(t) and not t.startswith("## ") and (
            re.fullmatch(r"[0-9]+", t) is not None or (counts.get(key(l), 0) >= min_repeats and len(t) < 80))
        (removed if drop else kept).append(t if drop else l)
    return "\n".join(kept), removed
# @end


# @stage hyphens
def join_hyphenated(text):
    """micro-\\ncontroller -> microcontroller"""
    return re.subn(r"([A-Za-z])-\n([a-z])", r"\1\2", text)
# @end


# @stage lines
def join_lines(text):
    """Lines inside a paragraph were only wrapped by the page width: glue them back."""
    out, para = [], []
    def flush():
        if para:
            out.append(" ".join(para)); para.clear()
    for l in text.split("\n"):
        t = l.strip()
        if not t:
            flush(); out.append(""); continue
        if t.startswith("## "):
            flush(); out.append(t); continue
        para.append(t)
    flush()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out))
# @end


# @stage spaces
def normalise_spaces(text):
    return "\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in text.split("\n"))
# @end


def clean(raw):
    t, removed = remove_repeated_lines(raw)
    t, fixed = join_hyphenated(t)
    t = normalise_spaces(join_lines(t))
    print(f"removed {len(removed)} header/footer lines, fixed {fixed} split words")
    print(f"{len(raw)} -> {len(t)} characters")
    return {"text": t, "removed": len(removed), "fixed": fixed}
