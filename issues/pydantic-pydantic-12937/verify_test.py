"""
Verification tests for pydantic/pydantic#12937
Bug: Extra fields accepted via model_validate(..., extra="allow") are
     silently dropped by model_dump().

These tests fail at brokenSha 94dd544, pass when the bug is fixed.
"""
import json
import pytest
from pydantic import BaseModel, ConfigDict, ValidationError


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    a: int


def test_extra_fields_included_in_model_dump():
    """model_dump() should include extra fields accepted via model_validate override."""
    m = StrictModel.model_validate({"a": 1, "b": "hello"}, extra="allow")
    dumped = m.model_dump()
    assert dumped == {"a": 1, "b": "hello"}, f"extra field 'b' missing from dump: {dumped}"


def test_extra_fields_included_in_model_dump_json():
    """model_dump_json() should also include extra fields."""
    m = StrictModel.model_validate({"a": 1, "b": 2}, extra="allow")
    dumped = json.loads(m.model_dump_json())
    assert dumped == {"a": 1, "b": 2}, f"extra field 'b' missing from JSON dump: {dumped}"


def test_extra_forbid_still_rejects_without_override():
    """Models with extra='forbid' should still reject extra fields normally."""
    with pytest.raises(ValidationError):
        StrictModel.model_validate({"a": 1, "unexpected": "x"})
