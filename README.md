# NalarNusa RAG Visual Lab — Phase 1

Learn retrieval-augmented generation (RAG) by watching it run, changing it, and reading the code behind it.

**Built so far: Levels 1 and 2 (lessons 1–12)**, in English and Bahasa Indonesia, plus:

- **Your own documents**: upload PDF, DOCX, TXT or Markdown in any lesson. Parsed in the browser; never uploaded.
- **Neural embeddings**: a multilingual sentence model (paraphrase-multilingual-MiniLM-L12-v2) running in a Web Worker.
  Opt-in per lesson (lessons 4, 6, 10, 12); ~120 MB downloaded once from Hugging Face, then cached by the browser.
- **Challenges and quizzes** in every lesson; progress is saved in the browser and lessons get a ✓ when complete.

| Level | Lessons |
| --- | --- |
| 1 Foundations | 1 LLMs & hallucination · 2 Closed vs open book · 3 Tokens & context window · 4 Embeddings · 5 Similarity · 6 First RAG pipeline |
| 2 Building blocks | 7 Loading & cleaning · 8 Chunking strategies · 9 Chunk size by measurement · 10 Metadata filtering · 11 Vector indexes · 12 Prompt budget & citations |

Phase 1 gate (from the project spec): *pilot with one class; pre/post quiz improves*. That part is yours.

## Run it

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm run build` | Static site in `dist/` |
| `npm run preview` | Serve the built site at http://localhost:4173 |
| `npm run golden` | Check that the Python in the Code tabs gives the same numbers as the visuals (18 cases) |

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
python/check_golden.py        golden test, Python side
scripts/golden.mjs            golden test, JavaScript side
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
| `variables(ctx)`, `python(ctx)` | Live values panel; `{ globals, call, compare? }` for "Run this Python in your browser" |
| `challenges` | `[{ id, text, check(ctx) }]`, ticked automatically when `check` passes |
| `quiz` | `[{ q, options, answer, why }]`, 80% to pass |
| `text`, `examples`, `defaultQuestion`, `questionLabel`, `runLabel` | Lesson content, all `{ en, id }` |

### Adding a lesson

1. Copy `src/lessons/06-rag-pipeline/` to `src/lessons/NN-name/`.
2. Write its stages and text; reuse toolkit components for the board where possible.
3. Write the Python twin with `# @stage` markers, and add cases to `scripts/golden.mjs`.
4. Register it in `src/lessons/index.js`. It lights up in the menu automatically.

### Rule: visual and code never drift

Where a lesson's Python is a twin of its JavaScript, `npm run golden` checks they agree (18 cases):
the RAG pipeline (`rag/core.js` ↔ lesson 6, 9 cases incl. Indonesian and out-of-scope questions),
the n-gram language model (`rag/ngram.js` ↔ lesson 1), BPE (`rag/bpe.js` ↔ lesson 3) and the vector index
(`rag/ann.js` ↔ lesson 11). Run it before every deploy.
In the app, "Run this Python in your browser" does the same check live for the learner's current settings.

## Known limits

- Lessons 2, 4, 8, 9, 10, 12 show read-only Python (it imports lesson 6's file or needs sentence-transformers).
- Lesson 9 uses the built-in handbook's test set; own documents need their own test set (lesson 19, Phase 2).
- Indonesian has no stemmer: "biayanya" does not match "biaya" with TF-IDF. Neural embeddings handle it.
- Monitor and live-value lines stay in technical English in both languages.
- First "Run Python" downloads ~15 MB; first neural run downloads ~120 MB. Both are cached afterwards.
- "Download .py" is blocked inside the claude.ai preview frame; it works on the deployed site.
