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
OPENAI_TIMEOUT = float(os.getenv("OPENAI_TIMEOUT", "25"))
OPENAI_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "1"))

# A missing key degrades the feature to deterministic mock output instead of
# crashing the container, which keeps Staging usable without a paid secret.
USE_REAL_LLM = not AI_MOCK_MODE and bool(OPENAI_API_KEY)
