# Repository Guide

A file-by-file map of the repo: what every folder and file is, and what the code
inside it does.

> **State of the repo.** There are two codebases here:
>
> 1. **`server/` + `DB/` — the active v1 backend.** Python / FastAPI. This is what
>    CI, Docker Compose and all new work target.
> 2. **`archive/` — the original TypeScript monorepo scaffold.** Express + React +
>    Postgres, built as the M0–M5 hackathon scaffold. Retained for reference only:
>    it is no longer built, run, or tested.
>
> Both are documented below, clearly labelled.

---

## Full tree

```
consultant-hackathon/
├── DB/                              # [v1] research results store (text files)
│   └── .gitkeep                     #      keeps the empty dir in git
├── docs/
│   ├── design-doc-freshcase.md      # product design doc / pitch
│   ├── repo-guide.md                # this file
│   ├── fixtures/
│   │   └── saverite.json            # sample CasePack used as a fixture
│   ├── references/                  # source material (not code)
│   │   ├── Mock-Interview-Feedback-Form.docx
│   │   └── case-books/              # 9 consulting casebook PDFs/PPTX
│   └── specs/                       # milestone specs M0–M5
│       ├── M0-types-scaffold.md
│       ├── M1-generator.md
│       ├── M2-engine.md
│       ├── M3-voice.md
│       ├── M4-scorer.md
│       └── M5-glue-demo.md
├── archive/                         # [legacy] TypeScript monorepo, no longer built/run
│   ├── db/
│   │   ├── migrations/001_init.sql
│   │   ├── src/index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── engine/
│   │   ├── src/index.ts
│   │   ├── src/services/contextDev.ts
│   │   ├── src/services/elevenlabs.ts
│   │   ├── tests/{cases,health,secrets}.test.ts
│   │   ├── tests/integration/sessions.test.ts
│   │   ├── Dockerfile
│   │   ├── jest.config.js
│   │   ├── jest.integration.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── generator/                   # src/index.ts, tests/, config
│   ├── scorer/                      # src/index.ts, tests/, config
│   ├── types/
│   │   ├── src/{casePack,llm,index}.ts
│   │   ├── tests/{casePack,llm}.test.ts
│   │   └── config
│   ├── voice/                       # src/index.ts, tests/, config
│   └── web/
│       ├── src/{App.tsx,main.tsx,index.css,vite-env.d.ts}
│       ├── index.html
│       ├── Dockerfile
│       ├── vite.config.ts
│       └── tsconfig*.json
├── server/                          # [v1] Python FastAPI backend
│   ├── model.py                     #      Model class + CALL_LLM
│   ├── server.py                    #      FastAPI app, /listen, DB persistence
│   ├── conftest.py                  #      pytest path setup
│   ├── Dockerfile                   #      image built by docker-compose
│   ├── requirements.txt             #      pinned Python deps
│   ├── static/
│   │   └── index.html               #      frontend (topic box + results)
│   ├── tests/
│   │   ├── test_model.py            #      13 unit tests for Model
│   │   └── test_server.py           #      9 tests for endpoints + persistence
│   ├── certs/                       #      local TLS certs (gitignored)
│   └── .venv/                       #      virtualenv (gitignored)
├── .github/workflows/ci.yml         # CI: pytest + docker build (Python only)
├── docker-compose.yml               # single `server` service on :8000
├── .env.example                     # secret template
├── .dockerignore
├── .gitignore
├── README.md
└── tech-spec.md                     # v1 technical spec
```

---

## Part 1 — The v1 backend (`server/`, `DB/`)

The whole v1 flow is: **user types a topic → FastAPI `/listen` → `Model.CALL_LLM`
web-searches it → curated links come back → result is saved to `DB/`.**

### `server/model.py` (99 lines) — the LLM layer

**`DEFAULT_SYSTEM_PROMPT`** — a module-level constant that casts the model as a
search assistant for *a consultant preparing for case interviews*. It instructs
the model to find (a) live/recent topic updates and industry reports, (b) real
case studies, and (c) practice question banks — prioritizing McKinsey, BCG,
Bain, Deloitte, KPMG, PwC, EY and established case-prep sites — and to return
each resource as a URL plus a one-line description.

**`class Model`** — one object holding all LLM configuration as instance
variables, so multiple differently-configured models can coexist later:

| Attribute | Default | Purpose |
|-----------|---------|---------|
| `model_name` | `claude-sonnet-4-5-20250929` | which Claude model to call |
| `system_prompt` | `DEFAULT_SYSTEM_PROMPT` | persona/instructions |
| `max_tokens` | `4096` | response cap |
| `api_key` | `$ANTHROPIC_API_KEY` | falls back to the env var |
| `enable_web_search` | `True` | attach the web-search tool or not |
| `max_search_uses` | `5` | max searches per request |

The Anthropic client is only constructed when a key exists, so the server can
boot without one (requests then fail cleanly instead of crashing at startup).

**`Model.CALL_LLM(context: dict) -> dict`** — the single entry point to the LLM.
It takes a prompt/context JSON payload: `context["prompt"]` is the user message,
and any other keys are JSON-serialized and appended under a `Context:` heading
(so future callers can pass `phase`, `case_id`, etc. without changing the
signature). When `enable_web_search` is on it attaches Anthropic's server-side
`web_search_20250305` tool. It then walks the response blocks, joins all `text`
blocks into one string, and harvests URLs from both `web_search_tool_result`
blocks and text-block `citations`, deduplicating by URL. Returns
`{"text": str, "sources": [{"url", "title"}]}`.

### `server/server.py` (113 lines) — the HTTP layer

- **Startup:** `load_dotenv()` reads `.env`, then creates the FastAPI app and a
  **single module-level `Model` instance**, with `MODEL_NAME` / `SYSTEM_PROMPT`
  env vars able to override the defaults.
- **`DB_DIR`** points at `<repo>/DB`; **`STATIC_DIR`** at `server/static`.
- **`TOPIC_PROMPT`** — the per-request template that wraps the user's topic into
  the explicit three-part ask (live updates, case studies, question banks) and
  names the preferred firms.
- **Pydantic schemas** — `ListenRequest {text: str, min_length=1}`,
  `Source {url, title}`, `ListenResponse {reply, sources[], db_file}`. These
  produce automatic 422 validation errors and the OpenAPI docs at `/docs`.
- **`save_to_db(topic, result)`** — creates `DB/` if needed and writes
  `DB/<UTC timestamp>-<topic-slug>.txt`, containing a header (topic, ISO date,
  model name), the full response text, and a bulleted source list. The slug is
  the lowercased topic with non-alphanumerics collapsed to hyphens, capped at
  50 chars.
- **`GET /health`** — liveness check; returns the configured model name.
- **`POST /listen`** — the main endpoint. Trims the topic, formats it into
  `TOPIC_PROMPT`, calls `model.CALL_LLM(...)`, persists via `save_to_db`, and
  returns reply + sources + the saved file path. Any LLM failure becomes a
  `502` with the error detail (and nothing is written to `DB/`).
- **Static mount** — `app.mount("/", StaticFiles(..., html=True))` is registered
  **last**, so the API routes above it always win; everything else falls through
  to the frontend.
- **`__main__`** — runs uvicorn on `PORT` (default 8000) with `reload=True`, and
  serves **HTTPS** when `SSL_KEYFILE` / `SSL_CERTFILE` are set.

### `server/static/index.html` — the frontend

A single self-contained page (no build step, no framework, no CORS since it's
served from the same origin). A `<textarea>` takes the topic/full details; on
submit the inline script `fetch`es `POST /listen`, disables the button and shows
"Searching…", then renders the reply text, the sources as clickable links
(`target="_blank"`, `rel="noopener noreferrer"`), and the `DB/` path where the
result was saved. Backend errors — including the 422 validation array and 502
detail string — are surfaced inline in red.

### `server/tests/` — 22 unit tests

Run with `cd server && .venv/bin/python -m pytest tests/ -q`. **No API key
required**: `CALL_LLM` is monkeypatched at the server level, and the model tests
inject a fake Anthropic client. `DB_DIR` is redirected to pytest's `tmp_path`, so
tests never touch the real `DB/`.

**`test_model.py` (13 tests)** — instance defaults; that the system prompt really
does mention consultant / case interview / McKinsey / Deloitte / KPMG;
constructor overrides; API key picked up from the environment; `RuntimeError`
when no key is set; that model/system/max_tokens/messages are passed through
correctly; extra context keys serialized as JSON; the web-search tool attached
when enabled and omitted when disabled; multiple text blocks joined; sources
collected from both search results and citations; source dedup; and blocks
without URLs ignored.

**`test_server.py` (9 tests)** — `/health`; the frontend page is served at `/`;
`/listen` returns reply + sources + db_file; the topic actually reaches the
prompt passed to `CALL_LLM`; whitespace trimming; the DB file is written with the
right contents; filename slugification; empty text and missing field both 422
(and never call the LLM); and LLM failure gives 502 with no DB file written.

### `server/conftest.py`

Four lines that insert `server/` onto `sys.path` so tests can `import server`
and `import model` regardless of where pytest is invoked from.

### `server/requirements.txt`

Pinned: `fastapi==0.141.1`, `uvicorn[standard]==0.52.1`, `anthropic==0.121.0`,
`python-dotenv==1.2.2`, plus dev dep `pytest==9.1.1`.

### `server/certs/` and `server/.venv/` (both gitignored)

A self-signed `localhost` cert/key pair for local HTTPS, and the virtualenv.
Regenerate the cert with the `openssl` command in `tech-spec.md`.

### `DB/`

The local research store. Every `/listen` call drops one human-readable `.txt`
file here. Only `.gitkeep` is committed — the contents are gitignored via
`DB/*` + `!DB/.gitkeep`. Results pulled from context.dev are planned to land
here too.

---

## Part 2 — The legacy TypeScript scaffold (`archive/`)

An npm-workspaces monorepo. Root `package.json` builds the packages in
dependency order (`types` → `db` → `generator`/`scorer`/`voice` → `engine` →
`web`). None of it is used by the v1 Python flow.

### `archive/packages/types` — shared contracts

- **`src/casePack.ts`** — the central Zod schema for a case. `CasePackSchema`
  composes `meta` (attribution, source URLs, company, industry, case type,
  qualitative/quantitative difficulty), `prompt`, a `clarifying_ledger`, a
  `framework_rubric` (expected/acceptable/avoid buckets + great-candidate
  signals), a verbal `quant_module` with worked solution and follow-up data
  drop, a `hidden_insight` with a kicker, a `brainstorm_module`, and a
  `recommendation_key`. Exports the inferred `CasePack` TS type.
- **`src/llm.ts`** — `callClaude(prompt, schema)`: the TS equivalent of
  `CALL_LLM`. Reads `ANTHROPIC_API_KEY`, POSTs to the Anthropic messages API,
  parses the reply as JSON and validates it against a Zod schema.
- **`src/index.ts`** — re-exports both modules.
- **`tests/`** — validates the SaveRite fixture against the schema (and that a
  missing `brainstorm_module` fails), plus `callClaude` guards.

### `archive/packages/db` — Postgres access

- **`src/index.ts`** — `getPool()` (throws if `DATABASE_URL` is unset),
  `migrate(pool)` (executes the SQL file), `healthCheck(pool)` (`SELECT 1`).
- **`migrations/001_init.sql`** — enables `pgcrypto` and creates a `sessions`
  table: UUID PK, created/updated timestamps, `mode`, `case_pack_id`, and a
  `phase` defaulting to `'menu'`.

### `archive/packages/engine` — the Express API

- **`src/index.ts`** — loads `.env` from the repo root, parses the SaveRite
  fixture through `CasePackSchema` at startup, and exposes `GET /health`
  (`ok`/`degraded` based on Postgres), `GET /api/cases` (the case menu),
  `POST /api/sessions` (insert, returns the new UUID), and
  `GET /api/sessions/:id` (404 when absent). Runs `migrate()` on boot and
  always closes the pool in `finally`.
- **`src/services/contextDev.ts` / `elevenlabs.ts`** — tiny config guards that
  read their API keys from the environment and throw a clear error when missing.
- **`tests/`** — Supertest suites for health, cases and secret guards, plus an
  integration test that creates and fetches a real session when `DATABASE_URL`
  is set (separate `jest.integration.js` config).

### `archive/packages/generator`, `archive/packages/scorer`, `archive/packages/voice` — stubs

- **generator** — `scoreCaseability(input)` is implemented as a trivial
  heuristic (+1 for a headline, +1 for a source URL, with reasons);
  `generateCasePack()` intentionally throws "not implemented".
- **scorer** — `computeVoiceMetrics()` returns zeroed talk-time/silence-gap
  metrics; `scoreCase()` throws "not implemented".
- **voice** — `getAgentConfig(mode)` returns the interviewer persona for
  `guided` (supportive, in-the-moment corrections) vs `realistic`
  (professionally cold, hints only when stuck), sharing one welcome message.

### `archive/packages/web` — the React frontend

`src/App.tsx` fetches `GET /api/cases` from `VITE_API_URL` (default
`http://localhost:3000`) and lists company + case type, with basic error state.
`main.tsx` mounts it; `index.html`/`vite.config.ts`/`Dockerfile` are the usual
Vite plumbing. **Note:** this is the *old* frontend — the v1 UI is
`server/static/index.html`.

---

## Part 3 — Root-level config

| File | What it does |
|------|--------------|
| `README.md` | Project overview and quick start for the Python/FastAPI backend |
| `tech-spec.md` | **v1 spec** — the Python/FastAPI backend, `/listen`, `Model`, `DB/`, TLS |
| `.env.example` | Template: `ANTHROPIC_API_KEY`, plus optional `MODEL_NAME`, `SYSTEM_PROMPT`, `PORT`, TLS paths |
| `.gitignore` | `.env`, Python artifacts (`server/.venv/`, `server/certs/`, `__pycache__/`, `.pytest_cache/`), `DB/*` except `.gitkeep`, and leftover Node artifacts |
| `.dockerignore` | Keeps `archive/`, `DB/`, the virtualenv, certs and secrets out of the image |
| `docker-compose.yml` | One `server` service built from `server/Dockerfile` on :8000, with `./DB` bind-mounted for persistence |
| `.github/workflows/ci.yml` | On push/PR to `main`: `test` job (Python 3.12 + `pytest tests/`) and `docker` job (`docker compose build`) |

The npm workspace config (`package.json`, `package-lock.json`, `.nvmrc`) moved
into `archive/` along with the TypeScript sources; no root config references it.

### `docs/`

- **`design-doc-freshcase.md`** — the product pitch and rationale: generate a
  casebook-quality mock case from *today's* news, run it as a spoken interview,
  end with evidence-backed coaching. Explains why context.dev (live data),
  ElevenLabs (voice) and Devin (build) are structural to the idea, plus the
  competitive wedge ("unmemorizable by construction").
- **`specs/M0`–`M5`** — the milestone specs the TS scaffold was built against:
  types/scaffold, generator, engine state machine, voice layer, scorer, and the
  glue/demo milestone.
- **`fixtures/saverite.json`** — a complete `CasePack` used by the engine and
  the schema tests.
- **`references/`** — nine consulting casebooks (Columbia, Darden, Fuqua, Stern,
  Michigan, IESE, …) and a mock-interview feedback form. Source material, not
  code.

---

## Known gaps

- `/listen` has no end-to-end verification against the real Anthropic API yet
  (needs `ANTHROPIC_API_KEY` in `.env`); everything else is covered by the
  22 mocked tests.
- context.dev ingestion into `DB/` is planned but not implemented.
- The archived TypeScript code is preserved but unmaintained. Its npm workspace
  root now lives at `archive/package.json`, so building it would mean running
  npm from inside `archive/`.
