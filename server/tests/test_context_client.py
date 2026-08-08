import httpx
import pytest

import context_client
from context_client import fetch_context, scrape_url


def make_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def ok_markdown(url, markdown="# Title\n\nBody text."):
    return {"success": True, "url": url, "markdown": markdown, "contentLength": len(markdown)}


def test_scrape_url_success_and_request_shape():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=ok_markdown("https://example.com"))

    with make_client(handler) as client:
        record = scrape_url("https://example.com", "ctxt_secret_x", client)

    assert record["ok"] is True
    assert record["markdown"].startswith("# Title")
    assert record["content_length"] == len("# Title\n\nBody text.")
    assert record["error"] is None
    assert "/web/scrape/markdown" in seen["url"]
    assert "url=https%3A%2F%2Fexample.com" in seen["url"]
    assert "useMainContentOnly=true" in seen["url"]
    assert seen["auth"] == "Bearer ctxt_secret_x"


def test_scrape_url_http_error_captured():
    def handler(request):
        return httpx.Response(404, json={"message": "Target page returned a 404", "error_code": "NOT_FOUND"})

    with make_client(handler) as client:
        record = scrape_url("https://missing.example", "k", client)

    assert record["ok"] is False
    assert record["error"] == "Target page returned a 404"
    assert record["markdown"] is None


def test_scrape_url_success_true_but_empty_markdown_is_invalid():
    def handler(request):
        return httpx.Response(200, json={"success": True, "url": "https://x", "markdown": "   "})

    with make_client(handler) as client:
        record = scrape_url("https://x", "k", client)

    assert record["ok"] is False
    assert "missing valid website data" in record["error"]


def test_scrape_url_non_json_response():
    def handler(request):
        return httpx.Response(200, text="<html>not json</html>")

    with make_client(handler) as client:
        record = scrape_url("https://x", "k", client)

    assert record["ok"] is False
    assert "non-JSON" in record["error"]


def test_scrape_url_network_error():
    def handler(request):
        raise httpx.ConnectError("boom")

    with make_client(handler) as client:
        record = scrape_url("https://x", "k", client)

    assert record["ok"] is False
    assert "request failed" in record["error"]


def test_fetch_context_preserves_order_and_mixes_results():
    def handler(request):
        if "good" in str(request.url):
            return httpx.Response(200, json=ok_markdown("https://good.example"))
        return httpx.Response(500, json={"message": "server error"})

    with make_client(handler) as client:
        results = fetch_context(
            ["https://good.example", "https://bad.example"],
            api_key="k",
            client=client,
        )

    assert [r["url"] for r in results] == ["https://good.example", "https://bad.example"]
    assert results[0]["ok"] is True
    assert results[1]["ok"] is False


def test_fetch_context_requires_api_key(monkeypatch):
    monkeypatch.delenv("CONTEXT_DEV_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="CONTEXT_DEV_API_KEY is not configured"):
        fetch_context(["https://x"])


def test_fetch_context_reads_key_from_env(monkeypatch):
    monkeypatch.setenv("CONTEXT_DEV_API_KEY", "env-key")
    captured = {}

    def handler(request):
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=ok_markdown("https://x"))

    with make_client(handler) as client:
        fetch_context(["https://x"], client=client)

    assert captured["auth"] == "Bearer env-key"
