// Header button + panel to connect an optional OpenAI-compatible LLM endpoint.
import { useState } from "react";
import { useT } from "../i18n.js";
import { chat, saveLLM, useLLM, llmReady } from "../rag/llm.js";

export default function LLMSettings() {
  const { t } = useT();
  const s = useLLM();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(s);
  const [test, setTest] = useState(null);
  const run = async () => {
    saveLLM(draft); setTest({ busy: true });
    try { const r = await chat([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 5 }); setTest({ ok: true, text: r.trim() }); }
    catch (e) { setTest({ ok: false, text: e.message }); }
  };
  return (
    <>
      <button className="btn" onClick={() => { setDraft(s); setOpen(!open); }} aria-expanded={open}>
        LLM: <b style={{ color: llmReady(s) ? "var(--good)" : "var(--muted)" }}>{llmReady(s) ? s.model : t("llmOff")}</b>
      </button>
      {open && (
        <div className="card" role="dialog" aria-label={t("llmTitle")} style={{ position: "absolute", right: 16, top: 56, width: 380, zIndex: 20, boxShadow: "0 8px 30px rgba(0,0,0,.15)" }}>
          <div className="card-h"><h2>{t("llmTitle")}</h2><button className="btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)}>✕</button></div>
          <form className="card-b" style={{ display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); saveLLM(draft); setOpen(false); }}>
            <p className="note" style={{ margin: 0 }}>{t("llmHelp")}</p>
            <label className="opt" style={{ padding: 0 }}><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> {t("llmEnable")}</label>
            <label className="lbl" htmlFor="llm-url">{t("llmUrl")}</label>
            <input id="llm-url" className="docsel" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
            <label className="lbl" htmlFor="llm-model">{t("llmModel")}</label>
            <input id="llm-model" className="docsel" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
            <label className="lbl" htmlFor="llm-key">{t("llmKey")}</label>
            <input id="llm-key" className="docsel" type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
            <p className="note" style={{ margin: 0 }}>{t("llmOllama")}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={run}>{t("llmTest")}</button>
              <button type="submit" className="btn primary">{t("llmSave")}</button>
            </div>
            {test && <p className={`note${test.ok === false ? " bad" : ""}`} style={{ margin: 0 }}>{test.busy ? "…" : (test.ok ? "✓ " : "✗ ") + test.text}</p>}
          </form>
        </div>
      )}
    </>
  );
}

/** Small box showing a real LLM answer under the simulated one. */
export function LLMAnswerBox({ st }) {
  const { t } = useT();
  if (st.status === "off") return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="note" style={{ marginTop: 0 }}>{t("llmAnswer")}</div>
      <div className={`answer${st.status === "error" ? " none" : ""}`}>
        {st.status === "loading" ? "…" : st.status === "error" ? "✗ " + st.error : st.text}
      </div>
    </div>
  );
}
