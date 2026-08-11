"""
Property-type filtering across data-source dialects.

The UI sends "Single Family"; RapidAPI stores "single_family"; the mock set uses
"Single Family". Exact string comparison meant a filter that matched in mock
mode returned nothing against live listings, with no error to show for it.
"""
import pytest

from backend.services.property_service import (
    matches_property_types,
    normalize_property_type,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Single Family", "single_family"),
        ("single_family", "single_family"),
        ("SFR", "single_family"),
        ("  Single   Family  ", "single_family"),
        ("Condo", "condo"),
        ("condos", "condo"),
        ("Townhomes", "townhouse"),
        ("Multi-Family", "multi_family"),
        ("duplex", "multi_family"),
        (None, None),
    ],
)
def test_normalize_property_type(raw, expected):
    assert normalize_property_type(raw) == expected


def test_matches_across_dialects():
    # UI label vs RapidAPI's stored value
    assert matches_property_types("single_family", ["Single Family"])
    # RapidAPI plural vs UI singular
    assert matches_property_types("condos", ["Condo"])
    # duplex is a multi-family for filtering purposes
    assert matches_property_types("duplex", ["Multi-Family"])


def test_does_not_match_unrelated_types():
    assert not matches_property_types("condo", ["Single Family"])
    assert not matches_property_types("land", ["Single Family", "Condo"])


def test_empty_request_matches_everything():
    assert matches_property_types("condo", [])
    assert matches_property_types("condo", None)
    assert matches_property_types(None, None)


def test_unknown_type_survives_normalization_without_crashing():
    assert normalize_property_type("Geodesic Dome") == "geodesic_dome"
    assert not matches_property_types("Geodesic Dome", ["Condo"])
    assert matches_property_types("Geodesic Dome", ["geodesic dome"])
