"""Unit tests for app.services and app.config.

These call the functions directly (no HTTP layer), so a failure points at the
generation logic itself rather than at routing or validation. Nothing here
touches the network: the OpenAI path is exercised with a fake client.
"""
import importlib
import json
import sys
import types

import pytest

from app import config, services
from app.models import Card

# ---------------------------------------------------------------------------
# Deterministic mock generator
# ---------------------------------------------------------------------------


def test_mock_returns_exactly_count_cards():
    for count in (1, 5, 9, 20, 50):
        assert len(services.generate_mock_cards("Docker", count)) == count


def test_mock_cards_are_numbered_from_zero():
    cards = services.generate_mock_cards("Docker", 4)
    assert [card.id for card in cards] == [0, 1, 2, 3]


def test_mock_cards_mention_the_topic():
    for card in services.generate_mock_cards("Kubernetes", 5):
        assert "Kubernetes" in card.front
        assert "Kubernetes" in card.back


def test_mock_is_deterministic_for_the_same_input():
    first = services.generate_mock_cards("Terraform", 7)
    second = services.generate_mock_cards("Terraform", 7)
    assert first == second


def test_mock_has_no_duplicate_questions_in_a_long_deck():
    # Wrapping past every angle must add a depth suffix, not repeat a card.
    cards = services.generate_mock_cards("Linux", 50)
    fronts = [card.front for card in cards]
    assert len(set(fronts)) == len(fronts)


def test_one_full_pass_covers_every_angle_once():
    count = len(services._ANGLES)
    fronts = [card.front for card in services.generate_mock_cards("X", count)]
    expected = {question.format(topic="X") for question, _ in services._ANGLES}
    assert set(fronts) == expected


def test_second_pass_uses_a_depth_suffix():
    count = len(services._ANGLES)
    cards = services.generate_mock_cards("X", count + 1)
    assert cards[count].front.endswith(services._DEPTH_SUFFIXES[1])


# ---------------------------------------------------------------------------
# Starting angle (topic hashing)
# ---------------------------------------------------------------------------


def test_starting_angle_is_within_range():
    for topic in ("a", "Docker", "Homeostasis", "x" * 200):
        assert 0 <= services._starting_angle(topic) < len(services._ANGLES)


def test_starting_angle_ignores_case_and_surrounding_spaces():
    assert services._starting_angle("Docker") == services._starting_angle("  docker ")


def test_different_topics_do_not_all_start_on_the_same_angle():
    topics = ["Docker", "Kubernetes", "Homeostasis", "Alkali metal", "Calculus", "Git"]
    assert len({services._starting_angle(t) for t in topics}) > 1


# ---------------------------------------------------------------------------
# In-memory deck store
# ---------------------------------------------------------------------------


@pytest.fixture
def empty_store():
    services.remember_deck([])
    yield
    services.remember_deck([])


def test_latest_cards_is_empty_before_any_generation(empty_store):
    assert services.latest_cards() == []


def test_remember_deck_replaces_the_previous_deck(empty_store):
    services.remember_deck(services.generate_mock_cards("First", 3))
    services.remember_deck(services.generate_mock_cards("Second", 2))

    latest = services.latest_cards()
    assert len(latest) == 2
    assert all("Second" in card.front for card in latest)


def test_latest_cards_returns_a_copy(empty_store):
    services.remember_deck(services.generate_mock_cards("Docker", 2))
    services.latest_cards().clear()
    assert len(services.latest_cards()) == 2


# ---------------------------------------------------------------------------
# Path selection: mock vs real LLM
# ---------------------------------------------------------------------------


def test_generate_cards_uses_mock_when_real_llm_is_off(monkeypatch):
    monkeypatch.setattr(config, "USE_REAL_LLM", False)
    assert services.generate_cards("Docker", 3) == services.generate_mock_cards("Docker", 3)


def _install_fake_openai(monkeypatch, reply: dict):
    """Put a fake `openai` module in sys.modules that returns `reply` as JSON."""
    calls = {}

    class _Completions:
        def create(self, **kwargs):
            calls.update(kwargs)
            message = types.SimpleNamespace(content=json.dumps(reply))
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)])

    class FakeOpenAI:
        def __init__(self, api_key):
            calls["api_key"] = api_key
            self.chat = types.SimpleNamespace(completions=_Completions())

    monkeypatch.setitem(sys.modules, "openai", types.SimpleNamespace(OpenAI=FakeOpenAI))
    return calls


def test_real_llm_reply_is_parsed_into_cards(monkeypatch):
    reply = {"cards": [{"front": "Q1", "back": "A1"}, {"front": "Q2", "back": "A2"}]}
    calls = _install_fake_openai(monkeypatch, reply)
    monkeypatch.setattr(config, "USE_REAL_LLM", True)
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")

    cards = services.generate_cards("Docker", 2)

    assert cards == [Card(id=0, front="Q1", back="A1"), Card(id=1, front="Q2", back="A2")]
    assert calls["api_key"] == "sk-test"
    assert calls["model"] == config.OPENAI_MODEL
    assert "Docker" in calls["messages"][0]["content"]


def test_real_llm_extra_cards_are_trimmed_to_count(monkeypatch):
    reply = {"cards": [{"front": f"Q{i}", "back": f"A{i}"} for i in range(5)]}
    _install_fake_openai(monkeypatch, reply)
    monkeypatch.setattr(config, "USE_REAL_LLM", True)

    assert len(services.generate_cards("Docker", 3)) == 3


def test_real_llm_short_reply_falls_back_to_mock(monkeypatch):
    _install_fake_openai(monkeypatch, {"cards": [{"front": "Only one", "back": "A"}]})
    monkeypatch.setattr(config, "USE_REAL_LLM", True)

    assert services.generate_cards("Docker", 4) == services.generate_mock_cards("Docker", 4)


def test_real_llm_malformed_reply_falls_back_to_mock(monkeypatch):
    _install_fake_openai(monkeypatch, {"unexpected": "shape"})
    monkeypatch.setattr(config, "USE_REAL_LLM", True)

    assert services.generate_cards("Docker", 2) == services.generate_mock_cards("Docker", 2)


# ---------------------------------------------------------------------------
# Configuration parsing
# ---------------------------------------------------------------------------


@pytest.fixture
def reload_config(monkeypatch):
    """Reload app.config under a temporary environment, then restore it."""

    def _reload(**env):
        for key in ("AI_MOCK_MODE", "OPENAI_API_KEY", "OPENAI_MODEL", "APP_VERSION"):
            monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return importlib.reload(config)

    yield _reload
    monkeypatch.undo()
    importlib.reload(config)


def test_config_defaults_to_mock_mode(reload_config):
    cfg = reload_config()
    assert cfg.AI_MOCK_MODE is True
    assert cfg.USE_REAL_LLM is False
    assert cfg.APP_VERSION == "1.0.0"
    assert cfg.OPENAI_MODEL == "gpt-4o-mini"


@pytest.mark.parametrize("value", ["true", "TRUE", "1", "yes", "on"])
def test_config_truthy_values_enable_mock_mode(reload_config, value):
    assert reload_config(AI_MOCK_MODE=value).AI_MOCK_MODE is True


def test_config_missing_key_keeps_mock_even_when_mock_is_off(reload_config):
    # Graceful degradation: no key means mock output, never a crash.
    cfg = reload_config(AI_MOCK_MODE="false")
    assert cfg.USE_REAL_LLM is False


def test_config_real_llm_needs_mock_off_and_a_key(reload_config):
    cfg = reload_config(AI_MOCK_MODE="false", OPENAI_API_KEY="sk-test")
    assert cfg.USE_REAL_LLM is True


def test_config_key_alone_does_not_enable_real_llm(reload_config):
    cfg = reload_config(AI_MOCK_MODE="true", OPENAI_API_KEY="sk-test")
    assert cfg.USE_REAL_LLM is False
