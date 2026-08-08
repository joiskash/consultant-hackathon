# FreshCase

Voice-first case interview practice, built live from today's news.

The backend is a **Python / FastAPI** service. You give it a topic you're
preparing for; it searches the web as a case-interview prep researcher and
returns curated links — live industry updates, real case studies, and practice
question banks from firms like McKinsey, BCG, Bain, Deloitte, KPMG, PwC and EY.
Every result is saved to a local `DB/` store.

## Quick start

```bash
cd server

# 1. Create a virtualenv and install dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment variables
cp ../.env.example ../.env
# edit .env and add your real ANTHROPIC_API_KEY

# 3. Run the server
python server.py
```

Open http://localhost:8000 and enter a topic.

To run over HTTPS, generate a local certificate and point the server at it:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
SSL_KEYFILE=certs/key.pem SSL_CERTFILE=certs/cert.pem python server.py
```

### With Docker

```bash
docker compose up --build
```

## Repository layout

```
.
├── server/                    # Python FastAPI backend
│   ├── server.py              # App, endpoints, DB persistence
│   ├── model.py               # Model class + CALL_LLM (web search)
│   ├── static/index.html      # Frontend: topic box and results
│   ├── tests/                 # pytest suite
│   ├── requirements.txt
│   └── Dockerfile
├── DB/                        # Research results as text files (gitignored)
├── docs/                      # Design doc, specs, fixtures, references
│   └── repo-guide.md          # File-by-file guide to the repo
├── archive/                   # Legacy TypeScript monorepo (unused)
├── .github/workflows/ci.yml   # CI: pytest + Docker build
├── docker-compose.yml
├── .env.example
└── tech-spec.md               # v1 technical specification
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Frontend page |
| `GET` | `/health` | Liveness check; reports the configured model |
| `POST` | `/listen` | Research a topic and persist the result |
| `GET` | `/docs` | Auto-generated OpenAPI docs |

`POST /listen`:

```bash
curl -X POST http://localhost:8000/listen \
  -H 'content-type: application/json' \
  -d '{"text": "EV charging infrastructure in India"}'
```

```json
{
  "reply": "…",
  "sources": [{ "url": "https://…", "title": "…" }],
  "db_file": "/path/to/DB/20260808-120000-ev-charging-infrastructure.txt"
}
```

## Tests

```bash
cd server && pytest tests/ -v
```

The suite mocks the LLM and redirects `DB/` to a temp directory, so it needs no
API key and never writes to your real research store.

## Environment variables

Copy `.env.example` to `.env` and fill in the values. These are server-side only.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key used by `CALL_LLM` |
| `MODEL_NAME` | no | Overrides the default Claude model |
| `SYSTEM_PROMPT` | no | Overrides the default researcher system prompt |
| `PORT` | no | Server port (default `8000`) |
| `SSL_KEYFILE` / `SSL_CERTFILE` | no | Enable HTTPS |

Do not commit `.env` or any real keys.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:

1. Install Python 3.12 and `server/requirements.txt`
2. Run `pytest tests/`
3. Build the server Docker image

## Archive

`archive/` holds the original TypeScript monorepo (Express engine, React web app,
Postgres, shared Zod types) from the M0–M5 scaffold. It is no longer built, run,
or tested — kept for reference only. See `docs/repo-guide.md` for details.
