// Lesson 1: what an LLM does (predict the next word), and why that alone produces confident mistakes.
import * as ng from "../../rag/ngram.js";
import { BarList } from "../../toolkit/charts.jsx";
import pySource from "./ngram.py?raw";

const L = (en, id) => ({ en, id });

const stages = [
  { id: "read", label: L("Read", "Baca"),
    desc: L("Split the text into words and count which word follows which. This is the model's whole \"training\".", "Memecah teks menjadi kata dan menghitung kata mana yang mengikuti kata mana. Inilah seluruh \"pelatihan\" model."),
    run: ({ inputs }) => {
      const docTokens = ng.lmTokens(inputs.doc.text);
      return { docTokens, lm: ng.trainLM(docTokens), promptTokens: ng.lmTokens(inputs.question || "") };
    },
    log: (c) => ({ text: `trained on ${c.docTokens.length} words · prompt = ${c.promptTokens.length} words` }),
    live: (c) => `${c.docTokens.length} training words, ${c.lm.tri.size} three-word contexts` },
  { id: "predict", label: L("Predict", "Prediksi"),
    desc: L("Score every possible next word given the last two words. The bars show the probabilities.", "Memberi skor setiap kata berikutnya yang mungkin berdasarkan dua kata terakhir. Batang menunjukkan peluangnya."),
    run: (c) => ({ first: ng.nextDist(c.lm, c.promptTokens) }),
    log: (c) => ({ text: `${c.first.order}: ${c.first.dist.length} candidates, top "${c.first.dist[0].w}" ${(c.first.dist[0].p * 100).toFixed(0)}%` }),
    live: (c) => `${c.first.dist.length} candidates via ${c.first.order}` },
  { id: "sample", label: L("Pick", "Pilih"),
    desc: L("Pick one word at random, weighted by probability. Temperature changes how adventurous the pick is.", "Memilih satu kata secara acak sesuai peluangnya. Temperatur mengatur seberapa berani pilihannya."),
    run: (c) => ({ gen: ng.generate(c.lm, c.promptTokens, c.inputs.steps, c.inputs.temperature, c.inputs.seed), reveal: 1 }),
    log: (c) => ({ text: `picked "${c.gen[0].w}" (p=${c.gen[0].p.toFixed(2)}, rank ${c.gen[0].rank + 1})` }),
    live: (c) => `"${c.gen[0].w}"` },
  { id: "repeat", label: L("Repeat", "Ulangi"),
    desc: L("Add the word to the text and predict again, one word at a time, until the length is reached.", "Tambahkan kata ke teks lalu prediksi lagi, satu kata demi satu kata, sampai panjangnya tercapai."),
    run: (c) => ({ reveal: c.gen.length }),
    log: (c) => ({ text: ng.detok([...c.promptTokens, ...c.gen.map((g) => g.w)]) }),
    live: (c) => `${c.gen.length} words generated` },
  { id: "check", label: L("Check", "Periksa"),
    desc: L("Compare with the document: red outlines mark where the model glued two different passages together. Those spots are where wrong facts appear.", "Bandingkan dengan dokumen: garis merah menandai tempat model menempelkan dua bagian berbeda. Di situlah fakta yang salah muncul."),
    run: (c) => ({ seams: ng.seams(c.docTokens, c.promptTokens, c.gen.map((g) => g.w)) }),
    log: (c) => ({ text: c.seams.length ? `${c.seams.length} seam(s) where the text was stitched together` : "every 5-word run appears in the document", warn: c.seams.length ? "check the facts" : null }),
    live: (c) => `${c.seams.length} seam(s)` },
];

const controls = [
  { id: "temperature", label: L("Temperature", "Temperatur"), min: 0.1, max: 2, step: 0.1, default: 1, format: (v) => v.toFixed(1) },
  { id: "steps", label: L("Words to write", "Jumlah kata"), min: 5, max: 30, step: 1, default: 14 },
  { id: "seed", label: L("Random seed", "Benih acak"), min: 1, max: 20, step: 1, default: 3 },
];

function Board({ ctx, hover, setHover, tr }) {
  const shown = ctx.gen ? ctx.gen.slice(0, ctx.reveal) : [];
  const seamSet = new Set(ctx.seams || []);
  const sel = hover != null && hover < shown.length ? hover : shown.length - 1;
  const dist = sel >= 0 ? shown[sel] : null;
  const firstBars = !dist && ctx.first ? { top: ctx.first.dist.slice(0, 8), order: ctx.first.order, w: null } : null;
  const bars = dist || firstBars;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("The model writing, word by word", "Model menulis, kata demi kata"))}</h2>
        <span className="sub">{tr(L("click a word to see the choice behind it", "klik sebuah kata untuk melihat pilihannya"))}</span></div>
      <div className="split">
        <div className="gen" aria-live="polite">
          {(ctx.promptTokens || []).map((w, i) => <span key={"p" + i} className="pw">{w} </span>)}
          {shown.map((g, i) => (
            <span key={i}>
              <span role="button" tabIndex={0} className={`gw${g.p < 0.25 ? " low" : ""}${seamSet.has(i) && ctx.seams ? " seam" : ""}${i === sel ? " sel" : ""}`}
                onClick={() => setHover(i)} onKeyDown={(e) => e.key === "Enter" && setHover(i)}>{g.w}</span>{" "}
            </span>
          ))}
          {!ctx.promptTokens && <span className="pw">{tr(L("Press Play to start.", "Tekan Putar untuk mulai."))}</span>}
        </div>
        <div className="plain">
          {bars ? (
            <>
              <p className="note" style={{ marginTop: 0 }}>
                {tr(L("Next-word probabilities", "Peluang kata berikutnya"))} · <b>{bars.order}</b>
                {dist && <> · {tr(L("picked", "dipilih"))} <b>"{dist.w}"</b></>}
              </p>
              <BarList items={bars.top.map((d) => ({ label: d.w, value: d.p, hl: dist && d.w === dist.w }))} />
            </>
          ) : <p className="note">{tr(L("Run the Predict step to see the probabilities.", "Jalankan langkah Prediksi untuk melihat peluangnya."))}</p>}
        </div>
      </div>
      <div className="legend2">
        <span><i style={{ background: "var(--accent-soft)" }} />{tr(L("likely word (p ≥ 0.25)", "kata yang mungkin (p ≥ 0,25)"))}</span>
        <span><i style={{ background: "var(--query-soft)" }} />{tr(L("unlikely word", "kata yang jarang"))}</span>
        <span><i style={{ outline: "2px solid var(--warn)", outlineOffset: -2 }} />{tr(L("seam: passages stitched together", "sambungan: bagian berbeda ditempel"))}</span>
      </div>
    </div>
  );
}

const text = {
  overview: {
    en: [
      { p: "A large language model (LLM) does one thing over and over: **predict the next word** (strictly, the next token) from the words before it, pick one, and repeat." },
      { p: "This lesson uses a tiny model that predicts from the last two words by counting, trained only on the handbook. Real LLMs use neural networks trained on trillions of words, but the writing loop is the same." },
      { h: "Why it matters for RAG" },
      { ul: [
        "The model picks words that **sound** right, not words that are **checked** against facts.",
        "When it stitches two passages together, you get fluent text with a wrong fact. That is a hallucination.",
        "RAG reduces this by putting the right passage in front of the model before it writes.",
      ] },
      { h: "Try" },
      { ol: ["Press **Play** and watch the five steps.", "Click any generated word to see the other words it could have picked.", "Look for red outlines: they show where a wrong fact can slip in."] },
    ],
    id: [
      { p: "Large language model (LLM) melakukan satu hal berulang-ulang: **memprediksi kata berikutnya** (tepatnya token berikutnya) dari kata-kata sebelumnya, memilih satu, lalu mengulanginya." },
      { p: "Pelajaran ini memakai model mini yang memprediksi dari dua kata terakhir dengan cara menghitung, dilatih hanya dengan buku panduan. LLM sungguhan memakai jaringan saraf yang dilatih dengan triliunan kata, tetapi putaran menulisnya sama." },
      { h: "Mengapa penting untuk RAG" },
      { ul: [
        "Model memilih kata yang **terdengar** benar, bukan kata yang sudah **diperiksa** kebenarannya.",
        "Saat model menempelkan dua bagian teks, hasilnya lancar tetapi faktanya salah. Itulah halusinasi.",
        "RAG mengurangi hal ini dengan meletakkan bagian dokumen yang tepat di depan model sebelum ia menulis.",
      ] },
      { h: "Coba" },
      { ol: ["Tekan **Putar** dan lihat lima langkahnya.", "Klik kata hasil model untuk melihat kata lain yang bisa dipilih.", "Cari garis merah: di situlah fakta yang salah bisa masuk."] },
    ],
  },
  experiments: {
    en: [
      { h: "Experiments" },
      { exp: ["Watch a wrong fact appear", "Keep the prompt \"PLA prints cost\" and try seeds 3 to 6. The model often writes \"Rp 6.000 per millilitre\", which is the resin price, not PLA."] },
      { exp: ["Turn the temperature down", "At 0.1 the model always takes the most likely word. It becomes repetitive and copies the document."] },
      { exp: ["Turn it up", "At 1.8 or more it picks unlikely words and the text falls apart."] },
      { exp: ["Ask about a person", "Type \"The lab coordinator is\". With some seeds the model answers \"a shared maker space\": fluent, confident, and wrong."] },
    ],
    id: [
      { h: "Eksperimen" },
      { exp: ["Lihat fakta salah muncul", "Pakai awalan \"Cetak PLA dikenakan biaya\" dan coba benih 1 sampai 6. Model sering menulis harga yang salah, misalnya biaya keanggotaan."] },
      { exp: ["Turunkan temperatur", "Pada 0,1 model selalu memilih kata yang paling mungkin. Hasilnya berulang dan menyalin dokumen."] },
      { exp: ["Naikkan temperatur", "Pada 1,8 atau lebih model memilih kata yang jarang dan teks menjadi kacau."] },
      { exp: ["Tanya tentang orang", "Ketik \"Koordinator lab\". Dengan beberapa benih model menjawab hal yang tidak berhubungan: lancar, yakin, dan salah."] },
    ],
  },
  specs: {
    en: [
      { h: "Controls" },
      { dl: [["Temperature", "Below 1 sharpens the probabilities (safer, more repetitive). Above 1 flattens them (riskier, more varied)."], ["Random seed", "Fixes the random choices so the same settings always give the same text."], ["Words to write", "How many times the predict-pick loop runs."]] },
      { h: "How this differs from a real LLM" },
      { ul: ["Real models predict **tokens** (lesson 3), not whole words.", "They look at thousands of previous tokens, not two.", "They learn from huge datasets with a neural network, so they generalise far beyond copying. They still hallucinate for the same basic reason: the loop chooses likely text, not verified text."] },
    ],
    id: [
      { h: "Kontrol" },
      { dl: [["Temperatur", "Di bawah 1 mempertajam peluang (lebih aman, lebih berulang). Di atas 1 meratakannya (lebih berisiko, lebih beragam)."], ["Benih acak", "Mengunci pilihan acak sehingga pengaturan yang sama selalu memberi teks yang sama."], ["Jumlah kata", "Berapa kali putaran prediksi-pilih dijalankan."]] },
      { h: "Perbedaan dengan LLM sungguhan" },
      { ul: ["Model sungguhan memprediksi **token** (pelajaran 3), bukan kata utuh.", "Model melihat ribuan token sebelumnya, bukan dua.", "Model belajar dari data sangat besar dengan jaringan saraf, sehingga bisa jauh lebih dari sekadar menyalin. Namun model tetap berhalusinasi karena alasan dasar yang sama: putaran memilih teks yang mungkin, bukan teks yang terverifikasi."] },
    ],
  },
};

export default {
  n: 1,
  stages, controls, text,
  inputs: { document: true, question: true },
  questionLabel: L("Start the text with", "Awali teks dengan"),
  runLabel: L("Write", "Tulis"),
  defaultQuestion: { en: "PLA prints cost", id: "Cetak PLA dikenakan biaya" },
  examples: { en: ["PLA prints cost", "The lab coordinator is", "Members may borrow", "Wear safety"], id: ["Cetak PLA dikenakan biaya", "Koordinator lab", "Anggota boleh meminjam", "Gunakan kacamata"] },
  Board,
  code: [{ id: "ngram", label: L("Tiny language model (runs here)", "Model bahasa mini (bisa dijalankan)"), source: pySource, runnable: true, filename: "tiny_lm.py" }],
  variables: (c) => [
    ["len(doc_tokens)", c.docTokens ? String(c.docTokens.length) : "—"],
    ["prompt_tokens", c.promptTokens ? `[${c.promptTokens.map((w) => `'${w}'`).join(", ")}]` : "—"],
    ["order (first step)", c.first ? c.first.order : "—"],
    ["words", c.gen ? c.gen.slice(0, c.reveal).map((g) => g.w).join(" ") : "—"],
    ["seams", c.seams ? JSON.stringify(c.seams) : "—"],
  ],
  python: (c) => ({
    globals: { DOCUMENT: c.inputs.doc.text, PROMPT: c.inputs.question || "", STEPS: c.inputs.steps, TEMP: c.inputs.temperature, SEED: c.inputs.seed },
    call: "run(DOCUMENT, PROMPT, STEPS, TEMP, SEED)",
    compare: (res) => {
      const lm = ng.trainLM(ng.lmTokens(c.inputs.doc.text));
      const js = ng.generate(lm, ng.lmTokens(c.inputs.question || ""), c.inputs.steps, c.inputs.temperature, c.inputs.seed).map((g) => g.w);
      return JSON.stringify(res.words) === JSON.stringify(js);
    },
  }),
  challenges: [
    { id: "wrong", text: L("Find settings where a red seam appears: the model glued two passages together.", "Temukan pengaturan yang memunculkan sambungan merah: model menempelkan dua bagian teks."), check: (c) => c.seams?.length > 0 },
    { id: "cold", text: L("Set temperature to 0.2 or lower and get text with no seams at all.", "Atur temperatur 0,2 atau lebih rendah dan dapatkan teks tanpa sambungan sama sekali."), check: (c) => c.inputs.temperature <= 0.2 && c.seams && c.seams.length === 0 },
    { id: "hot", text: L("Set temperature to 1.8 or higher and read what happens.", "Atur temperatur 1,8 atau lebih tinggi dan baca hasilnya."), check: (c) => c.inputs.temperature >= 1.8 && c.gen },
  ],
  quiz: [
    { q: L("What does a language model do at each step of writing?", "Apa yang dilakukan model bahasa pada setiap langkah menulis?"),
      options: [L("Looks up the answer in a database", "Mencari jawaban di database"), L("Predicts a probability for each possible next token and picks one", "Memprediksi peluang setiap token berikutnya lalu memilih satu"), L("Copies the most similar sentence from the internet", "Menyalin kalimat paling mirip dari internet"), L("Translates the question", "Menerjemahkan pertanyaan")],
      answer: 1, why: L("Writing is a loop: predict, pick, append, repeat.", "Menulis adalah putaran: prediksi, pilih, tambahkan, ulangi.") },
    { q: L("Why can a fluent answer still be wrong?", "Mengapa jawaban yang lancar bisa tetap salah?"),
      options: [L("The model chooses likely words, not verified facts", "Model memilih kata yang mungkin, bukan fakta yang terverifikasi"), L("The model is lying on purpose", "Model sengaja berbohong"), L("The temperature was exactly 1", "Temperaturnya tepat 1"), L("Fluent text is always correct", "Teks yang lancar selalu benar")],
      answer: 0, why: L("Nothing in the loop checks facts. Stitching two likely passages gives a likely-sounding but wrong statement.", "Tidak ada langkah yang memeriksa fakta. Menempelkan dua bagian yang mungkin menghasilkan pernyataan yang terdengar benar tetapi salah.") },
    { q: L("What does a low temperature do?", "Apa efek temperatur rendah?"),
      options: [L("Makes the model pick the most likely word almost every time", "Membuat model hampir selalu memilih kata paling mungkin"), L("Makes the model faster", "Membuat model lebih cepat"), L("Makes answers more creative", "Membuat jawaban lebih kreatif"), L("Adds facts from the document", "Menambahkan fakta dari dokumen")],
      answer: 0, why: L("Low temperature sharpens the probabilities. It is safer but repetitive, and it still does not check facts.", "Temperatur rendah mempertajam peluang. Lebih aman tetapi berulang, dan tetap tidak memeriksa fakta.") },
  ],
};
