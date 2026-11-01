// POST /api/withdraw — a participant removes all their pilot answers, using their participant code.
import { db, handle, json, readBody, str, PID, HttpError } from "../../functions-lib/db.js";

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readBody(request, 1000);
  const pid = str(b.pid, 9);
  if (!pid || !PID.test(pid)) throw new HttpError(400, "Invalid participant code.");
  const d = await db(env);
  const r = await d.prepare("DELETE FROM pilot WHERE pid = ?").bind(pid).run();
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
});
