# NalarNusa RAG Visual Lab · Lesson 28 · Region-aware chunks from a real PDF: text, table rows with headers, described images
# pip install "pdfplumber<0.11.10" pymupdf openai fpdf2
# (pdfplumber 0.11.10 upgrades Pillow, which crashes a running Colab session; the older one works the same here)
# Describing images needs a vision model, e.g. Ollama with: ollama pull llava. The lab's free model reads text only,
# so in Colab the image falls back to its caption and you see why descriptions matter.
import base64
import os
import pymupdf as fitz             # PyMuPDF, for images
import pdfplumber                # for text and tables
from openai import OpenAI

PDF = "room_guide.pdf"
# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
vision = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))
VISION_MODEL = os.environ.get("LLM_VISION_MODEL", "llava")
chunks = []


def make_sample_pdf(path):
    """No PDF of your own? One page like the lesson's: two paragraphs, a table and a floor plan."""
    from fpdf import FPDF
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (520, 260), "white"); g = ImageDraw.Draw(img)
    for x, y, w, h, name in [(20, 16, 140, 84, "B1"), (180, 16, 140, 84, "C1"), (340, 152, 160, 92, "B2"), (20, 152, 140, 92, "Store")]:
        g.rectangle([x, y, x + w, y + h], outline="black", width=3); g.text((x + 10, y + 10), name, fill="black")
    g.rectangle([490, 112, 516, 148], fill="green"); g.text((400, 96), "FIRE EXIT", fill="green")
    img.save("floor_plan.png")
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Helvetica", size=11)
    pdf.set_font("Helvetica", "B", 14); pdf.cell(0, 9, "Room booking guide", new_x="LMARGIN", new_y="NEXT"); pdf.set_font("Helvetica", size=11)
    pdf.multi_cell(0, 6, "Members can book the project rooms at the front desk or with the online booking form. Bookings must be made at least one day in advance.")
    pdf.ln(3)
    rows = [["Room", "Floor", "Seats", "Projector", "Price per hour"], ["A1", "1", "12", "no", "Rp 50.000"], ["A2", "1", "20", "yes", "Rp 60.000"],
            ["B1", "2", "8", "no", "Rp 40.000"], ["B2", "2", "30", "yes", "Rp 75.000"], ["C1", "2", "16", "yes", "Rp 55.000"]]
    with pdf.table() as table:
        for r in rows:
            row = table.row()
            for cell in r:
                row.cell(cell)
    pdf.ln(4); pdf.image("floor_plan.png", w=150); pdf.cell(0, 6, "Figure 1: floor plan of level 2", new_x="LMARGIN", new_y="NEXT")
    pdf.output(path)


def describe(image_bytes, ext, caption):
    """Ask a vision model what the picture shows. A text-only model can't, so fall back to the caption."""
    try:
        reply = vision.chat.completions.create(model=VISION_MODEL, messages=[{"role": "user", "content": [
            {"type": "text", "text": "Describe this figure for someone who cannot see it. Name every label, room, arrow and direction."},
            {"type": "image_url", "image_url": {"url": f"data:image/{ext};base64,{base64.b64encode(image_bytes).decode()}"}}]}])
        return reply.choices[0].message.content
    except Exception as e:
        print(f"(no vision model available: {str(e)[:80]}… using the caption instead)")
        return caption


# @stage layout
if not os.path.exists(PDF):
    make_sample_pdf(PDF)
pdf = pdfplumber.open(PDF)
doc = fitz.open(PDF)
# @end

# @stage extract
captions = {}
for n, page in enumerate(pdf.pages):
    tables = page.find_tables()
    outside = page
    for t in tables:
        outside = outside.outside_bbox(t.bbox)          # text outside the tables, paragraph by paragraph
    text = outside.extract_text() or ""
    captions[n] = next((l for l in text.splitlines() if l.lower().startswith(("figure", "gambar"))), "a figure")
    for para in text.split("\n\n"):
        if para.strip():
            chunks.append({"kind": "text", "page": n + 1, "text": " ".join(para.split())})
    for t in tables:                                     # one chunk per row, each row repeats the header
        rows = t.extract()
        header, body = rows[0], rows[1:]
        for r in body:
            chunks.append({"kind": "table", "page": n + 1, "text": "; ".join(f"{h}: {v}" for h, v in zip(header, r)) + "."})

for n, page in enumerate(doc):                           # images: describe each one, and index the description
    for img in page.get_images(full=True):
        data = doc.extract_image(img[0])
        chunks.append({"kind": "image", "page": n + 1, "xref": img[0], "text": describe(data["image"], data["ext"], captions.get(n, "a figure"))})
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
