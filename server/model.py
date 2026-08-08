"""LLM model configuration and invocation for the FreshCase backend."""

import json
import os

from anthropic import Anthropic


class Model:
    """An LLM endpoint plus its configuration.

    Configuration lives on the instance (model name, system prompt, token
    limit, API key); CALL_LLM sends a prompt/context JSON payload to the LLM.
    """

    def __init__(
        self,
        model_name: str = "claude-3-5-sonnet-20240620",
        system_prompt: str = (
            "You are FreshCase, an expert case-interview coach. "
            "Respond concisely and concretely."
        ),
        max_tokens: int = 1024,
        api_key: str | None = None,
    ) -> None:
        self.model_name = model_name
        self.system_prompt = system_prompt
        self.max_tokens = max_tokens
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client = Anthropic(api_key=self.api_key) if self.api_key else None

    def CALL_LLM(self, context: dict) -> str:
        """Call the LLM with a prompt/context JSON payload and return text.

        `context` must contain a "prompt" key with the user's text. Any
        additional keys are forwarded to the model as JSON context.
        """
        if self._client is None:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")

        prompt = context.get("prompt", "")
        extras = {k: v for k, v in context.items() if k != "prompt"}
        user_message = prompt
        if extras:
            user_message += f"\n\nContext:\n{json.dumps(extras, indent=2)}"

        response = self._client.messages.create(
            model=self.model_name,
            max_tokens=self.max_tokens,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text
