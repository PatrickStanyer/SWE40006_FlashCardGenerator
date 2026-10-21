"""Flashcard generation and the in-memory deck store.

Two generation paths share one signature. Mock mode is fully deterministic and
needs no network, which is what CI and the test suite run against. Live mode
calls OpenAI and is only reachable when a key is configured.
"""
import hashlib
import json
import logging
from typing import Literal, NamedTuple

from app import config
from app.models import Card

logger = logging.getLogger(__name__)

# Which path produced a deck. "model" means the provider answered and the
# reply parsed; "deterministic" means the offline generator produced it,
# either because no key is configured or because the live call failed.
Source = Literal["model", "deterministic"]


class Deck(NamedTuple):
    """A deck together with the path that produced it.

    The source travels with the cards because nothing else distinguishes
    them. A failed live call falls back to deterministic output of exactly
    the same shape, so a broken credential looks identical to one that was
    never configured unless the service says which path it took.
    """

    cards: list[Card]
    source: Source | None

# Question and answer angles the mock generator cycles through. Keeping several
# of them means a short deck never repeats itself.
_ANGLES: list[tuple[str, str]] = [
    (
        "What is {topic}?",
        "{topic} is the subject of this deck. Define it in one sentence, then name the "
        "problem it exists to solve.",
    ),
    (
        "Why does {topic} matter in practice?",
        "Because teams adopt {topic} to remove a specific cost or risk. Name that cost and "
        "the trade-off accepted in return.",
    ),
    (
        "What are the core components of {topic}?",
        "Break {topic} into its main parts and state what each part is responsible for on "
        "its own.",
    ),
    (
        "How would you explain {topic} to someone new?",
        "Start from a situation they already understand, then show the one change {topic} "
        "introduces.",
    ),
    (
        "What is a common mistake when working with {topic}?",
        "Most mistakes with {topic} come from assuming a default that does not hold. Name "
        "the default and when it breaks.",
    ),
    (
        "How is {topic} usually measured or verified?",
        "State the signal that tells you {topic} is working, and the signal that tells you "
        "it has failed.",
    ),
    (
        "What is an alternative to {topic}, and when is it better?",
        "Name one alternative to {topic} and the condition under which you would pick it "
        "instead.",
    ),
    (
        "Where does {topic} fit into a wider system?",
        "Describe what feeds into {topic} and what consumes its output.",
    ),
    (
        "What would break if {topic} were taken away?",
        "Name what {topic} is currently holding together, and what the fallback "
        "would cost in time, money or risk.",
    ),
]

# Appended once the deck is long enough to wrap past every angle, so cards in a
# second or third pass stay distinct from the first.
_DEPTH_SUFFIXES: list[str] = [
    "",
    " Give a concrete example.",
    " Explain the edge case.",
    " Compare it with the obvious alternative.",
    " Describe how you would test it.",
    " Say what you would monitor in production.",
    " Name the failure mode.",
]

# The most recent deck produced by /api/generate. Held in memory only, so the
# service stays stateless across restarts, which is what the deployment
# assumes. A source of None means nothing has been generated yet.
_LAST_DECK: Deck = Deck([], None)


def _starting_angle(topic: str) -> int:
    """Pick a stable starting angle so different topics do not all open the same way.

    A digest is used rather than the built-in hash because the built-in is
    salted per process, which would make output differ between workers.
    """
    digest = hashlib.sha256(topic.strip().lower().encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % len(_ANGLES)


def generate_mock_cards(topic: str, count: int) -> list[Card]:
    """Build a deck without calling any external service.

    The result depends only on topic and count, so repeating a request returns
    an identical payload.
    """
    offset = _starting_angle(topic)
    cards: list[Card] = []
    for index in range(count):
        question, answer = _ANGLES[(offset + index) % len(_ANGLES)]
        depth = _DEPTH_SUFFIXES[(index // len(_ANGLES)) % len(_DEPTH_SUFFIXES)]
        cards.append(
            Card(
                id=index,
                front=question.format(topic=topic) + depth,
                back=answer.format(topic=topic),
            )
        )
    return cards


def _json_from_reply(content: str) -> dict:
    """Parse a model reply that may or may not be wrapped in a code fence.

    Asking for JSON does not guarantee bare JSON. The same model returns it
    plain on one call and fenced as a markdown block on the next, and a fence
    makes json.loads fail on a reply that was otherwise correct.
    """
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]  # drop the opening fence and its tag
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = chr(10).join(lines)
    return json.loads(text or "{}")

def _generate_with_openai(topic: str, count: int) -> Deck:  # pragma: no cover
    """Build a deck from the configured model.

    Imported lazily so the package is only touched when a key is present, and
    excluded from coverage because it cannot run without a paid credential.
    """
    from openai import OpenAI

    # Only the key is required. A base URL points the same client at any
    # provider exposing an OpenAI-compatible endpoint, which is how this talks
    # to Gemini without a second SDK or a second code path here.
    client_options: dict[str, object] = {
        "api_key": config.OPENAI_API_KEY,
        "timeout": config.OPENAI_TIMEOUT,
        "max_retries": config.OPENAI_MAX_RETRIES,
    }
    if config.OPENAI_BASE_URL:
        client_options["base_url"] = config.OPENAI_BASE_URL

    instruction = (
        f"Write {count} study flashcards about {topic}. Return JSON of the form "
        '{"cards": [{"front": "...", "back": "..."}]} and nothing else.'
    )

    # A rate limit, an unreachable provider, a changed model name or a reply
    # that is not valid JSON all end up here. None of them should reach the
    # person who just asked for a deck, so every one degrades to mock output.
    try:
        client = OpenAI(**client_options)
        completion = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[{"role": "user", "content": instruction}],
            response_format={"type": "json_object"},
        )
        payload = _json_from_reply(completion.choices[0].message.content or "")
        raw = payload.get("cards", [])
    except Exception:
        logger.exception("Live generation failed, falling back to deterministic output")
        return Deck(generate_mock_cards(topic, count), "deterministic")
    cards = [
        Card(id=index, front=str(item.get("front", "")), back=str(item.get("back", "")))
        for index, item in enumerate(raw[:count])
    ]
    # A short or malformed reply falls back to mock output rather than failing
    # the request, so the user still gets a usable deck.
    if len(cards) < count:
        return Deck(generate_mock_cards(topic, count), "deterministic")
    return Deck(cards, "model")


def generate_cards(topic: str, count: int) -> Deck:
    """Return a deck for topic, using whichever generation path is configured."""
    if config.USE_REAL_LLM:  # pragma: no cover - needs a live API key
        return _generate_with_openai(topic, count)
    return Deck(generate_mock_cards(topic, count), "deterministic")


def remember_deck(deck: Deck) -> None:
    """Store the deck just generated so /api/cards can hand it back."""
    global _LAST_DECK
    _LAST_DECK = Deck(list(deck.cards), deck.source)


def latest_deck() -> Deck:
    """Return a copy of the most recent deck, empty before the first generation."""
    return Deck(list(_LAST_DECK.cards), _LAST_DECK.source)
