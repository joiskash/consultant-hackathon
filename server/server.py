"""FreshCase v1 backend — FastAPI server exposing the /listen endpoint.

Run locally:
    python server.py            # plain HTTP on :8000
    SSL_KEYFILE=certs/key.pem SSL_CERTFILE=certs/cert.pem python server.py  # HTTPS
"""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from context_client import fetch_context
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


class ContextRequest(BaseModel):
    urls: list[str] = Field(min_length=1, description="URLs to fetch via context.dev")


class ContextWebsite(BaseModel):
    url: str
    ok: bool
    content_length: int | None = None
    error: str | None = None


class ContextResponse(BaseModel):
    context_file: str
    websites_fetched: int
    websites_valid: int
    websites: list[ContextWebsite]
    interview: str


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


def save_context_to_db(results: list[dict]) -> Path:
    """Persist raw context.dev results (full markdown) as a JSON file under DB/."""
    DB_DIR.mkdir(exist_ok=True)
    now = datetime.now(timezone.utc)
    path = DB_DIR / f"context-{now.strftime('%Y%m%d-%H%M%S')}.json"
    payload = {"fetched_at": now.isoformat(), "results": results}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
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


@app.post("/get_context_data", response_model=ContextResponse)
def get_context_data(payload: ContextRequest) -> ContextResponse:
    # 1. Fetch each URL's content from context.dev.
    try:
        results = fetch_context(payload.urls)
    except RuntimeError as exc:  # missing CONTEXT_DEV_API_KEY
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # 2. Persist the raw results (full content) to DB/context-*.json.
    context_file = save_context_to_db(results)

    # 3. Only feed sites that returned valid JSON content into the LLM.
    valid = [r for r in results if r["ok"]]
    if not valid:
        raise HTTPException(
            status_code=502,
            detail="context.dev returned no valid website data for the given URLs",
        )
    websites = [{"url": r["url"], "content": r["markdown"]} for r in valid]

    # 4. Build the interview from the fetched context.
    try:
        built = model.build_interview(websites)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ContextResponse(
        context_file=str(context_file),
        websites_fetched=len(results),
        websites_valid=len(valid),
        websites=[
            ContextWebsite(
                url=r["url"],
                ok=r["ok"],
                content_length=r["content_length"],
                error=r["error"],
            )
            for r in results
        ],
        interview=built["interview"],
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
