import json
from types import SimpleNamespace

import pytest

from model import DEFAULT_SYSTEM_PROMPT, Model


def text_block(text, citations=None):
    return SimpleNamespace(type="text", text=text, citations=citations)


def search_block(results):
    return SimpleNamespace(type="web_search_tool_result", content=results)


def result(url, title=""):
    return SimpleNamespace(url=url, title=title)


class FakeMessages:
    def __init__(self, content):
        self.content = content
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(content=self.content)


def make_model(content, **overrides):
    model = Model(api_key="test-key", **overrides)
    messages = FakeMessages(content)
    model._client = SimpleNamespace(messages=messages)
    return model, messages


def test_defaults_are_set_on_the_instance():
    model = Model(api_key="test-key")
    assert model.model_name == "claude-sonnet-4-5-20250929"
    assert model.system_prompt == DEFAULT_SYSTEM_PROMPT
    assert model.max_tokens == 4096
    assert model.enable_web_search is True
    assert model.max_search_uses == 5


def test_system_prompt_targets_consultant_prep():
    prompt = DEFAULT_SYSTEM_PROMPT.lower()
    assert "consultant" in prompt
    assert "case interview" in prompt
    for firm in ("mckinsey", "deloitte", "kpmg"):
        assert firm in prompt


def test_constructor_overrides_win():
    model = Model(
        model_name="custom-model",
        system_prompt="custom prompt",
        max_tokens=99,
        api_key="test-key",
        enable_web_search=False,
        max_search_uses=2,
    )
    assert (model.model_name, model.system_prompt, model.max_tokens) == (
        "custom-model",
        "custom prompt",
        99,
    )
    assert model.enable_web_search is False


def test_api_key_read_from_environment(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key")
    assert Model().api_key == "env-key"


def test_call_llm_without_api_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY is not configured"):
        Model().CALL_LLM({"prompt": "hi"})


def test_call_llm_sends_prompt_and_config():
    model, messages = make_model([text_block("answer")])
    model.CALL_LLM({"prompt": "EV charging"})

    assert messages.kwargs["model"] == model.model_name
    assert messages.kwargs["system"] == model.system_prompt
    assert messages.kwargs["max_tokens"] == model.max_tokens
    assert messages.kwargs["messages"] == [{"role": "user", "content": "EV charging"}]


def test_call_llm_appends_extra_context_as_json():
    model, messages = make_model([text_block("answer")])
    model.CALL_LLM({"prompt": "EV charging", "phase": "brainstorm", "depth": 2})

    content = messages.kwargs["messages"][0]["content"]
    assert content.startswith("EV charging")
    assert "Context:" in content
    assert json.loads(content.split("Context:", 1)[1]) == {"phase": "brainstorm", "depth": 2}


def test_web_search_tool_attached_when_enabled():
    model, messages = make_model([text_block("answer")])
    model.CALL_LLM({"prompt": "topic"})

    tool = messages.kwargs["tools"][0]
    assert tool["type"] == "web_search_20250305"
    assert tool["name"] == "web_search"
    assert tool["max_uses"] == model.max_search_uses


def test_web_search_tool_omitted_when_disabled():
    model, messages = make_model([text_block("answer")], enable_web_search=False)
    model.CALL_LLM({"prompt": "topic"})
    assert "tools" not in messages.kwargs


def test_call_llm_joins_text_blocks_and_collects_sources():
    model, _ = make_model(
        [
            search_block([result("https://kpmg.com/a", "KPMG A")]),
            text_block("part one", citations=[result("https://deloitte.com/b", "Deloitte B")]),
            text_block("part two"),
        ]
    )
    out = model.CALL_LLM({"prompt": "topic"})

    assert out["text"] == "part one\npart two"
    assert out["sources"] == [
        {"url": "https://kpmg.com/a", "title": "KPMG A"},
        {"url": "https://deloitte.com/b", "title": "Deloitte B"},
    ]


def test_sources_are_deduplicated():
    model, _ = make_model(
        [
            search_block([result("https://bain.com/x", "Bain X"), result("https://bain.com/x", "Bain X")]),
            text_block("body", citations=[result("https://bain.com/x", "Bain X")]),
        ]
    )
    assert model.CALL_LLM({"prompt": "topic"})["sources"] == [
        {"url": "https://bain.com/x", "title": "Bain X"}
    ]


def test_blocks_without_urls_are_ignored():
    model, _ = make_model(
        [SimpleNamespace(type="thinking", thinking="hmm"), text_block("body", citations=None)]
    )
    out = model.CALL_LLM({"prompt": "topic"})
    assert out == {"text": "body", "sources": []}
