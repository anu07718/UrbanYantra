"""Export pipeline outputs including maps, rankings, summaries, and data provenance."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger("export_maps")


def _artifact_exists(out_dir: Path, rel: str) -> bool:
    return (out_dir / rel).exists()


def export_outputs(config: dict, df: pd.DataFrame, out_dir: Path) -> None:
    """Export pipeline outputs and a provenance manifest for the API/UI."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    city_key = config.get("city_key", "unknown")
    city_name = config.get("city_name", city_key)
    data_mode = config.get("data_mode", "unknown")
    is_real_mode = data_mode in {"gee", "local"}
    uses_local_cache = data_mode == "local" or bool((config.get("local_data") or {}).get("prefer_local_over_gee"))

    logger.info("Exporting outputs for %s to %s", city_name, out_dir)

    features_path = out_dir / "features.csv"
    df.to_csv(features_path, index=False)
    logger.info("Exported features: %s", features_path)

    sources = {
        "landsat_lst": _artifact_exists(out_dir, "rasters/landsat_lst_c.tif"),
        "sentinel2_ndvi": _artifact_exists(out_dir, "rasters/ndvi.tif"),
        "worldcover": _artifact_exists(out_dir, "rasters/worldcover.tif"),
        "ghsl": _artifact_exists(out_dir, "rasters/ghsl_building_height.tif"),
        "era5_meteo": _artifact_exists(out_dir, "tables/era5_land_hourly.parquet"),
        "osm_morphology": _artifact_exists(out_dir, "tables/osm_morphology.parquet"),
        "osm_buildings": _artifact_exists(out_dir, "vectors/osm_buildings.gpkg"),
        "station_calibration": _artifact_exists(out_dir, "calibration/station_calibration.json"),
        "ward_boundaries": _artifact_exists(out_dir, "geojson/ward_zonal.geojson"),
        "feature_table": _artifact_exists(out_dir, "tables/feature_table.parquet"),
        "lst_10m": _artifact_exists(out_dir, "rasters/lst_10m.tif"),
    }

    summary = {
        "city_key": city_key,
        "city_name": city_name,
        "data_mode": data_mode,
        "is_real_data": is_real_mode,
        "data_sources": {
            "landsat_lst": "Google Earth Engine — Landsat 8 Collection 2 L2 ST_B10",
            "sentinel2": "Google Earth Engine — Sentinel-2 SR harmonized (NDVI/NDBI/NDWI/UTFVI)",
            "worldcover": "Google Earth Engine — ESA WorldCover v200",
            "ghsl": "Google Drive/cache — GHSL Built-S + SMOD tiles" if uses_local_cache else "Google Earth Engine — JRC GHSL building height & population",
            "era5_meteo": "Google Drive/cache — ERA5 UTCI NetCDF" if uses_local_cache else "ERA5-Land reanalysis (GEE or Open-Meteo archive)",
            "osm_morphology": "OpenStreetMap buildings/roads (or WorldCover impervious fallback)",
            "station_calibration": "CPCB/IMD station coords + Open-Meteo/GEE air temperature",
            "ward_boundaries": "OpenStreetMap admin polygons + Voronoi seeds",
        },
        "artifacts_present": sources,
        "num_features": int(df.shape[1]),
        "num_samples": int(df.shape[0]),
        "output_dir": str(out_dir),
    }

    summary_path = out_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logger.info("Exported summary: %s", summary_path)

    for subdir in [
        "rasters", "tables", "simulation", "vectors", "ranking",
        "explainability", "models", "maps", "raw", "calibration", "geojson",
    ]:
        (out_dir / subdir).mkdir(parents=True, exist_ok=True)

    logger.info("Export complete for %s", city_name)
