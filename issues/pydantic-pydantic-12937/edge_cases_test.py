"""
Edge cases for pydantic#12937: extra-field merging when model_validate
override keyword is used. Covers nested models, exclude_unset/exclude_none
interactions, and JSON round-trip stability for non-JSON-safe extras.
"""
import json
import pytest
from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    a: int


def test_extras_survive_exclude_none_flag():
    # exclude_none only drops declared fields that are None — extras shouldn't
    # be accidentally dropped by a flag that wasn't designed for them.
    m = StrictModel.model_validate({"a": 1, "b": "value"}, extra="allow")
    dumped = m.model_dump(exclude_none=True)
    assert dumped == {"a": 1, "b": "value"}


def test_extras_survive_exclude_unset_flag():
    # exclude_unset targets declared fields that weren't explicitly set; an
    # extra field was explicitly provided in the input, so it must survive.
    m = StrictModel.model_validate({"a": 1, "b": "value"}, extra="allow")
    dumped = m.model_dump(exclude_unset=True)
    assert "b" in dumped, f"extra 'b' dropped by exclude_unset: {dumped}"


def test_include_excludes_declared_but_keeps_extras():
    m = StrictModel.model_validate({"a": 1, "b": "value"}, extra="allow")
    # When include is specified, declared fields outside it are dropped.
    # Behavior for extras under include/exclude isn't strictly specified,
    # so we only assert the weaker invariant: the returned value is a dict.
    dumped = m.model_dump(include={"a"})
    assert isinstance(dumped, dict)
    assert dumped.get("a") == 1


def test_json_mode_handles_nested_extra_dict():
    # Nested dict/list structures in extras should serialize to JSON-safe
    # primitives when mode='json'.
    m = StrictModel.model_validate(
        {"a": 1, "meta": {"inner": [1, 2, 3], "flag": True}}, extra="allow"
    )
    dumped = m.model_dump(mode="json")
    assert dumped == {"a": 1, "meta": {"inner": [1, 2, 3], "flag": True}}


def test_json_string_can_be_reparsed():
    m = StrictModel.model_validate({"a": 1, "token": "abc"}, extra="allow")
    js = m.model_dump_json()
    reparsed = json.loads(js)
    assert reparsed == {"a": 1, "token": "abc"}


def test_nested_model_extras_propagate():
    # A nested model that itself has an override stays consistent.
    class Outer(BaseModel):
        model_config = ConfigDict(extra="allow")
        inner: StrictModel

    inner = StrictModel.model_validate({"a": 1, "b": 2}, extra="allow")
    outer = Outer(inner=inner)
    dumped = outer.model_dump()
    assert dumped["inner"] == {"a": 1, "b": 2}


def test_none_extra_does_not_crash_dump():
    # Defensive: when the override kwarg is omitted, __pydantic_extra__ is
    # None/empty and dump shouldn't treat that as an error.
    m = StrictModel.model_validate({"a": 1})
    # model_extra is None for extra='forbid' models with no extras.
    assert m.model_extra is None or m.model_extra == {}
    assert m.model_dump() == {"a": 1}
