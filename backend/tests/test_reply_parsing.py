"""Parsing of model replies.

A provider asked for JSON does not reliably return bare JSON. The same model
returned it plain on one call and wrapped in a markdown fence on the next,
which made the reply unusable even though its content was correct. These cover
both shapes so that regression cannot come back silently.
"""
import json

import pytest

from app.services import _json_from_reply

PAYLOAD = {"cards": [{"front": "What is a bridge network?", "back": "The default driver."}]}
BARE = json.dumps(PAYLOAD)


def test_parses_bare_json():
    assert _json_from_reply(BARE) == PAYLOAD


def test_parses_json_fenced_with_a_language_tag():
    fenced = "```json\n" + BARE + "\n```"
    assert _json_from_reply(fenced) == PAYLOAD


def test_parses_json_fenced_without_a_language_tag():
    fenced = "```\n" + BARE + "\n```"
    assert _json_from_reply(fenced) == PAYLOAD


def test_tolerates_surrounding_whitespace():
    assert _json_from_reply("\n\n  " + BARE + "  \n") == PAYLOAD


def test_parses_a_fence_that_was_never_closed():
    # A reply cut short by a token limit loses its closing fence.
    assert _json_from_reply("```json\n" + BARE) == PAYLOAD


def test_empty_reply_is_an_empty_object():
    assert _json_from_reply("") == {}
    assert _json_from_reply("   ") == {}


def test_genuinely_broken_json_still_raises():
    # The caller treats this as a failed generation and falls back, so it has
    # to keep raising rather than quietly returning nothing.
    with pytest.raises(json.JSONDecodeError):
        _json_from_reply("not json at all")
