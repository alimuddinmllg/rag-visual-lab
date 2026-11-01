// Lesson 16: query rewriting, multi-query and HyDE.
import { useMemo } from "react";
import * as R from "../../rag/retrieval.js";
import * as ng from "../../rag/ngram.js";
import { GENERAL_EN, GENERAL_ID } from "../../documents/general.js";
import { chat, llmReady, useLLM } from "../../rag/llm.js";
import { useEffect, useState } from "react";
import { L, pct, getIndex, hitAt, quizQ } from "../shared.js";
import RankLists from "../../toolkit/RankLists.jsx";
import { BarList } from "../../toolkit/charts.jsx";

const lmCache = {};
const tinyLM = (lang) => (lmCache[lang] ||= ng.trainLM(ng.lmTokens(lang === "id" ? GENERAL_ID : GENERAL_EN)));
/** HyDE with the tiny model from lesson 2: write a fake answer, search with it. */
export function hydeTiny(q, lang) {
  const toks = ng.lmTokens(q).filter((t) => /[a-z]/.test(t));
  const seed = toks.slice(-2);
  const words = ng.generate(tinyLM(lang), seed, 14, 0.7, 5).map((g) => g.w);
  return q + " " + ng.detok([...seed, ...words]);
}
const PARA = { "nusabot-en": R.PARAPHRASES.en, "nusabot-id": R.PARAPHRASES.id };

function useHydeLLM(base) {
  const s = useLLM();
  const [st, setSt] = useState({});
  const q = base.question || "";
  useEffect(() => {
    if (!llmReady(s) || !q) { setSt({}); return; }
    let alive = true;
    setSt({ status: "loading" });
    chat([{ role: "user", content: `Write two sentences that could appear in a lab handbook and answer this question. Do not say you don't know; invent plausible details.\nQuestion: ${q}` }], { temperature: 0.3, maxTokens: 80 })
      .then((t) => alive && setSt({ status: "ready", q, text: t })).catch((e) => alive && setSt({ status: "error", error: e.message }));
    return () => { alive = false; };
  }, [q, s.enabled, s.model, s.baseUrl]);
  return useMemo(() => ({ hydeLLM: st }), [st]);
}

const stages = [
  { id: "original", label: L("Original", "Asli"), desc: L("Search with the question exactly as typed.", "Cari dengan pertanyaan persis seperti diketik."),
    run: ({ inputs }) => { const idx = getIndex(inputs.doc, 40, 8); const q = inputs.question || ""; return { idx, chunks: idx.chunks, orig: R.rankBy(R.tfidfScores(idx, q)) }; },
    log: (c) => ({ text: `top #${c.orig[0].i + 1} ${c.orig[0].s.toFixed(2)}` }), live: (c) => `#${c.orig[0].i + 1}` },
  { id: "multi", label: L("Multi-query", "Multi-kueri"), desc: L("Rewrite the question in the document's vocabulary (a synonym table stands in for an LLM), search with every version, fuse with RRF.", "Tulis ulang pertanyaan dengan kosakata dokumen (tabel sinonim menggantikan LLM), cari dengan setiap versi, gabungkan dengan RRF."),
    run: (c) => { const variants = R.rewriteQuery(c.inputs.question || "", c.idx.lang); return { variants, multi: R.rrf(variants.map((v) => R.rankBy(R.tfidfScores(c.idx, v)))) }; },
    log: (c) => ({ text: `${c.variants.length} versions: ${c.variants.slice(1).join(" | ") || "(no synonyms found)"}` }), live: (c) => `${c.variants.length} versions` },
  { id: "hyde", label: L("HyDE", "HyDE"), desc: L("Hypothetical Document Embeddings: let a model write a fake answer, then search with the fake answer. It sounds like the documents, even if its facts are wrong.", "Hypothetical Document Embeddings: biarkan model menulis jawaban palsu, lalu cari dengan jawaban palsu itu. Bunyinya mirip dokumen, walaupun faktanya salah."),
    run: (c) => {
      const llm = c.inputs.hydeLLM;
      const fake = llm?.status === "ready" && llm.q === c.inputs.question ? llm.text : hydeTiny(c.inputs.question || "", c.idx.lang);
      return { fake, fakeFrom: llm?.status === "ready" ? "your LLM" : "tiny model (lesson 2)", hyde: R.rankBy(R.tfidfScores(c.idx, fake)) };
    },
    log: (c) => ({ text: `fake answer (${c.fakeFrom}): "${c.fake.slice(0, 90)}…"` }), live: (c) => c.fakeFrom },
  { id: "evaluate", label: L("Measure", "Ukur"), desc: L("Hit@k on paraphrased questions (people's words, not the document's) for all three.", "Hit@k pada pertanyaan parafrasa (kata orang, bukan kata dokumen) untuk ketiganya."),
    run: (c) => {
      const set = PARA[c.inputs.doc.id];
      if (!set) return { evaluation: null };
      const k = c.inputs.k, s = { o: 0, m: 0, h: 0 };
      for (const [q, e] of set) {
        const rel = R.relevantFor(c.idx.chunks, e);
        s.o += hitAt(R.rankBy(R.tfidfScores(c.idx, q)), rel, k);
        s.m += hitAt(R.rrf(R.rewriteQuery(q, c.idx.lang).map((v) => R.rankBy(R.tfidfScores(c.idx, v)))), rel, k);
        s.h += hitAt(R.rankBy(R.tfidfScores(c.idx, hydeTiny(q, c.idx.lang))), rel, k);
      }
      return { evaluation: { n: set.length, o: s.o / set.length, m: s.m / set.length, h: s.h / set.length } };
    },
    log: (c) => (c.evaluation ? { text: `hit@${c.inputs.k}: original ${pct(c.evaluation.o)} · multi-query ${pct(c.evaluation.m)} · HyDE ${pct(c.evaluation.h)}` } : { text: "paraphrase set exists for the handbook only" }),
    live: (c) => (c.evaluation ? `${pct(c.evaluation.o)} / ${pct(c.evaluation.m)} / ${pct(c.evaluation.h)}` : "—") },
];

function Board({ ctx, hover, setHover, tr }) {
  const ev = ctx.evaluation;
  return (
    <div className="card board">
      <div className="card-h"><h2>{tr(L("One question, three ways to search", "Satu pertanyaan, tiga cara mencari"))}</h2></div>
      {ctx.variants && <div className="plain" style={{ paddingBottom: 0 }}>
        <p className="note" style={{ marginTop: 0 }}>{tr(L("Query versions", "Versi kueri"))}</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>{ctx.variants.map((v, i) => <li key={i} className="mono">{v}</li>)}</ol>
        {ctx.fake && <><p className="note">{tr(L("HyDE fake answer", "Jawaban palsu HyDE"))} ({ctx.fakeFrom})</p><p style={{ margin: 0, fontSize: 13, fontStyle: "italic" }}>{ctx.fake}</p></>}
      </div>}
      {ctx.orig ? <RankLists chunks={ctx.chunks} hover={hover} onHover={setHover} tr={tr} n={5}
        columns={[{ title: tr(L("Original", "Asli")), items: ctx.orig }, ...(ctx.multi ? [{ title: "Multi-query", items: ctx.multi, fmt: (v) => v.toFixed(3) }] : []), ...(ctx.hyde ? [{ title: "HyDE", items: ctx.hyde }] : [])]} /> : <p className="note plain">{tr(L("Press Play.", "Tekan Putar."))}</p>}
      {ev && <div className="plain" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="note" style={{ marginTop: 0 }}>hit@{ctx.inputs.k} · {ev.n} {tr(L("paraphrased questions", "pertanyaan parafrasa"))}</p>
        <BarList fmt={pct} items={[{ label: tr(L("original", "asli")), value: ev.o }, { label: "multi-query", value: ev.m, hl: ev.m > ev.o }, { label: "HyDE", value: ev.h, hl: ev.h > ev.o }]} />
      </div>}
    </div>
  );
}

const text = {
  overview: {
    en: [{ p: "People ask in their own words. Documents use other words. \"What's the **fee** to join?\" never matches \"membership **costs**\" by keywords. Three fixes work **before** retrieval:" },
      { ul: ["**Rewriting**: put the question into the document's vocabulary.", "**Multi-query**: search with several versions and fuse the results (lesson 14).", "**HyDE**: ask a model to write a hypothetical answer and search with that. Its facts may be wrong, but it is written like the documents."] },
      { p: "Here a synonym table and the tiny model from lesson 2 stand in for an LLM. Connect a real LLM (header button) and HyDE uses it instead." }],
    id: [{ p: "Orang bertanya dengan kata-katanya sendiri. Dokumen memakai kata lain. \"Berapa **tarif** jadi anggota?\" tidak akan cocok dengan \"keanggotaan dikenakan **biaya**\" lewat kata kunci. Tiga perbaikan bekerja **sebelum** retrieval:" },
      { ul: ["**Penulisan ulang**: ubah pertanyaan ke kosakata dokumen.", "**Multi-kueri**: cari dengan beberapa versi lalu gabungkan hasilnya (pelajaran 14).", "**HyDE**: minta model menulis jawaban hipotetis lalu cari dengan jawaban itu. Faktanya mungkin salah, tetapi gayanya mirip dokumen."] },
      { p: "Di sini tabel sinonim dan model mini dari pelajaran 2 menggantikan LLM. Hubungkan LLM sungguhan (tombol di header) dan HyDE akan memakainya." }],
  },
  experiments: {
    en: [{ h: "Experiments" }, { exp: ["Words the handbook doesn't use", "Try \"What is the fee to join as a student?\" and \"When do they shut early?\"."] }, { exp: ["Read the fake answer", "HyDE's fake answer is often wrong (another lab's price) yet it retrieves the right chunk, because it uses the right kind of words."] }],
    id: [{ h: "Eksperimen" }, { exp: ["Kata yang tidak dipakai buku panduan", "Coba \"Berapa ongkos daftar anggota mahasiswa?\" dan \"Kapan lab tutup lebih cepat?\"."] }, { exp: ["Baca jawaban palsunya", "Jawaban palsu HyDE sering salah (harga lab lain) tetapi tetap mengambil potongan yang benar, karena memakai jenis kata yang tepat."] }],
  },
  specs: {
    en: [{ dl: [["Synonym table", "Maps everyday words (price, fee, shut, weekend…) to the handbook's words. An LLM does this more broadly."], ["HyDE", "Gao et al., 2022. The fake answer is never shown to the user; it is only a search query."], ["Cost", "Each extra query is another search, and an LLM rewrite adds latency before retrieval even starts."]] }],
    id: [{ dl: [["Tabel sinonim", "Memetakan kata sehari-hari (harga, tarif, tutup, akhir pekan…) ke kata di buku panduan. LLM melakukannya lebih luas."], ["HyDE", "Gao dkk., 2022. Jawaban palsu tidak pernah ditunjukkan ke pengguna; hanya dipakai sebagai kueri pencarian."], ["Biaya", "Setiap kueri tambahan adalah pencarian lagi, dan penulisan ulang oleh LLM menambah waktu sebelum retrieval dimulai."]] }],
  },
};

const pySource = `# NalarNusa RAG Visual Lab · Lesson 16 · Query rewriting, multi-query, HyDE
# @stage original
ranking = search(question)
# @end

# @stage multi
variants = llm(f"Rewrite this question 3 ways using formal handbook wording, one per line:\\n{question}").splitlines()
rankings = [search(v) for v in [question] + variants]
fused = rrf(rankings)                     # lesson 14
# @end

# @stage hyde
fake_answer = llm(f"Write a short passage that answers: {question}")   # facts may be wrong; only used to search
ranking = search(fake_answer)
# @end

# @stage evaluate
# compare hit@k of all three on questions phrased the way your users talk
# @end
`;

export default {
  n: 16, stages, text, Board,
  controls: [{ id: "k", label: L("Evaluate top-k", "Evaluasi top-k"), min: 1, max: 5, step: 1, default: 1 }],
  useExtra: useHydeLLM,
  inputs: { document: true, question: true },
  defaultQuestion: { en: "What is the fee to join as a student?", id: "Berapa ongkos daftar anggota mahasiswa?" },
  examples: { en: ["What is the fee to join as a student?", "When do they shut early?", "Is the lab open at the weekend?", "Where do I charge a battery?"], id: ["Berapa ongkos daftar anggota mahasiswa?", "Kapan lab tutup lebih cepat?", "Apakah lab buka akhir pekan?", "Di mana saya bisa mengisi baterai?"] },
  code: [{ id: "rw", label: L("Rewriting with an LLM", "Penulisan ulang dengan LLM"), source: pySource, runnable: false, filename: "rewrite.py", note: L("Pseudocode: plug in your search() from lesson 6 and any llm() call.", "Pseudokode: pasang search() dari pelajaran 6 dan panggilan llm() apa pun.") }],
  variables: (c) => [["variants", c.variants ? c.variants.length : "—"], ["fake answer", c.fake ? c.fake.slice(0, 80) + "…" : "—"]],
  challenges: [
    { id: "rescue", text: L("Find a question where multi-query gets a different #1 than the original.", "Temukan pertanyaan di mana multi-kueri mendapat #1 yang berbeda dari kueri asli."), check: (c) => c.multi && c.multi[0].i !== c.orig[0].i },
    { id: "measure", text: L("Measure all three on the paraphrased questions.", "Ukur ketiganya pada pertanyaan parafrasa."), check: (c) => !!c.evaluation },
  ],
  quiz: [
    quizQ(L("What does HyDE search with?", "HyDE mencari dengan apa?"), [L("A fake answer written by a model", "Jawaban palsu yang ditulis model"), L("The user's question only", "Hanya pertanyaan pengguna"), L("A random chunk", "Potongan acak"), L("The previous answer", "Jawaban sebelumnya")], 0, L("The fake answer is written in document style, so it lands near real answers.", "Jawaban palsu ditulis dengan gaya dokumen, sehingga mendarat dekat jawaban asli.")),
    quizQ(L("Why fuse the results of several query versions?", "Mengapa hasil beberapa versi kueri digabung?"), [L("A chunk found by several versions is more likely right", "Potongan yang ditemukan beberapa versi lebih mungkin benar"), L("To make the prompt longer", "Agar prompt lebih panjang"), L("To translate the question", "Untuk menerjemahkan pertanyaan"), L("It's required by RRF", "Diharuskan oleh RRF")], 0, L("Agreement between versions is evidence.", "Kesepakatan antar versi adalah bukti.")),
    quizQ(L("What's the main cost of query rewriting with an LLM?", "Apa biaya utama penulisan ulang kueri dengan LLM?"), [L("Extra time and calls before retrieval", "Tambahan waktu dan panggilan sebelum retrieval"), L("Worse accuracy always", "Akurasi selalu memburuk"), L("Bigger chunks", "Potongan lebih besar"), L("Nothing", "Tidak ada")], 0, L("Every rewrite is an LLM call the user waits for.", "Setiap penulisan ulang adalah panggilan LLM yang harus ditunggu pengguna.")),
  ],
};
