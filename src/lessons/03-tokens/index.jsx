// Lesson 3: tokens (BPE trained live on the document) and the context window.
import * as bpe from "../../rag/bpe.js";
import { BarList } from "../../toolkit/charts.jsx";
import pySource from "./bpe.py?raw";
import libSource from "./with_libraries.py?raw";

const L = (en, id) => ({ en, id });
const cache = new Map();
function trained(text, merges) {
  const k = merges + "|" + text.length + "|" + text.slice(0, 200);
  if (!cache.has(k)) { if (cache.size > 30) cache.clear(); cache.set(k, bpe.trainBPE(bpe.wordFreqs(text), merges)); }
  return cache.get(k);
}
const show = (t) => t.replace(/▁$/, "·");

const stages = [
  { id: "chars", label: L("Characters", "Karakter"),
    desc: L("Start with every character as its own token. Text is long and meaningless at this level.", "Mulai dengan setiap karakter sebagai token sendiri. Teks menjadi panjang dan tidak bermakna di level ini."),
    run: ({ inputs }) => { const freq = bpe.wordFreqs(inputs.doc.text); return { freq, charTokens: bpe.tokenizeBPE(inputs.question || "", []) }; },
    log: (c) => ({ text: `${c.freq.size} distinct words · your text = ${c.charTokens.length} character tokens` }),
    live: (c) => `${c.charTokens.length} character tokens` },
  { id: "merge", label: L("Learn merges", "Pelajari gabungan"),
    desc: L("Find the most frequent neighbouring pair in the document and merge it into a new token. Repeat.", "Cari pasangan bersebelahan yang paling sering muncul di dokumen dan gabungkan menjadi token baru. Ulangi."),
    run: (c) => ({ merges: trained(c.inputs.doc.text, c.inputs.merges) }),
    log: (c) => ({ text: `${c.merges.length} merges learned` + (c.merges[0] ? `, first: "${c.merges[0].a}" + "${c.merges[0].b}"` : "") }),
    live: (c) => `${c.merges.length} merges` },
  { id: "tokenize", label: L("Tokenize", "Tokenisasi"),
    desc: L("Apply the merges, in order, to your text. Common words become one token; rare words stay in pieces.", "Terapkan gabungan, secara berurutan, ke teks Anda. Kata umum menjadi satu token; kata langka tetap terpecah."),
    run: (c) => ({ tokens: bpe.tokenizeBPE(c.inputs.question || "", c.merges) }),
    log: (c) => ({ text: `${c.tokens.length} tokens: ${c.tokens.slice(0, 12).map(show).join(" | ")}${c.tokens.length > 12 ? " …" : ""}` }),
    live: (c) => `${c.tokens.length} tokens (${((c.inputs.question || "").length / Math.max(1, c.tokens.length)).toFixed(1)} chars/token)` },
  { id: "window", label: L("Fit the window", "Muat ke jendela"),
    desc: L("A model reads at most N tokens at once: its context window. Does the whole document fit?", "Model hanya bisa membaca paling banyak N token sekaligus: jendela konteksnya. Apakah seluruh dokumen muat?"),
    run: (c) => { const docTokens = bpe.tokenizeBPE(c.inputs.doc.text, c.merges).length; return { docTokens, fits: docTokens <= c.inputs.window }; },
    log: (c) => ({ text: `document = ${c.docTokens} tokens, window = ${c.inputs.window}`, warn: c.fits ? null : `${c.docTokens - c.inputs.window} tokens don't fit` }),
    live: (c) => `${c.docTokens} / ${c.inputs.window} tokens` },
];

const controls = [
  { id: "merges", label: L("Merges learned", "Jumlah gabungan"), min: 0, max: 500, step: 10, default: 150 },
  { id: "window", label: L("Context window (tokens)", "Jendela konteks (token)"), min: 128, max: 4096, step: 128, default: 512 },
];

function Board({ ctx, tr }) {
  const toks = ctx.tokens || ctx.charTokens || [];
  const chars = (ctx.inputs.question || "").length;
  const win = ctx.inputs.window;
  const pct = ctx.docTokens ? Math.min(1, win / ctx.docTokens) : 0;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("Your text, as the model sees it", "Teks Anda, seperti yang dilihat model"))}</h2>
        <span className="sub">{chars} {tr(L("characters", "karakter"))} → {toks.length} {tr(L("tokens", "token"))}</span></div>
      <div className="tokens" aria-label="tokens">
        {toks.map((t, i) => <span key={i} className={`tok c${i % 6}`} title={t}>{show(t)}</span>)}
        {!toks.length && <span className="note">{tr(L("Type some text in Try it yourself.", "Ketik teks di Coba sendiri."))}</span>}
      </div>
      <div className="split">
        <div className="plain">
          <p className="note" style={{ marginTop: 0 }}>{tr(L("First merges learned from the document (pair → count)", "Gabungan pertama yang dipelajari dari dokumen (pasangan → jumlah)"))}</p>
          {ctx.merges?.length ? (
            <BarList max={ctx.merges[0].count} fmt={(v) => String(v)}
              items={ctx.merges.slice(0, 8).map((m) => ({ label: `${show(m.a)}+${show(m.b)}`, value: m.count }))} />
          ) : <p className="note">{tr(L("0 merges: every character is a token.", "0 gabungan: setiap karakter adalah token."))}</p>}
        </div>
        <div className="plain">
          <p className="note" style={{ marginTop: 0 }}>{tr(L("Whole document vs the context window", "Seluruh dokumen vs jendela konteks"))}</p>
          {ctx.docTokens != null ? <>
            <div className="segbar" style={{ height: 26 }}>
              <i style={{ width: `${pct * 100}%`, background: "var(--accent)" }} />
              <i style={{ width: `${(1 - pct) * 100}%`, background: "var(--warn)", opacity: 0.8 }} />
            </div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>{tr(L("document", "dokumen"))}</dt><dd>{ctx.docTokens} tokens</dd>
              <dt>{tr(L("window", "jendela"))}</dt><dd>{win} tokens</dd>
              <dt>{tr(L("fits?", "muat?"))}</dt><dd style={{ color: ctx.fits ? "var(--good)" : "var(--warn)" }}>{ctx.fits ? tr(L("yes", "ya")) : tr(L(`no: ${Math.round((1 - pct) * 100)}% cut off`, `tidak: ${Math.round((1 - pct) * 100)}% terpotong`))}</dd>
            </dl>
            <p className="note">{tr(L("Red is text the model would never see. That is one reason RAG sends only the relevant chunks.", "Merah adalah teks yang tidak akan pernah dilihat model. Inilah salah satu alasan RAG hanya mengirim potongan yang relevan."))}</p>
          </> : <p className="note">{tr(L("Run the last step to measure the document.", "Jalankan langkah terakhir untuk mengukur dokumen."))}</p>}
        </div>
      </div>
      <div className="legend2"><span>· = {tr(L("end of a word", "akhir kata"))}</span><span>{tr(L("each coloured box is one token", "setiap kotak berwarna adalah satu token"))}</span></div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "Models don't read letters or words. They read **tokens**: frequent chunks of text learned from data. \"printing\" might be one token; a rare word like \"osiloskop\" gets split into pieces." },
      { p: "The tokenizer here is **byte-pair encoding (BPE)**, the family GPT-style models use. It is trained live on the current document: start from characters, then keep merging the most frequent pair." },
      { p: "A model can only read a fixed number of tokens at once, its **context window**. Anything past the window is invisible to it." },
      { h: "Try" },
      { ol: ["Drag **Merges learned** from 0 up: watch character boxes join into word pieces.", "Type an Indonesian sentence while the English handbook is selected: it splits into many more tokens.", "Shrink the **context window** until the document no longer fits."] },
    ],
    id: [
      { p: "Model tidak membaca huruf atau kata. Model membaca **token**: potongan teks yang sering muncul dan dipelajari dari data. \"printing\" bisa menjadi satu token; kata langka seperti \"osiloskop\" dipecah menjadi beberapa bagian." },
      { p: "Tokenizer di sini adalah **byte-pair encoding (BPE)**, keluarga yang dipakai model bergaya GPT. Tokenizer dilatih langsung dari dokumen saat ini: mulai dari karakter, lalu terus menggabungkan pasangan yang paling sering." },
      { p: "Model hanya bisa membaca sejumlah token sekaligus, yaitu **jendela konteks**. Apa pun di luar jendela tidak terlihat oleh model." },
      { h: "Coba" },
      { ol: ["Geser **Jumlah gabungan** dari 0 ke atas: lihat kotak karakter bergabung menjadi potongan kata.", "Ketik kalimat bahasa Inggris saat buku panduan Indonesia dipilih: kalimat itu dipecah menjadi jauh lebih banyak token.", "Kecilkan **jendela konteks** sampai dokumen tidak muat lagi."] },
    ],
  },
  experiments: {
    en: [{ h: "Experiments" },
      { exp: ["Language matters", "Train on the English handbook and tokenize \"Mahasiswa meminjam osiloskop\". Then switch to the Indonesian handbook. The same sentence needs far fewer tokens, because the tokenizer learned Indonesian pieces. Real models trained mostly on English also spend more tokens (and money) on Indonesian."] },
      { exp: ["Rare words", "Type a name or code like \"QRIS-2026\". Rare strings stay in small pieces at any merge count."] },
      { exp: ["Shrink the window", "Set the context window to 128 tokens and step to Fit the window. Only a small slice of the handbook fits: this is why RAG sends a few relevant chunks instead of the whole file."] }],
    id: [{ h: "Eksperimen" },
      { exp: ["Bahasa berpengaruh", "Latih dengan buku panduan Indonesia lalu tokenisasi \"Members may borrow equipment\". Lalu ganti ke buku panduan Inggris. Kalimat yang sama butuh jauh lebih sedikit token, karena tokenizer mempelajari potongan bahasa Inggris. Model sungguhan yang sebagian besar dilatih dengan bahasa Inggris juga memakai lebih banyak token (dan biaya) untuk bahasa Indonesia."] },
      { exp: ["Kata langka", "Ketik nama atau kode seperti \"QRIS-2026\". String langka tetap terpecah kecil berapa pun jumlah gabungannya."] },
      { exp: ["Perkecil jendela", "Atur jendela konteks ke 128 token lalu jalankan sampai Muat ke jendela. Hanya sebagian kecil buku panduan yang muat: inilah alasan RAG mengirim beberapa potongan relevan, bukan seluruh file."] }],
  },
  specs: {
    en: [{ dl: [["Merges learned", "How many merge rules BPE learns from the document. Real tokenizers learn 30,000 to 200,000."], ["Context window", "Real models range from about 8,000 to over 1,000,000 tokens. Bigger windows cost more and models still pay less attention to the middle (lesson 18)."], ["·", "Marks the end of a word, so \"the\" at the end of a word differs from \"the\" inside \"there\"."]] }],
    id: [{ dl: [["Jumlah gabungan", "Berapa aturan gabungan yang dipelajari BPE dari dokumen. Tokenizer sungguhan mempelajari 30.000 sampai 200.000."], ["Jendela konteks", "Model sungguhan berkisar dari sekitar 8.000 sampai lebih dari 1.000.000 token. Jendela besar lebih mahal dan model tetap kurang memperhatikan bagian tengah (pelajaran 18)."], ["·", "Menandai akhir kata, sehingga \"the\" di akhir kata berbeda dari \"the\" di dalam \"there\"."]] }],
  },
};

export default {
  n: 3,
  stages, controls, text, Board,
  inputs: { document: true, question: true },
  questionLabel: L("Text to tokenize", "Teks yang ditokenisasi"),
  runLabel: L("Tokenize", "Tokenisasi"),
  defaultQuestion: { en: "How much does PLA printing cost at the lab?", id: "Berapa biaya cetak PLA di lab?" },
  examples: { en: ["How much does PLA printing cost at the lab?", "Mahasiswa meminjam osiloskop", "QRIS-2026 microcontroller"], id: ["Berapa biaya cetak PLA di lab?", "Members may borrow equipment", "QRIS-2026 mikrokontroler"] },
  code: [{ id: "bpe", label: L("BPE tokenizer (runs here)", "Tokenizer BPE (bisa dijalankan)"), source: pySource, runnable: true, filename: "bpe.py" },
    { id: "libs", label: L("With libraries", "Dengan pustaka"), source: libSource, runnable: false, filename: "tokens_libraries.py", note: L("Runs on your computer after: pip install tiktoken tokenizers", "Jalankan di komputer Anda setelah: pip install tiktoken tokenizers") }],
  variables: (c) => [["len(merges)", c.merges ? String(c.merges.length) : "—"], ["tokens", c.tokens ? `[${c.tokens.map((t) => `'${t}'`).join(", ")}]` : "—"], ["doc tokens", c.docTokens != null ? String(c.docTokens) : "—"], ["window", String(c.inputs.window)]],
  python: (c) => ({
    globals: { DOCUMENT: c.inputs.doc.text, TEXT: c.inputs.question || "", MERGES: c.inputs.merges, WINDOW: c.inputs.window },
    call: "run(DOCUMENT, TEXT, MERGES, WINDOW)",
    compare: (res) => {
      const m = trained(c.inputs.doc.text, c.inputs.merges);
      return JSON.stringify(res.tokens) === JSON.stringify(bpe.tokenizeBPE(c.inputs.question || "", m)) && res.n_merges === m.length;
    },
  }),
  challenges: [
    { id: "zero", text: L("Set merges to 0 and count how many tokens your text becomes.", "Atur gabungan ke 0 dan hitung jadi berapa token teks Anda."), check: (c) => c.inputs.merges === 0 && c.tokens },
    { id: "overflow", text: L("Make the document too big for the window (red appears).", "Buat dokumen terlalu besar untuk jendela (muncul warna merah)."), check: (c) => c.fits === false },
    { id: "fit", text: L("Find the smallest window that still fits the whole document.", "Temukan jendela terkecil yang masih memuat seluruh dokumen."), check: (c) => c.fits === true && c.inputs.window - c.docTokens < 128 },
  ],
  quiz: [
    { q: L("What is a token?", "Apa itu token?"),
      options: [L("Always one word", "Selalu satu kata"), L("A frequent chunk of text: a word, part of a word, or punctuation", "Potongan teks yang sering muncul: kata, bagian kata, atau tanda baca"), L("One character", "Satu karakter"), L("A sentence", "Satu kalimat")],
      answer: 1, why: L("Tokenizers learn pieces from data, so common words are one token and rare words are split.", "Tokenizer mempelajari potongan dari data, sehingga kata umum menjadi satu token dan kata langka dipecah.") },
    { q: L("Why might Indonesian text cost more tokens in many models?", "Mengapa teks bahasa Indonesia bisa memakai lebih banyak token di banyak model?"),
      options: [L("Indonesian words are longer", "Kata bahasa Indonesia lebih panjang"), L("The tokenizer learned mostly from English, so Indonesian words get split into more pieces", "Tokenizer sebagian besar belajar dari bahasa Inggris, sehingga kata Indonesia dipecah menjadi lebih banyak bagian"), L("Models translate it first", "Model menerjemahkannya dulu"), L("It doesn't", "Tidak benar")],
      answer: 1, why: L("You saw it on the board: a tokenizer trained on one language splits the other into small pieces.", "Anda melihatnya di papan: tokenizer yang dilatih dengan satu bahasa memecah bahasa lain menjadi potongan kecil.") },
    { q: L("Your document is 3,000 tokens and the window is 1,024. What does RAG do about it?", "Dokumen Anda 3.000 token dan jendelanya 1.024. Apa yang dilakukan RAG?"),
      options: [L("Sends only the most relevant chunks", "Hanya mengirim potongan yang paling relevan"), L("Sends the first 1,024 tokens", "Mengirim 1.024 token pertama"), L("Retrains the model", "Melatih ulang model"), L("Nothing: it fails", "Tidak ada: gagal")],
      answer: 0, why: L("Retrieval picks a few chunks that fit, instead of hoping the answer is in the first part.", "Retrieval memilih beberapa potongan yang muat, bukan berharap jawabannya ada di bagian awal.") },
  ],
};
