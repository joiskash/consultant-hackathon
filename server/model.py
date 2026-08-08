"""LLM model configuration and invocation for the FreshCase backend."""

import json
import os

from anthropic import Anthropic

DEFAULT_SYSTEM_PROMPT = """You are FreshCase Research, a search assistant for a
consultant preparing for case interviews.

The user gives you a topic they are preparing for. Acting like a search engine:
1. Use web search to find the most relevant, high-quality resources on the topic:
   - recent industry updates, news, and reports (live topic updates),
   - real case studies and worked case examples,
   - practice question banks and case-interview prep resources.
2. Prioritize reputable consulting and business sources — e.g. McKinsey, BCG,
   Bain, Deloitte, KPMG, PwC, EY, Oliver Wyman — plus established case-prep
   sites and business press.
3. Return a curated list of relevant URL links, each with a one-line note on
   what it contains and why it is useful for interview prep."""

BUILD_INTERVIEW_SYSTEM_PROMPT = """You are FreshCase Interviewer, a case-interview
designer.

You are given research content scraped from one or more websites (as JSON, one
entry per site with its URL and page content). Using ONLY this content, design a
consulting-style case interview for a candidate preparing on this topic.

Produce, clearly sectioned:
1. Case prompt — client, situation, and the explicit ask (2-4 sentences).
2. Clarifying questions the candidate might ask, each with a model answer
   grounded in the provided content.
3. A recommended framework / structure for cracking the case.
4. A quantitative question with realistic numbers drawn from the content, plus a
   worked answer key.
5. 3-5 probing follow-up questions.
6. The overall interview flow, step by step, from opening to recommendation.

Ground every fact and figure in the supplied website content; do not invent
numbers that contradict it."""


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
