// Header button + panel to connect an optional OpenAI-compatible LLM endpoint.
import { useState } from "react";
import { useT } from "../i18n.js";
import { chat, saveLLM, useLLM, llmReady, enableLabModel, PRESETS } from "../rag/llm.js";

const G = (en, id) => ({ en, id });

/** Step-by-step Ollama setup, with this site's own address filled in. */
function OllamaGuide() {
  const { tr } = useT();
  const origin = typeof location !== "undefined" ? location.origin : "https://rag-visual-lab.pages.dev";
  const Code = ({ children }) => <code className="mono" style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--panel-2, rgba(0,0,0,.05))", padding: "4px 6px", borderRadius: 4, margin: "4px 0" }}>{children}</code>;
  return (
    <details style={{ fontSize: 13 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{tr(G("Ollama setup, step by step", "Pengaturan Ollama, langkah demi langkah"))}</summary>
      <ol style={{ paddingLeft: 18, margin: "8px 0 0", display: "grid", gap: 8 }}>
        <li>{tr(G("Install Ollama from ollama.com and download a model (any chat model works; this one is small):", "Pasang Ollama dari ollama.com dan unduh sebuah model (model chat apa pun bisa; yang ini kecil):"))}<Code>ollama pull llama3.2</Code></li>
        <li>{tr(G("Allow only this lab's address to call Ollama (not \"*\", which lets every website use it):", "Izinkan hanya alamat lab ini memanggil Ollama (bukan \"*\", yang membuat semua situs bisa memakainya):"))}
          <div className="note" style={{ margin: "4px 0 0" }}>Windows (PowerShell)</div><Code>{`setx OLLAMA_ORIGINS "${origin}"`}</Code>
          <div className="note" style={{ margin: 0 }}>macOS</div><Code>{`launchctl setenv OLLAMA_ORIGINS "${origin}"`}</Code>
          <div className="note" style={{ margin: 0 }}>Linux (systemd)</div><Code>{`sudo systemctl edit ollama   # add: [Service]  Environment="OLLAMA_ORIGINS=${origin}"`}</Code>
          {tr(G("Then quit Ollama completely (Windows: right-click the tray icon → Quit) and start it again, so it reads the new setting.", "Lalu tutup Ollama sepenuhnya (Windows: klik kanan ikon di tray → Quit) dan jalankan lagi, agar pengaturan baru terbaca."))}</li>
        <li>{tr(G("If the old setting is still used, or port 11434 is busy, start a second server on port 11435 instead (PowerShell):", "Jika pengaturan lama masih terpakai, atau port 11434 sibuk, jalankan server kedua di port 11435 (PowerShell):"))}
          <Code>{`$env:OLLAMA_ORIGINS="${origin}"; $env:OLLAMA_HOST="127.0.0.1:11435"; ollama serve`}</Code>
          {tr(G("Keep that window open, use Base URL http://localhost:11435/v1, and check its models with:", "Biarkan jendela itu terbuka, pakai Base URL http://localhost:11435/v1, dan cek modelnya dengan:"))}
          <Code>{`$env:OLLAMA_HOST="127.0.0.1:11435"; ollama list`}</Code></li>
        <li>{tr(G("Chrome asks whether this site may access devices on your local network: choose Allow. If you blocked it, click the icon left of the address bar → Site settings → Local network access → Allow, then reload.", "Chrome menanyakan apakah situs ini boleh mengakses perangkat di jaringan lokal Anda: pilih Izinkan. Jika terlanjur diblokir, klik ikon di kiri bilah alamat → Setelan situs → Akses jaringan lokal → Izinkan, lalu muat ulang."))}</li>
        <li>{tr(G("Type the model name exactly as ollama list shows it, then press Test connection. A first answer can take a while while the model loads.", "Ketik nama model persis seperti yang ditampilkan ollama list, lalu tekan Uji koneksi. Jawaban pertama bisa lama karena model sedang dimuat."))}</li>
      </ol>
    </details>
  );
}

const label = (s, t, tr) => (!llmReady(s) ? t("llmOff") : s.provider === "lab" ? tr(G("lab model", "model lab")) : s.model);

export default function LLMSettings() {
  const { t, tr } = useT();
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
        LLM: <b style={{ color: llmReady(s) ? "var(--good)" : "var(--muted)" }}>{label(s, t, tr)}</b>
      </button>
      {open && (
        <div className="card" role="dialog" aria-label={t("llmTitle")} style={{ position: "absolute", right: 16, top: 56, width: "min(420px, calc(100vw - 32px))", maxHeight: "calc(100vh - 72px)", overflow: "auto", zIndex: 20, boxShadow: "0 8px 30px rgba(0,0,0,.15)" }}>
          <div className="card-h"><h2>{t("llmTitle")}</h2><button className="btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)}>✕</button></div>
          <form className="card-b" style={{ display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); saveLLM(draft); setOpen(false); }}>
            <p className="note" style={{ margin: 0 }}>{tr(G("The lessons work without an LLM. Turn one on to see a real model answer the same prompt.", "Pelajaran berjalan tanpa LLM. Aktifkan untuk melihat model sungguhan menjawab prompt yang sama."))}</p>
            <label className="opt" style={{ padding: 0 }}><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> {tr(G("Use an LLM for answers", "Gunakan LLM untuk jawaban"))}</label>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
              <legend className="lbl" style={{ padding: 0 }}>{tr(G("Which model?", "Model yang mana?"))}</legend>
              {[["lab", G("The lab's model (free, nothing to install)", "Model lab (gratis, tanpa instalasi)")], ["own", G("A hosted service with my own API key", "Layanan daring dengan API key saya sendiri")], ["ollama", G("Ollama on my own computer", "Ollama di komputer saya sendiri")]].map(([p, lab]) =>
                <label key={p} className="opt" style={{ padding: 0 }}><input type="radio" name="llm-provider" checked={draft.provider === p} onChange={() => setDraft({ ...PRESETS[p], enabled: draft.enabled, ...(p === draft.provider ? draft : {}), provider: p })} /> {tr(lab)}</label>)}
            </fieldset>
            {draft.provider === "lab" && <p className="note" style={{ margin: 0 }}>{tr(G("Runs on the lab's server (Cloudflare Workers AI, an open Llama model). Each person gets a number of answers per day, and the whole class shares a daily allowance. Your prompt, including retrieved text from your document, is sent to the server to be answered; it is not stored.", "Berjalan di server lab (Cloudflare Workers AI, model Llama terbuka). Setiap orang mendapat sejumlah jawaban per hari, dan seluruh kelas berbagi jatah harian. Prompt Anda, termasuk teks hasil retrieval dari dokumen Anda, dikirim ke server untuk dijawab; tidak disimpan."))}</p>}
            {draft.provider !== "lab" && <>
              <label className="lbl" htmlFor="llm-url">{t("llmUrl")}</label>
              <input id="llm-url" className="docsel" value={draft.baseUrl} placeholder="https://…/v1" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
              <label className="lbl" htmlFor="llm-model">{t("llmModel")}</label>
              <input id="llm-model" className="docsel" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
              <label className="lbl" htmlFor="llm-key">{t("llmKey")}</label>
              <input id="llm-key" className="docsel" type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
            </>}
            {draft.provider === "own" && <p className="note" style={{ margin: 0 }}>{tr(G("Services with a free tier, such as Groq, OpenRouter or Google AI Studio, give you a key and an OpenAI-compatible base URL; copy both, and a model name, from their documentation. Your key stays in this browser, and requests go straight from your browser to that service.", "Layanan dengan paket gratis, seperti Groq, OpenRouter, atau Google AI Studio, memberi Anda key dan base URL yang kompatibel dengan OpenAI; salin keduanya, beserta nama model, dari dokumentasinya. Key Anda tetap di browser ini, dan permintaan dikirim langsung dari browser Anda ke layanan itu."))}</p>}
            {draft.provider === "ollama" && <><p className="note" style={{ margin: 0 }}>{t("llmOllama")}</p><OllamaGuide /></>}
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

/** One-click start for lessons that use an LLM. */
export function LabModelButton({ children }) {
  const { tr } = useT();
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn primary" onClick={enableLabModel}>{tr(G("Use the lab's free model", "Pakai model gratis dari lab"))}</button>
      <span className="note" style={{ margin: 0 }}>{children || tr(G("No install, no key. Or pick another model with the LLM button in the header.", "Tanpa instalasi, tanpa key. Atau pilih model lain dengan tombol LLM di header."))}</span>
    </span>
  );
}

/** Small box showing a real LLM answer under the simulated one (or a one-click start when no LLM is on). */
export function LLMAnswerBox({ st }) {
  const { t, tr } = useT();
  const s = useLLM();
  if (st.status === "off") return llmReady(s) ? null : (
    <div style={{ marginTop: 10 }}><div className="note" style={{ marginTop: 0 }}>{tr(G("See how a real LLM answers this same prompt:", "Lihat bagaimana LLM sungguhan menjawab prompt yang sama:"))}</div><LabModelButton /></div>
  );
  return (
    <div style={{ marginTop: 10 }}>
      <div className="note" style={{ marginTop: 0 }}>{t("llmAnswer")}</div>
      <div className={`answer${st.status === "error" ? " none" : ""}`}>
        {st.status === "loading" ? "…" : st.status === "error" ? "✗ " + st.error : st.text}
      </div>
    </div>
  );
}
