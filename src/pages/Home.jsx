// Landing page (#home, and the default for first-time visitors).
import { useT } from "../i18n.js";
import { CURRICULUM, LEVELS, lessonHash } from "../engine/registry.js";
import { LESSONS } from "../lessons/index.js";
import { useProgress, isComplete } from "../engine/progress.js";

const L = (en, id) => ({ en, id });
const pad2 = (n) => String(n).padStart(2, "0");

const PROMISES = [
  [L("See it", "Lihat"), L("Every step of RAG drawn and animated: chunks, vectors, scores, the prompt.", "Setiap langkah RAG digambar dan dianimasikan: potongan, vektor, skor, prompt.")],
  [L("Change it", "Ubah"), L("Sliders and your own questions re-run the pipeline instantly.", "Slider dan pertanyaan Anda sendiri menjalankan ulang pipeline seketika.")],
  [L("Read the code", "Baca kodenya"), L("The real Python behind each visual, highlighted as it runs, runnable in your browser and in Colab.", "Kode Python di balik setiap visual, disorot saat berjalan, bisa dijalankan di browser dan di Colab.")],
  [L("Use your documents", "Pakai dokumen Anda"), L("Upload a PDF, Word file or text, or paste it. It never leaves your browser.", "Unggah PDF, file Word, atau teks, atau tempelkan. Dokumen tidak pernah keluar dari browser Anda.")],
];

export default function Home() {
  const { tr, t } = useT();
  const { progress } = useProgress();
  const built = Object.values(LESSONS);
  const done = built.filter((l) => isComplete(l, progress[l.n]));
  const started = Object.keys(progress).length > 0;
  const next = CURRICULUM.find((m) => LESSONS[m.n] && !isComplete(LESSONS[m.n], progress[m.n]));
  return (
    <section className="card home" style={{ gridColumn: "span 2" }} aria-labelledby="hh">
      <div className="plain" style={{ display: "grid", gap: 18 }}>
        <div>
          <h2 id="hh" className="hero">{tr(L("Learn RAG by watching it work", "Belajar RAG dengan melihatnya bekerja"))}</h2>
          <p className="lead">{tr(L("Retrieval-augmented generation, from your first pipeline to production: 32 interactive lessons in English and Bahasa Indonesia. Free, no account, runs in your browser.", "Retrieval-augmented generation, dari pipeline pertama sampai produksi: 32 pelajaran interaktif dalam bahasa Indonesia dan Inggris. Gratis, tanpa akun, berjalan di browser Anda."))}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {started && next
              ? <a className="btn primary" href={"#" + lessonHash(next.n)}>{tr(L("Continue", "Lanjutkan"))}: {pad2(next.n)} {tr(next.title)} →</a>
              : <a className="btn primary" href={"#" + lessonHash(1)}>{tr(L("Start lesson 1", "Mulai pelajaran 1"))} →</a>}
            <a className="btn" href="#glossary">{t("glossary")}</a>
          </div>
          {started && <p className="note">{tr(L(`${done.length} of ${built.length} lessons complete in this browser.`, `${done.length} dari ${built.length} pelajaran selesai di browser ini.`))}</p>}
        </div>
        <ul className="promises">
          {PROMISES.map(([h, p]) => <li key={h.en}><b>{tr(h)}</b><span>{tr(p)}</span></li>)}
        </ul>
        <div>
          <h3 className="ph3">{tr(L("Five levels, beginner to professional", "Lima level, dari pemula sampai profesional"))}</h3>
          <ol className="levelcards">
            {LEVELS.map((lv) => {
              const ls = CURRICULUM.filter((l) => l.level === lv.n), b = ls.filter((l) => LESSONS[l.n]).length;
              const d = ls.filter((l) => LESSONS[l.n] && isComplete(LESSONS[l.n], progress[l.n])).length;
              return (
                <li key={lv.n}>
                  <a href={`#level-${lv.n}`}>
                    <span className="lvn">{t("level")} {lv.n}</span>
                    <b>{tr(lv.name)}</b>
                    <span className="note" style={{ margin: 0 }}>{b ? `${ls.length} ${tr(L("lessons", "pelajaran"))}${d ? ` · ${d} ✓` : ""}` : tr(L("coming soon", "segera"))}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="note" style={{ margin: 0 }}>{tr(L("Made by NalarNusa. Your documents, progress and settings stay in this browser. Optional features (a real LLM, feedback, the study) send data only when you use them.", "Dibuat oleh NalarNusa. Dokumen, kemajuan, dan pengaturan Anda tetap di browser ini. Fitur opsional (LLM sungguhan, masukan, penelitian) hanya mengirim data saat Anda memakainya."))}</p>
      </div>
    </section>
  );
}
