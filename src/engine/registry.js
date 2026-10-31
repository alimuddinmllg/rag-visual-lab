// The full curriculum. A lesson appears here even before it is built;
// `built` lessons map to a config in src/lessons/index.js.

export const LEVELS = [
  { n: 1, name: { en: "Foundations", id: "Dasar" } },
  { n: 2, name: { en: "Building blocks", id: "Komponen dasar" } },
  { n: 3, name: { en: "Better retrieval", id: "Retrieval lebih baik" } },
  { n: 4, name: { en: "Evaluation and reliability", id: "Evaluasi dan keandalan" } },
  { n: 5, name: { en: "Production", id: "Produksi" } },
];

const L = (n, level, en, id) => ({ n, level, title: { en, id } });

export const CURRICULUM = [
  L(1, 1, "What an LLM does, and why it hallucinates", "Cara kerja LLM dan mengapa ia berhalusinasi"),
  L(2, 1, "Why RAG: open-book vs closed-book", "Mengapa RAG: ujian buku terbuka vs tertutup"),
  L(3, 1, "Tokens and the context window", "Token dan jendela konteks"),
  L(4, 1, "Embeddings: meaning as points", "Embedding: makna sebagai titik"),
  L(5, 1, "Measuring similarity", "Mengukur kemiripan"),
  L(6, 1, "Your first RAG pipeline", "Pipeline RAG pertama Anda"),
  L(7, 2, "Loading documents", "Memuat dokumen"),
  L(8, 2, "Chunking strategies", "Strategi chunking"),
  L(9, 2, "Chunk size and overlap", "Ukuran chunk dan overlap"),
  L(10, 2, "Metadata and filtering", "Metadata dan penyaringan"),
  L(11, 2, "Vector stores and indexes", "Vector store dan indeks"),
  L(12, 2, "Prompt assembly and citations", "Menyusun prompt dan sitasi"),
  L(13, 3, "Keyword (BM25) vs semantic search", "Pencarian kata kunci (BM25) vs semantik"),
  L(14, 3, "Hybrid search and rank fusion", "Pencarian hibrida dan rank fusion"),
  L(15, 3, "Re-ranking", "Re-ranking"),
  L(16, 3, "Query rewriting, multi-query, HyDE", "Penulisan ulang kueri, multi-kueri, HyDE"),
  L(17, 3, "Small-to-big retrieval", "Retrieval kecil-ke-besar"),
  L(18, 3, "Lost in the middle and compression", "Hilang di tengah dan kompresi"),
  L(19, 4, "Building a test set", "Membuat set uji"),
  L(20, 4, "Retrieval metrics", "Metrik retrieval"),
  L(21, 4, "Answer metrics: faithfulness and relevance", "Metrik jawaban: kesetiaan dan relevansi"),
  L(22, 4, "Failure clinic", "Klinik kegagalan"),
  L(23, 4, "Hallucination and refusal tuning", "Mengatur halusinasi dan penolakan"),
  L(24, 4, "Security: prompt injection and access control", "Keamanan: prompt injection dan kontrol akses"),
  L(25, 5, "Scaling to millions of vectors", "Skala jutaan vektor"),
  L(26, 5, "Keeping the index fresh", "Menjaga indeks tetap mutakhir"),
  L(27, 5, "Cost and latency budgets", "Anggaran biaya dan latensi"),
  L(28, 5, "Tables, images and multimodal RAG", "Tabel, gambar, dan RAG multimodal"),
  L(29, 5, "GraphRAG", "GraphRAG"),
  L(30, 5, "Agentic RAG", "RAG agentik"),
  L(31, 5, "Monitoring in production", "Pemantauan di produksi"),
  L(32, 5, "Capstone: your own RAG", "Proyek akhir: RAG Anda sendiri"),
];

export const pad2 = (n) => String(n).padStart(2, "0");
export const lessonHash = (n) => `lesson-${pad2(n)}`;
