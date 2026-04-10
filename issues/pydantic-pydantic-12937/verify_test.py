"""
Regression tests for extra fields with model_validate().
Extra fields accepted via extra="allow" must be preserved by model_dump().
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
