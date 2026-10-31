// Small generic pieces shared by every lesson.
import { Fragment, useEffect, useRef } from "react";
import { useT } from "../i18n.js";
import { CURRICULUM, LEVELS, lessonHash, pad2 } from "../engine/registry.js";

// Inline **bold** for lesson text.
export function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>);
}

// Lesson prose as data: [{h}, {p}, {ul:[]}, {ol:[]}, {exp:[title, body]}, {dl:[[term, def]]}]
export function Prose({ blocks }) {
  return blocks.map((b, i) => {
    if (b.h) return <h3 key={i}>{b.h}</h3>;
    if (b.p) return <p key={i}><Inline text={b.p} /></p>;
    if (b.ul) return <ul key={i}>{b.ul.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ul>;
    if (b.ol) return <ol key={i}>{b.ol.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ol>;
    if (b.exp) return <div className="exp" key={i}><b>{b.exp[0]}</b><Inline text={b.exp[1]} /></div>;
    if (b.dl) return <dl className="gloss" key={i}>{b.dl.map(([dt, dd], j) => (
      <Fragment key={j}><dt>{dt}</dt><dd><Inline text={dd} /></dd></Fragment>))}</dl>;
    return null;
  });
}

export function Tabs({ tabs, active, onChange, className = "tabs", tabClass = "tab" }) {
  return (
    <div className={className} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" className={tabClass} aria-selected={active === t.id}
          onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function LessonList({ current, builtSet }) {
  const { t, tr } = useT();
  return (
    <nav className="card lessons" aria-label={t("lessons")}>
      <div className="levels">
        {LEVELS.map((lv) => (
          <div className="lvwrap" key={lv.n}>
            <div className="lv">{t("level")} {lv.n} · {tr(lv.name)}</div>
            <ol>
              {CURRICULUM.filter((l) => l.level === lv.n).map((l) => {
                const built = builtSet.has(l.n);
                return (
                  <li key={l.n}>
                    <a href={"#" + lessonHash(l.n)} className={built ? "built" : ""}
                      aria-current={current === l.n ? "page" : undefined}>
                      <span className="n">{pad2(l.n)}</span>
                      <span>{tr(l.title)}</span>
                      {!built && <span className="soon">{t("soon")}</span>}
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <div className="prog">
        {t("built", builtSet.size, CURRICULUM.length)}
        <div className="bar"><i style={{ width: `${(builtSet.size / CURRICULUM.length) * 100}%` }} /></div>
      </div>
    </nav>
  );
}

export function StageBar({ stages, runner, focus, onFocus }) {
  const { t, tr } = useT();
  const { phase, playing, status, current } = runner;
  return (
    <div className="card stagebar" aria-label="Pipeline">
      {stages.map((s, i) => {
        const cls = current === s.id ? "active" : i < phase ? "done" : "";
        return (
          <Fragment key={s.id}>
            {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
            <button className={`stage ${cls} ${focus === s.id ? "focus" : ""}`} onClick={() => onFocus(s.id)}
              title={tr(s.desc)}>
              <span className="num">{i + 1}</span>{tr(s.label)}
            </button>
          </Fragment>
        );
      })}
      <div className="player">
        {playing
          ? <button className="btn" onClick={runner.pause}>❚❚ {t("pause")}</button>
          : <button className="btn primary" onClick={runner.play}>▶ {t("play")}</button>}
        <button className="btn" onClick={runner.step}>⏭ {t("step")}</button>
        <button className="btn" onClick={runner.reset} disabled={phase === 0 && !playing}>↺ {t("reset")}</button>
        <label className="sr-only" htmlFor="speed" style={{ position: "absolute", left: -9999 }}>{t("speed")}</label>
        <select id="speed" value={runner.speed} onChange={(e) => runner.setSpeed(+e.target.value)} aria-label={t("speed")}>
          <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
        </select>
        <span className={`status ${status}`}>{t(status)}</span>
      </div>
    </div>
  );
}

export function Monitor({ logs, onClear }) {
  const { t } = useT();
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  return (
    <div className="card mon">
      <div className="card-h"><h2>{t("monitor")}</h2>
        <button className="btn" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 12 }} onClick={onClear}>{t("clear")}</button>
      </div>
      <pre ref={ref} aria-live="polite">
        {logs.map((l, i) => l.stage === "header"
          ? <div key={i} className="d">── {l.text} ──</div>
          : <div key={i}><span className="k">{l.stage.padEnd(9)}</span>{l.text}{l.warn && <span className="w"> ← {l.warn}</span>}</div>)}
      </pre>
    </div>
  );
}

export function Slider({ c, value, onChange }) {
  const { tr } = useT();
  return (
    <div className="sl">
      <label htmlFor={"ctl-" + c.id}>{tr(c.label)} <output>{c.format ? c.format(value, tr) : value}</output></label>
      <input type="range" id={"ctl-" + c.id} min={c.min} max={typeof c.max === "function" ? c.max : c.max}
        step={c.step} value={value} onChange={(e) => onChange(c.id, +e.target.value)} />
    </div>
  );
}
