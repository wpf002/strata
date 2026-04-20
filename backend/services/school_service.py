"""
School data service using NCES ArcGIS (no API key required).
"""
import httpx

_NCES_URL = (
    "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services"
    "/School_Locations_Current/FeatureServer/0/query"
)

_LEVEL_MAP = {
    "ELEMENTARY": "Elementary",
    "MIDDLE": "Middle",
    "HIGH": "High",
}

_LEVEL_SORT = {"Elementary": 0, "Middle": 1, "High": 2, "Other": 3}


async def get_nearby_schools(lat: float, lon: float, radius_miles: int = 3) -> list[dict]:
    try:
        params = {
            "where": "1=1",
            "geometry": f"{lon},{lat}",
            "geometryType": "esriGeometryPoint",
            "spatialRel": "esriSpatialRelIntersects",
            "distance": radius_miles,
            "units": "esriSRUnit_Miles",
            "outFields": "NAME,CITY,STATE,LEVEL_,VIRTUAL,MAGNET,CHARTER_SCH,LAT,LON",
            "returnGeometry": "false",
            "f": "json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_NCES_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for feature in data.get("features", []):
            a = feature.get("attributes", {})
            raw_level = (a.get("LEVEL_") or "").upper()
            level = _LEVEL_MAP.get(raw_level, "Other")
            results.append({
                "name": a.get("NAME", "Unknown"),
                "level": level,
                "city": a.get("CITY", ""),
                "state": a.get("STATE", ""),
                "is_charter": (a.get("CHARTER_SCH") or "").upper() == "YES",
                "is_magnet": (a.get("MAGNET") or "").upper() == "YES",
                "lat": a.get("LAT"),
                "lon": a.get("LON"),
            })

        results.sort(key=lambda s: _LEVEL_SORT.get(s["level"], 3))
        return results[:10]

    except Exception:
        return []
