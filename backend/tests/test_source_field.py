"""The REST contract has to say which generator produced a deck.

Without it a caller cannot tell a live reply from a silent fallback. That is
not hypothetical: a model name carrying a trailing newline was rejected by the
provider on Staging, generation quietly dropped to the deterministic path, and
the service went on answering 200 with well formed cards for most of a day.
Nothing in the response could have shown it.
"""
import pytest

from app import services
from app.main import app
from app.models import Card


@pytest.fixture(autouse=True)
def reset_store():
    services.remember_deck(services.Deck([], None))
    yield
    services.remember_deck(services.Deck([], None))


async def test_generate_reports_the_deterministic_source(client):
    # conftest pins the suite to mock mode, so this is the offline path.
    res = await client.post("/api/generate", json={"topic": "Docker", "count": 2})
    assert res.status_code == 200
    assert res.json()["source"] == "deterministic"


async def test_cards_endpoint_has_no_source_before_any_generation(client):
    body = (await client.get("/api/cards")).json()
    assert body["cards"] == []
    assert body["source"] is None


async def test_cards_endpoint_keeps_the_source_of_the_stored_deck(client):
    generated = (await client.post("/api/generate", json={"topic": "Docker", "count": 2})).json()
    stored = (await client.get("/api/cards")).json()
    assert stored["source"] == generated["source"]
    assert stored["cards"] == generated["cards"]


async def test_generate_passes_a_model_source_through(client, monkeypatch):
    # The live path cannot run here, so stand in for it and check the route
    # reports what the service handed it rather than a hardcoded value.
    deck = services.Deck([Card(id=0, front="Q", back="A")], "model")
    monkeypatch.setattr(services, "generate_cards", lambda topic, count: deck)

    body = (await client.post("/api/generate", json={"topic": "Docker", "count": 1})).json()
    assert body["source"] == "model"
    assert body["cards"] == [{"id": 0, "front": "Q", "back": "A"}]


def test_source_is_published_in_the_openapi_contract():
    # The frontend reads this field, so it belongs in the generated document
    # rather than being an undeclared extra on the response.
    schema = app.openapi()["components"]["schemas"]["CardsResponse"]
    assert "source" in schema["properties"]
