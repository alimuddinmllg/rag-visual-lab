import { createContext, useContext } from "react";

// UI strings. Lesson text lives with each lesson as { en, id } objects.
const STRINGS = {
  en: {
    brand: "NalarNusa RAG Visual Lab",
    tagline: "See it · Change it · Read the code",
    lessons: "Lessons",
    built: (a, b) => `${a} of ${b} lessons built`,
    soon: "soon",
    level: "Level",
    play: "Play", pause: "Pause", step: "Step", reset: "Reset", speed: "Speed",
    run: "Run",
    yourQuestion: "Your question",
    tryIt: "Try it yourself",
    monitor: "Monitor", clear: "Clear",
    idle: "Idle", running: "Running", paused: "Paused", done: "Done",
    data: "Data", code: "Code",
    document: "Document",
    fromScratch: "From scratch", withLibraries: "With libraries",
    copy: "Copy", copied: "Copied", download: "Download .py",
    runPython: "Run this Python in your browser",
    loadingPython: "Loading Python (first time only, about 15 MB)…",
    runningPython: "Running…",
    pythonMatches: "Python gives the same top-k and scores as the visual.",
    pythonDiffers: "Python and the visual disagree. Please report this.",
    variables: "Live values",
    libsNote: "Library version: read-only here. Run it on your computer or in Google Colab after installing the packages listed at the top.",
    comingSoonTitle: "This lesson is planned",
    comingSoonBody: "Phase 0 builds the engine and lesson 6. The other lessons are added level by level on the same engine.",
    openLesson6: "Open lesson 6",
    stageWaiting: "waiting",
    phaseLabel: "Phase 0 preview",
  },
  id: {
    brand: "NalarNusa RAG Visual Lab",
    tagline: "Lihat · Ubah · Baca kodenya",
    lessons: "Pelajaran",
    built: (a, b) => `${a} dari ${b} pelajaran selesai dibuat`,
    soon: "segera",
    level: "Level",
    play: "Putar", pause: "Jeda", step: "Langkah", reset: "Ulang", speed: "Kecepatan",
    run: "Jalankan",
    yourQuestion: "Pertanyaan Anda",
    tryIt: "Coba sendiri",
    monitor: "Monitor", clear: "Hapus",
    idle: "Siap", running: "Berjalan", paused: "Dijeda", done: "Selesai",
    data: "Data", code: "Kode",
    document: "Dokumen",
    fromScratch: "Dari nol", withLibraries: "Dengan pustaka",
    copy: "Salin", copied: "Tersalin", download: "Unduh .py",
    runPython: "Jalankan Python ini di browser",
    loadingPython: "Memuat Python (hanya pertama kali, sekitar 15 MB)…",
    runningPython: "Menjalankan…",
    pythonMatches: "Python memberi top-k dan skor yang sama dengan visual.",
    pythonDiffers: "Python dan visual tidak cocok. Mohon laporkan.",
    variables: "Nilai saat ini",
    libsNote: "Versi pustaka: hanya untuk dibaca di sini. Jalankan di komputer Anda atau Google Colab setelah memasang paket yang tertulis di bagian atas.",
    comingSoonTitle: "Pelajaran ini sedang direncanakan",
    comingSoonBody: "Fase 0 membangun mesin pelajaran dan pelajaran 6. Pelajaran lain ditambahkan per level di atas mesin yang sama.",
    openLesson6: "Buka pelajaran 6",
    stageWaiting: "menunggu",
    phaseLabel: "Pratinjau Fase 0",
  },
};

export const LangContext = createContext("en");

export function useT() {
  const lang = useContext(LangContext);
  const s = STRINGS[lang] || STRINGS.en;
  // t("key") for UI strings, tr({en, id}) for lesson text
  const t = (key, ...args) => {
    const v = s[key] ?? STRINGS.en[key] ?? key;
    return typeof v === "function" ? v(...args) : v;
  };
  const tr = (obj) => (obj == null ? "" : typeof obj === "string" ? obj : obj[lang] ?? obj.en);
  return { t, tr, lang };
}
