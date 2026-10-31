// Generic lesson screen. Everything lesson-specific comes from the lesson config.
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.js";
import { useLessonRunner } from "./useLessonRunner.js";
import { Monitor, Prose, Slider, StageBar, Tabs } from "../toolkit/basics.jsx";
import CodeView from "../toolkit/CodeView.jsx";

export default function LessonView({ lesson }) {
  const { t, tr, lang } = useT();
  const T = lesson.text;

  // ----- inputs -----
  const [docOverride, setDocOverride] = useState(null);
  const docId = docOverride || lesson.defaultDoc[lang];
  const docLang = lesson.documents.find((d) => d.id === docId)?.lang || lang;
  const [values, setValues] = useState(() => Object.fromEntries(lesson.controls.map((c) => [c.id, c.default])));
  const [draft, setDraft] = useState(lesson.defaultQuestion[docLang]);
  const [question, setQuestion] = useState(lesson.defaultQuestion[docLang]);

  // When the document language changes, switch to that language's example question.
  useEffect(() => {
    setDraft(lesson.defaultQuestion[docLang]);
    setQuestion(lesson.defaultQuestion[docLang]);
  }, [docLang, lesson]);

  const inputs = useMemo(() => ({ ...values, question, docId }), [values, question, docId]);
  const runner = useLessonRunner(lesson, inputs);
  const { ctx } = runner;

  const setValue = (id, v) => setValues((old) => {
    const next = { ...old, [id]: v };
    for (const c of lesson.controls) if (c.maxFrom) next[c.id] = Math.min(next[c.id], c.maxFrom(next));
    return next;
  });

  // ----- UI state -----
  const [rightTab, setRightTab] = useState("overview");
  const [benchTab, setBenchTab] = useState("data");
  const [focus, setFocus] = useState(null);
  const [hover, setHover] = useState(null);

  const ask = (q) => {
    const text = (q ?? draft).trim() || "…";
    setDraft(text);
    setQuestion(text);
    runner.restart(`"${text}"`);
  };
  const focusStage = (id) => { setFocus(id); setBenchTab("code"); };
  const codeActive = runner.current || focus;

  return (
    <>
      <section className="col">
        <StageBar stages={lesson.stages} runner={runner} focus={focus} onFocus={focusStage} />
        <lesson.Board ctx={ctx} runner={runner} hover={hover} setHover={setHover} tr={tr} />
        <div className="card">
          <Tabs className="wtabs" tabClass="wtab" active={benchTab} onChange={setBenchTab}
            tabs={[{ id: "data", label: t("data") }, { id: "code", label: `${t("code")} (Python)` }]} />
          {benchTab === "data"
            ? <lesson.DataPanel ctx={ctx} runner={runner} hover={hover} setHover={setHover} />
            : <CodeView files={lesson.code} stageOrder={lesson.stages.map((s) => s.id)}
                active={codeActive} doneUpTo={runner.phase} variables={lesson.variables(ctx)}
                python={lesson.python(ctx)} />}
        </div>
      </section>

      <aside className="col">
        <div className="card">
          <Tabs active={rightTab} onChange={setRightTab}
            tabs={["overview", "pipeline", "examples", "specs"].map((id) => ({ id, label: tr(T.ui.tabs[id]) }))} />
          <div className="pane" role="tabpanel">
            {rightTab === "overview" && <Prose blocks={tr(T.overview)} />}
            {rightTab === "pipeline" && (
              <>
                <p>{tr(T.ui.pipelineIntro)}</p>
                {lesson.stages.map((s, i) => (
                  <div key={s.id} className={`scard${runner.current === s.id ? " on" : ""}`}
                    role="button" tabIndex={0} onClick={() => focusStage(s.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && focusStage(s.id)}>
                    <h4><span className="num">0{i + 1}</span>{tr(s.label)}</h4>
                    <p>{tr(s.desc)}</p>
                    <div className="live">{i < runner.phase ? s.live(ctx) : t("stageWaiting")}</div>
                  </div>
                ))}
              </>
            )}
            {rightTab === "examples" && (
              <>
                <h3>{tr(T.ui.askHandbook)}</h3>
                {lesson.examples[docLang].map((q) => (
                  <button key={q} className="qbtn" onClick={() => ask(q)}>{q}</button>
                ))}
                <Prose blocks={tr(T.experiments)} />
              </>
            )}
            {rightTab === "specs" && <Prose blocks={tr(T.specs)} />}
          </div>
        </div>

        <div className="card try">
          <div className="card-h"><h2>{t("tryIt")}</h2></div>
          <div className="card-b">
            <div>
              <label className="lbl" htmlFor="docsel">{t("document")}</label>
              <select id="docsel" className="docsel" value={docId} onChange={(e) => setDocOverride(e.target.value)}>
                {lesson.documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="q">{t("yourQuestion")}</label>
              <form className="qrow" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                <input id="q" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn primary" type="submit">▶ {t("run")}</button>
              </form>
            </div>
            <div className="sliders">
              {lesson.controls.map((c) => (
                <Slider key={c.id} c={{ ...c, max: c.maxFrom ? c.maxFrom(values) : c.max }}
                  value={values[c.id]} onChange={setValue} />
              ))}
            </div>
          </div>
        </div>

        <Monitor logs={runner.logs} onClear={runner.clearLogs} />
      </aside>
    </>
  );
}
