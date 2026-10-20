"""Runtime configuration, read once from the process environment.

Every value has a safe default so the container starts even when an optional
secret is missing. Nothing here reaches out to the network at import time.
"""
import os

# Reported by /healthz and used as the OpenAPI document version. The CD
# pipeline can override it with the short commit SHA it tags the image with.
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

_TRUTHY = {"1", "true", "yes", "on"}

# Deterministic offline mode. CI and the test suite always run with this on,
# so no API key and no network access are required to verify the service.
AI_MOCK_MODE = os.getenv("AI_MOCK_MODE", "true").lower() in _TRUTHY

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Any provider exposing an OpenAI-compatible chat completions endpoint can be
# used without a second SDK or a second code path. Gemini publishes one, which
# is how this runs on Google's free tier. Empty means talk to OpenAI itself.
#
#   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
#   OPENAI_MODEL=<a model name from Google's documentation>
#   OPENAI_API_KEY=<a Google AI Studio key>
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")

# A missing key degrades the feature to deterministic mock output instead of
# crashing the container, which keeps Staging usable without a paid secret.
USE_REAL_LLM = not AI_MOCK_MODE and bool(OPENAI_API_KEY)
