import { useEffect, useMemo, useState } from "react";
import { LangContext, useT } from "./i18n.js";
import { CURRICULUM, lessonHash } from "./engine/registry.js";
import { LESSONS } from "./lessons/index.js";
import LessonView from "./engine/LessonView.jsx";
import { LessonList } from "./toolkit/basics.jsx";

const DEFAULT_LESSON = 6;
const readHash = () => {
  const m = location.hash.match(/^#lesson-(\d{1,2})$/);
  const n = m ? +m[1] : DEFAULT_LESSON;
  return CURRICULUM.some((l) => l.n === n) ? n : DEFAULT_LESSON;
};
const initialLang = () => {
  try { const s = localStorage.getItem("lab-lang"); if (s === "en" || s === "id") return s; } catch { /* storage blocked */ }
  return (navigator.language || "").toLowerCase().startsWith("id") ? "id" : "en";
};

function Shell({ n, setLang }) {
  const { t, tr, lang } = useT();
  const meta = CURRICULUM.find((l) => l.n === n);
  const lesson = LESSONS[n];
  const builtSet = useMemo(() => new Set(Object.keys(LESSONS).map(Number)), []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return (
    <>
      <header className="top">
        <div className="brand"><h1>{t("brand")}</h1><span className="tag">{t("tagline")}</span><span className="phase">{t("phaseLabel")}</span></div>
        <div className="right">
          <span className="crumb">{t("level")} {meta.level} › <b>{n}. {tr(meta.title)}</b></span>
          <div className="lang" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "id"} onClick={() => setLang("id")}>ID</button>
          </div>
        </div>
      </header>
      <main className="grid">
        <LessonList current={n} builtSet={builtSet} />
        {lesson ? <LessonView key={n} lesson={lesson} /> : (
          <section className="card soonpage" style={{ gridColumn: "span 2" }}>
            <span className="phase" style={{ justifySelf: "start" }}>{t("level")} {meta.level} · {String(n).padStart(2, "0")}</span>
            <h2>{tr(meta.title)}</h2>
            <p><b>{t("comingSoonTitle")}.</b> {t("comingSoonBody")}</p>
            <a className="btn primary" style={{ justifySelf: "start", textDecoration: "none" }} href={"#" + lessonHash(6)}>{t("openLesson6")} →</a>
          </section>
        )}
      </main>
      <footer>NalarNusa · {lang === "id" ? "Buku panduan NusaBot Robotics Lab adalah teks fiktif untuk latihan." : "The NusaBot Robotics Lab handbook is fictional sample text."}</footer>
    </>
  );
}

export default function App() {
  const [n, setN] = useState(readHash);
  const [lang, setLangState] = useState(initialLang);
  useEffect(() => {
    const on = () => setN(readHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const setLang = (l) => { setLangState(l); try { localStorage.setItem("lab-lang", l); } catch { /* ignore */ } };
  return (
    <LangContext.Provider value={lang}>
      <Shell n={n} setLang={setLang} />
    </LangContext.Provider>
  );
}
