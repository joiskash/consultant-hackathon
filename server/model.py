"""LLM model configuration and invocation for the FreshCase backend."""

import json
import os

from anthropic import Anthropic

DEFAULT_SYSTEM_PROMPT = """You are FreshCase Research, a search assistant for a
consultant preparing for case interviews.

The user gives you a topic they are preparing for. Acting like a search engine,
use web search to find the SINGLE most useful, high-quality resource on the topic
— ideally one page with a relevant case study or worked case example, or a strong
prep resource. Prioritize reputable consulting and business sources — e.g.
McKinsey, BCG, Bain, Deloitte, KPMG, PwC, EY — plus established case-prep sites.

Return the one best URL link with a one-line note on what it contains and why it
is the most useful single resource for interview prep."""

BUILD_INTERVIEW_SYSTEM_PROMPT = """You are FreshCase Interviewer, a case-interview
designer.

You are given research content scraped from a website (as JSON with its URL and
page content). Using this content as grounding, design a single consulting-style
case interview that fits the candidate's request.

Return, clearly sectioned:
1. Case prompt — a short text case: client, situation, and the explicit ask
   (2-4 sentences), consistent with the request and the content.
2. EXACTLY 5 interview questions that walk through the case in order — a sensible
   arc such as a clarifying question, a framework/structure question, a
   quantitative question, an analysis/insight question, and a recommendation.
   Number them 1 to 5.
3. For each of the 5 questions, one or two lines on what a strong answer covers.
4. The interview flow in one or two lines.

Produce EXACTLY 5 questions — no more, no fewer. Ground facts in the supplied
content; do not invent figures that contradict it."""


class Model:
    """An LLM endpoint plus its configuration.

    Configuration lives on the instance (model name, system prompt, token
    limit, API key, web-search settings); CALL_LLM sends a prompt/context
    JSON payload to the LLM and returns the reply text plus source links.
    """

    def __init__(
        self,
        model_name: str = "claude-sonnet-4-5-20250929",
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
        interview_system_prompt: str = BUILD_INTERVIEW_SYSTEM_PROMPT,
        max_tokens: int = 4096,
        api_key: str | None = None,
        enable_web_search: bool = True,
        max_search_uses: int = 5,
    ) -> None:
        self.model_name = model_name
        self.system_prompt = system_prompt
        self.interview_system_prompt = interview_system_prompt
        self.max_tokens = max_tokens
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.enable_web_search = enable_web_search
        self.max_search_uses = max_search_uses
        self._client = Anthropic(api_key=self.api_key) if self.api_key else None

    def CALL_LLM(self, context: dict) -> dict:
        """Call the LLM with a prompt/context JSON payload.

        `context` must contain a "prompt" key with the user's text. Any
        additional keys are forwarded to the model as JSON context.

        Returns {"text": str, "sources": [{"url": str, "title": str}]}.
        With web search enabled, sources are deduplicated links collected
        from the model's search results and citations.
        """
        if self._client is None:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")

        prompt = context.get("prompt", "")
        extras = {k: v for k, v in context.items() if k != "prompt"}
        user_message = prompt
        if extras:
            user_message += f"\n\nContext:\n{json.dumps(extras, indent=2)}"

        kwargs = {
            "model": self.model_name,
            "max_tokens": self.max_tokens,
            "system": self.system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }
        if self.enable_web_search:
            kwargs["tools"] = [
                {
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": self.max_search_uses,
                }
            ]

        response = self._client.messages.create(**kwargs)

        texts, sources, seen = [], [], set()
        for block in response.content:
            if block.type == "text":
                texts.append(block.text)
                candidates = getattr(block, "citations", None) or []
            elif block.type == "web_search_tool_result":
                candidates = getattr(block, "content", None) or []
            else:
                continue
            for item in candidates:
                url = getattr(item, "url", None)
                if url and url not in seen:
                    seen.add(url)
                    sources.append({"url": url, "title": getattr(item, "title", "") or ""})

        return {"text": "\n".join(texts), "sources": sources}

    def build_interview(self, websites: list[dict]) -> dict:
        """Build a case interview from scraped website content.

        `websites` is a list of per-site dicts (e.g. {"url", "markdown"}) that
        already passed validation. The content is passed as JSON context and the
        model synthesizes questions and an interview flow from it — no web search.

        Returns {"interview": str}.
        """
        if self._client is None:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")

        payload = json.dumps(websites, indent=2)
        response = self._client.messages.create(
            model=self.model_name,
            max_tokens=self.max_tokens,
            system=self.interview_system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Research content scraped from the websites (JSON):\n"
                        f"{payload}\n\nDesign the case interview."
                    ),
                }
            ],
        )
        text = "".join(b.text for b in response.content if b.type == "text")
        return {"interview": text}
