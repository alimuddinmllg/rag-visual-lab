// #privacy: what the lab stores, where, and what it sends.
import { useT } from "../i18n.js";

const ITEMS = {
  en: [
    ["Your documents, progress and settings", "Stay in this browser (local storage). Uploaded or pasted documents are parsed and searched in the browser and are never sent to us. Clearing your browser data removes them."],
    ["Neural model and Python", "On first use, the browser downloads the embedding model from Hugging Face and Python from jsDelivr. Those services see a normal download request; your documents are not sent."],
    ["LLM answers (optional, off until you turn them on)", "With the lab's model, the prompt (your question and the retrieved text, which can come from your own document) is sent to the lab's server and answered by Cloudflare Workers AI. It is not stored. The only record is a daily count of answers per person, kept under a code made from your IP address and a secret key; the code changes every day, the IP address itself is not saved, and counts are deleted after three days. With your own service or Ollama, the prompt goes from your browser straight to the address you entered, and your settings and key stay in this browser."],
    ["Feedback button", "Sends the page name, your 1–5 rating and your comment. Nothing else; no name or account."],
    ["Study pages (invited classes)", "Only after consent: a random participant code, class code, answers and questionnaire responses. Delete them any time on the Withdraw page. Details are on the study's information sheet."],
    ["Visit statistics", "Cloudflare Web Analytics counts page views without cookies and without tracking you across sites."],
    ["Who runs this", "NalarNusa. Use the Feedback button for questions about this page."],
  ],
  id: [
    ["Dokumen, kemajuan, dan pengaturan Anda", "Tetap di browser ini (local storage). Dokumen yang diunggah atau ditempel diproses dan dicari di browser dan tidak pernah dikirim kepada kami. Menghapus data browser akan menghapusnya."],
    ["Model neural dan Python", "Saat pertama dipakai, browser mengunduh model embedding dari Hugging Face dan Python dari jsDelivr. Layanan itu melihat permintaan unduhan biasa; dokumen Anda tidak dikirim."],
    ["Jawaban LLM (opsional, mati sampai Anda menyalakannya)", "Dengan model lab, prompt (pertanyaan Anda dan teks hasil retrieval, yang bisa berasal dari dokumen Anda sendiri) dikirim ke server lab dan dijawab oleh Cloudflare Workers AI. Prompt tidak disimpan. Satu-satunya catatan adalah hitungan jawaban harian per orang, dengan kode yang dibuat dari alamat IP Anda dan sebuah kunci rahasia; kodenya berganti setiap hari, alamat IP-nya sendiri tidak disimpan, dan hitungan dihapus setelah tiga hari. Dengan layanan Anda sendiri atau Ollama, prompt dikirim dari browser Anda langsung ke alamat yang Anda isi, dan pengaturan serta key tetap di browser ini."],
    ["Tombol masukan", "Mengirim nama halaman, penilaian 1–5, dan komentar Anda. Tidak lebih; tanpa nama atau akun."],
    ["Halaman penelitian (kelas yang diundang)", "Hanya setelah persetujuan: kode peserta acak, kode kelas, jawaban, dan respons kuesioner. Hapus kapan saja di halaman Mengundurkan diri. Rinciannya ada di lembar informasi penelitian."],
    ["Statistik kunjungan", "Cloudflare Web Analytics menghitung kunjungan halaman tanpa cookie dan tanpa melacak Anda di situs lain."],
    ["Pengelola", "NalarNusa. Pakai tombol Masukan untuk pertanyaan tentang halaman ini."],
  ],
};

export default function Privacy() {
  const { lang } = useT();
  return (
    <section className="card" style={{ gridColumn: "span 2" }} aria-labelledby="prh">
      <div className="card-h"><h2 id="prh">{lang === "id" ? "Privasi" : "Privacy"}</h2></div>
      <div className="plain"><dl className="infosheet">{ITEMS[lang].map(([h, p]) => <div key={h}><dt>{h}</dt><dd>{p}</dd></div>)}</dl></div>
    </section>
  );
}
