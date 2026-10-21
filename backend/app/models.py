"""Request and response schemas for the public REST contract.

These models are the single source of truth for validation and for the
generated OpenAPI document, so the frontend and the test suite agree on one
shape without a separate schema file.
"""
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    """Body of POST /api/generate."""

    topic: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Subject the deck should cover, for example 'Docker networking'.",
    )
    count: int = Field(
        10,
        ge=1,
        le=50,
        description="How many cards to return. Capped so one request cannot exhaust the service.",
    )


class Card(BaseModel):
    """A single flashcard. The frontend reads front and back directly."""

    id: int = Field(..., description="Position of the card within the deck, starting at zero.")
    front: str = Field(..., description="The prompt shown first.")
    back: str = Field(
        ...,
        description=(
            "The reverse of the card, revealed on flip. An answer when a model "
            "wrote it, a study prompt when the deterministic generator did."
        ),
    )


class CardsResponse(BaseModel):
    """Envelope returned by both card endpoints."""

    cards: list[Card]
    source: Literal["model", "deterministic"] | None = Field(
        None,
        description=(
            "Which path produced this deck. 'model' means the provider answered and "
            "the reply parsed, 'deterministic' means the offline generator produced "
            "it, and null means no deck has been generated yet. Without this a "
            "caller cannot tell a live reply from a silent fallback."
        ),
    )


class HealthResponse(BaseModel):
    """Payload of the liveness probe."""

    status: str = Field(..., description="Always 'ok' when the process can serve traffic.")
    version: str = Field(..., description="Build version, set from APP_VERSION.")
