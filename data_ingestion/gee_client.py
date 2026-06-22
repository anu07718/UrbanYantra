"""Google Earth Engine client with graceful fallback."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_gee_initialized = False


def init_gee(project: str | None = None) -> bool:
    """Initialize GEE. Returns True if successful."""
    global _gee_initialized
    if _gee_initialized:
        return True
    try:
        import ee

        if project:
            ee.Initialize(project=project)
        else:
            ee.Initialize()
        _gee_initialized = True
        logger.info("Google Earth Engine initialized.")
        return True
    except Exception as exc:
        logger.warning("GEE init failed (%s). Use data_mode=synthetic or run earthengine authenticate.", exc)
        return False


def get_study_region(bbox: list[float]):
    """Return ee.Geometry.Rectangle from [min_lon, min_lat, max_lon, max_lat]."""
    import ee

    return ee.Geometry.Rectangle(bbox)
