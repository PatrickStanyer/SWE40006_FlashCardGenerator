"""Runtime configuration, read once from the process environment.

Every value has a safe default so the container starts even when an optional
secret is missing. Nothing here reaches out to the network at import time.
"""
import os


def _env(name: str, default: str = "") -> str:
    """Read one variable, trimmed, falling back to the default when blank.

    Two things make a plain os.getenv call unsafe here.

    A value typed into the GitHub Actions variables form keeps whatever
    whitespace came with it, and a trailing newline on OPENAI_MODEL is not
    cosmetic: the provider rejects the request with "unexpected model name
    format" and generation drops silently back to the deterministic path.

    A variable that is set but empty also shadows the default, because
    os.getenv only falls back when the name is absent. The deploy job always
    passes OPENAI_MODEL and OPENAI_BASE_URL, so they arrive as empty strings
    whenever the matching repository variable has not been configured.
    """
    return os.getenv(name, "").strip() or default


# Reported by /healthz and used as the OpenAPI document version. The CD
# pipeline can override it with the short commit SHA it tags the image with.
APP_VERSION = _env("APP_VERSION", "1.0.0")

_TRUTHY = {"1", "true", "yes", "on"}

# Deterministic offline mode. CI and the test suite always run with this on,
# so no API key and no network access are required to verify the service.
AI_MOCK_MODE = _env("AI_MOCK_MODE", "true").lower() in _TRUTHY

OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-4o-mini")

# Any provider exposing an OpenAI-compatible chat completions endpoint can be
# used without a second SDK or a second code path. Gemini publishes one, which
# is how this runs on Google's free tier. Empty means talk to OpenAI itself.
#
#   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
#   OPENAI_MODEL=<a model name from Google's documentation>
#   OPENAI_API_KEY=<a Google AI Studio key>
OPENAI_BASE_URL = _env("OPENAI_BASE_URL")

# How long one request may take, and how many times to retry it.
#
# Measured against Gemini's free tier for a four card deck: a flash-lite
# model answered in 1.6s, the full flash model in 6s, and the newest and
# largest flash model took 59s. Newer is not faster, so the model name is
# configuration rather than a constant, and the ceiling has to allow for a
# busy free tier without making someone wait through a stall.
#
# One retry rather than the client default of two keeps the worst case at
# twice the ceiling instead of three times it.
OPENAI_TIMEOUT = float(_env("OPENAI_TIMEOUT", "25"))
OPENAI_MAX_RETRIES = int(_env("OPENAI_MAX_RETRIES", "1"))

# A missing key degrades the feature to deterministic mock output instead of
# crashing the container, which keeps Staging usable without a paid secret.
USE_REAL_LLM = not AI_MOCK_MODE and bool(OPENAI_API_KEY)
