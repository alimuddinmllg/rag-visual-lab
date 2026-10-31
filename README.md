# NalarNusa RAG Visual Lab — Phase 0

Learn retrieval-augmented generation (RAG) by watching it run, changing it, and reading the code behind it.
Phase 0 delivers the **lesson engine**, the **visual toolkit**, the **synced code view**, **English + Bahasa Indonesia**,
and **lesson 6 (Your first RAG pipeline)** rebuilt on top of them. Lessons 1–5 and 7–32 appear in the menu as "soon".

Phase 0 gate (from the project spec): *lesson 6 rebuilt on the engine, code synced* — met.

## Run it

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm run build` | Static site in `dist/` |
| `npm run preview` | Serve the built site at http://localhost:4173 |
| `npm run golden` | Check that the Python in the Code tab gives the same numbers as the visual |

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

A lesson is a plain object:

| Field | What it is |
| --- | --- |
| `stages` | `[{ id, label, desc, run(ctx) → partial ctx, log(ctx), live(ctx) }]`. `run` must be pure: the engine recomputes from the inputs every time. |
| `controls` | Sliders: `{ id, label, min, max, step, default, format?, maxFrom?(values) }` |
| `Board`, `DataPanel` | React components that draw `ctx` (use toolkit components) |
| `code` | `[{ id, label, source, runnable }]`. Mark stages in the source with `# @stage <id>` … `# @end` |
| `variables(ctx)` | `[[name, value]]` for the Live values panel |
| `python(ctx)` | `{ globals, call, compare(result) }` for "Run this Python in your browser" |
| `text`, `examples`, `documents`, `defaultDoc`, `defaultQuestion` | Lesson content, all `{ en, id }` |

### Adding a lesson

1. Copy `src/lessons/06-rag-pipeline/` to `src/lessons/NN-name/`.
2. Write its stages and text; reuse toolkit components for the board where possible.
3. Write the Python twin with `# @stage` markers, and add cases to `scripts/golden.mjs`.
4. Register it in `src/lessons/index.js`. It lights up in the menu automatically.

### Rule: visual and code never drift

`src/rag/core.js` and `rag_from_scratch.py` are line-for-line twins. `npm run golden` runs both on 9 cases
(English and Indonesian, small/large chunks, out-of-scope questions) and compares chunk counts, vocabulary,
top-k ids and scores, map coordinates, prompt and answer (tolerance 1e-6). Run it before every deploy.
In the app, "Run this Python in your browser" does the same check live for the learner's current settings.

## Known limits in Phase 0

- Embeddings are TF-IDF (word matching). Real neural embeddings and own-document upload are Phase 1.
- "Download .py" is blocked inside the claude.ai preview frame; it works on the deployed site.
- Monitor and live-value lines stay in technical English in both languages.
- The first "Run Python" downloads ~15 MB; later runs are instant.
