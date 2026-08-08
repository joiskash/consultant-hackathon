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
├── server.py          # FastAPI app, endpoints, Model instance
├── model.py           # Model class + CALL_LLM
├── requirements.txt   # pinned Python dependencies
└── certs/             # local self-signed TLS certs (gitignored)
```

## Backend architecture

`server/server.py` instantiates a single `Model` object at startup and exposes:

- `GET /health` — returns `{"status": "ok", "model": <model_name>}`
- `POST /listen` — receives user text and returns the LLM reply

### `POST /listen`

Request schema (`ListenRequest`):

```json
{
  "text": "string — raw user input"
}
```

Response schema (`ListenResponse`):

```json
{
  "reply": "string — LLM response text"
}
```

The endpoint forwards `text` to `model.CALL_LLM({"prompt": text})` and returns
the model's reply. LLM failures surface as `502` with the error detail.

## Model class

`server/model.py` defines `Model`, which holds the LLM configuration as
instance variables:

| Attribute | Default | Overridable via |
|-----------|---------|-----------------|
| `model_name` | `claude-3-5-sonnet-20240620` | `MODEL_NAME` |
| `system_prompt` | FreshCase coach prompt | `SYSTEM_PROMPT` |
| `max_tokens` | `1024` | constructor arg |
| `api_key` | — | `ANTHROPIC_API_KEY` |

`Model.CALL_LLM(context: dict) -> str` takes a prompt/context JSON payload:
`context["prompt"]` is the user message; any other keys are serialized as
JSON context appended to the message. The system prompt is sent via the
Anthropic `system` parameter.

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
