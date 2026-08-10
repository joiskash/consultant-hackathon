# FreshCase

Voice-first case interview practice, built live from today's news.

This repository is a TypeScript monorepo for the FreshCase project: an Express engine with the interview state machine (M2), a news-to-CasePack generator (M1), a React web UI with a voice interview client, a Postgres data store, Docker Compose for local development, and GitHub Actions for CI. The scorer (M4) and voice deploy layer (M3) are still in progress.

## Quick start

```bash
# 1. Install dependencies for the whole workspace
npm install

# 2. Configure environment variables
cp .env.example .env
# edit .env and add your real API keys

# 3. Build all packages
npm run build

# 4. Run unit tests
npm test

# 5. Run integration tests (requires a Postgres database)
DATABASE_URL=postgresql://... npm run integration

# 6. Start the full stack with Docker Compose
docker compose up --build
```

The web app is exposed on `http://localhost:5173`. Under Docker Compose the backend is not published to the host — the web app proxies `/api` and `/session` requests to the `backend` service internally (see `packages/web/vite.config.ts`).

## Repository layout

```
.
├── docs/                      # Design doc, specs, fixtures, references
├── packages/
│   ├── types/                 # Shared Zod schemas and TS types (M0)
│   ├── db/                    # Postgres client and migrations
│   ├── engine/                # Express API and interview state machine (M2)
│   ├── generator/             # News-to-CasePack generator pipeline (M1)
│   ├── scorer/                # Scoring/debrief stub (M4)
│   ├── voice/                 # ElevenLabs agent config, prompts, tools, deploy (M3)
│   └── web/                   # React + Vite frontend with voice interview client
├── .github/workflows/ci.yml   # PR CI: build, test, coverage, Docker
├── docker-compose.yml         # Postgres + backend + web
├── .env.example               # Secret and config template
└── package.json               # npm workspace configuration
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile all packages |
| `npm test` | Run unit tests across all packages |
| `npm run test:coverage` | Run unit tests with coverage reports |
| `npm run integration` | Run integration tests in `packages/engine` |
| `npm run dev` | Start Docker Compose (`docker compose up --build`) |

## Environment variables

Copy `.env.example` to `.env` and fill in the real values. These values are server-side only.

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — Postgres credentials for the Compose `db` service
- `DATABASE_URL` — Postgres connection string
- `CONTEXT_DEV_API_KEY` — context.dev API key (news headlines for the generator)
- `ELEVENLABS_API_KEY` — ElevenLabs API key (voice layer)
- `OPENROUTER_API_KEY` — OpenRouter API key used by the shared `callClaude` LLM entry point
- `LLM_MODEL` — model slug routed through OpenRouter (default `anthropic/claude-sonnet-4.5`)
- `PORT` — port the engine listens on (default `3000`)

Do not commit `.env` or any real keys.

## CI / GitHub Actions

Every PR and push to `main` triggers the workflow in `.github/workflows/ci.yml`:

1. Install dependencies
2. Build all packages
3. Run unit tests with coverage
4. Run integration tests against a Postgres service
5. Upload coverage artifacts
6. Build Docker images

Configure the required repository secrets under **Settings > Secrets and variables > Actions**:

- `CONTEXT_DEV_API_KEY`
- `ELEVENLABS_API_KEY`
- `OPENROUTER_API_KEY`

## Platform-risk spike findings

The M3 voice layer depends on three ElevenLabs Agents platform behaviours that
must be verified before the voice layer is wired end-to-end. Run the spike
script (`npx tsx packages/voice/scripts/spike.ts`, requires `ELEVENLABS_API_KEY`)
plus the manual playground checks, then fill in the blanks below.

> Status: **NOT YET RUN.** Fill in each result after a human runs the spike.

1. **Silence-timer control** — can native no-input reprompts be disabled or
   maxed out (so `report_silence` owns silence handling)?
   - Result: _______________________________________________
   - If insufficient: native reprompts must be treated as `check_in`-equivalent
     and the team must be flagged (changes the Guided/Realistic feel).

2. **Tool round-trip latency** — rough server-tool round-trip latency
   mid-conversation (webhook tool attached to a public URL).
   - Result: _______________________________________________

3. **Transcript event availability** — are per-utterance transcript events
   available live (client events), or only via the post-call webhook?
   - Result: _______________________________________________

Automated spike output to record (`agent_id`, `signed_url_ok`,
`conversations_endpoint_ok`, `cleanup_ok`):

- Result: _______________________________________________
