// Chunk list and answer/prompt panels, reusable across retrieval lessons.
import { useEffect, useRef } from "react";
import { useT } from "../i18n.js";
import { SECTION_COLORS } from "./DocumentSpace.jsx";

export function ChunkList({ chunks, sections, scores, ranks, retrievedSet, hover, onHover, anim, title }) {
  const { tr } = useT();
  const box = useRef(null);
  useEffect(() => {
    if (anim !== "retrieve" || !box.current) return;
    const el = box.current.querySelector(".chunk.ret");
    if (el) box.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }, [anim, ranks]);
  useEffect(() => {
    if (hover == null || !box.current) return;
    const el = box.current.querySelector(`[data-i="${hover}"]`);
    if (el) {
      const b = box.current;
      if (el.offsetTop < b.scrollTop || el.offsetTop > b.scrollTop + b.clientHeight - 40) b.scrollTo({ top: el.offsetTop - 8 });
    }
  }, [hover]);
  return (
    <div>
      <div className="panel-h">{tr(title)}<span className="sub">{chunks ? chunks.length : 0}</span></div>
      <div className="chunks" ref={box}>
        {(chunks || []).map((c, i) => {
          const r = ranks?.get(i);
          const ret = retrievedSet?.has(i);
          const sec = c.sec2 != null
            ? <span className="mixed">{sections[c.sec]} + {sections[c.sec2]}</span> : <span>{sections[c.sec]}</span>;
          return (
            <div key={i} data-i={i} className={`chunk${ret ? " ret" : ""}${hover === i ? " hl" : ""}`}
              style={{ "--c": SECTION_COLORS[c.sec % SECTION_COLORS.length] }}
              onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)}>
              <div className="meta">
                {ret && r != null && <span className="badge">{r + 1}</span>}
                <span>#{String(i + 1).padStart(2, "0")}</span>{sec}<span>{c.words}w</span>
                {scores && <span className="sc">{scores[i].toFixed(2)}</span>}
              </div>
              {c.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnswerPanel({ answer, prompt, promptTokens, usedCount, text }) {
  const { tr } = useT();
  return (
    <div>
      <div className="panel-h">{tr(text.title)}<span className="sub">{tr(text.sub)}</span></div>
      <div className="card-b">
        {!answer
          ? <div className="answer none">{tr(text.waiting)}</div>
          : <div className={`answer${answer.grounded ? "" : " none"}`}>
              {answer.grounded
                ? answer.parts.map((p, i) => <span key={i}>{p.text}<sup>[{p.cite}]</sup>{" "}</span>)
                : answer.text}
            </div>}
        <p className="note">{tr(text.note)}</p>
        <details className="prompt">
          <summary>{tr(text.prompt)} <span className="sub">{prompt ? `${usedCount} · ≈${promptTokens} tokens` : ""}</span></summary>
          <pre>{prompt || "…"}</pre>
        </details>
      </div>
    </div>
  );
}
