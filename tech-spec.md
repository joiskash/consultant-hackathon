# FreshCase — Technical Specification

## Stack

- **Runtime:** Node.js 20
- **Language:** TypeScript 5.5
- **Package manager:** npm workspaces
- **Web framework:** React 18 + Vite 5
- **Backend:** Express 4
- **Database:** PostgreSQL 16, accessed via `pg`
- **Validation / types:** Zod
- **Testing:** Jest + ts-jest, Supertest for API tests
- **Containers:** Docker, Docker Compose
- **CI/CD:** GitHub Actions

## Monorepo layout

The repo uses npm workspaces. Each package under `packages/` is versioned independently but built in dependency order at the root.

| Package | Responsibility | Depends on |
|---------|----------------|------------|
| `packages/types` | Shared Zod schemas, TypeScript types, and the central `callClaude` LLM helper | — |
| `packages/db` | Postgres connection, migrations | — |
| `packages/generator` | News story intake and case-pack generation stubs | `types` |
| `packages/engine` | Express HTTP API, session state machine, live-fetch and secret wrappers | `types`, `db` |
| `packages/voice` | ElevenLabs agent configuration stubs | `types` |
| `packages/scorer` | Rubric scoring and voice-metric stubs | `types` |
| `packages/web` | React + Vite frontend | — |

## Backend architecture

`packages/engine/src/index.ts` exposes:

- `GET /health` — returns `ok` if Postgres is reachable, otherwise `degraded`
- `GET /api/cases` — returns the current case menu (currently the committed SaveRite fixture)
- `POST /api/sessions` — creates an interview session in the database
- `GET /api/sessions/:id` — fetches a session by UUID

The engine loads environment variables via `dotenv` from the repo root and never logs API keys.

## Database

`packages/db/migrations/001_init.sql` bootstraps a `sessions` table with a UUID primary key, timestamps, mode, case-pack reference, and phase.

The engine runs `migrate()` on startup and before database-dependent endpoints.

## Web application

`packages/web` is a minimal React + Vite app that fetches and displays the case menu from `GET /api/cases`. It reads the backend URL from the `VITE_API_URL` environment variable.

## External APIs and secret handling

- `CONTEXT_DEV_API_KEY` — required by `packages/engine/src/services/contextDev.ts`
- `ELEVENLABS_API_KEY` — required by `packages/engine/src/services/elevenlabs.ts`
- `ANTHROPIC_API_KEY` — required by `packages/types/src/llm.ts` (`callClaude`)

All keys are read from environment variables. `.env` is gitignored; `.env.example` documents the expected variables. CI receives the same values from GitHub repository secrets.

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. Check out the repo
2. Set up Node.js 20 from `.nvmrc` and cache `npm`
3. Install workspace dependencies
4. Build all packages in dependency order
5. Run unit tests with coverage and upload the reports
6. Run integration tests against a Postgres service container
7. Build the Docker images defined in `packages/engine/Dockerfile` and `packages/web/Dockerfile`

## Testing strategy

- **Unit tests:** each package has its own Jest suite. `packages/types` validates the SaveRite fixture against the `CasePack` Zod schema and asserts that missing `brainstorm_module` fails.
- **API tests:** `packages/engine` uses Supertest to test `/health`, `/api/cases`, and secret guards.
- **Integration tests:** `packages/engine/tests/integration/sessions.test.ts` creates and fetches a real session against a Postgres database when `DATABASE_URL` is set.
- **Coverage:** Jest's built-in `--coverage` flag produces `coverage/` directories for the packages that run Jest.
