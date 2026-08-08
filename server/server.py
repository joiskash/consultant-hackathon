"""FreshCase v1 backend — FastAPI server exposing the /listen endpoint.

Run locally:
    python server.py            # plain HTTP on :8000
    SSL_KEYFILE=certs/key.pem SSL_CERTFILE=certs/cert.pem python server.py  # HTTPS
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from model import Model

load_dotenv()

app = FastAPI(title="FreshCase Backend", version="1.0.0")

model = Model(
    model_name=os.environ.get("MODEL_NAME", "claude-3-5-sonnet-20240620"),
    system_prompt=os.environ.get(
        "SYSTEM_PROMPT",
        "You are FreshCase, an expert case-interview coach. "
        "Respond concisely and concretely.",
    ),
)


class ListenRequest(BaseModel):
    text: str


class ListenResponse(BaseModel):
    reply: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": model.model_name}


@app.post("/listen", response_model=ListenResponse)
def listen(payload: ListenRequest) -> ListenResponse:
    try:
        reply = model.CALL_LLM({"prompt": payload.text})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ListenResponse(reply=reply)


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
