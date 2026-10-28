"""Configuration is read from values people paste into a web form.

These tests cover what that form actually hands the container: values with
stray whitespace, and values that are present but empty. A model name with a
trailing newline reached Staging and the provider answered

    GenerateContentRequest.model: unexpected model name format
    status: INVALID_ARGUMENT

which looks like a broken key or a wrong model until you print the value with
its repr. Generation then falls back to deterministic cards and the failure is
invisible from the outside, so it is worth pinning down here.
"""
import importlib

import pytest

from app import config

_KEYS = (
    "AI_MOCK_MODE",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_BASE_URL",
    "OPENAI_TIMEOUT",
    "OPENAI_MAX_RETRIES",
    "APP_VERSION",
)


@pytest.fixture
def reload_config(monkeypatch):
    def _reload(**env):
        for key in _KEYS:
            monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return importlib.reload(config)

    yield _reload
    monkeypatch.undo()
    importlib.reload(config)


@pytest.mark.parametrize(
    "raw",
    ["gemini-3.5-flash-lite\r\n", "gemini-3.5-flash-lite\n", " gemini-3.5-flash-lite "],
)
def test_model_name_is_trimmed(reload_config, raw):
    assert reload_config(OPENAI_MODEL=raw).OPENAI_MODEL == "gemini-3.5-flash-lite"


def test_base_url_is_trimmed(reload_config):
    cfg = reload_config(OPENAI_BASE_URL="https://example.com/v1/\n")
    assert cfg.OPENAI_BASE_URL == "https://example.com/v1/"


def test_api_key_is_trimmed(reload_config):
    # A newline here authenticates as a different string and fails the call.
    cfg = reload_config(AI_MOCK_MODE="false", OPENAI_API_KEY="  sk-test\n")
    assert cfg.OPENAI_API_KEY == "sk-test"
    assert cfg.USE_REAL_LLM is True


def test_blank_model_falls_back_to_the_default(reload_config):
    # The deploy job always passes OPENAI_MODEL, so an unset repository
    # variable arrives as an empty string rather than as a missing name.
    assert reload_config(OPENAI_MODEL="").OPENAI_MODEL == "gpt-4o-mini"
    assert reload_config(OPENAI_MODEL="   ").OPENAI_MODEL == "gpt-4o-mini"


def test_blank_version_falls_back_to_the_default(reload_config):
    assert reload_config(APP_VERSION="").APP_VERSION == "1.0.0"


def test_whitespace_only_key_does_not_enable_the_live_path(reload_config):
    # Otherwise every request would be sent with an unusable credential
    # instead of degrading to deterministic output.
    cfg = reload_config(AI_MOCK_MODE="false", OPENAI_API_KEY="\n")
    assert cfg.USE_REAL_LLM is False


def test_mock_mode_survives_a_trailing_newline(reload_config):
    assert reload_config(AI_MOCK_MODE="true\r\n").AI_MOCK_MODE is True


def test_blank_numeric_settings_fall_back_instead_of_crashing(reload_config):
    cfg = reload_config(OPENAI_TIMEOUT="", OPENAI_MAX_RETRIES="\n")
    assert cfg.OPENAI_TIMEOUT == 45.0
    assert cfg.OPENAI_MAX_RETRIES == 1
