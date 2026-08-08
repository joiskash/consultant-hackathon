"""Client for context.dev — scrape URLs into LLM-ready content.

Uses the Web Scraping API (`GET /web/scrape/markdown`), which turns any URL into
GitHub-Flavored Markdown and responds with JSON:

    {"success": true, "url": "...", "markdown": "...", "contentLength": 174}

Auth is a bearer token read from CONTEXT_DEV_API_KEY.
"""

import os

import httpx

CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1"
SCRAPE_MARKDOWN_PATH = "/web/scrape/markdown"
DEFAULT_TIMEOUT = 30.0


def _is_valid_result(data: object) -> bool:
    """A website result is usable only if it is JSON with non-empty content."""
    return (
        isinstance(data, dict)
        and data.get("success") is True
        and isinstance(data.get("markdown"), str)
        and data["markdown"].strip() != ""
    )


def scrape_url(url: str, api_key: str, client: httpx.Client) -> dict:
    """Scrape a single URL via context.dev. Never raises for HTTP/parse errors.

    Returns a normalized per-URL record:
        {"url", "ok", "markdown", "content_length", "error", "raw"}
    """
    record: dict = {
        "url": url,
        "ok": False,
        "markdown": None,
        "content_length": None,
        "error": None,
        "raw": None,
    }
    try:
        response = client.get(
            f"{CONTEXT_DEV_BASE_URL}{SCRAPE_MARKDOWN_PATH}",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"url": url, "useMainContentOnly": "true"},
            timeout=DEFAULT_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        record["error"] = f"request failed: {exc}"
        return record

    try:
        data = response.json()
    except ValueError:
        record["error"] = f"non-JSON response (HTTP {response.status_code})"
        return record

    record["raw"] = data
    if response.status_code != 200:
        message = data.get("message") if isinstance(data, dict) else None
        record["error"] = message or f"HTTP {response.status_code}"
        return record

    if not _is_valid_result(data):
        record["error"] = "response missing valid website data"
        return record

    record["ok"] = True
    record["markdown"] = data["markdown"]
    record["content_length"] = data.get("contentLength")
    return record


def fetch_context(
    urls: list[str],
    api_key: str | None = None,
    client: httpx.Client | None = None,
) -> list[dict]:
    """Scrape every URL and return one normalized record per URL, in order."""
    api_key = api_key or os.environ.get("CONTEXT_DEV_API_KEY")
    if not api_key:
        raise RuntimeError("CONTEXT_DEV_API_KEY is not configured")

    owns_client = client is None
    client = client or httpx.Client()
    try:
        return [scrape_url(url, api_key, client) for url in urls]
    finally:
        if owns_client:
            client.close()
