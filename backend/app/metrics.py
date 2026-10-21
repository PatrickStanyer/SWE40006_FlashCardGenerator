"""Counters for the generation paths, in the Prometheus exposition format.

Written by hand rather than pulled from a library. The format is a few lines of
text, the service runs one process without forking, and keeping it here means
the hardened runtime image gains no dependency to scan, patch or justify.

What is counted is deliberately narrow. The question this has to answer is the
one the project could not answer for most of a day: is generation actually
reaching the model, or has it quietly fallen back? A counter per path makes the
fallback rate a number instead of something you notice by reading card text.
"""
import threading

from app import config

# Both paths are always reported, including before either has been used. A
# series that only appears on first use cannot be alerted on, because a scraper
# has nothing to compare against when the fallback starts.
_PATHS = ("model", "deterministic")

_lock = threading.Lock()
_decks: dict[str, int] = {}
_cards: dict[str, int] = {}
_seconds: dict[str, float] = {}


def reset() -> None:
    """Clear every counter. Used by the tests to isolate one case from the next."""
    with _lock:
        _decks.clear()
        _cards.clear()
        _seconds.clear()


def observe_generation(source: str | None, cards: int, seconds: float) -> None:
    """Record one generation: which path served it, how big, and how slow."""
    if source not in _PATHS:
        return
    with _lock:
        _decks[source] = _decks.get(source, 0) + 1
        _cards[source] = _cards.get(source, 0) + cards
        _seconds[source] = _seconds.get(source, 0.0) + seconds


def _escape(value: str) -> str:
    """Escape a label value the way the exposition format requires."""
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\n")


def render() -> str:
    """Return the current counters as a Prometheus exposition document."""
    with _lock:
        decks = dict(_decks)
        cards = dict(_cards)
        seconds = dict(_seconds)

    lines = [
        "# HELP flashcard_build_info Version string of the running build.",
        "# TYPE flashcard_build_info gauge",
        f'flashcard_build_info{{version="{_escape(config.APP_VERSION)}"}} 1',
        "# HELP flashcard_decks_generated_total Decks generated, by the path that produced them.",
        "# TYPE flashcard_decks_generated_total counter",
    ]
    for path in _PATHS:
        lines.append(f'flashcard_decks_generated_total{{source="{path}"}} {decks.get(path, 0)}')

    lines += [
        "# HELP flashcard_cards_generated_total Individual cards generated, by path.",
        "# TYPE flashcard_cards_generated_total counter",
    ]
    for path in _PATHS:
        lines.append(f'flashcard_cards_generated_total{{source="{path}"}} {cards.get(path, 0)}')

    # Count and sum rather than buckets: the average per path is what tells you
    # the live call is reaching the provider, and buckets would be guesswork at
    # this traffic level.
    lines += [
        "# HELP flashcard_generation_duration_seconds Time spent generating, by path.",
        "# TYPE flashcard_generation_duration_seconds summary",
    ]
    for path in _PATHS:
        lines.append(
            f'flashcard_generation_duration_seconds_count{{source="{path}"}} {decks.get(path, 0)}'
        )
    for path in _PATHS:
        lines.append(
            f'flashcard_generation_duration_seconds_sum{{source="{path}"}} '
            f"{seconds.get(path, 0.0):.6f}"
        )

    return "\n".join(lines) + "\n"
