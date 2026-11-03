// Lesson 28: tables, images and multimodal RAG. One page with text, a table and a floor plan,
// extracted flat (plain text) or by region (rows with headers, images described in words). Twin: ./multimodal.py
import * as rag from "../../rag/core.js";
import { L, quizQ } from "../shared.js";
import { prelude, stopList } from "../prelude.js";
import pySource from "./multimodal.py?raw";
import libSource from "./with_libraries.py?raw";

export const PAGE = {
  en: { title: "Room booking guide",
    paragraphs: ["Members can book the project rooms at the front desk or with the online booking form. Bookings must be made at least one day in advance and can be cancelled up to two hours before the start time. One group may book a room for at most four hours per day.",
      "Leave the room tidy and switch off the projector when you leave. For safety reasons, a group may not be larger than the number of seats in the room."],
    table: { caption: "Project rooms", header: ["Room", "Floor", "Seats", "Projector", "Price per hour"],
      rows: [["A1", "1", "12", "no", "Rp 50.000"], ["A2", "1", "20", "yes", "Rp 60.000"], ["B1", "2", "8", "no", "Rp 40.000"], ["B2", "2", "30", "yes", "Rp 75.000"], ["C1", "2", "16", "yes", "Rp 55.000"]] },
    image: { caption: "Figure 1: floor plan of level 2", description: "The fire exit is at the east end of the corridor, next to room B2. The lift and the stairs are in the middle of the corridor. Rooms B1 and C1 face the courtyard on the north side." } },
  id: { title: "Panduan pemesanan ruang",
    paragraphs: ["Anggota dapat memesan ruang proyek di meja depan atau lewat formulir pemesanan daring. Pemesanan wajib dilakukan paling lambat satu hari sebelumnya dan dapat dibatalkan sampai dua jam sebelum waktu mulai. Satu kelompok boleh memesan ruang paling lama empat jam per hari.",
      "Rapikan ruang dan matikan proyektor saat Anda pergi. Demi keselamatan, jumlah anggota kelompok tidak boleh melebihi jumlah kursi di ruang tersebut."],
    table: { caption: "Ruang proyek", header: ["Ruang", "Lantai", "Kursi", "Proyektor", "Harga per jam"],
      rows: [["A1", "1", "12", "tidak", "Rp 50.000"], ["A2", "1", "20", "ya", "Rp 60.000"], ["B1", "2", "8", "tidak", "Rp 40.000"], ["B2", "2", "30", "ya", "Rp 75.000"], ["C1", "2", "16", "ya", "Rp 55.000"]] },
    image: { caption: "Gambar 1: denah lantai 2", description: "Pintu darurat ada di ujung timur lorong, di sebelah ruang B2. Lift dan tangga ada di tengah lorong. Ruang B1 dan C1 menghadap halaman di sisi utara." } },
};
const QS = {
  en: [["How many seats does room B2 have?", "Seats: 30"], ["Where is the fire exit on level 2?", "east end of the corridor"], ["How far in advance must a room be booked?", "at least one day in advance"], ["How much does room B1 cost per hour?", "Price per hour: Rp 40.000"]],
  id: [["Berapa jumlah kursi di ruang B2?", "Kursi: 30"], ["Di mana pintu darurat di lantai 2?", "ujung timur lorong"], ["Berapa lama sebelumnya ruang harus dipesan?", "paling lambat satu hari sebelumnya"], ["Berapa harga per jam ruang B1?", "Harga per jam: Rp 40.000"]],
};

export function flatText(page) {
  const t = page.table, cells = t.header.join(" ") + " " + t.rows.map((r) => r.join(" ")).join(" ");
  return [`## ${page.title}`, ...page.paragraphs, t.caption, cells, page.image.caption].join("\n");
}
export function structured(page, describe) {
  const chunks = page.paragraphs.map((p, i) => ({ kind: "text", region: `p${i + 1}`, text: p }));
  const t = page.table;
  for (const r of t.rows) chunks.push({ kind: "table", region: "table", row: r[0], text: `${t.caption}. ${t.header.map((h, j) => `${h}: ${r[j]}`).join("; ")}.` });
  chunks.push({ kind: "image", region: "figure", text: page.image.caption + (describe ? ". " + page.image.description : "") });
  return chunks;
}
export function extract(page, strategy, describe) {
  if (strategy === "flat") return rag.chunkDocument(rag.parseDocument(flatText(page)).words, 40, 8).map((c) => ({ kind: "mixed", region: "flat", text: c.text }));
  return structured(page, describe);
}

const stages = [
  { id: "layout", label: L("Layout", "Tata letak"), desc: L("A layout model (or the file's own structure) finds the regions on the page: paragraphs, a table, a picture.", "Model tata letak (atau struktur file itu sendiri) menemukan wilayah di halaman: paragraf, tabel, gambar."),
    run: ({ inputs }) => ({ lang: inputs.uiLang, page: PAGE[inputs.uiLang], stop: rag.stopwordsFor(inputs.uiLang) }),
    log: (c) => ({ text: `${c.page.paragraphs.length} paragraphs, 1 table (${c.page.table.rows.length} rows), 1 image` }), live: () => "3 kinds" },
  { id: "extract", label: L("Extract", "Ekstrak"), desc: L("Flat: plain text in reading order, the table loses its headers and the picture disappears. By region: one chunk per row with its headers, and the picture as words.", "Datar: teks biasa sesuai urutan baca, tabel kehilangan judul kolom dan gambar lenyap. Per wilayah: satu potongan per baris dengan judul kolomnya, dan gambar sebagai kata-kata."),
    run: (c) => ({ chunks: extract(c.page, c.inputs.strategy, c.inputs.describe === "on") }), log: (c) => ({ text: `${c.chunks.length} chunks (${c.inputs.strategy})` }), live: (c) => `${c.chunks.length} chunks` },
  { id: "index", label: L("Index", "Indeks"), desc: L("Embed every chunk the same way, whatever region it came from. Its kind is kept as metadata.", "Embed setiap potongan dengan cara yang sama, apa pun asal wilayahnya. Jenisnya disimpan sebagai metadata."),
    run: (c) => ({ emb: rag.embedChunks(c.chunks, c.stop, c.lang) }), log: (c) => ({ text: `${c.emb.vocab.length} terms` }), live: (c) => `${c.emb.vocab.length} terms` },
  { id: "retrieve", label: L("Retrieve", "Ambil"), desc: L("Top 3 chunks for the question.", "3 potongan teratas untuk pertanyaan."),
    run: (c) => {
      const [q, expected] = QS[c.lang][+c.inputs.qi], qv = rag.vectorize(rag.tokenize(q, c.stop, c.lang), c.emb.idf);
      const top = c.emb.vectors.map((v, i) => ({ i, s: qv.size ? rag.cosine(qv, v) : 0 })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3);
      return { q, expected, top };
    },
    log: (c) => ({ text: c.top.map((x) => `${c.chunks[x.i].kind} ${x.s.toFixed(2)}`).join(" · ") }), live: (c) => c.chunks[c.top[0].i].kind },
  { id: "answer", label: L("Answer", "Jawab"), desc: L("Answer from the top chunks. Found = the answer contains the fact the question asks for.", "Jawab dari potongan teratas. Ditemukan = jawaban berisi fakta yang ditanyakan."),
    run: (c) => {
      const known = rag.tokenize(c.q, c.stop, c.lang).filter((t) => c.emb.idf.has(t));
      const answer = rag.extractAnswer(c.top.filter((x) => x.s >= 0.1), c.chunks, known, c.emb.idf, c.stop, c.lang).text;
      return { answer, found: answer.includes(c.expected) };
    },
    log: (c) => ({ text: c.answer.slice(0, 90), warn: c.found ? null : "the fact was not found" }), live: (c) => (c.found ? "found" : "missed") },
];

const KIND = { text: ["var(--accent)", L("text", "teks")], table: ["#7a5cc2", L("table row", "baris tabel")], image: ["#d98a3d", L("image", "gambar")], mixed: ["var(--muted)", L("flat text", "teks datar")] };

function FloorPlan({ hl, tr, lang }) {
  const room = (x, y, w, h, name) => <g><rect x={x} y={y} width={w} height={h} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.2} /><text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" style={{ font: "600 11px var(--body)", fill: "var(--ink)" }}>{name}</text></g>;
  return (
    <svg viewBox="0 0 260 130" style={{ width: "100%", height: "auto", outline: hl ? "3px solid #d98a3d" : "none", borderRadius: 6 }} role="img" aria-label={tr(L("floor plan of level 2", "denah lantai 2"))}>
      <rect x={0} y={0} width={260} height={130} fill="var(--grid)" />
      {room(10, 8, 70, 42, "B1")}{room(90, 8, 70, 42, "C1")}{room(170, 76, 80, 46, "B2")}{room(10, 76, 70, 46, lang === "id" ? "Gudang" : "Store")}
      <rect x={95} y={78} width={30} height={22} fill="var(--line)" /><text x={110} y={93} textAnchor="middle" style={{ font: "9px var(--body)", fill: "var(--ink)" }}>{lang === "id" ? "lift" : "lift"}</text>
      <text x={130} y={68} textAnchor="middle" style={{ font: "10px var(--body)", fill: "var(--muted)" }}>{lang === "id" ? "lorong" : "corridor"}</text>
      <rect x={244} y={56} width={14} height={18} fill="#2f9e62" /><text x={236} y={50} textAnchor="end" style={{ font: "600 9px var(--body)", fill: "#2f9e62" }}>{lang === "id" ? "PINTU DARURAT" : "FIRE EXIT"}</text>
      <text x={250} y={20} textAnchor="middle" style={{ font: "10px var(--body)", fill: "var(--muted)" }}>N↑</text>
    </svg>
  );
}

function Board({ ctx, runner, tr }) {
  const ph = runner.phase, page = ctx.page, lang = ctx.lang;
  if (!page) return null;
  const topSet = new Set((ctx.top || []).map((x) => x.i));
  const flat = ctx.inputs.strategy === "flat";
  const hit = (region) => !flat && (ctx.chunks || []).some((c, i) => topSet.has(i) && c.region === region);
  const rowHit = (r) => (ctx.chunks || []).some((c, i) => topSet.has(i) && c.row === r);
  const frame = (on, color) => ({ outline: on && ph >= 4 ? `3px solid ${color}` : "1px dashed var(--line)", outlineOffset: 2, borderRadius: 6, padding: 6 });
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("One page, three kinds of content", "Satu halaman, tiga jenis isi"))}</h2><span className="sub">{ctx.inputs.strategy === "flat" ? tr(L("flat text", "teks datar")) : tr(L("by region", "per wilayah"))}{ctx.inputs.strategy !== "flat" && ctx.inputs.describe === "on" ? " + " + tr(L("image descriptions", "deskripsi gambar")) : ""}</span></div>
      <div className="split">
        <div className="plain" style={{ display: "grid", gap: 10, fontSize: 13 }}>
          <h3 style={{ margin: 0 }}>{page.title}</h3>
          {page.paragraphs.map((p, i) => <p key={i} style={{ margin: 0, ...frame(hit(`p${i + 1}`), KIND.text[0]) }}>{p}</p>)}
          <div style={frame(hit("table"), KIND.table[0])}>
            <div className="sub" style={{ marginBottom: 4 }}>{page.table.caption}</div>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead><tr>{page.table.header.map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--line)", padding: "2px 4px" }}>{h}</th>)}</tr></thead>
              <tbody>{page.table.rows.map((r) => <tr key={r[0]} style={{ background: ph >= 4 && rowHit(r[0]) ? "rgba(122,92,194,.15)" : "none" }}>{r.map((v, j) => <td key={j} style={{ padding: "2px 4px" }}>{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div style={{ ...frame(hit("figure"), KIND.image[0]), opacity: ph >= 2 && flat ? 0.45 : 1 }}><FloorPlan hl={false} tr={tr} lang={lang} /><div className="sub">{page.image.caption}{ph >= 2 && flat ? " · " + tr(L("only the caption survives plain text extraction", "hanya keterangan yang selamat dari ekstraksi teks biasa")) : ""}</div></div>
          {ph >= 4 && flat && <p className="note" style={{ margin: 0 }}>{tr(L("Flat chunks cut across regions, so they can't be traced back to the table or the picture.", "Potongan datar memotong lintas wilayah, sehingga tidak bisa ditelusuri ke tabel atau gambar."))}</p>}
        </div>
        <div className="plain" style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <h4 style={{ margin: 0 }}>{tr(L("What gets indexed", "Apa yang diindeks"))}</h4>
          {ph >= 2 ? (ctx.chunks || []).map((c, i) => {
            const rank = (ctx.top || []).findIndex((x) => x.i === i);
            return <div key={i} className="colcard" style={{ fontSize: 12, borderLeft: `4px solid ${KIND[c.kind][0]}`, opacity: ph >= 4 && rank < 0 ? 0.5 : 1 }}>
              <h4 style={{ fontSize: 11 }}>{tr(KIND[c.kind][1])}{ph >= 4 && rank >= 0 && <span className="sub"> · #{rank + 1} · {ctx.top[rank].s.toFixed(2)}</span>}</h4>{c.text}</div>;
          }) : <p className="note">{tr(L("Run to the Extract step.", "Jalankan sampai langkah Ekstrak."))}</p>}
        </div>
      </div>
      {ctx.answer && <div className="plain"><div style={{ fontSize: 13, marginBottom: 6 }}><b>{ctx.q}</b></div>
        <div className="answer" style={{ borderLeft: `4px solid ${ctx.found ? "var(--good)" : "var(--warn)"}` }}><b style={{ color: ctx.found ? "var(--good)" : "var(--warn)" }}>{ctx.found ? tr(L("Found", "Ditemukan")) : tr(L("Missed", "Meleset"))}:</b> {ctx.answer}</div></div>}
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Real documents are not just paragraphs. Prices sit in **tables**, directions sit in **pictures**. Plain text extraction reads a table cell by cell, so \"30\" ends up far from \"B2\" and \"Seats\", and a picture becomes nothing at all." },
      { p: "**Multimodal RAG** treats each region on its own terms. Each table row becomes a chunk that repeats its column headers. Each image gets a text **description** (written by a vision model in practice) that is embedded like any other chunk, and the original image can still be shown with the answer." },
      { p: "Ask the four questions with flat extraction, then by region, then with image descriptions on." },
    ],
    id: [
      { p: "Dokumen nyata bukan hanya paragraf. Harga ada di **tabel**, petunjuk arah ada di **gambar**. Ekstraksi teks biasa membaca tabel sel demi sel, sehingga \"30\" berada jauh dari \"B2\" dan \"Kursi\", dan gambar tidak menjadi apa-apa." },
      { p: "**RAG multimodal** memperlakukan setiap wilayah sesuai jenisnya. Setiap baris tabel menjadi potongan yang mengulang judul kolomnya. Setiap gambar mendapat **deskripsi** teks (ditulis model visi dalam praktiknya) yang di-embed seperti potongan lain, dan gambar aslinya tetap bisa ditampilkan bersama jawaban." },
      { p: "Ajukan keempat pertanyaan dengan ekstraksi datar, lalu per wilayah, lalu dengan deskripsi gambar aktif." },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["The table falls apart", "Flat, question about B2's seats: the retrieved chunk has the right numbers in it, but nothing says which number belongs to which column. By region, the row says \"Seats: 30\" outright."] },
      { exp: ["The invisible picture", "By region with descriptions off, ask about the fire exit. Only the caption is indexed, and it doesn't say where the exit is. Turn descriptions on."] },
      { exp: ["Text still works", "The booking question is answered in every mode: plain paragraphs never needed help. Spend the extra effort where the structure is."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Tabelnya berantakan", "Datar, pertanyaan tentang kursi B2: potongan yang diambil berisi angka yang benar, tetapi tidak ada yang menyebut angka mana milik kolom mana. Per wilayah, barisnya langsung menyebut \"Kursi: 30\"."] },
      { exp: ["Gambar yang tak terlihat", "Per wilayah dengan deskripsi mati, tanyakan pintu darurat. Hanya keterangan gambar yang diindeks, dan tidak menyebut letak pintunya. Aktifkan deskripsi."] },
      { exp: ["Teks tetap berfungsi", "Pertanyaan pemesanan terjawab di setiap mode: paragraf biasa tidak butuh bantuan. Curahkan upaya ekstra di bagian yang berstruktur."] }],
  },
  specs: {
    en: [{ dl: [["Row chunks", "\"Header: value; …\" for every row, with the table caption in front. Small tables can also be kept whole as Markdown."], ["Image description", "Written once at indexing time by a vision-language model, then searched as text. Keep a link to the image so the answer can show it."], ["Layout detection", "PDF parsers and layout models (the Code tab uses one) find tables and figures; scanned pages need OCR first."], ["Alternative", "Multimodal embeddings put images and text in the same vector space, so an image can be retrieved without a description."]] }],
    id: [{ dl: [["Potongan baris", "\"Judul: nilai; …\" untuk setiap baris, dengan keterangan tabel di depan. Tabel kecil juga bisa disimpan utuh sebagai Markdown."], ["Deskripsi gambar", "Ditulis sekali saat pengindeksan oleh model visi-bahasa, lalu dicari sebagai teks. Simpan tautan ke gambarnya agar jawaban bisa menampilkannya."], ["Deteksi tata letak", "Parser PDF dan model tata letak (tab Kode memakai salah satunya) menemukan tabel dan gambar; halaman hasil pindai perlu OCR dulu."], ["Alternatif", "Embedding multimodal menaruh gambar dan teks di ruang vektor yang sama, sehingga gambar bisa diambil tanpa deskripsi."]] }],
  },
};

export default {
  n: 28, stages, text, Board,
  controls: [
    { id: "qi", type: "select", default: "0", label: L("Question", "Pertanyaan"), options: QS.en.map(([q], i) => ({ value: String(i), label: L(q, QS.id[i][0]) })) },
    { id: "strategy", type: "select", default: "flat", label: L("Extraction", "Ekstraksi"), options: [{ value: "flat", label: L("Flat text", "Teks datar") }, { value: "structured", label: L("By region", "Per wilayah") }] },
    { id: "describe", type: "select", default: "off", label: L("Describe images", "Deskripsikan gambar"), options: [{ value: "off", label: L("off (caption only)", "mati (keterangan saja)") }, { value: "on", label: L("on (vision model)", "aktif (model visi)") }] },
  ],
  code: [
    { id: "mm", label: L("Region-aware chunks (runs here)", "Potongan per wilayah (bisa dijalankan)"), source: pySource, runnable: true, filename: "multimodal.py" },
    { id: "libs", label: L("With a PDF parser and a vision model", "Dengan parser PDF dan model visi"), source: libSource, runnable: false, filename: "multimodal_libraries.py", note: L("Runs on your computer after: pip install \"pdfplumber<0.11.10\" pymupdf openai fpdf2", "Jalankan di komputer Anda setelah: pip install \"pdfplumber<0.11.10\" pymupdf openai fpdf2") },
  ],
  variables: (c) => [["chunks", c.chunks ? String(c.chunks.length) : "—"], ["top", c.top ? JSON.stringify(c.top.map((x) => x.i)) : "—"], ["found", c.found != null ? String(c.found) : "—"]],
  python: (c) => {
    const I = c.inputs, lang = I.uiLang, [q, e] = QS[lang][+I.qi];
    return {
      prelude: prelude("rag"),
      globals: { PAGE: PAGE[lang], QUESTION: q, EXPECTED: e, STRATEGY: I.strategy, DESCRIBE: I.describe === "on", LANG: lang, STOPWORDS: stopList(lang) },
      call: "demo(PAGE, QUESTION, EXPECTED, STRATEGY, DESCRIBE, LANG, STOPWORDS)",
      compare: (res) => {
        let ctx = { inputs: I };
        for (const st of stages) ctx = { ...ctx, ...st.run(ctx) };
        return JSON.stringify(res.chunks) === JSON.stringify(ctx.chunks.map((x) => x.text)) && JSON.stringify(res.top) === JSON.stringify(ctx.top.map((x) => x.i)) && res.answer === ctx.answer && res.found === ctx.found;
      },
    };
  },
  challenges: [
    { id: "table", text: L("Answer the B2 seats question correctly.", "Jawab pertanyaan kursi B2 dengan benar."), check: (c) => +c.inputs.qi === 0 && c.found },
    { id: "image", text: L("Find the fire exit. It is only in the picture.", "Temukan pintu darurat. Letaknya hanya ada di gambar."), check: (c) => +c.inputs.qi === 1 && c.found },
    { id: "flatfail", text: L("Show a table question that flat extraction gets wrong.", "Tunjukkan pertanyaan tabel yang salah dijawab ekstraksi datar."), check: (c) => c.inputs.strategy === "flat" && [0, 3].includes(+c.inputs.qi) && c.found === false },
  ],
  quiz: [
    quizQ(L("Why repeat the column headers in every row chunk?", "Mengapa judul kolom diulang di setiap potongan baris?"), [L("So each chunk says what its numbers mean, on its own", "Agar setiap potongan menjelaskan arti angkanya sendiri"), L("To make chunks longer", "Agar potongan lebih panjang"), L("Because tables need more tokens", "Karena tabel butuh lebih banyak token"), L("It is required by PDF", "Diwajibkan PDF")], 0, L("A retrieved chunk is read alone; \"30\" means nothing without \"Seats\".", "Potongan yang diambil dibaca sendirian; \"30\" tidak berarti tanpa \"Kursi\".")),
    quizQ(L("How does a text-only RAG system find information inside a picture?", "Bagaimana sistem RAG teks menemukan informasi di dalam gambar?"), [L("A vision model describes the picture in words, and the description is indexed", "Model visi mendeskripsikan gambar dengan kata-kata, lalu deskripsinya diindeks"), L("It can't", "Tidak bisa"), L("By the file name", "Lewat nama file"), L("By the image size", "Lewat ukuran gambar")], 0, L("The description is a chunk like any other; the picture is kept to show with the answer.", "Deskripsi adalah potongan seperti yang lain; gambarnya disimpan untuk ditampilkan bersama jawaban.")),
    quizQ(L("Which question gains least from region-aware extraction?", "Pertanyaan mana yang paling sedikit diuntungkan ekstraksi per wilayah?"), [L("One answered by a plain paragraph", "Yang dijawab oleh paragraf biasa"), L("One about a table cell", "Yang tentang sel tabel"), L("One about a diagram", "Yang tentang diagram"), L("One about a chart", "Yang tentang grafik")], 0, L("Paragraphs already survive plain text extraction.", "Paragraf sudah selamat dalam ekstraksi teks biasa.")),
  ],
};
