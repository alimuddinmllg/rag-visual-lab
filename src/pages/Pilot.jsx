// Pilot study pages: #pilot (information + consent + code), #pilot/pre, #pilot/post, #pilot/withdraw, #pilot/admin.
// Answers are sent to /api/pilot (Cloudflare D1) only after consent. Scores are recomputed on the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.js";
import { LESSONS } from "../lessons/index.js";
import { CURRICULUM } from "../engine/registry.js";
import { useProgress, isComplete } from "../engine/progress.js";
import { PILOT } from "../pilot/config.js";
import { VERSION, KNOWLEDGE, CONFIDENCE, AGREE, SUS, susScore, scoreKnowledge } from "../pilot/instrument.js";

const L = (en, id) => ({ en, id });
const KEY = "lab-pilot-v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";           // no 0/O, 1/I
const newCode = () => { const r = crypto.getRandomValues(new Uint8Array(8)); const c = [...r].map((x) => ALPHA[x % ALPHA.length]).join(""); return c.slice(0, 4) + "-" + c.slice(4); };
const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const LEVEL_OF = { 1: L("Foundations", "Dasar"), 2: L("Building blocks", "Komponen dasar"), 3: L("Better retrieval", "Retrieval lebih baik"), 4: L("Evaluation", "Evaluasi") };

// Same option order for one participant every time, different between participants.
function shuffled(n, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

function usePilot() {
  const [s, setS] = useState(load);
  const update = (patch) => setS((old) => { const next = { ...old, ...patch }; save(next); return next; });
  return [s, update, () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } setS({}); }];
}

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export default function Pilot({ sub }) {
  const { tr } = useT();
  return (
    <section className="card pilot" style={{ gridColumn: "span 2" }} aria-labelledby="ph">
      <div className="card-h"><h2 id="ph">{tr(L("RAG Visual Lab study", "Penelitian RAG Visual Lab"))}</h2>
        <nav className="sub" aria-label={tr(L("Study pages", "Halaman penelitian"))}>
          <a href="#pilot">{tr(L("Start", "Mulai"))}</a> · <a href="#pilot/pre">{tr(L("Pre-test", "Tes awal"))}</a> · <a href="#pilot/post">{tr(L("Post-test", "Tes akhir"))}</a> · <a href="#pilot/withdraw">{tr(L("Withdraw", "Mengundurkan diri"))}</a>
        </nav></div>
      <div className="plain" style={{ display: "grid", gap: 14 }}>
        {sub === "pre" || sub === "post" ? <Test key={sub} phase={sub} /> : sub === "withdraw" ? <Withdraw /> : sub === "admin" ? <Admin /> : <Start />}
      </div>
    </section>
  );
}

function InfoSheet() {
  const { tr, lang } = useT();
  const contact = PILOT.contact ? PILOT.contact : tr(L("ask your lecturer, who will pass your question on", "tanyakan kepada dosen Anda, yang akan meneruskan pertanyaan Anda"));
  const S = lang === "id" ? [
    ["Tentang penelitian ini", `Penelitian ini menguji apakah belajar RAG dengan visual interaktif di NalarNusa RAG Visual Lab membantu mahasiswa memahami RAG. Peneliti: ${PILOT.researcher}, ${PILOT.institution.id}.`],
    ["Yang Anda lakukan", "Mengerjakan tes awal (sekitar 15 menit), belajar dengan lab seperti biasa, lalu mengerjakan tes akhir (sekitar 20 menit) yang berisi pertanyaan yang sama ditambah kuesioner kegunaan."],
    ["Data yang dikumpulkan", "Kode peserta acak (bukan nama atau NIM), kode kelas, jawaban dan skor Anda, jawaban skala setuju–tidak setuju, komentar yang Anda tulis, pelajaran yang Anda selesaikan di browser ini, lama pengerjaan, dan apakah Anda memakai ponsel. Tidak ada nama, email, atau NIM yang diminta. Jangan menulis data pribadi di kolom komentar."],
    ["Sukarela", "Ikut serta sepenuhnya sukarela dan tidak memengaruhi nilai mata kuliah. Anda boleh berhenti kapan saja, dan boleh memilih \"Saya tidak tahu\" pada pertanyaan mana pun."],
    ["Mengundurkan diri", "Anda dapat menghapus semua jawaban Anda kapan saja di halaman Mengundurkan diri, dengan kode peserta Anda. Tanpa kode itu, jawaban Anda tidak bisa dikaitkan dengan Anda."],
    ["Penyimpanan", `Jawaban disimpan di database Cloudflare milik peneliti, ${PILOT.retention.id}. Hasil hanya dilaporkan sebagai angka kelompok. Komentar bisa dikutip tanpa identitas.`],
    ["Risiko", "Tidak ada risiko yang diketahui selain waktu yang Anda luangkan."],
    ["Pertanyaan", `Hubungi ${contact}.${PILOT.ethicsRef ? ` Nomor persetujuan etik: ${PILOT.ethicsRef}.` : ""}`],
  ] : [
    ["About this study", `This study tests whether learning RAG with the interactive visuals of NalarNusa RAG Visual Lab helps students understand it. Researcher: ${PILOT.researcher}, ${PILOT.institution.en}.`],
    ["What you do", "Take a pre-test (about 15 minutes), learn with the lab as usual, then take a post-test (about 20 minutes) with the same questions plus a usability questionnaire."],
    ["What is collected", "A random participant code (not your name or student number), a class code, your answers and scores, your agree–disagree ratings, any comments you write, the lessons you completed in this browser, how long you took, and whether you used a phone. No name, email or student number is asked. Please don't write personal details in the comment boxes."],
    ["Voluntary", "Taking part is entirely voluntary and does not affect your course grade. You can stop at any time, and you can choose \"I don't know\" for any question."],
    ["Withdrawing", "You can delete all your answers at any time on the Withdraw page, using your participant code. Without that code, your answers cannot be linked to you."],
    ["Storage", `Answers are stored in the researcher's Cloudflare database, ${PILOT.retention.en}. Results are only reported as group figures. Comments may be quoted without anything that identifies you.`],
    ["Risks", "No known risks beyond the time you spend."],
    ["Questions", `Contact: ${contact}.${PILOT.ethicsRef ? ` Ethics approval number: ${PILOT.ethicsRef}.` : ""}`],
  ];
  return <dl className="infosheet">{S.map(([h, p]) => <div key={h}><dt>{h}</dt><dd>{p}</dd></div>)}</dl>;
}

function Start() {
  const { tr } = useT();
  const [s, update, clear] = usePilot();
  const [checks, setChecks] = useState({ read: false, adult: false, agree: false });
  const [classCode, setClassCode] = useState(s.classCode || "");
  const [existing, setExisting] = useState("");
  const all = checks.read && checks.adult && checks.agree;
  const cls = classCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  if (s.pid && s.consent) {
    return (
      <>
        <p style={{ margin: 0 }}>{tr(L("You are taking part. Your participant code is:", "Anda sudah ikut serta. Kode peserta Anda:"))}</p>
        <p className="pcode" aria-label={tr(L("Participant code", "Kode peserta"))}>{s.pid}</p>
        <p className="note" style={{ margin: 0 }}><b>{tr(L("Write it down.", "Catat kode ini."))}</b> {tr(L("You need it for the post-test on another device, and to withdraw.", "Anda memerlukannya untuk tes akhir di perangkat lain, dan untuk mengundurkan diri."))}{s.classCode ? ` ${tr(L("Class", "Kelas"))}: ${s.classCode}.` : ""}</p>
        <div className="steps3">
          <a className={`btn ${s.pre ? "" : "primary"}`} href="#pilot/pre">1 · {tr(L("Pre-test", "Tes awal"))} {s.pre ? "✓" : ""}</a>
          <a className="btn" href="#lesson-01">2 · {tr(L("Learn with the lab", "Belajar dengan lab"))}</a>
          <a className={`btn ${s.pre && !s.post ? "primary" : ""}`} href="#pilot/post">3 · {tr(L("Post-test", "Tes akhir"))} {s.post ? "✓" : ""}</a>
        </div>
        <details><summary>{tr(L("Read the information sheet again", "Baca lagi lembar informasi"))}</summary><InfoSheet /></details>
        <button className="btn" type="button" onClick={() => { if (confirm(tr(L("Forget the code on this device? Your answers stay in the study.", "Lupakan kode di perangkat ini? Jawaban Anda tetap ada di penelitian.")))) clear(); }}>{tr(L("Use a different code on this device", "Pakai kode lain di perangkat ini"))}</button>
      </>
    );
  }
  return (
    <>
      <p style={{ margin: 0 }}>{tr(L("Please read this before you decide to take part.", "Mohon baca ini sebelum Anda memutuskan untuk ikut serta."))}</p>
      <InfoSheet />
      <fieldset className="consent">
        <legend>{tr(L("Consent", "Persetujuan"))}</legend>
        <label><input type="checkbox" checked={checks.read} onChange={(e) => setChecks({ ...checks, read: e.target.checked })} /> {tr(L("I have read the information above.", "Saya sudah membaca informasi di atas."))}</label>
        <label><input type="checkbox" checked={checks.adult} onChange={(e) => setChecks({ ...checks, adult: e.target.checked })} /> {tr(L("I am 18 or older.", "Saya berusia 18 tahun atau lebih."))}</label>
        <label><input type="checkbox" checked={checks.agree} onChange={(e) => setChecks({ ...checks, agree: e.target.checked })} /> {tr(L("I agree to take part, and to my anonymous answers being used in research publications.", "Saya setuju ikut serta, dan jawaban anonim saya dipakai dalam publikasi penelitian."))}</label>
        <label className="lbl" htmlFor="cls">{tr(L("Class code (from your lecturer, optional)", "Kode kelas (dari dosen, opsional)"))}</label>
        <input id="cls" className="docsel" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="IF-2026-A" autoComplete="off" />
        <button className="btn primary" type="button" disabled={!all} onClick={() => update({ pid: newCode(), consent: { at: new Date().toISOString(), version: VERSION }, classCode: cls })}>{tr(L("I agree — give me a participant code", "Saya setuju — beri saya kode peserta"))}</button>
      </fieldset>
      <details>
        <summary>{tr(L("I already have a participant code (second device)", "Saya sudah punya kode peserta (perangkat kedua)"))}</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <label className="lbl" htmlFor="oldcode">{tr(L("Your code", "Kode Anda"))}</label>
          <input id="oldcode" className="docsel" value={existing} onChange={(e) => setExisting(e.target.value.toUpperCase().trim())} placeholder="ABCD-2345" autoComplete="off" />
          <button className="btn" type="button" disabled={!CODE.test(existing) || !all} onClick={() => update({ pid: existing, consent: { at: new Date().toISOString(), version: VERSION }, classCode: cls })}>{tr(L("Continue with this code", "Lanjutkan dengan kode ini"))}</button>
          {!all && <p className="note" style={{ margin: 0 }}>{tr(L("Tick the three consent boxes above first.", "Centang dulu tiga kotak persetujuan di atas."))}</p>}
        </div>
      </details>
    </>
  );
}

function Likert({ name, label, value, onChange, labels }) {
  return (
    <fieldset className="likert">
      <legend>{label}</legend>
      <div className="lk">
        {labels.map((l, i) => (
          <label key={i}><input type="radio" name={name} checked={value === i + 1} onChange={() => onChange(i + 1)} /><span>{l}</span></label>
        ))}
      </div>
    </fieldset>
  );
}

function Test({ phase }) {
  const { tr, lang } = useT();
  const [s, update] = usePilot();
  const { progress } = useProgress();
  const started = useRef(Date.now());
  const [ans, setAns] = useState(() => Array(KNOWLEDGE.length).fill(undefined));
  const [conf, setConf] = useState(() => Array(CONFIDENCE.length).fill(null));
  const [sus, setSus] = useState(() => Array(SUS.length).fill(null));
  const [open, setOpen] = useState({ helped: "", confusing: "" });
  const [state, setState] = useState({ kind: "idle" });
  useEffect(() => { window.scrollTo(0, 0); }, [phase]);
  const orders = useMemo(() => KNOWLEDGE.map((q) => shuffled(q.options.length, (s.pid || "x") + q.id)), [s.pid]);

  if (!s.pid || !s.consent) return <p>{tr(L("Please start on the study page and give your consent first.", "Mohon mulai dari halaman penelitian dan berikan persetujuan Anda dulu."))} <a href="#pilot">{tr(L("Go to the study page", "Ke halaman penelitian"))} →</a></p>;
  const done = s[phase];
  if (done && state.kind !== "sent") {
    return <><p>{tr(L(`You already sent the ${phase === "pre" ? "pre-test" : "post-test"} from this device.`, `Anda sudah mengirim ${phase === "pre" ? "tes awal" : "tes akhir"} dari perangkat ini.`))}</p><Result phase={phase} r={done} pre={s.pre} /></>;
  }
  if (state.kind === "sent") return <Result phase={phase} r={s[phase]} pre={s.pre} />;

  const missing = ans.filter((a) => a === undefined).length + conf.filter((c) => c === null).length + (phase === "post" ? sus.filter((x) => x === null).length : 0);
  const submit = async () => {
    const answers = ans.map((a) => (a === null ? null : a));
    const k = scoreKnowledge(answers);
    const lessonsDone = Object.values(LESSONS).filter((l) => isComplete(l, progress[l.n])).map((l) => l.n);
    const body = {
      version: VERSION, pid: s.pid, classCode: s.classCode || null, phase, lang, consent: true, answers, confidence: conf,
      ...(phase === "post" ? { sus, helped: open.helped.trim() || null, confusing: open.confusing.trim() || null, lessonsDone } : {}),
      minutes: (Date.now() - started.current) / 60000, mobile: matchMedia("(max-width: 700px)").matches,
    };
    setState({ kind: "sending" });
    try {
      await post("/api/pilot", body);
      update({ [phase]: { at: new Date().toISOString(), score: k.total, of: k.of, per: k.per, sus: phase === "post" ? susScore(sus) : null } });
      setState({ kind: "sent" });
    } catch (e) { setState({ kind: "error", msg: e.message }); }
  };

  return (
    <>
      <p style={{ margin: 0 }}>{phase === "pre"
        ? tr(L("20 questions about RAG. Don't look anything up, and don't worry if you know none of it yet: that is the point of a pre-test. Choose \"I don't know\" rather than guessing.", "20 pertanyaan tentang RAG. Jangan mencari jawaban di tempat lain, dan jangan khawatir jika belum tahu sama sekali: itulah tujuan tes awal. Pilih \"Saya tidak tahu\" daripada menebak."))
        : tr(L("The same 20 questions as the pre-test, then a short questionnaire about the lab. Don't look anything up. Choose \"I don't know\" rather than guessing.", "20 pertanyaan yang sama dengan tes awal, lalu kuesioner singkat tentang lab. Jangan mencari jawaban di tempat lain. Pilih \"Saya tidak tahu\" daripada menebak."))}</p>
      <p className="note" style={{ margin: 0 }}>{tr(L("Participant", "Peserta"))} <b className="mono">{s.pid}</b></p>
      <ol className="testlist">
        {KNOWLEDGE.map((q, i) => (
          <li key={q.id}>
            <fieldset>
              <legend>{tr(q.q)}</legend>
              {orders[i].map((oi) => (
                <label key={oi}><input type="radio" name={q.id} checked={ans[i] === oi} onChange={() => setAns(Object.assign([...ans], { [i]: oi }))} /> {tr(q.options[oi])}</label>
              ))}
              <label className="idk"><input type="radio" name={q.id} checked={ans[i] === null} onChange={() => setAns(Object.assign([...ans], { [i]: null }))} /> {tr(L("I don't know", "Saya tidak tahu"))}</label>
            </fieldset>
          </li>
        ))}
      </ol>
      <h3 className="ph3">{tr(L("How confident are you?", "Seberapa yakin Anda?"))}</h3>
      {CONFIDENCE.map((c, i) => <Likert key={c.id} name={c.id} label={tr(c)} value={conf[i]} labels={AGREE[lang]} onChange={(v) => setConf(Object.assign([...conf], { [i]: v }))} />)}
      {phase === "post" && <>
        <h3 className="ph3">{tr(L("About the lab", "Tentang lab"))}</h3>
        {SUS.map((q, i) => <Likert key={i} name={"sus" + i} label={`${i + 1}. ${tr(q)}`} value={sus[i]} labels={AGREE[lang]} onChange={(v) => setSus(Object.assign([...sus], { [i]: v }))} />)}
        <label className="lbl" htmlFor="helped">{tr(L("What helped you learn most? (optional)", "Apa yang paling membantu Anda belajar? (opsional)"))}</label>
        <textarea id="helped" className="docsel" rows={3} maxLength={2000} value={open.helped} onChange={(e) => setOpen({ ...open, helped: e.target.value })} />
        <label className="lbl" htmlFor="confusing">{tr(L("What was confusing or didn't work? (optional)", "Apa yang membingungkan atau tidak berjalan? (opsional)"))}</label>
        <textarea id="confusing" className="docsel" rows={3} maxLength={2000} value={open.confusing} onChange={(e) => setOpen({ ...open, confusing: e.target.value })} />
      </>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" type="button" disabled={missing > 0 || state.kind === "sending"} onClick={submit}>{state.kind === "sending" ? "…" : tr(L("Send my answers", "Kirim jawaban saya"))}</button>
        {missing > 0 && <span className="note" role="status">{tr(L(`${missing} still to answer`, `${missing} belum dijawab`))}</span>}
      </div>
      {state.kind === "error" && <p className="note bad" role="alert">{tr(L("Could not send: ", "Gagal mengirim: "))}{state.msg}. {tr(L("Your answers are still here; try again, or tell your lecturer.", "Jawaban Anda masih ada di sini; coba lagi, atau beri tahu dosen Anda."))}</p>}
    </>
  );
}

function Result({ phase, r, pre }) {
  const { tr } = useT();
  if (!r) return null;
  return (
    <div className="panel good" role="status">
      <h3 style={{ margin: "0 0 6px" }}>✓ {tr(L("Answers sent. Thank you!", "Jawaban terkirim. Terima kasih!"))}</h3>
      <p style={{ margin: "0 0 6px" }}>{tr(L("Your score", "Skor Anda"))}: <b>{r.score}/{r.of}</b>{phase === "post" && pre ? ` (${tr(L("pre-test", "tes awal"))}: ${pre.score}/${pre.of})` : ""}</p>
      <p className="note" style={{ margin: 0 }}>{Object.entries(r.per).map(([lv, v]) => `${tr(LEVEL_OF[lv])} ${v.right}/${v.of}`).join(" · ")}</p>
      {phase === "pre" && <p style={{ margin: "8px 0 0" }}>{tr(L("Next: learn with the lab. Your lecturer will tell you when to take the post-test.", "Berikutnya: belajar dengan lab. Dosen Anda akan memberi tahu kapan mengerjakan tes akhir."))} <a href="#lesson-01">{tr(L("Open lesson 1", "Buka pelajaran 1"))} →</a></p>}
    </div>
  );
}

function Withdraw() {
  const { tr } = useT();
  const [s, , clear] = usePilot();
  const [code, setCode] = useState(s.pid || "");
  const [st, setSt] = useState(null);
  const go = async () => {
    setSt({ busy: true });
    try { const r = await post("/api/withdraw", { pid: code }); setSt({ ok: true, n: r.deleted }); if (code === s.pid) clear(); }
    catch (e) { setSt({ ok: false, msg: e.message }); }
  };
  return (
    <>
      <p style={{ margin: 0 }}>{tr(L("This deletes every answer sent with your participant code. It cannot be undone.", "Ini menghapus semua jawaban yang dikirim dengan kode peserta Anda. Tidak bisa dibatalkan."))}</p>
      <label className="lbl" htmlFor="wcode">{tr(L("Participant code", "Kode peserta"))}</label>
      <input id="wcode" className="docsel" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().trim())} placeholder="ABCD-2345" autoComplete="off" />
      <button className="btn" type="button" disabled={!CODE.test(code) || st?.busy} onClick={go}>{tr(L("Delete my answers", "Hapus jawaban saya"))}</button>
      {st && !st.busy && <p className={`note${st.ok ? "" : " bad"}`} role="status">{st.ok ? tr(L(`Done: ${st.n} record(s) deleted. You are no longer in the study.`, `Selesai: ${st.n} catatan dihapus. Anda tidak lagi ikut dalam penelitian.`)) : tr(L("Could not delete: ", "Gagal menghapus: ")) + st.msg}</p>}
    </>
  );
}

// Researcher page: download the data with the EXPORT_KEY set in Cloudflare, and see a quick summary.
function Admin() {
  const { tr } = useT();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState(null);
  const [sum, setSum] = useState(null);
  const get = async (table, format) => {
    const r = await fetch(`/api/export?table=${table}&format=${format}`, { headers: { authorization: "Bearer " + key } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return format === "json" ? r.json() : r.blob();
  };
  const download = async (table) => {
    setMsg(null);
    try { const b = await get(table, "csv"); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `rag-lab-${table}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    catch (e) { setMsg(e.message); }
  };
  const summary = async () => {
    setMsg(null);
    try {
      const { rows } = await get("pilot", "json");
      const latest = {};
      for (const r of rows) latest[`${r.pid}|${r.phase}`] = r;           // last submission per participant and phase
      const pre = Object.values(latest).filter((r) => r.phase === "pre"), postR = Object.values(latest).filter((r) => r.phase === "post");
      const pairs = postR.map((p) => [latest[`${p.pid}|pre`], p]).filter(([a]) => a);
      const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
      const gains = pairs.filter(([a]) => a.score < 20).map(([a, b]) => (b.score - a.score) / (20 - a.score));
      setSum({ pre: pre.length, post: postR.length, pairs: pairs.length, preMean: mean(pairs.map(([a]) => a.score)), postMean: mean(pairs.map(([, b]) => b.score)), gain: mean(gains), sus: mean(postR.map((r) => r.sus_score).filter((x) => x != null)), classes: [...new Set(rows.map((r) => r.class_code || "—"))].join(", ") });
    } catch (e) { setMsg(e.message); }
  };
  const [use, setUse] = useState(null);
  const usage = async () => {
    setMsg(null);
    try { const r = await fetch("/api/llm/usage", { headers: { authorization: "Bearer " + key } }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setUse(j); }
    catch (e) { setMsg(e.message); }
  };
  const [vis, setVis] = useState(null);
  const visits = async (days) => {
    setMsg(null);
    try { const r = await fetch(`/api/visits?days=${days}`, { headers: { authorization: "Bearer " + key } }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setVis(j); }
    catch (e) { setMsg(e.message); }
  };
  const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  return (
    <>
      <p style={{ margin: 0 }}>{tr(L("For the researcher. Enter the EXPORT_KEY you set in Cloudflare. It is kept in this page only.", "Untuk peneliti. Masukkan EXPORT_KEY yang Anda atur di Cloudflare. Kunci hanya disimpan di halaman ini."))}</p>
      <label className="lbl" htmlFor="xkey">EXPORT_KEY</label>
      <input id="xkey" className="docsel" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" disabled={!key} onClick={() => download("pilot")}>{tr(L("Download test answers (CSV)", "Unduh jawaban tes (CSV)"))}</button>
        <button className="btn" type="button" disabled={!key} onClick={() => download("feedback")}>{tr(L("Download feedback (CSV)", "Unduh masukan (CSV)"))}</button>
        <button className="btn primary" type="button" disabled={!key} onClick={summary}>{tr(L("Show summary", "Tampilkan ringkasan"))}</button>
        <button className="btn" type="button" disabled={!key} onClick={usage}>{tr(L("Lab model usage", "Pemakaian model lab"))}</button>
        <button className="btn" type="button" disabled={!key} onClick={() => visits(30)}>{tr(L("Visitors", "Pengunjung"))}</button>
      </div>
      {msg && <p className="note bad" role="alert">{msg}</p>}
      {vis && <VisitStats data={vis} onRange={visits} />}
      {use && (
        <>
          <p className="note" style={{ margin: "8px 0 0" }}>{tr(L(`Limits per day: ${use.limits.per_person} answers per person, ${use.limits.per_network} per network, ${use.limits.per_day} in total. Model ${use.ai ? "connected" : "NOT connected"}.`, `Batas per hari: ${use.limits.per_person} jawaban per orang, ${use.limits.per_network} per jaringan, ${use.limits.per_day} total. Model ${use.ai ? "terhubung" : "TIDAK terhubung"}.`))}</p>
          <table className="lvtable"><thead><tr><th>{tr(L("Day (UTC)", "Hari (UTC)"))}</th><th>{tr(L("Answers", "Jawaban"))}</th><th>{tr(L("People", "Orang"))}</th><th>{tr(L("Networks", "Jaringan"))}</th><th>{tr(L("Most by one person", "Terbanyak oleh satu orang"))}</th></tr></thead>
            <tbody>{use.days.length ? use.days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.answers} / {use.limits.per_day}</td><td>{d.people}</td><td>{d.networks}</td><td>{d.most_by_one}</td></tr>) : <tr><td colSpan={5}>{tr(L("No use yet.", "Belum ada pemakaian."))}</td></tr>}</tbody></table>
        </>
      )}
      {sum && (
        <table className="lvtable"><tbody>
          <tr><th>{tr(L("Pre-tests / post-tests", "Tes awal / tes akhir"))}</th><td>{sum.pre} / {sum.post}</td></tr>
          <tr><th>{tr(L("Matched pairs", "Pasangan lengkap"))}</th><td>{sum.pairs}</td></tr>
          <tr><th>{tr(L("Mean score, pairs (of 20)", "Rata-rata skor, pasangan (dari 20)"))}</th><td>{f(sum.preMean)} → {f(sum.postMean)}</td></tr>
          <tr><th>{tr(L("Mean normalised gain", "Rata-rata gain ternormalisasi"))}</th><td>{f(sum.gain, 2)}</td></tr>
          <tr><th>{tr(L("Mean SUS (0–100)", "Rata-rata SUS (0–100)"))}</th><td>{f(sum.sus)}</td></tr>
          <tr><th>{tr(L("Class codes", "Kode kelas"))}</th><td>{sum.classes}</td></tr>
        </tbody></table>
      )}
    </>
  );
}

// Visitors: totals, a bar per day, and where people come from. Country codes come from Cloudflare's IP lookup.
const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
function VisitStats({ data, onRange }) {
  const { tr, lang } = useT();
  const names = useMemo(() => { try { return new Intl.DisplayNames([lang], { type: "region" }); } catch { return null; } }, [lang]);
  const country = (cc) => (cc && cc !== "XX" && cc !== "T1" ? `${flag(cc)} ${names?.of(cc) || cc}` : tr(L("Unknown", "Tidak diketahui")));
  const place = (k) => { const [cc, p] = k.split("|"); return `${p || tr(L("(unknown)", "(tidak diketahui)"))}, ${country(cc)}`; };
  const pageLabel = (p) => { const m = p.match(/^lesson-(\d+)$/); if (m) return `${tr(L("Lesson", "Pelajaran"))} ${m[1]}${(() => { const c = CURRICULUM.find((l) => l.n === +m[1]); return c ? ": " + tr(c.title) : ""; })()}`; const v = p.match(/^level-(\d)$/); if (v) return `${tr(L("Level", "Level"))} ${v[1]}`; const P = { home: L("Home page", "Beranda"), glossary: L("Glossary", "Glosarium"), privacy: L("Privacy", "Privasi"), pilot: L("Study pages", "Halaman penelitian") }; return P[p] ? tr(P[p]) : p; };
  const max = Math.max(1, ...data.byDay.map((d) => d.visitors));
  const T = data.total || {};
  const table = (title, rows, label) => (
    <table className="lvtable" style={{ marginTop: 10 }}><thead><tr><th>{title}</th><th>{tr(L("Visitors", "Pengunjung"))}</th><th>{tr(L("Page views", "Tampilan halaman"))}</th></tr></thead>
      <tbody>{rows.length ? rows.map((r) => <tr key={r.k}><td>{label(r.k)}</td><td>{r.visitors}</td><td>{r.views}</td></tr>) : <tr><td colSpan={3}>—</td></tr>}</tbody></table>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b>{tr(L("Visitors", "Pengunjung"))}</b>
        {[7, 30, 90, 365].map((n) => <button key={n} className={"btn" + (data.days === n ? " primary" : "")} type="button" onClick={() => onRange(n)}>{n} {tr(L("days", "hari"))}</button>)}
      </div>
      <table className="lvtable" style={{ marginTop: 8 }}><tbody>
        <tr><th>{tr(L("Visitors (each browser once per day)", "Pengunjung (tiap browser sekali per hari)"))}</th><td>{T.visitors || 0}</td></tr>
        <tr><th>{tr(L("New visitors (first time on the lab)", "Pengunjung baru (pertama kali ke lab)"))}</th><td>{T.new_visitors || 0}</td></tr>
        <tr><th>{tr(L("Page views", "Tampilan halaman"))}</th><td>{T.views || 0}</td></tr>
        <tr><th>{tr(L("Countries", "Negara"))}</th><td>{T.countries || 0}</td></tr>
      </tbody></table>
      <div role="img" aria-label={tr(L("Visitors per day", "Pengunjung per hari"))} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110, marginTop: 10, borderBottom: "1px solid var(--line)" }}>
        {data.byDay.map((d) => <div key={d.day} title={`${d.day}: ${d.visitors} / ${d.views}`} style={{ flex: 1, minWidth: 3, height: `${(100 * d.visitors) / max}%`, background: "var(--query)", borderRadius: "2px 2px 0 0" }} />)}
      </div>
      <p className="note" style={{ margin: "4px 0 0" }}>{data.byDay.length ? `${data.byDay[0].day} → ${data.byDay[data.byDay.length - 1].day} (UTC)` : tr(L("No visits recorded yet.", "Belum ada kunjungan tercatat."))}</p>
      {table(tr(L("Country", "Negara")), data.countries, country)}
      {table(tr(L("Province / region", "Provinsi / wilayah")), data.regions, place)}
      {table(tr(L("City", "Kota")), data.cities, place)}
      {table(tr(L("Came from (other sites)", "Datang dari (situs lain)")), data.refs, (k) => k || tr(L("Direct (typed, bookmark, app, or the site was not shared)", "Langsung (diketik, bookmark, aplikasi, atau situsnya tidak dibagikan)")))}
      {table(tr(L("Device", "Perangkat")), data.devices, (k) => tr({ desktop: L("Computer", "Komputer"), mobile: L("Phone", "Ponsel"), tablet: L("Tablet", "Tablet") }[k] || L(k, k)))}
      {table(tr(L("Language", "Bahasa")), data.langs, (k) => (k === "id" ? "Bahasa Indonesia" : "English"))}
      {table(tr(L("Page", "Halaman")), data.pages, pageLabel)}
    </div>
  );
}
