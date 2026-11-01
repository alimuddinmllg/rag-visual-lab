// POST /api/feedback — the feedback button. Anonymous: page, lesson, language, a 1–5 rating and a comment.
import { db, handle, json, readBody, str, int, HttpError } from "../../functions-lib/db.js";

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readBody(request, 6000);
  const rating = int(b.rating, 1, 5), text = str(b.text, 3000);
  if (!rating && !text?.trim()) throw new HttpError(400, "Give a rating or a comment.");
  const d = await db(env);
  await d.prepare("INSERT INTO feedback (created, page, lesson, lang, rating, text) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), str(b.page, 40), int(b.lesson, 1, 32), b.lang === "id" ? "id" : "en", rating, text).run();
  return json({ ok: true });
});
