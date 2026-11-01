// Learner progress, saved in this browser only.
import { useCallback, useEffect, useState } from "react";

const KEY = "lab-progress-v1";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const listeners = new Set();
let state = read();

function write(next) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach((f) => f(next));
}

export function useProgress() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  const passChallenge = useCallback((n, id) => {
    const l = state[n] || {};
    if (l.challenges?.[id]) return;
    write({ ...state, [n]: { ...l, challenges: { ...(l.challenges || {}), [id]: true } } });
  }, []);
  const saveQuiz = useCallback((n, score, total) => {
    const l = state[n] || {};
    if ((l.quiz?.score ?? -1) >= score) return;
    write({ ...state, [n]: { ...l, quiz: { score, total } } });
  }, []);
  const reset = useCallback((n) => { const { [n]: _, ...rest } = state; write(rest); }, []);
  return { progress: s, passChallenge, saveQuiz, reset };
}

export const QUIZ_PASS = 0.8;
export function isComplete(lesson, p) {
  if (!lesson || !p) return false;
  const ch = (lesson.challenges || []).every((c) => p.challenges?.[c.id]);
  const qz = !lesson.quiz?.length || (p.quiz && p.quiz.score / p.quiz.total >= QUIZ_PASS);
  return ch && qz;
}
