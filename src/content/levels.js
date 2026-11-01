// What a learner can do after each level (shown on the level page). EN + ID.
export const LEVEL_GOALS = {
  1: {
    en: ["Explain why an LLM answers fluently but can be wrong, and how retrieval fixes that.", "Read tokens, context windows and embeddings as numbers you can inspect.", "Score similarity with cosine, and say when it differs from distance.", "Run a complete RAG pipeline from scratch and trace each answer to its source."],
    id: ["Menjelaskan mengapa LLM menjawab dengan lancar tetapi bisa salah, dan bagaimana retrieval memperbaikinya.", "Membaca token, jendela konteks, dan embedding sebagai angka yang bisa diperiksa.", "Menghitung kemiripan dengan cosine, dan tahu kapan hasilnya berbeda dari jarak.", "Menjalankan pipeline RAG lengkap dari nol dan menelusuri setiap jawaban ke sumbernya."],
  },
  2: {
    en: ["Clean extracted text so search can find it.", "Choose a chunking strategy and a chunk size by measuring, not guessing.", "Filter by metadata before searching, and explain what a vector index trades away.", "Fit sources into a token budget with numbered citations."],
    id: ["Membersihkan teks hasil ekstraksi agar bisa ditemukan pencarian.", "Memilih strategi chunking dan ukuran potongan dengan mengukur, bukan menebak.", "Menyaring dengan metadata sebelum mencari, dan menjelaskan apa yang dikorbankan indeks vektor.", "Memasukkan sumber ke dalam anggaran token dengan sitasi bernomor."],
  },
  3: {
    en: ["Compare keyword and vector search and combine them with rank fusion.", "Decide whether a re-ranker or query rewriting helps, by measuring it.", "Search small and answer big, and keep the context short and focused."],
    id: ["Membandingkan pencarian kata kunci dan vektor lalu menggabungkannya dengan rank fusion.", "Memutuskan apakah re-ranker atau penulisan ulang kueri membantu, dengan mengukurnya.", "Mencari yang kecil dan menjawab dengan yang besar, serta menjaga konteks tetap pendek dan fokus."],
  },
  4: {
    en: ["Build a test set for your own documents and score retrieval with recall, MRR and nDCG.", "Check answers claim by claim for faithfulness.", "Find the faulty stage of a broken pipeline and tune when to refuse.", "Defend against prompt injection and enforce access control in code."],
    id: ["Membuat set uji untuk dokumen Anda sendiri dan menilai retrieval dengan recall, MRR, dan nDCG.", "Memeriksa kesetiaan jawaban klaim demi klaim.", "Menemukan langkah yang rusak di pipeline dan menyetel kapan harus menolak.", "Bertahan dari prompt injection dan menegakkan kontrol akses di dalam kode."],
  },
  5: {
    en: ["Run RAG at scale, keep it fresh, and watch it in production.", "Handle tables, images, graphs and agents, and finish with a capstone on your own documents."],
    id: ["Menjalankan RAG dalam skala besar, menjaganya tetap mutakhir, dan memantaunya di produksi.", "Menangani tabel, gambar, graf, dan agen, lalu menutup dengan proyek akhir pada dokumen Anda sendiri."],
  },
};
