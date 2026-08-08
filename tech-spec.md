# FreshCase — Technical Specification (v1)

## Stack

- **Language:** Python 3.12
- **Web framework:** FastAPI (+ Pydantic v2 for schemas)
- **Server:** Uvicorn (HTTP/HTTPS)
- **LLM:** Anthropic Messages API via the `anthropic` SDK
- **Config:** environment variables via `python-dotenv`

## Layout

```
server/
├── server.py          # FastAPI app, endpoints, Model instance, DB persistence
├── model.py           # Model class + CALL_LLM (web-search enabled)
├── requirements.txt   # pinned Python dependencies
└── certs/             # local self-signed TLS certs (gitignored)
DB/                    # research results stored as text files (contents gitignored)
```

## Backend architecture

`server/server.py` instantiates a single `Model` object at startup and exposes:

- `GET /health` — returns `{"status": "ok", "model": <model_name>}`
- `POST /listen` — receives a prep topic from the user, web-searches it via the
  LLM, persists the results to `DB/`, and returns the reply plus source links

### `POST /listen`

Request schema (`ListenRequest`):

```json
{
  "text": "string, min 1 char — the topic the user is preparing for"
}
```

Response schema (`ListenResponse`):

```json
{
  "reply": "string — LLM response text",
  "sources": [{"url": "string", "title": "string"}],
  "db_file": "string — path of the persisted DB text file"
}
```

Flow: `text` (the topic) is wrapped in a topic-research prompt, sent to
`model.CALL_LLM(...)`, and the result is written to
`DB/<timestamp>-<topic-slug>.txt` (topic, date, model, reply text, and source
list). LLM failures surface as `502` with the error detail.

## Model class

`server/model.py` defines `Model`, which holds the LLM configuration as
instance variables:

| Attribute | Default | Overridable via |
|-----------|---------|-----------------|
| `model_name` | `claude-sonnet-4-5-20250929` | `MODEL_NAME` |
| `system_prompt` | `DEFAULT_SYSTEM_PROMPT` (consultant interview-prep researcher) | `SYSTEM_PROMPT` |
| `max_tokens` | `4096` | constructor arg |
| `api_key` | — | `ANTHROPIC_API_KEY` |
| `enable_web_search` | `True` | constructor arg |
| `max_search_uses` | `5` | constructor arg |

The default system prompt casts the model as a search assistant for a
consultant preparing for case interviews: find live topic updates, case
studies, and question banks, prioritizing reputable firms (McKinsey, BCG,
Bain, Deloitte, KPMG, PwC, EY, …) and returning curated URL links.

`Model.CALL_LLM(context: dict) -> dict` takes a prompt/context JSON payload:
`context["prompt"]` is the user message; any other keys are serialized as
JSON context appended to the message. The system prompt is sent via the
Anthropic `system` parameter. Web search uses Anthropic's server-side
`web_search_20250305` tool; the returned `sources` are deduplicated URLs
collected from search results and citations.

## Research store (`DB/`)

Every `/listen` result is appended to the local research store as a
human-readable text file. The directory is committed via `.gitkeep`; its
contents are gitignored. Later, results pulled from context.dev will be
stored here as well.

## Transport

- Local development runs on port `8000` (env `PORT`).
- **HTTPS:** set `SSL_KEYFILE` and `SSL_CERTFILE` to run Uvicorn with TLS.
  Self-signed certs for local testing live in `server/certs/` (regenerate with
  `openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"`).
  In production, TLS is terminated at the reverse proxy / load balancer.

## Secrets

- `ANTHROPIC_API_KEY` — required for `CALL_LLM`; read from the environment
  (`.env` is gitignored). Never logged or exposed to clients.

## Running locally

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python server.py                     # HTTP on :8000
# or with TLS:
SSL_KEYFILE=certs/key.pem SSL_CERTFILE=certs/cert.pem python server.py
```
