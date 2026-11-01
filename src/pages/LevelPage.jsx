// Level page: progress through one level's lessons, and a completion message when every lesson is done.
import { useT } from "../i18n.js";
import { CURRICULUM, LEVELS, lessonHash } from "../engine/registry.js";
import { LESSONS } from "../lessons/index.js";
import { useProgress, isComplete, QUIZ_PASS } from "../engine/progress.js";
import { LEVEL_GOALS } from "../content/levels.js";

const L = (en, id) => ({ en, id });
const pad2 = (n) => String(n).padStart(2, "0");

export default function LevelPage({ level }) {
  const { tr, lang } = useT();
  const { progress } = useProgress();
  const lv = LEVELS.find((l) => l.n === level);
  const items = CURRICULUM.filter((l) => l.level === level).map((meta) => {
    const lesson = LESSONS[meta.n], p = progress[meta.n] || {};
    const ch = lesson ? (lesson.challenges || []).filter((c) => p.challenges?.[c.id]).length : 0;
    return { meta, lesson, p, ch, chTotal: lesson ? (lesson.challenges || []).length : 0, done: !!lesson && isComplete(lesson, p) };
  });
  const built = items.filter((x) => x.lesson);
  const done = built.filter((x) => x.done).length;
  const complete = built.length === items.length && done === items.length;
  const next = LEVELS.find((l) => l.n === level + 1);
  const firstOpen = items.find((x) => x.lesson && !x.done);

  return (
    <section className="card levelpage" style={{ gridColumn: "span 2" }} aria-labelledby="lvh">
      <div className="card-h">
        <h2 id="lvh">{tr(L("Level", "Level"))} {level} · {tr(lv.name)}</h2>
        <span className="sub">{done}/{items.length} {tr(L("lessons complete", "pelajaran selesai"))}</span>
      </div>
      <div className="plain" style={{ display: "grid", gap: 14 }}>
        <div className="segbar" style={{ height: 12 }} role="img" aria-label={`${done} / ${items.length}`}>
          <i style={{ width: `${(done / items.length) * 100}%`, background: "var(--good)" }} />
        </div>
        {complete ? (
          <div className="panel good" role="status">
            <h3 style={{ margin: "0 0 6px" }}>✓ {tr(L(`Level ${level} complete`, `Level ${level} selesai`))}</h3>
            <p style={{ margin: 0 }}>{tr(L("Every challenge passed and every quiz at 80% or more. You can now:", "Semua tantangan lulus dan semua kuis 80% atau lebih. Sekarang Anda bisa:"))}</p>
          </div>
        ) : (
          <p style={{ margin: 0 }}>{tr(L("A lesson is complete when all its challenges pass and its quiz reaches 80%. After this level you can:", "Sebuah pelajaran selesai jika semua tantangannya lulus dan kuisnya mencapai 80%. Setelah level ini Anda bisa:"))}</p>
        )}
        <ul style={{ margin: 0, paddingLeft: 20 }}>{LEVEL_GOALS[level][lang].map((g, i) => <li key={i}>{g}</li>)}</ul>
        <div className="tablewrap">
          <table className="lvtable">
            <thead><tr><th>#</th><th>{tr(L("Lesson", "Pelajaran"))}</th><th>{tr(L("Challenges", "Tantangan"))}</th><th>{tr(L("Best quiz", "Kuis terbaik"))}</th><th>{tr(L("Status", "Status"))}</th></tr></thead>
            <tbody>
              {items.map(({ meta, lesson, p, ch, chTotal, done: d }) => (
                <tr key={meta.n}>
                  <td className="mono">{pad2(meta.n)}</td>
                  <td>{lesson ? <a href={"#" + lessonHash(meta.n)}>{tr(meta.title)}</a> : tr(meta.title)}</td>
                  <td>{lesson ? `${ch}/${chTotal}` : "—"}</td>
                  <td>{p.quiz ? `${p.quiz.score}/${p.quiz.total}` : "—"}{p.quiz && p.quiz.score / p.quiz.total < QUIZ_PASS ? " ✗" : ""}</td>
                  <td>{!lesson ? tr(L("coming soon", "segera")) : d ? <b style={{ color: "var(--good)" }}>✓ {tr(L("complete", "selesai"))}</b> : ch || p.quiz ? tr(L("in progress", "berjalan")) : tr(L("not started", "belum mulai"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {firstOpen && <a className="btn primary" href={"#" + lessonHash(firstOpen.meta.n)}>{tr(L("Continue", "Lanjutkan"))}: {pad2(firstOpen.meta.n)} →</a>}
          {complete && next && <a className="btn primary" href={`#level-${next.n}`}>{tr(L("Next level", "Level berikutnya"))}: {tr(next.name)} →</a>}
          <a className="btn" href="#glossary">{tr(L("Glossary", "Glosarium"))}</a>
        </div>
        <p className="note" style={{ margin: 0 }}>{tr(L("Progress is saved in this browser only.", "Kemajuan hanya tersimpan di browser ini."))}</p>
      </div>
    </section>
  );
}
