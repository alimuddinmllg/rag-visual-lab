// Generic lesson screen. Everything lesson-specific comes from the lesson config:
//   inputs: { document?: bool, question?: bool }
//   controls: [{ id, label, min, max, step, default, format?, maxFrom? } | { type: "select", options }]
//   useExtra?(inputs) -> extra inputs (a React hook, e.g. neural vectors)
//   stages, Board, DataPanel?, code, variables?, python?, text, examples?, challenges?, quiz?
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.js";
import { useDocs } from "../documents/store.jsx";
import { useLessonRunner } from "./useLessonRunner.js";
import { Monitor, Prose, Slider, StageBar, Tabs } from "../toolkit/basics.jsx";
import { ChallengePanel, DocPicker, SelectControl } from "../toolkit/LessonParts.jsx";
import CodeView from "../toolkit/CodeView.jsx";

const EMPTY = {};
const NO_EXTRA = () => EMPTY; // useExtra must return a memoised object

export default function LessonView({ lesson }) {
  const { t, tr, lang } = useT();
  const T = lesson.text || {};
  const docs = useDocs();
  const want = lesson.inputs || {};

  // ----- inputs -----
  const [docPick, setDocPick] = useState(null);
  const defaultDoc = (lesson.defaultDoc && lesson.defaultDoc[lang]) || `nusabot-${lang}`;
  const doc = (docPick && docs.get(docPick)) || docs.get(defaultDoc);
  const docLang = want.document ? doc.lang : lang;

  const [values, setValues] = useState(() => ({ ...(lesson.extraValues || {}), ...Object.fromEntries((lesson.controls || []).map((c) => [c.id, c.default])) }));
  const defQ = lesson.defaultQuestion ? lesson.defaultQuestion[docLang] || lesson.defaultQuestion.en : "";
  const [draft, setDraft] = useState(defQ);
  const [question, setQuestion] = useState(defQ);
  useEffect(() => {
    if (doc.user) return;                       // keep the learner's question for their own document
    setDraft(defQ); setQuestion(defQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docLang, doc.user]);

  const base = useMemo(() => ({ ...values, question, doc, lang: docLang, uiLang: lang }), [values, question, doc, docLang, lang]);
  const useExtra = lesson.useExtra || NO_EXTRA;
  const extra = useExtra(base);
  const inputs = useMemo(() => ({ ...base, ...extra }), [base, extra]);
  const runner = useLessonRunner(lesson, inputs);
  const { ctx } = runner;

  const setValue = (id, v) => setValues((old) => {
    const next = { ...old, [id]: v };
    for (const c of lesson.controls || []) if (c.maxFrom) next[c.id] = Math.min(next[c.id], c.maxFrom(next));
    return next;
  });

  // ----- UI state -----
  const tabs = ["overview", "pipeline"];
  if (lesson.examples || T.experiments) tabs.push("examples");
  if (T.specs) tabs.push("specs");
  if (lesson.challenges || lesson.quiz) tabs.push("challenge");
  const [rightTab, setRightTab] = useState("overview");
  const [benchTab, setBenchTab] = useState(lesson.DataPanel ? "data" : "code");
  const [focus, setFocus] = useState(null);
  const [hover, setHover] = useState(null);

  const ask = (q) => {
    const text = (q ?? draft).trim() || "…";
    setDraft(text); setQuestion(text);
    runner.restart(`"${text}"`);
  };
  const focusStage = (id) => { setFocus(id); setBenchTab("code"); };
  const codeActive = runner.current || focus;
  const examples = lesson.examples && !doc.user ? lesson.examples[docLang] || lesson.examples.en : null;
  const boardProps = { ctx, runner, hover, setHover, tr, t, inputs, lang, setValue: (id, v) => setValue(id, v) };

  return (
    <>
      <section className="col">
        <StageBar stages={lesson.stages} runner={runner} focus={focus} onFocus={focusStage} />
        <lesson.Board {...boardProps} />
        <div className="card">
          <Tabs className="wtabs" tabClass="wtab" active={benchTab} onChange={setBenchTab}
            tabs={[...(lesson.DataPanel ? [{ id: "data", label: t("data") }] : []), { id: "code", label: `${t("code")} (Python)` }]} />
          {benchTab === "data" && lesson.DataPanel
            ? <lesson.DataPanel {...boardProps} />
            : <CodeView key={lesson.n} files={lesson.code} stageOrder={lesson.stages.map((s) => s.id)}
                active={codeActive} doneUpTo={runner.phase} variables={lesson.variables ? lesson.variables(ctx) : []}
                python={lesson.python ? lesson.python(ctx) : null} />}
        </div>
      </section>

      <aside className="col">
        <div className="card">
          <Tabs active={rightTab} onChange={setRightTab} tabs={tabs.map((id) => ({ id, label: t("tab_" + id) }))} />
          <div className="pane" role="tabpanel">
            {rightTab === "overview" && <Prose blocks={tr(T.overview)} />}
            {rightTab === "pipeline" && (
              <>
                <p>{t("pipelineIntro")}</p>
                {lesson.stages.map((s, i) => (
                  <div key={s.id} className={`scard${runner.current === s.id ? " on" : ""}`}
                    role="button" tabIndex={0} onClick={() => focusStage(s.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && focusStage(s.id)}>
                    <h4><span className="num">0{i + 1}</span>{tr(s.label)}</h4>
                    <p>{tr(s.desc)}</p>
                    <div className="live">{i < runner.phase && s.live ? s.live(ctx) : t("stageWaiting")}</div>
                  </div>
                ))}
              </>
            )}
            {rightTab === "examples" && (
              <>
                {examples && <h3>{t("examplesHead")}</h3>}
                {examples && examples.map((q) => <button key={q} className="qbtn" onClick={() => ask(q)}>{q}</button>)}
                {T.experiments && <Prose blocks={tr(T.experiments)} />}
              </>
            )}
            {rightTab === "specs" && <Prose blocks={tr(T.specs)} />}
            {rightTab === "challenge" && <ChallengePanel lesson={lesson} ctx={ctx} />}
          </div>
        </div>

        <div className="card try">
          <div className="card-h"><h2>{t("tryIt")}</h2></div>
          <div className="card-b">
            {want.document && <DocPicker value={doc.id} onChange={setDocPick} />}
            {want.question && (
              <div>
                <label className="lbl" htmlFor="q">{lesson.questionLabel ? tr(lesson.questionLabel) : t("yourQuestion")}</label>
                <form className="qrow" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                  <input id="q" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <button className="btn primary" type="submit">▶ {lesson.runLabel ? tr(lesson.runLabel) : t("run")}</button>
                </form>
              </div>
            )}
            {!!lesson.controls?.length && (
              <div className="sliders">
                {lesson.controls.map((c) => c.type === "select"
                  ? <SelectControl key={c.id} c={c} value={values[c.id]} onChange={setValue} />
                  : <Slider key={c.id} c={{ ...c, max: c.maxFrom ? c.maxFrom(values) : c.max }} value={values[c.id]} onChange={setValue} />)}
              </div>
            )}
            {lesson.ControlsExtra && <lesson.ControlsExtra {...boardProps} />}
          </div>
        </div>

        <Monitor logs={runner.logs} onClear={runner.clearLogs} />
      </aside>
    </>
  );
}
