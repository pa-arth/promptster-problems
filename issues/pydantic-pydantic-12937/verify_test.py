"""
Regression tests for pydantic#12937 — extra fields captured via
model_validate(..., extra="allow") on a model whose class-level config is
"forbid" or "ignore" are silently dropped by model_dump / model_dump_json.

The validator already stores the overrides on __pydantic_extra__, but the
serializer is built from the class-level config and ignores them.

Fix: model_dump and model_dump_json merge __pydantic_extra__ into the output
when it is populated.
"""
import json
import pytest
from pydantic import BaseModel, ConfigDict, ValidationError


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    a: int


class IgnoreModel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    a: int


def test_extra_fields_round_trip_through_model_dump():
    m = StrictModel.model_validate({"a": 1, "b": "hello"}, extra="allow")
    assert m.model_dump() == {"a": 1, "b": "hello"}


def test_extra_fields_round_trip_through_model_dump_json():
    m = StrictModel.model_validate({"a": 1, "b": 2}, extra="allow")
    assert json.loads(m.model_dump_json()) == {"a": 1, "b": 2}


def test_multiple_extras_all_appear_in_dump():
    m = StrictModel.model_validate(
        {"a": 1, "b": "hello", "c": 3, "d": [1, 2]}, extra="allow"
    )
    assert m.model_dump() == {"a": 1, "b": "hello", "c": 3, "d": [1, 2]}


def test_declared_field_still_dumps_correctly_alongside_extras():
    m = StrictModel.model_validate({"a": 42, "b": "keep"}, extra="allow")
    dumped = m.model_dump()
    assert dumped["a"] == 42
    assert dumped["b"] == "keep"


def test_model_extra_contains_the_extras_on_the_instance():
    # Regression guard: __pydantic_extra__ / model_extra must be populated
    # by the validator regardless of how dump behaves.
    m = StrictModel.model_validate({"a": 1, "b": "x"}, extra="allow")
    assert m.model_extra == {"b": "x"}


def test_ignore_mode_also_respects_override():
    m = IgnoreModel.model_validate({"a": 1, "b": "y"}, extra="allow")
    assert m.model_dump() == {"a": 1, "b": "y"}


def test_no_override_preserves_forbid_semantics():
    # Regression guard: without the override, extra='forbid' must still reject.
    with pytest.raises(ValidationError):
        StrictModel.model_validate({"a": 1, "unexpected": "x"})


def test_no_override_preserves_ignore_semantics():
    # Regression guard: without the override, extra='ignore' still drops extras.
    m = IgnoreModel.model_validate({"a": 1, "unexpected": "x"})
    assert m.model_dump() == {"a": 1}


def test_empty_extra_dump_unchanged():
    # Regression guard: if no extras are captured, output is identical to
    # the pre-patch serializer.
    m = StrictModel.model_validate({"a": 1})
    assert m.model_dump() == {"a": 1}
    assert json.loads(m.model_dump_json()) == {"a": 1}


def test_dump_then_reparse_succeeds_when_target_accepts_extras():
    # With the fix, the dumped dict round-trips through a model that allows
    # extras — useful for inter-process handoff.
    class Accepting(BaseModel):
        model_config = ConfigDict(extra="allow")
        a: int

    m = StrictModel.model_validate({"a": 7, "note": "payload"}, extra="allow")
    dumped = m.model_dump()
    reloaded = Accepting.model_validate(dumped)
    assert reloaded.a == 7
    assert reloaded.model_extra == {"note": "payload"}
