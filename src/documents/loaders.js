// Turn an uploaded file into plain text with "## " section headings.
// Everything runs in the browser; the file never leaves the device.
// Heavy parsers (pdf.js, mammoth) are loaded only when needed.
import STOPWORDS from "../rag/stopwords.json";

export const MAX_CHARS = 300_000;   // ~50 pages
export const MAX_DOCS = 5;
export const ACCEPT = ".pdf,.docx,.txt,.md,.markdown";

export function detectLang(text) {
  const words = (text.toLowerCase().match(/[a-z]+/g) || []).slice(0, 5000);
  const en = new Set(STOPWORDS.en), id = new Set(STOPWORDS.id);
  let e = 0, i = 0;
  for (const w of words) { if (en.has(w)) e++; if (id.has(w)) i++; }
  return i > e ? "id" : "en";
}

function markdownToSections(text) {
  return text.split(/\r?\n/).map((l) => {
    const m = l.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    return m ? "## " + m[1].trim() : l;
  }).join("\n");
}

async function pdfToText(buf) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let line = "", lines = [];
    for (const it of content.items) {
      line += it.str;
      if (it.hasEOL) { lines.push(line); line = ""; } else if (it.str && !/\s$/.test(it.str)) line += " ";
    }
    if (line.trim()) lines.push(line);
    pages.push(`## Page ${p}\n` + lines.map((l) => l.trim()).filter(Boolean).join("\n"));
  }
  return { text: pages.join("\n\n"), pages: pdf.numPages };
}

async function docxToText(buf) {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  doc.body.querySelectorAll("h1,h2,h3,h4,p,li").forEach((el) => {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (!t) return;
    out.push(/^H[1-4]$/.test(el.tagName) ? "## " + t : t);
  });
  return { text: out.join("\n") };
}

export async function loadFile(file) {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop();
  let text, pages;
  if (ext === "pdf") ({ text, pages } = await pdfToText(await file.arrayBuffer()));
  else if (ext === "docx") ({ text } = await docxToText(await file.arrayBuffer()));
  else if (["txt", "md", "markdown"].includes(ext)) text = markdownToSections(await file.text());
  else throw new Error("unsupported");
  const raw = text;
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const words = text.replace(/^## .*$/gm, "").split(/\s+/).filter(Boolean).length;
  if (words < 30) throw new Error("empty");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return {
    id: "user-" + Date.now().toString(36),
    title: name,
    lang: detectLang(text),
    text,
    raw,
    user: true,
    meta: { type: ext, pages, words, truncated },
  };
}
