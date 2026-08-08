# FreshCase

Voice-first case interview practice, built live from today's news.

This repository contains the M0–M5 scaffold for the FreshCase project: a TypeScript monorepo with an Express engine, React web UI, Postgres data store, Docker Compose for local development, and GitHub Actions for CI.

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

The backend is exposed on `http://localhost:3000` and the web app on `http://localhost:5173`.

## Repository layout

```
.
├── docs/                      # Design doc, specs, fixtures, references
├── packages/
│   ├── types/                 # Shared Zod schemas and TS types (M0)
│   ├── db/                    # Postgres client and migrations
│   ├── engine/                # Express API and session state machine (M2)
│   ├── generator/             # Case pack generator stub (M1)
│   ├── scorer/                # Scoring/debrief stub (M4)
│   ├── voice/                 # ElevenLabs agent config stub (M3)
│   └── web/                   # React + Vite frontend
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

- `DATABASE_URL` — Postgres connection string
- `CONTEXT_DEV_API_KEY` — context.dev API key
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `ANTHROPIC_API_KEY` — Anthropic API key for `callClaude`

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
- `ANTHROPIC_API_KEY`
