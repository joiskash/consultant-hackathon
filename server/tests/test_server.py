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
