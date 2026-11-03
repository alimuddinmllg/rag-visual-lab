# NalarNusa RAG Visual Lab · Lesson 7 · Loading real files
# pip install pypdf python-docx fpdf2
import os
import re
from pypdf import PdfReader
from docx import Document

# No files of your own yet? Make a sample PDF (with a running header) and Word file from the handbook.
if not (os.path.exists("handbook.pdf") and os.path.exists("handbook.docx")):
    from fpdf import FPDF
    import docx
    handbook = open("handbook.txt", encoding="utf-8").read()
    pdf = FPDF(); pdf.set_auto_page_break(True, 20)
    pdf.set_font("Helvetica", size=11)
    for n, section in enumerate(handbook.split("\n## ")):
        pdf.add_page(); pdf.set_font("Helvetica", "I", 8); pdf.cell(0, 6, "NusaBot Robotics Lab - Member handbook", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", size=11); pdf.multi_cell(0, 6, section.lstrip("# ").encode("latin-1", "replace").decode("latin-1"))
    pdf.output("handbook.pdf")
    d = docx.Document()
    for para in handbook.split("\n"):
        if para.startswith("## "): d.add_heading(para[3:], level=2)
        elif para.strip(): d.add_paragraph(para)
    d.save("handbook.docx")

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
print(f"{len(pages)} PDF pages, {len(repeated)} repeated header line(s) removed, {len(text.split())} words")
print(text[:300], "…")
print("Word file:", len(docx_text.split()), "words")
# @end
