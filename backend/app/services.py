"""Flashcard generation and the in-memory deck store.

Two generation paths share one signature. Mock mode is fully deterministic and
needs no network, which is what CI and the test suite run against. Live mode
calls OpenAI and is only reachable when a key is configured.
"""
import hashlib
import json

from app import config
from app.models import Card

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

# The most recent deck produced by /api/generate. A module-level list keeps the
# service stateless across restarts, which is what the deployment assumes.
_LAST_DECK: list[Card] = []


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


def _generate_with_openai(topic: str, count: int) -> list[Card]:  # pragma: no cover
    """Build a deck from the configured model.

    Imported lazily so the package is only touched when a key is present, and
    excluded from coverage because it cannot run without a paid credential.
    """
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)
    instruction = (
        f"Write {count} study flashcards about {topic}. Return JSON of the form "
        '{"cards": [{"front": "...", "back": "..."}]} and nothing else.'
    )
    completion = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[{"role": "user", "content": instruction}],
        response_format={"type": "json_object"},
    )
    payload = json.loads(completion.choices[0].message.content or "{}")
    raw = payload.get("cards", [])
    cards = [
        Card(id=index, front=str(item.get("front", "")), back=str(item.get("back", "")))
        for index, item in enumerate(raw[:count])
    ]
    # A short or malformed reply falls back to mock output rather than failing
    # the request, so the user still gets a usable deck.
    if len(cards) < count:
        return generate_mock_cards(topic, count)
    return cards


def generate_cards(topic: str, count: int) -> list[Card]:
    """Return count cards for topic, using whichever generation path is configured."""
    if config.USE_REAL_LLM:  # pragma: no cover - needs a live API key
        return _generate_with_openai(topic, count)
    return generate_mock_cards(topic, count)


def remember_deck(cards: list[Card]) -> None:
    """Store the deck just generated so /api/cards can hand it back."""
    _LAST_DECK.clear()
    _LAST_DECK.extend(cards)


def latest_cards() -> list[Card]:
    """Return a copy of the most recent deck, empty before the first generation."""
    return list(_LAST_DECK)
