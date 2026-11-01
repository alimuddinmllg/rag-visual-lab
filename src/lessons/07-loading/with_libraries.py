# NalarNusa RAG Visual Lab · Lesson 7 · Loading real files
# pip install pypdf python-docx
import re
from pypdf import PdfReader
from docx import Document

# @stage extract
pages = [p.extract_text() or "" for p in PdfReader("handbook.pdf").pages]
docx_text = "\n".join(p.text for p in Document("handbook.docx").paragraphs)
# @end

# @stage headers
# A line that repeats on most pages is a running header or footer: drop it.
from collections import Counter
lines = Counter(l.strip() for p in pages for l in set(p.splitlines()) if l.strip())
repeated = {l for l, n in lines.items() if n >= 0.6 * len(pages)}
pages = ["\n".join(l for l in p.splitlines() if l.strip() not in repeated) for p in pages]
# @end

# @stage hyphens
text = re.sub(r"(\w)-\n(\w)", r"\1\2", "\n".join(pages))        # "regis-\ntration" -> "registration"
# @end

# @stage lines
text = re.sub(r"(?<![.!?:])\n(?!\n)", " ", text)                 # join lines inside a paragraph
# @end

# @stage spaces
text = re.sub(r"[ \t]+", " ", text).strip()
# Scanned PDFs have no text layer at all: run OCR first (e.g. pip install pytesseract).
# @end
