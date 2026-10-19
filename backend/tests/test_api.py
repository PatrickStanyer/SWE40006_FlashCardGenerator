"""Integration tests for the REST contract (healthz, generate, cards).

These exercise the real FastAPI app in-process through httpx.AsyncClient with
AI_MOCK_MODE=true, so they are fast, deterministic and need no network.
"""


def _cards_of(payload):
    """Accept either a bare list or {"cards": [...]} (mirrors frontend normalizeCards)."""
    cards = payload if isinstance(payload, list) else payload.get("cards")
    assert isinstance(cards, list), f"unexpected generate payload: {payload!r}"
    return cards


async def test_healthz_reports_ok_and_version(client):
    res = await client.get("/healthz")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]


async def test_generate_returns_requested_number_of_cards(client, card_fields):
    res = await client.post("/api/generate", json={"topic": "Docker", "count": 3})

    assert res.status_code == 200
    cards = _cards_of(res.json())
    assert len(cards) == 3
    for card in cards:
        front, back = card_fields(card)
        assert isinstance(front, str) and front.strip()
        assert isinstance(back, str) and back.strip()


async def test_generate_is_deterministic_in_mock_mode(client):
    payload = {"topic": "Kubernetes", "count": 4}

    first = await client.post("/api/generate", json=payload)
    second = await client.post("/api/generate", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


async def test_generate_rejects_missing_topic(client):
    res = await client.post("/api/generate", json={"count": 3})

    assert res.status_code == 422


async def test_generate_rejects_non_integer_count(client):
    res = await client.post("/api/generate", json={"topic": "Docker", "count": "many"})

    assert res.status_code == 422


async def test_generate_rejects_malformed_body(client):
    res = await client.post(
        "/api/generate", content="not json", headers={"Content-Type": "application/json"}
    )

    assert res.status_code == 422


async def test_cards_endpoint_returns_a_list(client):
    res = await client.get("/api/cards")

    assert res.status_code == 200
    assert isinstance(_cards_of(res.json()), list)


async def test_openapi_documents_the_contract(client):
    res = await client.get("/openapi.json")

    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/healthz" in paths
    assert "/api/generate" in paths
    assert "/api/cards" in paths
