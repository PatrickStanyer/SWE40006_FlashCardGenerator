"""Counters have to answer one question: is generation reaching the model?

A deployment whose credential is rejected still serves every request, so the
only outward sign is which counter moves. These tests pin the parts that make
that readable: both paths always present, the deterministic path counted when
the model is off, and the numbers moving with real requests.
"""
import pytest

from app import config, metrics, services


@pytest.fixture(autouse=True)
def clean_counters():
    metrics.reset()
    services.remember_deck(services.Deck([], None))
    yield
    metrics.reset()
    services.remember_deck(services.Deck([], None))


def _value(body: str, line_start: str) -> float:
    for line in body.splitlines():
        if line.startswith(line_start):
            return float(line.rsplit(" ", 1)[1])
    raise AssertionError(f"no line starting with {line_start!r} in:\n{body}")


async def test_metrics_endpoint_serves_the_prometheus_content_type(client):
    res = await client.get("/metrics")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert "version=0.0.4" in res.headers["content-type"]


async def test_both_paths_are_reported_before_anything_is_generated(client):
    # A series that only appears on first use cannot be alerted on, because a
    # scraper has nothing to compare against when the fallback starts.
    body = (await client.get("/metrics")).text
    assert _value(body, 'flashcard_decks_generated_total{source="model"}') == 0
    assert _value(body, 'flashcard_decks_generated_total{source="deterministic"}') == 0


async def test_generating_moves_the_deterministic_counters(client):
    await client.post("/api/generate", json={"topic": "Docker", "count": 3})
    body = (await client.get("/metrics")).text

    assert _value(body, 'flashcard_decks_generated_total{source="deterministic"}') == 1
    assert _value(body, 'flashcard_cards_generated_total{source="deterministic"}') == 3
    assert _value(body, 'flashcard_decks_generated_total{source="model"}') == 0


async def test_duration_is_counted_against_the_path_that_served_it(client):
    await client.post("/api/generate", json={"topic": "Docker", "count": 2})
    body = (await client.get("/metrics")).text

    name = "flashcard_generation_duration_seconds"
    assert _value(body, f'{name}_count{{source="deterministic"}}') == 1
    assert _value(body, f'{name}_sum{{source="deterministic"}}') >= 0


async def test_a_model_deck_is_counted_against_the_model_path(client, monkeypatch):
    deck = services.Deck(services.generate_mock_cards("Docker", 2), "model")
    monkeypatch.setattr(services, "generate_cards", lambda topic, count: deck)

    await client.post("/api/generate", json={"topic": "Docker", "count": 2})
    body = (await client.get("/metrics")).text

    assert _value(body, 'flashcard_decks_generated_total{source="model"}') == 1
    assert _value(body, 'flashcard_decks_generated_total{source="deterministic"}') == 0


async def test_build_info_carries_the_running_version(client):
    body = (await client.get("/metrics")).text
    assert f'flashcard_build_info{{version="{config.APP_VERSION}"}} 1' in body


def test_an_unknown_source_is_not_counted():
    # Guards the label set: a stray value would create a series nobody watches.
    metrics.observe_generation("something-else", 3, 0.1)
    body = metrics.render()
    assert "something-else" not in body
    assert _value(body, 'flashcard_decks_generated_total{source="model"}') == 0


def test_label_values_are_escaped(monkeypatch):
    # Built from character codes, so the test is not itself a backslash puzzle.
    quote, slash = chr(34), chr(92)
    monkeypatch.setattr(config, "APP_VERSION", f"sha-{quote}x{quote}{slash}y")

    value = f"sha-{slash}{quote}x{slash}{quote}{slash}{slash}y"
    assert f"flashcard_build_info{{version={quote}{value}{quote}}} 1" in metrics.render()
