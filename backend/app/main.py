"""FastAPI entrypoint for the flashcard service.

The frontend reaches this service through the nginx proxy at /api, and the CD
smoke test reaches /healthz through the same proxy, so both paths are part of
the deployed contract rather than internal detail.

No CORS middleware is configured on purpose. Every caller arrives same-origin,
through nginx in Staging and Production and through the Vite dev proxy locally,
so opening cross-origin access would widen the attack surface for nothing.
"""
from fastapi import FastAPI

from app import config, services
from app.models import CardsResponse, GenerateRequest, HealthResponse

app = FastAPI(
    title="Flashcard Generator API",
    version=config.APP_VERSION,
    description="Generates study flashcards from a topic and serves the most recent deck.",
)


@app.get("/healthz", response_model=HealthResponse, tags=["ops"])
async def healthz() -> HealthResponse:
    """Liveness probe used by the Docker healthcheck, nginx and the CD smoke test."""
    return HealthResponse(status="ok", version=config.APP_VERSION)


@app.post("/api/generate", response_model=CardsResponse, tags=["cards"])
async def generate(payload: GenerateRequest) -> CardsResponse:
    """Generate a deck for the requested topic and keep it as the current deck.

    Validation failures are turned into 422 responses by FastAPI before this
    function runs, which is what the frontend relies on to show a field error.
    """
    deck = services.generate_cards(payload.topic, payload.count)
    services.remember_deck(deck)
    return CardsResponse(cards=deck.cards, source=deck.source)


@app.get("/api/cards", response_model=CardsResponse, tags=["cards"])
async def list_cards() -> CardsResponse:
    """Return the most recently generated deck, or an empty deck on a cold start."""
    deck = services.latest_deck()
    return CardsResponse(cards=deck.cards, source=deck.source)
