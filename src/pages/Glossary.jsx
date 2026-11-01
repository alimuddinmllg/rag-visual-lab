// Glossary page: every term with its definition and the lesson that teaches it. #glossary or #glossary/<term id>.
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.js";
import { CURRICULUM, lessonHash } from "../engine/registry.js";
import { GLOSSARY } from "../content/glossary.js";

const L = (en, id) => ({ en, id });

export default function Glossary({ focus }) {
  const { tr, lang } = useT();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...GLOSSARY].sort((a, b) => tr(a.term).localeCompare(tr(b.term), lang))
      .filter((g) => !s || (tr(g.term) + " " + tr(g.def) + " " + g.term.en).toLowerCase().includes(s));
  }, [q, lang, tr]);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById("g-" + focus);
    if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
  }, [focus]);

  return (
    <section className="card glossary" style={{ gridColumn: "span 2" }} aria-labelledby="gh">
      <div className="card-h"><h2 id="gh">{tr(L("Glossary", "Glosarium"))}</h2><span className="sub">{GLOSSARY.length} {tr(L("terms", "istilah"))}</span></div>
      <div className="plain" style={{ display: "grid", gap: 12 }}>
        <label className="lbl" htmlFor="gq">{tr(L("Search the glossary", "Cari di glosarium"))}</label>
        <input id="gq" className="docsel" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(L("e.g. chunk, BM25, recall", "mis. chunk, BM25, recall"))} />
        <dl className="glist">
          {list.map((g) => {
            const meta = CURRICULUM.find((l) => l.n === g.lesson);
            return (
              <div key={g.id} id={"g-" + g.id} tabIndex={-1} className={focus === g.id ? "gitem hl" : "gitem"}>
                <dt>{tr(g.term)}</dt>
                <dd>{tr(g.def)} <a href={"#" + lessonHash(g.lesson)}>{tr(L("Lesson", "Pelajaran"))} {g.lesson}: {tr(meta.title)} →</a></dd>
              </div>
            );
          })}
          {!list.length && <p className="note">{tr(L("No term matches.", "Tidak ada istilah yang cocok."))}</p>}
        </dl>
      </div>
    </section>
  );
}
