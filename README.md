# NalarNusa RAG Visual Lab — Phase 2

Learn retrieval-augmented generation (RAG) by watching it run, changing it, and reading the code behind it.

**Built so far: Levels 1–4 (lessons 1–24)**, in English and Bahasa Indonesia, plus:

- **Your own documents**: upload PDF, DOCX, TXT or Markdown in any lesson. Parsed in the browser; never uploaded.
- **Neural embeddings**: a multilingual sentence model (paraphrase-multilingual-MiniLM-L12-v2) running in a Web Worker.
  Opt-in per lesson (lessons 4, 6, 10, 12); ~120 MB downloaded once from Hugging Face, then cached by the browser.
- **Challenges and quizzes** in every lesson; progress is saved in the browser and lessons get a ✓ when complete.
- **Optional real LLM** (header button): any OpenAI-compatible endpoint, e.g. Ollama on your own computer
  (base URL `http://localhost:11434/v1`; the LLM panel has step-by-step setup for Windows, macOS and Linux,
  allowing only the lab's own address). Used in lessons 6, 16, 18, 19, 21, 24.
  Settings and key stay in the browser; requests go straight from the browser to that endpoint.
- **Your own test sets** (lesson 19), saved per document and used by lessons 14–23.
- **Code in every lesson, two ways**: a from-scratch Python file that runs in the browser (Pyodide) and is checked
  against the visual, and a "with libraries" file (sentence-transformers, LangChain, LlamaIndex, Chroma, FAISS,
  rank_bm25, ranx, an OpenAI-compatible client) to run on your own computer.
- **Every lesson** has at least 3 experiments, 3 challenges and 3 quiz questions, in both languages.

| Level | Lessons |
| --- | --- |
| 1 Foundations | 1 LLMs & hallucination · 2 Closed vs open book · 3 Tokens & context window · 4 Embeddings · 5 Similarity · 6 First RAG pipeline |
| 2 Building blocks | 7 Loading & cleaning · 8 Chunking strategies · 9 Chunk size by measurement · 10 Metadata filtering · 11 Vector indexes · 12 Prompt budget & citations |
| 3 Better retrieval | 13 BM25 vs vector · 14 Hybrid search & RRF · 15 Re-ranking · 16 Query rewriting, multi-query, HyDE · 17 Small-to-big · 18 Lost in the middle & compression |
| 4 Evaluation & reliability | 19 Building a test set · 20 Retrieval metrics · 21 Faithfulness · 22 Failure clinic · 23 Refusal tuning · 24 Prompt injection & access control |

Gates still open: the Phase 1 class pilot (pre/post quiz) and the Phase 2 public-launch check.

## Run it

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm run build` | Static site in `dist/` |
| `npm run preview` | Serve the built site at http://localhost:4173 |
| `npm run golden` | Check that the Python in the Code tabs gives the same numbers as the visuals (38 cases + all 24 lessons in both languages) |
| `npm run pylessons` | Only the second part: run every lesson's Python with its default settings and compare with the lesson |

`npm run golden` needs Python 3 with numpy (`pip install numpy`). It finds `python3`, `python` or `py` automatically.

## Deploy (Cloudflare Pages, free, commercial use allowed)

1. Push this folder to a GitHub repository.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION` = `20`.
4. Project → **Custom domains** → add `lab.nalarnusa.com` *first*, then create the DNS record:
   CNAME `lab` → `<project>.pages.dev` (Cloudflare adds it for you if the domain's DNS is on Cloudflare).
5. Every push to `main` deploys. Run `npm run golden` before pushing.

No server, database or API key is needed. Everything runs in the learner's browser.

## How it fits together

```
src/
  rag/core.js                 RAG functions (chunk, embed, PCA map, retrieve, generate). No UI.
  rag/stopwords.json          shared by JavaScript and Python
  documents/nusabot.js        sample handbook, English + Indonesian (fictional)
  engine/
    useLessonRunner.js        runs a lesson's stages: play / pause / step / reset / speed, monitor log
    LessonView.jsx            the standard lesson screen, built from a lesson config
    registry.js               all 32 lessons and 5 levels (titles in EN + ID)
  toolkit/
    basics.jsx                stage bar + player, lesson list, tabs, sliders, monitor, prose renderer
    DocumentSpace.jsx         the 2D embedding map board (dots, query star, retrieval lines)
    TextPanels.jsx            chunk list, answer + prompt panel
    CodeView.jsx              code with stage-synced highlighting, live values, copy/download, run Python
    pyodide.js                loads Python + numpy in the browser on first use (~15 MB, from jsDelivr)
  lessons/
    index.js                  which lessons are built
    06-rag-pipeline/
      index.jsx               lesson config: stages, controls, board, panels, variables, Python hook
      content.js              lesson text in EN + ID
      rag_from_scratch.py     the Python shown in the Code tab (twin of rag/core.js)
      rag_with_libraries.py   the same pipeline with sentence-transformers + Ollama (read-only)
    NN-name/with_libraries.py every lesson: the same idea with common libraries (read-only)
    prelude.js                earlier lessons' Python, loaded before a lesson's own file in the browser
python/check_golden.py        golden test, Python side
scripts/golden.mjs            golden test, JavaScript side
scripts/python-lessons.mjs    runs every lesson's Python file through the lesson's own compare()
```

### The lesson contract

A lesson is a plain object (see any folder in `src/lessons/`):

| Field | What it is |
| --- | --- |
| `n` | Lesson number (matches `engine/registry.js`) |
| `stages` | `[{ id, label, desc, run(ctx) → partial ctx, log(ctx), live(ctx) }]`. `run` must be pure: the engine recomputes from the inputs every time. |
| `inputs` | `{ document?: true, question?: true }`: show the document picker (with upload) and/or the question box |
| `controls` | Sliders `{ id, label, min, max, step, default, format?, maxFrom? }` or selects `{ type: "select", options }` |
| `extraValues`, `ControlsExtra` | Extra input values and a custom control component (gets `setValue`) |
| `useExtra(inputs)` | Optional React hook returning a **memoised** object merged into inputs (used for neural vectors) |
| `Board`, `DataPanel?` | React components that draw `ctx` (use toolkit components) |
| `code` | `[{ id, label, source, runnable, note? }]`. Mark stages in the source with `# @stage <id>` … `# @end` |
| `variables(ctx)`, `python(ctx)` | Live values panel; `{ prelude?, globals, call, compare? }` for "Run this Python in your browser". `prelude` = earlier lessons' files (`prelude("rag", "bm25")` from `lessons/prelude.js`); their `from x import …` lines are removed before running. `compare` returns true/false, or is `null` for output only |
| `challenges` | `[{ id, text, check(ctx) }]`, ticked automatically when `check` passes |
| `quiz` | `[{ q, options, answer, why }]`, 80% to pass |
| `text`, `examples`, `defaultQuestion`, `questionLabel`, `runLabel` | Lesson content, all `{ en, id }` |

### Adding a lesson

1. Copy `src/lessons/06-rag-pipeline/` to `src/lessons/NN-name/`.
2. Write its stages and text; reuse toolkit components for the board where possible.
3. Write the Python twin with `# @stage` markers and a `demo(...)` function, add `python(ctx)` with a `compare`,
   and add a `with_libraries.py`. `npm run pylessons NN` checks it.
4. Register it in `src/lessons/index.js`. It lights up in the menu automatically.

### Rule: visual and code never drift

Where a lesson's Python is a twin of its JavaScript, `npm run golden` checks they agree (38 cases):
the RAG pipeline (`rag/core.js` ↔ lesson 6), the n-gram language model (`rag/ngram.js` ↔ lesson 1),
BPE (`rag/bpe.js` ↔ lesson 3), the vector index (`rag/ann.js` ↔ lesson 11), and BM25 ranking, RRF and the
retrieval metrics (`rag/retrieval.js` ↔ lessons 13, 14, 20) on all 20 built-in test questions.
It then runs the from-scratch Python of all 24 lessons in both languages through each lesson's own `compare()`
(48 runs). Run it before every deploy.

### Honest findings built into the lessons

The lessons report what the measurements show, including when a technique doesn't help on this data:
on the built-in handbook BM25, TF-IDF and their hybrid score the same (they fail on the same questions);
the simple re-ranker in lesson 15 can make hit@1 worse; multi-query lifts paraphrased questions a lot.
Neural embeddings change several of these results; learners can switch and measure.
In the app, "Run this Python in your browser" does the same check live for the learner's current settings.

## Known limits

- The "with libraries" files are read-only in the browser: they need packages or a model server on your computer.
- The from-scratch Python of lessons 16, 18, 19, 21 and 24 covers the simulated parts; the real-LLM parts are in their "with libraries" files.
- Lesson 24's vulnerable model is simulated; connect a real LLM to test a real one.
- Calling an LLM from the browser needs the endpoint to allow it (CORS) and, in Chrome, the local-network permission. See the LLM panel.
- Lesson 9 uses the built-in handbook's test set; own documents need their own test set (lesson 19, Phase 2).
- Indonesian has no stemmer: "biayanya" does not match "biaya" with TF-IDF. Neural embeddings handle it.
- Monitor and live-value lines stay in technical English in both languages.
- First "Run Python" downloads ~15 MB; first neural run downloads ~120 MB. Both are cached afterwards.
- "Download .py" is blocked inside the claude.ai preview frame; it works on the deployed site.
