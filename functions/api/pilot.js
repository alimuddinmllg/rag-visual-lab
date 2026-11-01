// POST /api/pilot — one pre-test or post-test submission. Only sent after the participant consents.
import { db, handle, json, readBody, str, int, PID, HttpError } from "../../functions-lib/db.js";
import { VERSION, KNOWLEDGE, scoreKnowledge, susScore } from "../../src/pilot/instrument.js";

const VERSIONS = new Set([VERSION]);
const arr = (v, n, lo, hi) => (Array.isArray(v) && v.length === n && v.every((x) => x === null || (Number.isInteger(x) && x >= lo && x <= hi)) ? JSON.stringify(v) : null);

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readBody(request);
  if (b.consent !== true) throw new HttpError(400, "Consent is required.");
  if (!VERSIONS.has(b.version)) throw new HttpError(400, "Unknown test version.");
  const pid = str(b.pid, 9);
  if (!pid || !PID.test(pid)) throw new HttpError(400, "Invalid participant code.");
  if (b.phase !== "pre" && b.phase !== "post") throw new HttpError(400, "Phase must be pre or post.");
  const answers = arr(b.answers, KNOWLEDGE.length, 0, 3);
  if (!answers) throw new HttpError(400, "Answers missing.");
  // Scores are computed here from the answers, never taken from the browser.
  const k = scoreKnowledge(b.answers), per = Object.fromEntries(Object.entries(k.per).map(([l, v]) => [l, v.right]));
  const sus = b.phase === "post" ? arr(b.sus, 10, 1, 5) : null;
  const row = [
    new Date().toISOString(), b.version, str(b.classCode, 32), pid, b.phase, b.lang === "id" ? "id" : "en", 1,
    answers, k.total, per[1], per[2], per[3], per[4],
    arr(b.confidence, 4, 1, 5), sus, sus && b.sus.every((x) => x !== null) ? susScore(b.sus) : null,
    str(b.helped, 2000), str(b.confusing, 2000),
    Array.isArray(b.lessonsDone) && b.lessonsDone.every((n) => Number.isInteger(n) && n >= 1 && n <= 32) ? JSON.stringify(b.lessonsDone.slice(0, 32)) : null,
    typeof b.minutes === "number" && b.minutes >= 0 && b.minutes < 600 ? Math.round(b.minutes * 10) / 10 : null,
    b.mobile ? 1 : 0,
  ];
  const d = await db(env);
  await d.prepare(`INSERT INTO pilot (created, version, class_code, pid, phase, lang, consent, answers, score, score_l1, score_l2, score_l3, score_l4,
    confidence, sus, sus_score, helped, confusing, lessons_done, minutes, mobile) VALUES (${row.map(() => "?").join(",")})`).bind(...row).run();
  return json({ ok: true });
});
