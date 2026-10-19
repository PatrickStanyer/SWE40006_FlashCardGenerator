"""Shared fixtures. Tests always run in deterministic mock mode (no LLM/network)."""
import os

# Must be set before the app module is imported so services.py reads mock mode.
os.environ["AI_MOCK_MODE"] = "true"
os.environ.pop("OPENAI_API_KEY", None)

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def card_fields():
    """The frontend accepts front/back OR question/answer (see frontend/src/api.js)."""

    def _extract(card):
        front = card.get("front", card.get("question"))
        back = card.get("back", card.get("answer"))
        return front, back

    return _extract
