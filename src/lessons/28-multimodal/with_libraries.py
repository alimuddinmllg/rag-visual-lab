# NalarNusa RAG Visual Lab · Lesson 28 · Region-aware chunks from a real PDF: text, table rows with headers, described images
# pip install pdfplumber pymupdf openai
# The vision model can be local, e.g. Ollama with a vision model: ollama pull llava
import base64
import fitz                      # PyMuPDF, for images
import pdfplumber                # for text and tables
from openai import OpenAI

PDF = "room_guide.pdf"
vision = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
chunks = []

# @stage layout
pdf = pdfplumber.open(PDF)
doc = fitz.open(PDF)
# @end

# @stage extract
for n, page in enumerate(pdf.pages):
    tables = page.find_tables()
    # text outside the tables, paragraph by paragraph
    outside = page
    for t in tables:
        outside = outside.outside_bbox(t.bbox)
    for para in (outside.extract_text() or "").split("\n\n"):
        if para.strip():
            chunks.append({"kind": "text", "page": n + 1, "text": " ".join(para.split())})
    # one chunk per row, each row repeats the header
    for t in tables:
        rows = t.extract()
        header, body = rows[0], rows[1:]
        for r in body:
            chunks.append({"kind": "table", "page": n + 1, "text": "; ".join(f"{h}: {v}" for h, v in zip(header, r)) + "."})

# images: ask a vision model to describe each one, and index the description
for n, page in enumerate(doc):
    for img in page.get_images(full=True):
        data = doc.extract_image(img[0])
        b64 = base64.b64encode(data["image"]).decode()
        reply = vision.chat.completions.create(model="llava", messages=[{"role": "user", "content": [
            {"type": "text", "text": "Describe this figure for someone who cannot see it. Name every label, room, arrow and direction."},
            {"type": "image_url", "image_url": {"url": f"data:image/{data['ext']};base64,{b64}"}}]}])
        chunks.append({"kind": "image", "page": n + 1, "xref": img[0], "text": reply.choices[0].message.content})
# @end

# @stage index
# From here it is ordinary RAG: embed chunk["text"], keep "kind", "page" and "xref" as metadata,
# and show the original image next to the answer when an image chunk is used.
# @end

# @stage retrieve
for c in chunks:
    print(f"[{c['kind']:5s} p{c['page']}] {c['text'][:90]}")
# @end

# @stage answer
# (answer as in lesson 6, citing the page and showing images by their xref)
# @end
