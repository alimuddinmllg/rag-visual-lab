import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The lesson engine's runner.
//
// A lesson defines `stages`: [{ id, run(ctx) => partialCtx, log?(ctx, t) => string }].
// The runner keeps `phase` = how many stages have run (0..stages.length).
// The context is recomputed from scratch from the inputs, so moving a slider
// can never leave stale data on screen.
//
// - play():  run the remaining stages one by one, with a pause between them
// - pause(): stop after the current stage
// - step():  run exactly one more stage
// - reset(): back to phase 0
// - restart(): reset and play (the Run button)
// Changing inputs re-runs instantly up to the current phase, with no animation.

const BASE_DELAY = 900; // ms per stage at 1x

export function computeContext(stages, inputs, phase) {
  let ctx = { inputs };
  for (let i = 0; i < phase; i++) ctx = { ...ctx, ...stages[i].run(ctx) };
  return ctx;
}

export function useLessonRunner(lesson, inputs) {
  const stages = lesson.stages;
  const total = stages.length;
  const [phase, setPhase] = useState(total);   // open in a complete state
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [animStage, setAnimStage] = useState(null); // stage that just ran (for animations)
  const [runKey, setRunKey] = useState(0);
  const [logs, setLogs] = useState([]);
  const timer = useRef(null);

  const ctx = useMemo(() => computeContext(stages, inputs, phase), [stages, inputs, phase]);

  const reduceMotion = useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const pushLog = useCallback((entry) => setLogs((l) => [...l.slice(-80), entry]), []);

  // Inputs changed: drop the animation flag so components re-render quietly.
  useEffect(() => { setAnimStage(null); }, [inputs]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const advance = useCallback(() => {
    const p = phaseRef.current;
    if (p >= total) return;
    setAnimStage(stages[p].id);
    setRunKey((k) => k + 1);
    setPhase(p + 1);
  }, [stages, total]);

  // Log a stage whenever it has just been animated in.
  const lastLogged = useRef(null);
  useEffect(() => {
    if (!animStage) return;
    const key = `${runKey}:${animStage}`;
    if (lastLogged.current === key) return;
    lastLogged.current = key;
    const st = stages.find((s) => s.id === animStage);
    if (st && st.log) pushLog({ stage: st.id, ...st.log(ctx) });
  }, [animStage, runKey, ctx, stages, pushLog]);

  // Auto-advance while playing.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing) return;
    if (phase >= total) { setPlaying(false); return; }
    const delay = phase === 0 ? 150 : reduceMotion ? 0 : BASE_DELAY / speed;
    timer.current = setTimeout(advance, delay);
    return () => clearTimeout(timer.current);
  }, [playing, phase, total, speed, advance, reduceMotion]);

  const play = useCallback(() => {
    if (phase >= total) { setPhase(0); setAnimStage(null); }
    setPlaying(true);
  }, [phase, total]);
  const pause = useCallback(() => setPlaying(false), []);
  const step = useCallback(() => {
    setPlaying(false);
    if (phase >= total) { setPhase(0); setAnimStage(null); return; }
    advance();
  }, [phase, total, advance]);
  const reset = useCallback(() => { setPlaying(false); setPhase(0); setAnimStage(null); }, []);
  const restart = useCallback((header) => {
    if (header) pushLog({ stage: "header", text: header });
    setPhase(0); setAnimStage(null); setPlaying(true);
  }, [pushLog]);
  const clearLogs = useCallback(() => setLogs([]), []);

  const status = playing ? "running" : phase === 0 ? "idle" : phase < total ? "paused" : "done";
  // The stage that has just run, while a run is in progress or paused.
  const current = phase > 0 && (playing || phase < total) ? stages[phase - 1].id : null;

  return {
    ctx, phase, total, playing, speed, setSpeed, status, current,
    animStage, runKey, logs, pushLog, clearLogs,
    play, pause, step, reset, restart,
    stageIndex: (id) => stages.findIndex((s) => s.id === id),
  };
}
