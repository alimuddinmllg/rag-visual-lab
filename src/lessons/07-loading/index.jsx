// Lesson 7: loading documents. What PDF extraction gives you, and how to clean it.
import * as cl from "../../rag/cleaning.js";
import pySource from "./clean.py?raw";

const L = (en, id) => ({ en, id });

const stages = [
  { id: "extract", label: L("Extract", "Ekstrak"),
    desc: L("Pull the text out of the PDF. You get the page layout too: wrapped lines, split words, headers and page numbers.", "Mengambil teks dari PDF. Tata letak halaman ikut terbawa: baris terpotong, kata terbelah, header, dan nomor halaman."),
    run: ({ inputs }) => {
      const real = inputs.doc.raw && inputs.doc.meta?.type === "pdf";
      const raw = real ? inputs.doc.raw : cl.simulateExtraction(inputs.doc.text, inputs.width);
      const testWords = [...new Set([...raw.matchAll(/([A-Za-z]+)-\n([a-z]+)/g)].map((m) => m[1] + m[2]))].slice(0, 6);
      return { raw, real, current: raw, testWords, history: [{ id: "extract", ...cl.stats(raw) }] };
    },
    log: (c) => ({ text: `${c.real ? "real PDF text" : "simulated PDF extraction"}: ${cl.stats(c.raw).lines} lines, ${c.testWords.length}+ split words` }),
    live: (c) => `${cl.stats(c.raw).lines} lines` },
  { id: "headers", label: L("Headers", "Header"),
    desc: L("Remove lines that repeat on every page (running headers and footers) and bare page numbers.", "Menghapus baris yang berulang di setiap halaman (header dan footer) serta nomor halaman."),
    run: (c) => { const r = cl.removeRepeatedLines(c.current); return { current: r.text, removed: r.removed, history: [...c.history, { id: "headers", ...cl.stats(r.text) }] }; },
    log: (c) => ({ text: `removed ${c.removed.length} lines` + (c.removed[0] ? ` (e.g. "${c.removed[0]}")` : "") }), live: (c) => `${c.removed.length} lines removed` },
  { id: "hyphens", label: L("Split words", "Kata terbelah"),
    desc: L("Re-join words the PDF hyphenated across a line break, or search will never find them.", "Menyambung kembali kata yang dipisah tanda hubung di akhir baris, kalau tidak pencarian tidak akan menemukannya."),
    run: (c) => { const r = cl.joinHyphenated(c.current); return { current: r.text, fixed: r.fixed, history: [...c.history, { id: "hyphens", ...cl.stats(r.text) }] }; },
    log: (c) => ({ text: `re-joined ${c.fixed} words` }), live: (c) => `${c.fixed} words fixed` },
  { id: "lines", label: L("Line breaks", "Pindah baris"),
    desc: L("Glue lines back into paragraphs. Line breaks from the page width are not meaningful.", "Menyatukan baris menjadi paragraf. Pindah baris karena lebar halaman tidak bermakna."),
    run: (c) => { const r = cl.joinLines(c.current); return { current: r.text, history: [...c.history, { id: "lines", ...cl.stats(r.text) }] }; },
    log: (c) => ({ text: `${c.history.at(-2).lines} → ${c.history.at(-1).lines} lines` }), live: (c) => `${c.history.at(-1).lines} lines` },
  { id: "spaces", label: L("Spaces", "Spasi"),
    desc: L("Collapse repeated spaces. Now the text is ready for chunking.", "Merapikan spasi ganda. Sekarang teks siap dipotong."),
    run: (c) => { const r = cl.normaliseSpaces(c.current); return { current: r.text, clean: r.text, history: [...c.history, { id: "spaces", ...cl.stats(r.text) }] }; },
    log: (c) => ({ text: `${c.raw.length} → ${c.clean.length} characters` }), live: (c) => `${c.clean.length} chars` },
];

function Board({ ctx, tr }) {
  const cur = ctx.current || "";
  const wordSet = new Set((cur.toLowerCase().match(/[a-z]+/g) || []));
  const h = ctx.history || [];
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("The text a computer actually gets", "Teks yang benar-benar didapat komputer"))}</h2>
        <span className="sub">{ctx.real ? tr(L("from your PDF", "dari PDF Anda")) : tr(L("simulated PDF extraction", "simulasi ekstraksi PDF"))}</span></div>
      <div className="split">
        <pre className="code" style={{ maxHeight: 380, padding: "10px 12px", whiteSpace: "pre-wrap", margin: 0 }}>{cur.slice(0, 6000)}{cur.length > 6000 ? "\n…" : ""}</pre>
        <div className="plain">
          <p className="note" style={{ marginTop: 0 }}>{tr(L("After each step", "Setelah tiap langkah"))}</p>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }} className="mono">
            <thead><tr style={{ color: "var(--muted)", textAlign: "right" }}><th style={{ textAlign: "left" }}>step</th><th>lines</th><th>words</th><th>chars</th></tr></thead>
            <tbody>{h.map((r) => <tr key={r.id} style={{ textAlign: "right" }}><td style={{ textAlign: "left" }}>{r.id}</td><td>{r.lines}</td><td>{r.words}</td><td>{r.chars}</td></tr>)}</tbody>
          </table>
          <p className="note">{tr(L("Search test: can these words be found?", "Uji pencarian: apakah kata-kata ini bisa ditemukan?"))}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {(ctx.testWords || []).map((w) => { const ok = wordSet.has(w.toLowerCase()); return <li key={w}><span style={{ color: ok ? "var(--good)" : "var(--warn)", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span> <span className="mono">{w}</span></li>; })}
            {ctx.testWords && !ctx.testWords.length && <li className="note">{tr(L("No split words in this document.", "Tidak ada kata terbelah di dokumen ini."))}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "RAG is only as good as the text it searches. Text pulled out of a PDF keeps the **page layout**: lines broken by the page width, words split with a hyphen, a header and page number on every page." },
      { p: "Those leftovers hurt retrieval. A word split as \"micro-\" + \"controller\" never matches a search for \"microcontroller\", and a header repeated 40 times ends up inside many chunks." },
      { h: "Try" },
      { ol: ["**Step** through the four cleaning steps and watch the table and the search test.", "Upload a real PDF in Try it yourself: this lesson then shows your PDF's own extracted text."] },
    ],
    id: [
      { p: "RAG hanya sebaik teks yang dicarinya. Teks yang diambil dari PDF membawa **tata letak halaman**: baris terpotong oleh lebar halaman, kata terbelah tanda hubung, header dan nomor halaman di setiap halaman." },
      { p: "Sisa-sisa ini merusak retrieval. Kata yang terbelah menjadi \"mikro-\" + \"kontroler\" tidak akan cocok dengan pencarian \"mikrokontroler\", dan header yang berulang 40 kali masuk ke banyak potongan." },
      { h: "Coba" },
      { ol: ["Tekan **Langkah** untuk empat langkah pembersihan dan perhatikan tabel serta uji pencarian.", "Unggah PDF sungguhan di Coba sendiri: pelajaran ini lalu menampilkan teks hasil ekstraksi PDF Anda sendiri."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Narrow pages", "Lower the line width to 40: more words get split, and the search test fails more often before cleaning."] },
      { exp: ["Your own PDF", "Upload a PDF exported from Word. Real extraction often has different problems: missing spaces between words, tables read row by row, columns mixed together. Cleaning rules are always tuned to your documents."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Halaman sempit", "Turunkan lebar baris ke 40: lebih banyak kata terbelah, dan uji pencarian lebih sering gagal sebelum dibersihkan."] },
      { exp: ["PDF Anda sendiri", "Unggah PDF hasil ekspor Word. Ekstraksi sungguhan sering punya masalah lain: spasi antarkata hilang, tabel terbaca per baris, kolom tercampur. Aturan pembersihan selalu disesuaikan dengan dokumen Anda."] }],
  },
  specs: {
    en: [{ dl: [["Repeated lines", "A line (with digits ignored) that appears 3+ times and is shorter than 80 characters is treated as a header or footer."], ["Split words", "letter + \"-\" + line break + lowercase letter is joined. This can wrongly join real hyphenated words like \"well-\\nknown\"; real pipelines check a dictionary."], ["Scanned PDFs", "Pages that are images contain no text at all. They need OCR (optical character recognition) first."]] }],
    id: [{ dl: [["Baris berulang", "Baris (angka diabaikan) yang muncul 3 kali atau lebih dan kurang dari 80 karakter dianggap header atau footer."], ["Kata terbelah", "huruf + \"-\" + pindah baris + huruf kecil digabung. Ini bisa salah menggabung kata yang memang bertanda hubung; pipeline sungguhan memeriksa kamus."], ["PDF hasil pindai", "Halaman berupa gambar tidak berisi teks sama sekali. Perlu OCR (pengenalan karakter optik) dulu."]] }],
  },
};

export default {
  n: 7,
  stages, text, Board,
  controls: [{ id: "width", label: L("Simulated line width", "Lebar baris simulasi"), min: 40, max: 100, step: 5, default: 60, format: (v) => `${v} ch` }],
  inputs: { document: true },
  code: [{ id: "clean", label: L("Cleaning (runs here)", "Pembersihan (bisa dijalankan)"), source: pySource, runnable: true, filename: "clean.py" }],
  variables: (c) => [["len(raw)", c.raw ? String(c.raw.length) : "—"], ["removed", c.removed ? String(c.removed.length) : "—"], ["fixed", c.fixed != null ? String(c.fixed) : "—"], ["len(clean)", c.clean ? String(c.clean.length) : "—"]],
  python: (c) => ({
    globals: { RAW: c.raw || "" },
    call: "clean(RAW)",
    compare: (res) => {
      const raw = c.raw || "";
      const a = cl.removeRepeatedLines(raw), b = cl.joinHyphenated(a.text);
      const js = cl.normaliseSpaces(cl.joinLines(b.text).text).text;
      return res.text === js && res.fixed === b.fixed && res.removed === a.removed.length;
    },
  }),
  challenges: [
    { id: "clean", text: L("Run all five steps and make every search-test word findable.", "Jalankan kelima langkah dan buat semua kata uji pencarian bisa ditemukan."), check: (c) => c.clean && c.testWords.every((w) => new RegExp(`\\b${w}\\b`, "i").test(c.clean)) },
    { id: "narrow", text: L("Set the line width to 40 and count how many words the PDF split.", "Atur lebar baris ke 40 dan hitung berapa kata yang dibelah PDF."), check: (c) => c.inputs.width <= 40 && c.fixed != null },
    { id: "pdf", text: L("Upload a real PDF and run the cleaning on it.", "Unggah PDF sungguhan dan jalankan pembersihannya."), check: (c) => c.real && c.clean },
  ],
  quiz: [
    { q: L("Why does a hyphen at a line break hurt retrieval?", "Mengapa tanda hubung di akhir baris merusak retrieval?"),
      options: [L("The word is stored as two pieces that never match the whole word", "Kata tersimpan sebagai dua potongan yang tidak cocok dengan kata utuh"), L("Hyphens are not allowed in prompts", "Tanda hubung tidak boleh ada di prompt"), L("It makes the PDF bigger", "Membuat PDF lebih besar"), L("It doesn't", "Tidak merusak")],
      answer: 0, why: L("\"micro-\" and \"controller\" are different tokens from \"microcontroller\".", "\"mikro-\" dan \"kontroler\" adalah token yang berbeda dari \"mikrokontroler\".") },
    { q: L("What is wrong with leaving a repeated page header in the text?", "Apa masalahnya jika header halaman yang berulang dibiarkan?"),
      options: [L("It lands in many chunks and makes unrelated chunks look similar", "Header masuk ke banyak potongan dan membuat potongan yang tidak berhubungan terlihat mirip"), L("Nothing", "Tidak ada"), L("The model refuses to answer", "Model menolak menjawab"), L("It deletes the first page", "Menghapus halaman pertama")],
      answer: 0, why: L("Shared noise words push unrelated chunks closer together in vector space.", "Kata pengganggu yang sama mendorong potongan yang tidak berhubungan menjadi lebih dekat di ruang vektor.") },
    { q: L("A scanned PDF gives you no text at all. What do you need?", "PDF hasil pindai tidak menghasilkan teks sama sekali. Apa yang dibutuhkan?"),
      options: [L("OCR, to read the text from the page images", "OCR, untuk membaca teks dari gambar halaman"), L("A bigger chunk size", "Ukuran potongan lebih besar"), L("A neural embedding", "Embedding neural"), L("A higher temperature", "Temperatur lebih tinggi")],
      answer: 0, why: L("A scan is a picture; the text must be recognised first.", "Hasil pindai adalah gambar; teksnya harus dikenali dulu.") },
  ],
};
