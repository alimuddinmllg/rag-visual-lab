// Lesson 10: metadata tags on chunks, and filtering before similarity search.
import * as S from "../../rag/stages.js";
import DocumentSpace, { SECTION_COLORS } from "../../toolkit/DocumentSpace.jsx";
import { ChunkList, AnswerPanel } from "../../toolkit/TextPanels.jsx";
import { NeuralStatus } from "../../toolkit/LessonParts.jsx";
import pySource from "./filtering.py?raw";
import libSource from "./with_libraries.py?raw";
import * as rag from "../../rag/core.js";
import { prelude, stopList } from "../prelude.js";

const L = (en, id) => ({ en, id });
const KINDS = { price: L("a price", "harga"), time: L("a time", "jam"), rule: L("a rule", "aturan") };

export function tagChunk(text) {
  const kinds = [];
  if (/\bRp\s?[0-9]/.test(text)) kinds.push("price");
  if (/\b[0-9]{1,2}[:.][0-9]{2}\b/.test(text)) kinds.push("time");
  if (/\b(must|never|required|wajib|jangan|harus)\b/i.test(text)) kinds.push("rule");
  return kinds;
}

const stages = [
  { id: "chunk", label: L("Chunk", "Potong"), desc: L("Split the document as in lesson 6.", "Memotong dokumen seperti di pelajaran 6."),
    run: S.chunkStage, log: (c) => ({ text: `${c.chunks.length} chunks` }), live: (c) => `${c.chunks.length} chunks` },
  { id: "tag", label: L("Tag", "Tandai"),
    desc: L("Attach metadata to every chunk: which section it came from, and whether it mentions a price, a time or a rule.", "Menempelkan metadata ke setiap potongan: dari bagian mana, dan apakah menyebut harga, jam, atau aturan."),
    run: (c) => ({ meta: c.chunks.map((ch) => ({ section: ch.sec, kinds: tagChunk(ch.text) })) }),
    log: (c) => ({ text: Object.keys(KINDS).map((k) => `${k}: ${c.meta.filter((m) => m.kinds.includes(k)).length}`).join(", ") }),
    live: (c) => `${c.meta.filter((m) => m.kinds.length).length} chunks tagged` },
  { id: "embed", label: L("Embed", "Embed"), desc: L("Turn chunks into vectors.", "Mengubah potongan menjadi vektor."),
    run: S.embedStage, log: (c) => ({ text: `${c.method}, ${c.dims} dims` }), live: (c) => c.method },
  { id: "filter", label: L("Filter", "Saring"),
    desc: L("Keep only chunks whose metadata matches the filter. This is an exact rule, not a similarity guess.", "Hanya simpan potongan yang metadatanya cocok dengan filter. Ini aturan pasti, bukan tebakan kemiripan."),
    run: (c) => {
      const sec = c.inputs.fSection, kind = c.inputs.fKind;
      const allowed = new Set(c.meta.map((m, i) => ((sec === "all" || m.section === +sec) && (kind === "all" || m.kinds.includes(kind)) ? i : -1)).filter((i) => i >= 0));
      return { allowed };
    },
    log: (c) => ({ text: `${c.allowed.size} of ${c.chunks.length} chunks pass the filter`, warn: c.allowed.size ? null : "filter removed everything" }),
    live: (c) => `${c.allowed.size}/${c.chunks.length} pass` },
  { id: "retrieve", label: L("Retrieve", "Ambil"), desc: L("Similarity search, but only among the chunks that passed the filter.", "Pencarian kemiripan, tetapi hanya di antara potongan yang lolos filter."),
    run: (c) => ({ ...S.queryStage(c), ...S.retrieveStage({ ...c, ...S.queryStage(c) }, (i) => c.allowed.has(i)) }),
    log: (c) => ({ text: c.top.map((t) => `#${t.i + 1} ${t.s.toFixed(2)}`).join(", ") || "nothing" }), live: (c) => c.top.map((t) => `#${t.i + 1}`).join(" ") },
  { id: "generate", label: L("Answer", "Jawab"), desc: L("Answer from the filtered results.", "Jawab dari hasil yang sudah disaring."),
    run: S.generateStage, log: (c) => ({ text: c.answer.text.slice(0, 90) }), live: (c) => (c.answer.grounded ? "grounded" : "refused") },
];

function Filters({ ctx, inputs, setValue, tr }) {
  const sections = ctx.sections || [];
  return (
    <div>
      <span className="lbl">{tr(L("Filter: section", "Filter: bagian"))}</span>
      <div className="chips">
        <button className="chip" aria-pressed={inputs.fSection === "all"} onClick={() => setValue("fSection", "all")}>{tr(L("All", "Semua"))}</button>
        {sections.map((s, i) => <button key={i} className="chip" aria-pressed={inputs.fSection === String(i)} onClick={() => setValue("fSection", String(i))}><i style={{ background: SECTION_COLORS[i % SECTION_COLORS.length] }} />{s}</button>)}
      </div>
      <span className="lbl" style={{ marginTop: 10 }}>{tr(L("Filter: chunk mentions", "Filter: potongan menyebut"))}</span>
      <div className="chips">
        <button className="chip" aria-pressed={inputs.fKind === "all"} onClick={() => setValue("fKind", "all")}>{tr(L("Anything", "Apa saja"))}</button>
        {Object.entries(KINDS).map(([k, v]) => <button key={k} className="chip" aria-pressed={inputs.fKind === k} onClick={() => setValue("fKind", k)}>{tr(v)}</button>)}
      </div>
    </div>
  );
}

function Board({ ctx, runner, hover, setHover, tr }) {
  const dimmed = ctx.allowed ? new Set(ctx.chunks.map((_, i) => i).filter((i) => !ctx.allowed.has(i))) : null;
  return (
    <div className="card">
      <div className="card-h"><h2>{tr(L("Filter first, then search", "Saring dulu, lalu cari"))}</h2>
        <span className="sub">{ctx.allowed ? `${ctx.allowed.size}/${ctx.chunks.length} ${tr(L("chunks pass the filter", "potongan lolos filter"))}` : ""}</span></div>
      <div style={{ padding: "0 14px" }}><NeuralStatus neural={ctx.inputs.neural} /></div>
      <DocumentSpace points={ctx.map ? ctx.map.coords : null} labels={ctx.chunks || []} sections={ctx.sections || []} dimmed={dimmed}
        query={{ show: !!ctx.qTokens, xy: ctx.qxy }} links={ctx.top || null} threshold={ctx.inputs.minSim}
        anim={runner.animStage === "retrieve" ? "retrieve" : runner.animStage} runKey={runner.runKey} hover={hover} onHover={setHover}
        text={{ aria: L("Chunks with filter", "Potongan dengan filter"), empty: L("Press Play or Step to start", "Tekan Putar atau Langkah untuk mulai"), question: L("your question", "pertanyaan Anda"), noMatch: L("No word in the question appears in the document", "Tidak ada kata pertanyaan yang muncul di dokumen") }} />
    </div>
  );
}

function DataPanel({ ctx, hover, setHover, runner, tr }) {
  const ranks = ctx.top ? new Map(ctx.top.map((t, r) => [t.i, r])) : null;
  const retrieved = ctx.used ? new Set(ctx.used.map((t) => t.i)) : null;
  return (
    <div className="row2">
      <ChunkList chunks={ctx.chunks} sections={ctx.sections || []} title={L("Chunks", "Potongan")} scores={ctx.scores && ctx.hasQuery ? ctx.scores : null}
        ranks={ranks} retrievedSet={retrieved} hover={hover} onHover={setHover} anim={runner.animStage} />
      <AnswerPanel answer={ctx.answer} prompt={ctx.prompt} promptTokens={ctx.promptTokens} usedCount={ctx.used ? ctx.used.length : 0}
        text={{ title: L("Answer", "Jawaban"), sub: L("from filtered chunks", "dari potongan tersaring"), waiting: L("Waiting for the Answer step…", "Menunggu langkah Jawab…"), note: L("Only chunks that passed the filter could be used.", "Hanya potongan yang lolos filter yang bisa dipakai."), prompt: L("Prompt sent to the model", "Prompt yang dikirim ke model") }} />
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Similarity search is fuzzy. **Metadata** is exact: facts stored with each chunk, such as its section, source file, date, department or language." },
      { p: "Filtering on metadata **before** the similarity search removes whole groups of wrong answers. Ask \"How much does it cost?\": membership, printing and paper printing all match. Filter to the 3D printing section and only one can win." },
      { p: "The faded dots on the map are chunks the filter removed. They can no longer be retrieved, however similar they look." },
      { h: "Try" },
      { ol: ["Ask the default question with no filter, then filter to a section.", "Filter to chunks that mention **a price**."] },
    ],
    id: [
      { p: "Pencarian kemiripan itu kabur. **Metadata** itu pasti: fakta yang disimpan bersama setiap potongan, seperti bagian, nama file sumber, tanggal, departemen, atau bahasa." },
      { p: "Menyaring berdasarkan metadata **sebelum** pencarian kemiripan membuang seluruh kelompok jawaban yang salah. Tanyakan \"Berapa biaya yang harus dibayar?\": keanggotaan, cetak 3D, dan cetak kertas semuanya cocok. Saring ke bagian cetak 3D dan hanya satu yang bisa menang." },
      { p: "Titik yang pudar di peta adalah potongan yang dibuang filter. Potongan itu tidak bisa diambil lagi, semirip apa pun kelihatannya." },
      { h: "Coba" },
      { ol: ["Tanyakan pertanyaan bawaan tanpa filter, lalu saring ke satu bagian.", "Saring ke potongan yang menyebut **harga**."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Filter too hard", "Ask about safety but filter to the Membership section. Nothing relevant is left: the answer becomes \"I don't know\". A wrong filter is worse than none."] }, { exp: ["Uploaded PDFs", "For an uploaded PDF, sections are pages. Filtering by page is how real systems answer \"according to page 3…\"."] },
      { exp: ["Filter plus search", "Ask \"When does it close?\" with the kind filter set to a time. Every candidate now has a time in it, so similarity only has to choose which time. Then remove the filter and compare the top three."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Filter terlalu ketat", "Tanyakan soal keselamatan tetapi saring ke bagian Keanggotaan. Tidak ada yang relevan tersisa: jawabannya menjadi \"tidak tahu\". Filter yang salah lebih buruk daripada tanpa filter."] }, { exp: ["PDF yang diunggah", "Untuk PDF yang diunggah, bagian adalah halaman. Menyaring per halaman adalah cara sistem sungguhan menjawab \"menurut halaman 3…\"."] },
      { exp: ["Filter ditambah pencarian", "Tanyakan \"Kapan lab tutup?\" dengan filter jenis diatur ke jam. Semua kandidat kini berisi jam, sehingga kemiripan hanya perlu memilih jam yang mana. Lalu hapus filter dan bandingkan tiga teratas."] }],
  },
  specs: {
    en: [{ dl: [["Section", "Taken from the document's headings (or PDF pages)."], ["Mentions", "Detected with simple patterns: \"Rp\" + number = price; 09:00-style = time; must/never/required = rule. Real systems store metadata from the source system (author, date, access rights) or extract it with a model."], ["Pre-filtering", "Filter, then search. Vector databases support this natively with metadata fields."]] }],
    id: [{ dl: [["Bagian", "Diambil dari judul dokumen (atau halaman PDF)."], ["Menyebut", "Dideteksi dengan pola sederhana: \"Rp\" + angka = harga; format 09.00 = jam; wajib/jangan/harus = aturan. Sistem sungguhan menyimpan metadata dari sistem sumber (penulis, tanggal, hak akses) atau mengekstraknya dengan model."], ["Pra-penyaringan", "Saring, lalu cari. Vector database mendukung ini langsung lewat kolom metadata."]] }],
  },
};

export default {
  n: 10,
  stages, text, Board, DataPanel,
  ControlsExtra: Filters,
  extraValues: { fSection: "all", fKind: "all" },
  controls: [
    { id: "size", label: L("Chunk size", "Ukuran potongan"), min: 15, max: 120, step: 5, default: 40, format: (v, tr) => `${v} ${tr(L("words", "kata"))}` },
    { id: "overlap", label: L("Overlap", "Overlap"), min: 0, max: 30, step: 2, default: 8, maxFrom: (v) => Math.min(30, v.size - 6) },
    { id: "topK", label: L("Top-k", "Top-k"), min: 1, max: 8, step: 1, default: 3 },
    { id: "minSim", label: L("Min similarity", "Kemiripan minimum"), min: 0, max: 0.8, step: 0.02, default: 0.1, format: (v) => v.toFixed(2) },
    S.methodControl,
  ],
  useExtra: S.useNeuralExtra,
  inputs: { document: true, question: true },
  defaultQuestion: { en: "How much does it cost?", id: "Berapa biaya yang harus dibayar?" },
  examples: { en: ["How much does it cost?", "What are the rules?", "When does it close?"], id: ["Berapa biaya yang harus dibayar?", "Apa aturan keselamatan?", "Kapan lab tutup?"] },
  code: [
    { id: "filter", label: L("Metadata filter (runs here)", "Filter metadata (bisa dijalankan)"), source: pySource, runnable: true, filename: "filtering.py" },
    { id: "libs", label: L("With a vector database", "Dengan database vektor"), source: libSource, runnable: false, filename: "filtering_chroma.py",
      note: L("Runs on your computer after: pip install chromadb sentence-transformers", "Jalankan di komputer Anda setelah: pip install chromadb sentence-transformers") },
  ],
  python: (c) => {
    const doc = c.inputs.doc, lang = doc.lang, I = c.inputs;
    const sec = I.fSection === "all" ? null : +I.fSection, kind = I.fKind === "all" ? null : I.fKind;
    return {
      prelude: prelude("rag"),
      globals: { DOCUMENT: doc.text, QUESTION: I.question || "", SIZE: I.size, OVERLAP: I.overlap, TOP_K: I.topK, MIN_SIM: I.minSim, LANG: lang, STOPWORDS: stopList(lang), SECTION: sec, KIND: kind },
      call: "demo(DOCUMENT, QUESTION, SIZE, OVERLAP, TOP_K, MIN_SIM, LANG, STOPWORDS, SECTION, KIND)",
      compare: I.method === "neural" ? null : (res) => {
        const stop = rag.stopwordsFor(lang), { words } = rag.parseDocument(doc.text);
        const chunks = rag.chunkDocument(words, I.size, I.overlap), e = rag.embedChunks(chunks, stop, lang);
        const qt = rag.tokenize(I.question || "", stop, lang), qv = rag.vectorize(qt, e.idf), known = [...new Set(qt.filter((t) => e.idf.has(t)))];
        const ok = (i) => (sec === null || chunks[i].sec === sec) && (kind === null || tagChunk(chunks[i].text).includes(kind));
        const top = e.vectors.map((v, i) => ({ i, s: qv.size ? rag.cosine(qv, v) : 0 })).filter((t) => ok(t.i)).sort((a, b) => b.s - a.s).slice(0, I.topK);
        const used = top.filter((t) => t.s >= I.minSim && known.length);
        const ans = rag.extractAnswer(used, chunks, known, e.idf, stop, lang);
        return res.top.length === top.length && res.top.every(([i, s], k) => i === top[k].i && Math.abs(s - top[k].s) < 1e-9) && res.answer === ans.text;
      },
    };
  },
  variables: (c) => [["filter", `section=${c.inputs.fSection}, kind=${c.inputs.fKind}`], ["len(candidates)", c.allowed ? String(c.allowed.size) : "—"], ["top", c.top ? c.top.map((t) => `(${t.i}, ${t.s.toFixed(2)})`).join(", ") : "—"]],
  challenges: [
    { id: "sec", text: L("Ask \"How much does it cost?\" and use a section filter to get the 3D printing price as the answer.", "Tanyakan \"Berapa biaya yang harus dibayar?\" dan pakai filter bagian agar jawabannya biaya cetak 3D."), check: (c) => c.inputs.fSection !== "all" && c.answer?.grounded && /PLA|filament|filamen/i.test(c.answer.text) },
    { id: "empty", text: L("Make a filter so strict that the answer becomes \"I don't know\".", "Buat filter yang begitu ketat sampai jawabannya menjadi \"tidak tahu\"."), check: (c) => (c.inputs.fSection !== "all" || c.inputs.fKind !== "all") && c.answer && !c.answer.grounded },
    { id: "kind", text: L("Filter to chunks that mention a time and ask when the lab closes.", "Saring ke potongan yang menyebut jam dan tanyakan kapan lab tutup."), check: (c) => c.inputs.fKind === "time" && c.answer?.grounded },
  ],
  quiz: [
    { q: L("What is metadata in RAG?", "Apa itu metadata dalam RAG?"),
      options: [L("Exact facts stored with each chunk, like section, date or source", "Fakta pasti yang disimpan bersama setiap potongan, seperti bagian, tanggal, atau sumber"), L("The embedding vector", "Vektor embedding"), L("The model's answer", "Jawaban model"), L("The prompt template", "Template prompt")],
      answer: 0, why: L("Metadata lets you filter exactly, which similarity alone cannot do.", "Metadata memungkinkan penyaringan yang pasti, hal yang tidak bisa dilakukan kemiripan saja.") },
    { q: L("Why filter before the similarity search rather than after?", "Mengapa menyaring sebelum pencarian kemiripan, bukan sesudahnya?"),
      options: [L("So the top-k slots are filled only with allowed chunks", "Agar slot top-k hanya diisi potongan yang diizinkan"), L("It makes embeddings smaller", "Membuat embedding lebih kecil"), L("The model requires it", "Model mengharuskannya"), L("It doesn't matter", "Tidak ada bedanya")],
      answer: 0, why: L("Filtering after top-k can leave you with zero results even when allowed matches exist.", "Menyaring setelah top-k bisa menyisakan nol hasil walaupun ada potongan yang diizinkan.") },
    { q: L("A user may only see documents from their own faculty. How do you enforce that?", "Pengguna hanya boleh melihat dokumen fakultasnya sendiri. Bagaimana menegakkannya?"),
      options: [L("Store the faculty as metadata and filter on it for every query", "Simpan fakultas sebagai metadata dan saring untuk setiap kueri"), L("Ask the model not to mention other faculties", "Minta model tidak menyebut fakultas lain"), L("Use a lower temperature", "Pakai temperatur lebih rendah"), L("Use bigger chunks", "Pakai potongan lebih besar")],
      answer: 0, why: L("Access rules must be exact filters, never instructions to the model (lesson 24).", "Aturan akses harus berupa filter pasti, bukan instruksi ke model (pelajaran 24).") },
  ],
};
