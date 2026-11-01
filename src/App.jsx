import { useEffect, useMemo, useState } from "react";
import { LangContext, useT } from "./i18n.js";
import { CURRICULUM, LEVELS, lessonHash } from "./engine/registry.js";
import LevelPage from "./pages/LevelPage.jsx";
import Glossary from "./pages/Glossary.jsx";
import Home from "./pages/Home.jsx";
import Pilot from "./pages/Pilot.jsx";
import Privacy from "./pages/Privacy.jsx";
import Feedback from "./toolkit/Feedback.jsx";
import { LESSONS } from "./lessons/index.js";
import LessonView from "./engine/LessonView.jsx";
import { LessonList } from "./toolkit/basics.jsx";
import { DocsProvider } from "./documents/store.jsx";
import LLMSettings from "./toolkit/LLMSettings.jsx";
import { useProgress, isComplete } from "./engine/progress.js";

// Routes: #home (default), #lesson-NN, #level-N, #glossary, #glossary/<term id>, #pilot, #pilot/<pre|post|withdraw|admin>
const readHash = () => {
  const h = location.hash;
  if (!h || h === "#" || h === "#home") return { kind: "home" };
  if (h === "#privacy") return { kind: "privacy" };
  const p = h.match(/^#pilot(?:\/(pre|post|withdraw|admin))?$/);
  if (p) return { kind: "pilot", sub: p[1] || null };
  const lv = h.match(/^#level-(\d)$/);
  if (lv && LEVELS.some((l) => l.n === +lv[1])) return { kind: "level", n: +lv[1] };
  const g = h.match(/^#glossary(?:\/([a-z0-9-]+))?$/);
  if (g) return { kind: "glossary", focus: g[1] || null };
  const m = h.match(/^#lesson-(\d{1,2})$/);
  if (!m || !CURRICULUM.some((l) => l.n === +m[1])) return { kind: "home" };
  return { kind: "lesson", n: +m[1] };
};
const initialLang = () => {
  try { const s = localStorage.getItem("lab-lang"); if (s === "en" || s === "id") return s; } catch { /* storage blocked */ }
  return (navigator.language || "").toLowerCase().startsWith("id") ? "id" : "en";
};

function Shell({ route, setLang }) {
  const { t, tr, lang } = useT();
  const n = route.kind === "lesson" ? route.n : null;
  const meta = CURRICULUM.find((l) => l.n === n);
  const lesson = LESSONS[n];
  const builtSet = useMemo(() => new Set(Object.keys(LESSONS).map(Number)), []);
  const { progress } = useProgress();
  const doneSet = new Set(Object.values(LESSONS).filter((l) => isComplete(l, progress[l.n])).map((l) => l.n));
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return (
    <>
      <header className="top">
        <div className="brand"><h1><a href="#home" style={{ color: "inherit", textDecoration: "none" }}>{t("brand")}</a></h1><span className="tag">{t("tagline")}</span><span className="phase">{t("phaseLabel")}</span></div>
        <div className="right">
          <span className="crumb">{meta ? <>{t("level")} {meta.level} › <b>{n}. {tr(meta.title)}</b></> : route.kind === "level" ? <b>{t("level")} {route.n}</b> : route.kind === "glossary" ? <b>{lang === "id" ? "Glosarium" : "Glossary"}</b> : route.kind === "pilot" ? <b>{lang === "id" ? "Penelitian" : "Study"}</b> : route.kind === "privacy" ? <b>{lang === "id" ? "Privasi" : "Privacy"}</b> : null}</span>
          <Feedback page={route.kind === "lesson" ? `lesson-${n}` : route.kind === "level" ? `level-${route.n}` : route.kind} lesson={n} />
          <LLMSettings />
          <div className="lang" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "id"} onClick={() => setLang("id")}>ID</button>
          </div>
        </div>
      </header>
      <main className="grid">
        <LessonList current={n} currentLevel={route.kind === "level" ? route.n : null} builtSet={builtSet} doneSet={doneSet} />
        {route.kind === "home" ? <Home /> : route.kind === "privacy" ? <Privacy /> : route.kind === "pilot" ? <Pilot sub={route.sub} /> : route.kind === "level" ? <LevelPage level={route.n} /> : route.kind === "glossary" ? <Glossary focus={route.focus} /> : lesson ? <LessonView key={n} lesson={lesson} /> : (
          <section className="card soonpage" style={{ gridColumn: "span 2" }}>
            <span className="phase" style={{ justifySelf: "start" }}>{t("level")} {meta.level} · {String(n).padStart(2, "0")}</span>
            <h2>{tr(meta.title)}</h2>
            <p><b>{t("comingSoonTitle")}.</b> {t("comingSoonBody")}</p>
            <a className="btn primary" style={{ justifySelf: "start", textDecoration: "none" }} href={"#" + lessonHash(1)}>{t("openLesson6")} →</a>
          </section>
        )}
      </main>
      <footer><a href="#privacy">{lang === "id" ? "Privasi" : "Privacy"}</a> · <a href="#pilot">{lang === "id" ? "Penelitian (untuk kelas yang diundang)" : "Study (for invited classes)"}</a> · NalarNusa · {lang === "id" ? "Buku panduan NusaBot Robotics Lab adalah teks fiktif untuk latihan. Dokumen yang Anda unggah tetap di browser ini." : "The NusaBot Robotics Lab handbook is fictional sample text. Documents you upload stay in this browser."}</footer>
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState(readHash);
  const [lang, setLangState] = useState(initialLang);
  useEffect(() => {
    const on = () => { setRoute(readHash()); if (!/^#glossary\//.test(location.hash)) scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const setLang = (l) => { setLangState(l); try { localStorage.setItem("lab-lang", l); } catch { /* ignore */ } };
  return (
    <LangContext.Provider value={lang}>
      <DocsProvider>
        <Shell route={route} setLang={setLang} />
      </DocsProvider>
    </LangContext.Provider>
  );
}
