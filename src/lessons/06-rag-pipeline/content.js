// Lesson 6 text, English and Indonesian.

export const overview = {
  en: [
    { p: "**Retrieval-augmented generation (RAG)** lets a language model answer from your documents instead of from memory alone. Before the model writes anything, the system finds the most relevant passages and pastes them into the prompt." },
    { h: "Reading the board" },
    { ul: [
      "Each **dot** is one chunk of the NusaBot Lab handbook. Its colour shows the handbook section it came from.",
      "Dots close together use similar words.",
      "The **star** is your question, placed in the same space.",
      "**Lines** join the question to the chunks it retrieved. The number on each line is the similarity score: 0 means nothing shared, 1 means identical.",
    ] },
    { h: "In this lesson you will" },
    { ol: [
      "Press **Play** and watch the five steps run, or press **Step** to go one at a time.",
      "Open the **Code** tab under the board: the lines for each step light up as it runs.",
      "Move the sliders and see what changes on the board and in the answer.",
      "Find a question that makes retrieval fail.",
    ] },
  ],
  id: [
    { p: "**Retrieval-augmented generation (RAG)** membuat model bahasa menjawab dari dokumen Anda, bukan hanya dari ingatannya. Sebelum model menulis jawaban, sistem mencari bagian dokumen yang paling relevan lalu menempelkannya ke dalam prompt." },
    { h: "Membaca papan" },
    { ul: [
      "Setiap **titik** adalah satu potongan (chunk) dari buku panduan NusaBot Lab. Warnanya menunjukkan bagian buku asalnya.",
      "Titik yang berdekatan memakai kata-kata yang mirip.",
      "**Bintang** adalah pertanyaan Anda, ditempatkan di ruang yang sama.",
      "**Garis** menghubungkan pertanyaan dengan potongan yang diambil. Angka di garis adalah skor kemiripan: 0 berarti tidak ada kata yang sama, 1 berarti identik.",
    ] },
    { h: "Dalam pelajaran ini Anda akan" },
    { ol: [
      "Tekan **Putar** dan lihat lima langkah berjalan, atau tekan **Langkah** untuk maju satu per satu.",
      "Buka tab **Kode** di bawah papan: baris kode setiap langkah menyala saat langkah itu berjalan.",
      "Geser slider dan lihat apa yang berubah di papan dan di jawaban.",
      "Temukan pertanyaan yang membuat retrieval gagal.",
    ] },
  ],
};

export const examples = {
  en: [
    "How much does PLA printing cost?",
    "Can I borrow the oscilloscope?",
    "When is the lab open on Saturday?",
    "What happens if I return equipment late?",
    "Who is the lab coordinator?",
    "What is the price of PLA printing?",
    "What is the capital of France?",
  ],
  id: [
    "Berapa biaya cetak PLA?",
    "Apakah saya boleh meminjam osiloskop?",
    "Kapan lab buka hari Sabtu?",
    "Apa yang terjadi jika saya terlambat mengembalikan alat?",
    "Siapa koordinator lab?",
    "Berapa harga cetak PLA?",
    "Apa ibu kota Prancis?",
  ],
};

export const experiments = {
  en: [
    { h: "Experiments" },
    { exp: ["Ask something the handbook doesn't cover", "Try \"What is the capital of France?\". No chunk shares a word with it, so every score is 0 and the model is told to say it doesn't know."] },
    { exp: ["Make chunks tiny", "Set chunk size to 15. The number of dots jumps and sentences get cut in half, so a price can end up in a different chunk from the thing it prices."] },
    { exp: ["Make chunks huge", "Set chunk size to 120. Chunks start mixing two sections (shown in red as \"A + B\") and the prompt gets much longer."] },
    { exp: ["Swap a word for a synonym", "Compare \"How much does PLA printing cost?\" with \"What is the price of PLA printing?\". The handbook never says \"price\", so that word matches nothing and the top score drops from 0.46 to 0.38. A neural embedding model would treat price and cost as close."] },
    { exp: ["Raise top-k to 8", "Low-scoring chunks join the prompt. In a real system that extra text can distract the model."] },
    { exp: ["Switch the embedding to Neural", "Ask \"What is the price of PLA printing?\" again. The neural model understands that price and cost mean the same thing. Notice that neural scores are higher across the board, so a minimum similarity of 0.1 no longer filters anything: raise it to about 0.4."] },
    { exp: ["Use your own document", "Upload a PDF or Word file in Try it yourself and ask it a question. Each PDF page becomes a section colour on the map."] },
  ],
  id: [
    { h: "Eksperimen" },
    { exp: ["Tanyakan hal yang tidak ada di buku panduan", "Coba \"Apa ibu kota Prancis?\". Tidak ada potongan yang memuat kata-kata itu, jadi semua skor 0 dan model diminta menjawab tidak tahu."] },
    { exp: ["Buat potongan sangat kecil", "Atur ukuran potongan ke 15. Jumlah titik melonjak dan kalimat terpotong di tengah, sehingga harga bisa terpisah dari barang yang dihargai."] },
    { exp: ["Buat potongan sangat besar", "Atur ukuran potongan ke 120. Potongan mulai mencampur dua bagian (ditandai merah \"A + B\") dan prompt menjadi jauh lebih panjang."] },
    { exp: ["Ganti kata dengan sinonim", "Bandingkan \"Berapa biaya cetak PLA?\" dengan \"Berapa harga cetak PLA?\". Buku panduan tidak pernah memakai kata \"harga\", jadi kata itu tidak cocok dengan apa pun dan skor tertinggi turun. Model embedding neural akan menganggap harga dan biaya berdekatan."] },
    { exp: ["Naikkan top-k ke 8", "Potongan berskor rendah ikut masuk ke prompt. Di sistem nyata, teks tambahan ini bisa mengganggu model."] },
    { exp: ["Ganti embedding ke Neural", "Tanyakan lagi \"Berapa harga cetak PLA?\". Model neural memahami bahwa harga dan biaya bermakna sama. Perhatikan bahwa skor neural lebih tinggi secara umum, jadi kemiripan minimum 0,1 tidak lagi menyaring apa pun: naikkan ke sekitar 0,4."] },
    { exp: ["Pakai dokumen Anda sendiri", "Unggah file PDF atau Word di Coba sendiri lalu ajukan pertanyaan. Setiap halaman PDF menjadi satu warna bagian di peta."] },
  ],
};

export const specs = {
  en: [
    { h: "Controls" },
    { dl: [
      ["Chunk size", "How many words go into each chunk. Small chunks are precise but lose context; big chunks keep context but blur topics together."],
      ["Overlap", "How many words each chunk repeats from the one before, so a sentence cut at a boundary still appears whole somewhere."],
      ["Top-k", "How many of the highest-scoring chunks are pasted into the prompt."],
      ["Min similarity", "Chunks scoring below this are treated as irrelevant (dashed lines). If none pass, the answer is \"I don't know\"."],
    ] },
    { h: "How this lesson simplifies real RAG" },
    { ul: [
      "**Embeddings:** TF-IDF word vectors computed in your browser. Real systems use a neural embedding model that captures meaning, not just shared words. The \"With libraries\" code shows one.",
      "**The map:** vectors have hundreds of dimensions. The board squashes them to 2D with PCA, so two dots can look close and still score low. Trust the scores over the distances.",
      "**Generation:** the answer is built by picking sentences, not by an LLM, so you can see where every word came from.",
      "**Same numbers everywhere:** the Python in the Code tab and the JavaScript behind the board are tested to give identical results.",
    ] },
  ],
  id: [
    { h: "Kontrol" },
    { dl: [
      ["Ukuran potongan", "Berapa kata dalam setiap potongan. Potongan kecil lebih tepat tetapi kehilangan konteks; potongan besar menjaga konteks tetapi mencampur topik."],
      ["Overlap", "Berapa kata yang diulang dari potongan sebelumnya, agar kalimat yang terpotong di batas tetap muncul utuh di salah satu potongan."],
      ["Top-k", "Berapa potongan dengan skor tertinggi yang dimasukkan ke prompt."],
      ["Kemiripan minimum", "Potongan dengan skor di bawah nilai ini dianggap tidak relevan (garis putus-putus). Jika tidak ada yang lolos, jawabannya \"tidak tahu\"."],
    ] },
    { h: "Penyederhanaan dibanding RAG sungguhan" },
    { ul: [
      "**Embedding:** vektor kata TF-IDF yang dihitung di browser Anda. Sistem sungguhan memakai model embedding neural yang menangkap makna, bukan sekadar kata yang sama. Kode \"Dengan pustaka\" menunjukkan caranya.",
      "**Peta:** vektor punya ratusan dimensi. Papan memampatkannya ke 2D dengan PCA, sehingga dua titik bisa tampak dekat tetapi skornya rendah. Percayai skor, bukan jarak di peta.",
      "**Generasi:** jawaban disusun dengan memilih kalimat, bukan oleh LLM, sehingga Anda bisa melihat asal setiap kata.",
      "**Angka yang sama di mana-mana:** Python di tab Kode dan JavaScript di balik papan diuji agar memberi hasil yang identik.",
    ] },
  ],
};

export const ui = {
  pipelineIntro: { en: "Click a step to see its code. The highlighted card is the step that just ran.", id: "Klik sebuah langkah untuk melihat kodenya. Kartu yang disorot adalah langkah yang baru berjalan." },
  board: {
    title: { en: "Document space", id: "Ruang dokumen" },
    sub: { en: (n, d) => `${n} chunks · ${d}-dim vectors shown in 2D`, id: (n, d) => `${n} potongan · vektor ${d} dimensi ditampilkan dalam 2D` },
    aria: { en: "2D map of document chunks and the question", id: "Peta 2D potongan dokumen dan pertanyaan" },
    empty: { en: "Press Play or Step to start", id: "Tekan Putar atau Langkah untuk mulai" },
    question: { en: "your question", id: "pertanyaan Anda" },
    noMatch: { en: "No word in the question appears in the document", id: "Tidak ada kata dalam pertanyaan yang muncul di dokumen" },
  },
  chunks: { en: "Chunks", id: "Potongan" },
  answer: {
    title: { en: "Answer", id: "Jawaban" },
    sub: { en: "simulated generator", id: "generator simulasi" },
    waiting: { en: "Waiting for the Generate step…", id: "Menunggu langkah Generate…" },
    note: { en: "No LLM is called here. The answer is built from the best-matching sentences in the retrieved chunks, with citations, so you can see where every word came from.", id: "Tidak ada LLM yang dipanggil di sini. Jawaban disusun dari kalimat yang paling cocok di potongan yang diambil, lengkap dengan sitasi, sehingga Anda bisa melihat asal setiap kata." },
    prompt: { en: "Prompt sent to the model", id: "Prompt yang dikirim ke model" },
  },
  tabs: {
    overview: { en: "Overview", id: "Ikhtisar" },
    pipeline: { en: "Pipeline", id: "Pipeline" },
    examples: { en: "Examples", id: "Contoh" },
    specs: { en: "Specs", id: "Spesifikasi" },
  },
  askHandbook: { en: "Ask the handbook", id: "Tanya buku panduan" },
};

export const challenges = [
  { id: "fail", text: { en: "Make retrieval fail: ask a question the document can't answer, so the answer is \"I don't know\".", id: "Buat retrieval gagal: tanyakan hal yang tidak bisa dijawab dokumen, sampai jawabannya \"tidak tahu\"." },
    check: (c) => c.answer && !c.answer.grounded && (c.inputs.question || "").length > 3 },
  { id: "tiny", text: { en: "Still get a grounded answer with chunk size 20 or smaller.", id: "Tetap dapatkan jawaban berdasar dokumen dengan ukuran potongan 20 atau lebih kecil." },
    check: (c) => c.answer?.grounded && c.inputs.size <= 20 },
  { id: "noise", text: { en: "Set top-k to 8 and find a question where at least one retrieved chunk falls below the minimum similarity (a dashed line).", id: "Atur top-k ke 8 dan temukan pertanyaan yang membuat setidaknya satu potongan di bawah kemiripan minimum (garis putus-putus)." },
    check: (c) => c.top?.length >= 8 && c.top.some((t) => t.s < c.inputs.minSim) },
  { id: "own", text: { en: "Upload your own document and get a grounded answer from it.", id: "Unggah dokumen Anda sendiri dan dapatkan jawaban berdasar dokumen itu." },
    check: (c) => c.inputs.doc.user && c.answer?.grounded },
];

export const quiz = [
  { q: { en: "In RAG, what is fetched before the model writes an answer?", id: "Dalam RAG, apa yang diambil sebelum model menulis jawaban?" },
    options: [
      { en: "New model weights", id: "Bobot model yang baru" },
      { en: "The most relevant chunks of your documents", id: "Potongan dokumen Anda yang paling relevan" },
      { en: "The model's previous answers", id: "Jawaban model sebelumnya" },
      { en: "A random sample of the internet", id: "Sampel acak dari internet" },
    ], answer: 1,
    why: { en: "Retrieval finds the chunks closest to the question and pastes them into the prompt. The model itself does not change.", id: "Retrieval mencari potongan yang paling dekat dengan pertanyaan lalu menempelkannya ke prompt. Modelnya sendiri tidak berubah." } },
  { q: { en: "Why is the question turned into a vector the same way as the chunks?", id: "Mengapa pertanyaan diubah menjadi vektor dengan cara yang sama seperti potongan?" },
    options: [
      { en: "So it can be stored in the database", id: "Agar bisa disimpan di database" },
      { en: "So question and chunks live in the same space and can be compared", id: "Agar pertanyaan dan potongan berada di ruang yang sama dan bisa dibandingkan" },
      { en: "To make the question shorter", id: "Agar pertanyaan lebih pendek" },
      { en: "To translate it into English", id: "Untuk menerjemahkannya ke bahasa Inggris" },
    ], answer: 1,
    why: { en: "Similarity only makes sense between vectors built the same way, with the same vocabulary or model.", id: "Kemiripan hanya bermakna antara vektor yang dibuat dengan cara yang sama, dengan kosakata atau model yang sama." } },
  { q: { en: "What usually goes wrong when chunks are very small?", id: "Apa yang biasanya salah jika potongan sangat kecil?" },
    options: [
      { en: "The prompt becomes too long", id: "Prompt menjadi terlalu panjang" },
      { en: "Sentences are cut apart, so a fact loses its context", id: "Kalimat terpotong, sehingga fakta kehilangan konteksnya" },
      { en: "Retrieval becomes slower than the LLM", id: "Retrieval menjadi lebih lambat dari LLM" },
      { en: "Nothing: smaller is always better", id: "Tidak ada: lebih kecil selalu lebih baik" },
    ], answer: 1,
    why: { en: "A price can land in one chunk and the item it prices in another. Overlap reduces this.", id: "Harga bisa berada di satu potongan dan barangnya di potongan lain. Overlap mengurangi masalah ini." } },
  { q: { en: "What is the minimum similarity threshold for?", id: "Untuk apa ambang kemiripan minimum?" },
    options: [
      { en: "To keep irrelevant chunks out of the prompt, so the model can say \"I don't know\"", id: "Agar potongan yang tidak relevan tidak masuk prompt, sehingga model bisa menjawab \"tidak tahu\"" },
      { en: "To make the map look nicer", id: "Agar peta terlihat lebih rapi" },
      { en: "To limit how many words a chunk has", id: "Untuk membatasi jumlah kata dalam potongan" },
      { en: "To speed up the embedding step", id: "Untuk mempercepat langkah embedding" },
    ], answer: 0,
    why: { en: "Without it, top-k always returns something, even when nothing in the document is related.", id: "Tanpa ambang ini, top-k selalu mengembalikan sesuatu, walaupun tidak ada yang terkait di dokumen." } },
];
