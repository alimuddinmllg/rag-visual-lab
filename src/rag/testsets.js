// Test sets: built-in (handbook) and learner-made (saved in this browser).
import { NUSABOT_EN, NUSABOT_ID } from "../documents/nusabot.js";

export const HANDBOOK = { en: NUSABOT_EN, id: NUSABOT_ID };

// [question, phrase the right chunk must contain]
export const TEST_SET = {
  en: [
    ["How much does PLA printing cost?", "2.000 per gram"], ["When is the lab open on Saturday?", "Saturday from 10:00 to 16:00"],
    ["How much does a gold card cost?", "250.000 per year"], ["Can the drone kit leave the lab?", "drone kit cannot leave the lab"],
    ["What is the fine for late returns?", "5.000 per item per day"], ["Where must lithium batteries be charged?", "fireproof charging bags"],
    ["When are files on the workstations deleted?", "deleted every Sunday night"], ["Who should I ask about urgent safety issues?", "lab assistant on duty"],
    ["How long can a print run before it needs an overnight slot?", "longer than eight hours"], ["What software is installed on the workstations?", "KiCad"],
  ],
  id: [
    ["Berapa biaya cetak PLA?", "2.000 per gram"], ["Jam berapa lab buka hari Sabtu?", "Sabtu pukul 10.00 sampai 16.00"],
    ["Berapa biaya kartu emas?", "250.000 per tahun"], ["Apakah kit drone boleh dibawa keluar lab?", "kit drone tidak boleh dibawa keluar lab"],
    ["Berapa denda jika terlambat mengembalikan alat?", "5.000 per alat per hari"], ["Di mana baterai litium harus diisi?", "kantong pengisian tahan api"],
    ["Kapan file di komputer kerja dihapus?", "dihapus setiap Minggu malam"], ["Siapa yang dihubungi untuk masalah keselamatan mendesak?", "asisten lab yang bertugas"],
    ["Berapa lama cetakan boleh berjalan sebelum perlu slot malam?", "lebih dari delapan jam"], ["Perangkat lunak apa yang terpasang di komputer kerja?", "KiCad"],
  ],
};

// Questions the handbook cannot answer (for refusal tuning)
export const UNANSWERABLE = {
  en: ["What is the capital of France?", "How do I renew my passport?", "What is the Wi-Fi password for the library?", "Who won the football match yesterday?", "How much does a laptop repair cost?"],
  id: ["Apa ibu kota Prancis?", "Bagaimana cara memperpanjang paspor?", "Apa kata sandi Wi-Fi perpustakaan?", "Siapa yang menang pertandingan sepak bola kemarin?", "Berapa biaya servis laptop?"],
};

const KEY = "lab-testsets-v1";
export function loadUserSets() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
export function saveUserSet(docId, items) { const all = loadUserSets(); all[docId] = items; try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; } }

/** Test set for a document: the learner's own if saved, the built-in one for the handbook, else null. */
export function testSetFor(doc) {
  const own = loadUserSets()[doc.id];
  if (own?.length) return { items: own, source: "yours" };
  if (doc.id === "nusabot-en") return { items: TEST_SET.en, source: "built-in" };
  if (doc.id === "nusabot-id") return { items: TEST_SET.id, source: "built-in" };
  return null;
}
