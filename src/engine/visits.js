// Visit statistics: tell /api/visit which page was opened (once per page per visit), for the Admin page.
// Nothing is sent when the browser asks sites not to track (Global Privacy Control or Do Not Track),
// on the researcher's Admin page, or when running locally.
import { clientId } from "../rag/llm.js";

const sent = new Set();
let firstVisit = null;

function optedOut() {
  const n = typeof navigator === "undefined" ? {} : navigator;
  return n.globalPrivacyControl === true || n.doNotTrack === "1" || window.doNotTrack === "1";
}

function isFirstVisit() {
  if (firstVisit !== null) return firstVisit;
  try { firstVisit = !localStorage.getItem("lab-visited"); localStorage.setItem("lab-visited", "1"); }
  catch { firstVisit = false; }
  return firstVisit;
}

export function pageName(route) {
  if (route.kind === "lesson") return `lesson-${route.n}`;
  if (route.kind === "level") return `level-${route.n}`;
  if (route.kind === "pilot" && route.sub === "admin") return null;
  return route.kind;   // home, privacy, glossary, pilot
}

export function trackPage(route, lang) {
  const page = pageName(route);
  if (!page || sent.has(page) || optedOut() || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
  sent.add(page);
  const body = JSON.stringify({ page, lang, client: clientId(), first: isFirstVisit() && sent.size === 1, landing: sent.size === 1, ref: sent.size === 1 ? document.referrer : "" });
  try {
    if (navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" }))) return;
  } catch { /* fall back to fetch */ }
  fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}
