// Shared lesson pieces added in Phase 1: document picker with upload,
// challenge + quiz panel, select control, neural-model status line.
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.js";
import { useDocs } from "../documents/store.jsx";
import { ACCEPT, loadFile, docFromText } from "../documents/loaders.js";
import { useProgress, QUIZ_PASS, isComplete } from "../engine/progress.js";
import { Inline } from "./basics.jsx";

export function DocPicker({ value, onChange }) {
  const { t } = useT();
  const { docs, add, remove, savedOk } = useDocs();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const file = useRef(null);
  const [paste, setPaste] = useState(null);       // { title, text } while the paste box is open
  const current = docs.find((d) => d.id === value);

  const addPasted = () => {
    setMsg(null);
    try {
      const doc = docFromText(paste.title, paste.text);
      add(doc); onChange(doc.id); setPaste(null);
      if (doc.meta.truncated) setMsg({ kind: "warn", text: t("truncated") });
    } catch { setMsg({ kind: "err", text: t("errEmpty") }); }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const doc = await loadFile(f);
      add(doc);
      onChange(doc.id);
      if (doc.meta.truncated) setMsg({ kind: "warn", text: t("truncated") });
    } catch (err) {
      const m = String(err.message);
      setMsg({ kind: "err", text: t(m === "unsupported" ? "errUnsupported" : m === "empty" ? "errEmpty" : "errRead") });
    } finally { setBusy(false); }
  };

  return (
    <div className="docpick">
      <label className="lbl" htmlFor="docsel">{t("document")}</label>
      <div className="qrow">
        <select id="docsel" className="docsel" value={value} onChange={(e) => onChange(e.target.value)}>
          {docs.map((d) => <option key={d.id} value={d.id}>{d.user ? "📄 " : ""}{d.title}</option>)}
        </select>
        {current?.user && <button className="btn" type="button" onClick={() => { remove(current.id); onChange(null); }}>{t("removeDoc")}</button>}
      </div>
      <input ref={file} type="file" accept={ACCEPT} onChange={onFile} hidden id="docfile" aria-label={t("upload")} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn linkish" type="button" onClick={() => file.current?.click()} disabled={busy}>
          {busy ? t("uploading") : "＋ " + t("upload")}
        </button>
        <button className="btn linkish" type="button" aria-expanded={!!paste} onClick={() => setPaste(paste ? null : { title: "", text: "" })}>
          {"＋ " + t("pasteText")}
        </button>
      </div>
      {paste && (
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          <label className="lbl" htmlFor="paste-title">{t("pasteTitle")}</label>
          <input id="paste-title" className="docsel" value={paste.title} placeholder={t("pasteTitlePh")} onChange={(e) => setPaste({ ...paste, title: e.target.value })} />
          <label className="lbl" htmlFor="paste-text">{t("pasteBody")}</label>
          <textarea id="paste-text" className="docsel" rows={7} value={paste.text} placeholder={t("pasteBodyPh")} onChange={(e) => setPaste({ ...paste, text: e.target.value })} style={{ resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn primary" type="button" onClick={addPasted} disabled={paste.text.trim().split(/\s+/).length < 30}>{t("pasteAdd")}</button>
            <button className="btn" type="button" onClick={() => setPaste(null)}>{t("cancel")}</button>
          </div>
        </div>
      )}
      <p className="note">{t("uploadHelp")}</p>
      {msg && <p className={msg.kind === "err" ? "note bad" : "note"}>{msg.text}</p>}
      {!savedOk && <p className="note bad">{t("notSaved")}</p>}
    </div>
  );
}

export function SelectControl({ c, value, onChange }) {
  const { tr } = useT();
  return (
    <div className="sl wide">
      <label htmlFor={"ctl-" + c.id}>{tr(c.label)}</label>
      <select id={"ctl-" + c.id} className="docsel" value={value} onChange={(e) => onChange(c.id, e.target.value)}>
        {c.options.map((o) => <option key={o.value} value={o.value}>{typeof o.label === "string" ? o.label : tr(o.label)}</option>)}
      </select>
    </div>
  );
}

export function NeuralStatus({ neural }) {
  const { t } = useT();
  if (!neural || neural.status === "off" || neural.status === "ready") return null;
  if (neural.status === "error") return <p className="note bad">{t("neuralError")}</p>;
  const d = neural.download;
  const text = d && d.total > 5e6
    ? t("neuralDownload", Math.round(d.loaded / 1e6), Math.round(d.total / 1e6))
    : neural.progress ? t("neuralEmbedding", neural.progress.done, neural.progress.total) : t("neuralLoading");
  return <p className="note busy">⏳ {text} {t("neuralFallback")}</p>;
}

// Options are written with the correct answer first; show them in a fixed shuffled order per question,
// the same for every learner and every visit (so the answer is not always the first option).
export function optionOrder(lesson, q, n) {
  let s = (lesson * 7919 + q * 104729 + 17) % 2147483647;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

export function ChallengePanel({ lesson, ctx }) {
  const { t, tr } = useT();
  const { progress, passChallenge, saveQuiz, reset } = useProgress();
  const p = progress[lesson.n] || {};
  // Challenges check themselves against what is on the board.
  useEffect(() => {
    for (const c of lesson.challenges || []) {
      try { if (!p.challenges?.[c.id] && c.check(ctx)) passChallenge(lesson.n, c.id); } catch { /* stage not run yet */ }
    }
  }, [ctx, lesson, p.challenges, passChallenge]);

  const quiz = lesson.quiz || [];
  const [picks, setPicks] = useState({});
  const [checked, setChecked] = useState(false);
  const score = quiz.reduce((s, q, i) => s + (picks[i] === q.answer ? 1 : 0), 0);
  const passed = checked && score / quiz.length >= QUIZ_PASS;

  return (
    <div>
      {isComplete(lesson, p) && <p className="done-banner">✓ {t("lessonDone")}</p>}
      {!!lesson.challenges?.length && (
        <>
          <h3>{t("challenges")}</h3>
          <p className="note" style={{ marginTop: 0 }}>{t("challengesNote")}</p>
          <ul className="chall">
            {lesson.challenges.map((c) => (
              <li key={c.id} className={p.challenges?.[c.id] ? "ok" : ""}>
                <span aria-hidden="true">{p.challenges?.[c.id] ? "✓" : "○"}</span><span><Inline text={tr(c.text)} /></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!!quiz.length && (
        <>
          <h3>{t("quiz")}</h3>
          {quiz.map((q, i) => (
            <fieldset key={i} className="qz">
              <legend><Inline text={tr(q.q)} /></legend>
              {optionOrder(lesson.n, i, q.options.length).map((j) => {
                const o = q.options[j];
                const state = checked ? (j === q.answer ? "right" : picks[i] === j ? "wrong" : "") : "";
                return (
                  <label key={j} className={`opt ${state}`}>
                    <input type="radio" name={`q${lesson.n}-${i}`} checked={picks[i] === j} disabled={checked}
                      onChange={() => setPicks({ ...picks, [i]: j })} />
                    <Inline text={tr(o)} />
                  </label>
                );
              })}
              {checked && q.why && <p className="why"><Inline text={tr(q.why)} /></p>}
            </fieldset>
          ))}
          {!checked
            ? <button className="btn primary" disabled={Object.keys(picks).length < quiz.length}
                onClick={() => { setChecked(true); saveQuiz(lesson.n, score, quiz.length); }}>{t("check")}</button>
            : <div className="qres">
                <b>{t("quizScore", score, quiz.length)}</b> — <span className={passed ? "ok" : "bad"}>{t(passed ? "quizPass" : "quizFail")}</span>
                <div><button className="btn" onClick={() => { setChecked(false); setPicks({}); }}>{t("tryAgain")}</button></div>
              </div>}
        </>
      )}
      <p style={{ marginTop: 18 }}><button className="btn linkish" onClick={() => reset(lesson.n)}>{t("resetProgress")}</button></p>
    </div>
  );
}
