"""
Unit tests for flood zone, school, and rent services.
All HTTP calls are intercepted with pytest-httpx.
"""
import re
import pytest
import httpx
from unittest.mock import patch, MagicMock
from pytest_httpx import HTTPXMock

from backend.services.risk_service import get_flood_zone
from backend.services.school_service import get_nearby_schools
from backend.services.rent_service import get_rent_estimate


# ── Flood Zone ────────────────────────────────────────────────────────────────

async def test_flood_zone_low_risk(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=re.compile(r"https://hazards\.fema\.gov"),
        json={
            "features": [
                {"attributes": {"FLD_ZONE": "X", "ZONE_SUBTY": "", "SFHA_TF": "F"}}
            ]
        },
    )
    result = await get_flood_zone(32.77, -96.79)
    assert result["zone"] == "X"
    assert result["risk_label"] == "Low Risk"
    assert result["in_sfha"] is False


async def test_flood_zone_high_risk(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=re.compile(r"https://hazards\.fema\.gov"),
        json={
            "features": [
                {"attributes": {"FLD_ZONE": "AE", "ZONE_SUBTY": "", "SFHA_TF": "T"}}
            ]
        },
    )
    result = await get_flood_zone(32.77, -96.79)
    assert result["zone"] == "AE"
    assert result["risk_label"] == "High Risk"
    assert result["in_sfha"] is True


async def test_flood_zone_no_features_returns_unknown(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=re.compile(r"https://hazards\.fema\.gov"), json={"features": []})
    result = await get_flood_zone(32.77, -96.79)
    assert result["zone"] == "Unknown"


async def test_flood_zone_network_error_returns_unknown(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("timeout"))
    result = await get_flood_zone(32.77, -96.79)
    assert result["zone"] == "Unknown"


# ── School Service ────────────────────────────────────────────────────────────

async def test_get_nearby_schools(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=re.compile(r"https://services1\.arcgis\.com"),
        json={
            "features": [
                {
                    "attributes": {
                        "NAME": "Oak Creek Elementary",
                        "LEVEL_": "Elementary",
                        "CITY": "Dallas",
                        "STATE": "TX",
                        "CHARTER_SCH": "No",
                        "MAGNET": "No",
                        "LAT": 32.78,
                        "LON": -96.80,
                    },
                }
            ]
        },
    )
    schools = await get_nearby_schools(32.77, -96.79)
    assert len(schools) >= 1
    assert schools[0]["name"] == "Oak Creek Elementary"
    assert schools[0]["level"] == "Elementary"


async def test_get_nearby_schools_network_error_returns_empty(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("timeout"))
    schools = await get_nearby_schools(32.77, -96.79)
    assert schools == []


# ── Rent Service ─────────────────────────────────────────────────────────────

async def test_rent_estimate_fallback_when_no_key():
    mock_settings = MagicMock()
    mock_settings.rentcast_api_key = ""
    with patch("backend.services.rent_service.get_settings", return_value=mock_settings):
        result = await get_rent_estimate("123 Test St", "Single Family", 3, 2.0, 1800)

    assert "rent_mid" in result
    assert result["rent_mid"] > 0
    assert result["source"] == "Estimate"


async def test_rent_estimate_rentcast_success(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=re.compile(r"https://api\.rentcast\.io"),
        json={"rent": 2200, "rentRangeLow": 1980, "rentRangeHigh": 2420},
    )
    mock_settings = MagicMock()
    mock_settings.rentcast_api_key = "test-key"
    with patch("backend.services.rent_service.get_settings", return_value=mock_settings):
        result = await get_rent_estimate("123 Main St", "Single Family", 3, 2.0, 1800)

    assert result["rent_mid"] == 2200
    assert result["source"] == "RentCast"


async def test_rent_estimate_rentcast_fallback_on_402(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=re.compile(r"https://api\.rentcast\.io"), status_code=402)
    mock_settings = MagicMock()
    mock_settings.rentcast_api_key = "test-key"
    with patch("backend.services.rent_service.get_settings", return_value=mock_settings):
        result = await get_rent_estimate("123 Main St", "Single Family", 3, 2.0, 1800)

    assert result["source"] == "Estimate"
