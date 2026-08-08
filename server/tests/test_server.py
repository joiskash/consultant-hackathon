import json

import pytest
from fastapi.testclient import TestClient

import server

RESULT = {
    "text": "Here are resources on EV charging.",
    "sources": [
        {"url": "https://www.mckinsey.com/ev", "title": "McKinsey EV"},
        {"url": "https://kpmg.com/ev", "title": "KPMG EV"},
    ],
}


@pytest.fixture
def db_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DB_DIR", tmp_path / "DB")
    return tmp_path / "DB"


@pytest.fixture
def client(db_dir):
    return TestClient(server.app)


@pytest.fixture
def calls(monkeypatch):
    recorded = []

    def fake_call_llm(context):
        recorded.append(context)
        return RESULT

    monkeypatch.setattr(server.model, "CALL_LLM", fake_call_llm)
    return recorded


def test_health_reports_model(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model": server.model.model_name}


def test_frontend_page_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<textarea" in response.text
    assert "/listen" in response.text


def test_listen_returns_reply_sources_and_db_file(client, calls):
    response = client.post("/listen", json={"text": "EV charging"})

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == RESULT["text"]
    assert body["sources"] == RESULT["sources"]
    assert body["db_file"].endswith(".txt")


def test_listen_passes_topic_into_call_llm_prompt(client, calls):
    client.post("/listen", json={"text": "EV charging"})

    assert len(calls) == 1
    prompt = calls[0]["prompt"]
    assert "EV charging" in prompt
    assert "case interviews" in prompt


def test_listen_trims_whitespace(client, calls):
    client.post("/listen", json={"text": "  EV charging  "})
    assert "Topic: EV charging\n" in calls[0]["prompt"]


def test_listen_writes_result_file_to_db(client, calls, db_dir):
    response = client.post("/listen", json={"text": "EV charging"})

    files = list(db_dir.glob("*.txt"))
    assert len(files) == 1
    assert str(files[0]) == response.json()["db_file"]

    content = files[0].read_text()
    assert "# Topic: EV charging" in content
    assert RESULT["text"] in content
    assert "https://www.mckinsey.com/ev" in content
    assert "KPMG EV" in content


def test_db_filename_is_slugified(client, calls, db_dir):
    client.post("/listen", json={"text": "EV Charging: India!! 2026"})
    assert list(db_dir.glob("*-ev-charging-india-2026.txt"))


def test_listen_rejects_empty_topic(client, calls):
    assert client.post("/listen", json={"text": ""}).status_code == 422
    assert not calls


def test_listen_rejects_missing_field(client, calls):
    assert client.post("/listen", json={"wrong": 1}).status_code == 422
    assert not calls


def test_listen_returns_502_when_llm_fails(client, monkeypatch, db_dir):
    def boom(context):
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    monkeypatch.setattr(server.model, "CALL_LLM", boom)
    response = client.post("/listen", json={"text": "EV charging"})

    assert response.status_code == 502
    assert response.json()["detail"] == "ANTHROPIC_API_KEY is not configured"
    assert not db_dir.exists() or not list(db_dir.glob("*.txt"))


# --- /get_context_data ---------------------------------------------------------


def record(url, ok=True, markdown="# Data", error=None):
    return {
        "url": url,
        "ok": ok,
        "markdown": markdown if ok else None,
        "content_length": len(markdown) if ok else None,
        "error": error,
    }


@pytest.fixture
def fake_context(monkeypatch):
    """Stub fetch_context and build_interview; capture what they receive."""
    calls = {"urls": None, "websites": None}

    def fake_fetch(urls, *args, **kwargs):
        calls["urls"] = urls
        return [
            record("https://good-a.example"),
            record("https://bad.example", ok=False, error="HTTP 500"),
            record("https://good-b.example", markdown="# More data"),
        ]

    def fake_build(websites):
        calls["websites"] = websites
        return {"interview": "## Case prompt\nBuilt interview."}

    monkeypatch.setattr(server, "fetch_context", fake_fetch)
    monkeypatch.setattr(server.model, "build_interview", fake_build)
    return calls


def test_get_context_data_happy_path(client, fake_context):
    response = client.post(
        "/get_context_data",
        json={"urls": ["https://good-a.example", "https://bad.example", "https://good-b.example"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["websites_fetched"] == 3
    assert body["websites_valid"] == 2
    assert body["interview"] == "## Case prompt\nBuilt interview."
    assert body["context_file"].endswith(".json")
    # per-URL statuses echoed back, no full markdown in the response
    assert [w["ok"] for w in body["websites"]] == [True, False, True]
    assert body["websites"][1]["error"] == "HTTP 500"


def test_get_context_data_only_valid_sites_go_to_llm(client, fake_context):
    client.post("/get_context_data", json={"urls": ["https://good-a.example"]})

    urls_sent = [w["url"] for w in fake_context["websites"]]
    assert urls_sent == ["https://good-a.example", "https://good-b.example"]
    assert all("content" in w for w in fake_context["websites"])


def test_get_context_data_writes_context_file_with_full_content(client, fake_context, db_dir):
    response = client.post("/get_context_data", json={"urls": ["https://good-a.example"]})

    files = list(db_dir.glob("context-*.json"))
    assert len(files) == 1
    assert str(files[0]) == response.json()["context_file"]

    saved = json.loads(files[0].read_text())
    assert "fetched_at" in saved
    assert len(saved["results"]) == 3  # all results persisted, including the failed one
    assert saved["results"][0]["markdown"] == "# Data"


def test_get_context_data_502_when_no_valid_sites(client, monkeypatch, db_dir):
    monkeypatch.setattr(server, "fetch_context", lambda urls: [record("https://x", ok=False, error="404")])
    build_called = []
    monkeypatch.setattr(server.model, "build_interview", lambda w: build_called.append(w))

    response = client.post("/get_context_data", json={"urls": ["https://x"]})

    assert response.status_code == 502
    assert "no valid website data" in response.json()["detail"]
    assert not build_called  # LLM never invoked
    # raw results are still persisted for debugging
    assert list(db_dir.glob("context-*.json"))


def test_get_context_data_500_when_key_missing(client, monkeypatch):
    def no_key(urls):
        raise RuntimeError("CONTEXT_DEV_API_KEY is not configured")

    monkeypatch.setattr(server, "fetch_context", no_key)
    response = client.post("/get_context_data", json={"urls": ["https://x"]})

    assert response.status_code == 500
    assert response.json()["detail"] == "CONTEXT_DEV_API_KEY is not configured"


def test_get_context_data_rejects_empty_url_list(client):
    assert client.post("/get_context_data", json={"urls": []}).status_code == 422


def test_get_context_data_rejects_missing_field(client):
    assert client.post("/get_context_data", json={}).status_code == 422
