// Header button: anonymous feedback (1–5 rating and/or a comment) about the current page, sent to /api/feedback.
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.js";

const L = (en, id) => ({ en, id });

export default function Feedback({ page, lesson }) {
  const { tr, lang } = useT();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const [text, setText] = useState("");
  const [st, setSt] = useState(null);
  const box = useRef(null);
  useEffect(() => { if (open) box.current?.querySelector("input,textarea")?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  const send = async () => {
    setSt({ busy: true });
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, lesson: lesson || null, lang, rating, text: text.trim() || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setSt({ ok: true }); setRating(null); setText("");
    } catch (e) { setSt({ ok: false, msg: e.message }); }
  };
  return (
    <>
      <button className="btn" onClick={() => { setOpen(!open); setSt(null); }} aria-expanded={open}>{tr(L("Feedback", "Masukan"))}</button>
      {open && (
        <div ref={box} className="card" role="dialog" aria-label={tr(L("Send feedback", "Kirim masukan"))} style={{ position: "absolute", right: 16, top: 56, width: "min(380px, calc(100vw - 32px))", zIndex: 21, boxShadow: "0 8px 30px rgba(0,0,0,.15)" }}>
          <div className="card-h"><h2>{tr(L("Feedback on this page", "Masukan untuk halaman ini"))}</h2><button className="btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} aria-label={tr(L("Close", "Tutup"))}>✕</button></div>
          <div className="card-b" style={{ display: "grid", gap: 10 }}>
            {st?.ok ? <p role="status" style={{ margin: 0 }}>✓ {tr(L("Thank you! It was sent anonymously.", "Terima kasih! Masukan terkirim secara anonim."))}</p> : <>
              <fieldset className="likert" style={{ margin: 0 }}>
                <legend>{tr(L("How useful is this page?", "Seberapa berguna halaman ini?"))}</legend>
                <div className="lk">
                  {[1, 2, 3, 4, 5].map((v) => <label key={v}><input type="radio" name="fbr" checked={rating === v} onChange={() => setRating(v)} /><span>{v}</span></label>)}
                </div>
                <div className="note" style={{ display: "flex", justifyContent: "space-between", margin: 0 }}><span>{tr(L("not useful", "tidak berguna"))}</span><span>{tr(L("very useful", "sangat berguna"))}</span></div>
              </fieldset>
              <label className="lbl" htmlFor="fbt">{tr(L("What should we fix or add? (optional)", "Apa yang perlu diperbaiki atau ditambah? (opsional)"))}</label>
              <textarea id="fbt" className="docsel" rows={4} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="note" style={{ margin: 0 }}>{tr(L("Anonymous: we store the page, your rating and your comment, nothing else. Please don't include personal details.", "Anonim: kami menyimpan halaman, penilaian, dan komentar Anda, tidak lebih. Mohon jangan menulis data pribadi."))}</p>
              <button className="btn primary" type="button" disabled={(!rating && !text.trim()) || st?.busy} onClick={send}>{st?.busy ? "…" : tr(L("Send", "Kirim"))}</button>
              {st && st.ok === false && <p className="note bad" role="alert" style={{ margin: 0 }}>{tr(L("Could not send: ", "Gagal mengirim: "))}{st.msg}</p>}
            </>}
          </div>
        </div>
      )}
    </>
  );
}
