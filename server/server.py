"""FreshCase v1 backend — FastAPI server exposing the /listen endpoint.

Run locally:
    python server.py            # plain HTTP on :8000
    SSL_KEYFILE=certs/key.pem SSL_CERTFILE=certs/cert.pem python server.py  # HTTPS
"""

import os
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from model import DEFAULT_SYSTEM_PROMPT, Model

load_dotenv()

app = FastAPI(title="FreshCase Backend", version="1.0.0")

model = Model(
    model_name=os.environ.get("MODEL_NAME", "claude-sonnet-4-5-20250929"),
    system_prompt=os.environ.get("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
)

DB_DIR = Path(__file__).resolve().parent.parent / "DB"
STATIC_DIR = Path(__file__).resolve().parent / "static"

TOPIC_PROMPT = """Topic: {topic}

I am preparing for consulting case interviews. Search the web for this topic and return:
1. Live/recent updates and industry reports on the topic.
2. Real case studies and worked examples.
3. Practice question banks and where to find them.
Prefer sources from firms like McKinsey, BCG, Bain, Deloitte, KPMG, PwC, EY and
established case-prep sites. For every resource, give the URL and a one-line
description of what it offers."""


class ListenRequest(BaseModel):
    text: str = Field(min_length=1, description="Topic the user is preparing for")


class Source(BaseModel):
    url: str
    title: str


class ListenResponse(BaseModel):
    reply: str
    sources: list[Source]
    db_file: str


def save_to_db(topic: str, result: dict) -> Path:
    """Persist a /listen result as a text file under DB/."""
    DB_DIR.mkdir(exist_ok=True)
    now = datetime.now(timezone.utc)
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:50] or "topic"
    path = DB_DIR / f"{now.strftime('%Y%m%d-%H%M%S')}-{slug}.txt"
    lines = [
        f"# Topic: {topic}",
        f"# Date: {now.isoformat()}",
        f"# Model: {model.model_name}",
        "",
        "## Response",
        result["text"],
        "",
        "## Sources",
        *[f"- {s['title']} — {s['url']}" for s in result["sources"]],
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": model.model_name}


@app.post("/listen", response_model=ListenResponse)
def listen(payload: ListenRequest) -> ListenResponse:
    topic = payload.text.strip()
    try:
        result = model.CALL_LLM({"prompt": TOPIC_PROMPT.format(topic=topic)})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db_file = save_to_db(topic, result)
    return ListenResponse(
        reply=result["text"],
        sources=result["sources"],
        db_file=str(db_file),
    )


# Mounted last so the API routes above take precedence.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        ssl_keyfile=os.environ.get("SSL_KEYFILE"),
        ssl_certfile=os.environ.get("SSL_CERTFILE"),
        reload=True,
    )
