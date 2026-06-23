"""OpenStreetMap morphology via osmnx / geopandas."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

from data_ingestion.cache import save_parquet
from utils import synthetic_grid_shape

logger = logging.getLogger(__name__)


def fetch_osm_morphology(config: dict, out_dir: Path) -> Path:
    """Download OSM buildings and roads; compute density metrics per grid cell."""
    out_path = out_dir / "tables" / "osm_morphology.parquet"
    if out_path.exists():
        return out_path

    if config.get("data_mode") == "gee":
        try:
            import osmnx as ox
            from shapely.geometry import box

            from data_ingestion.cache import save_geopackage

            bbox = config["bbox"]
            poly = box(bbox[0], bbox[1], bbox[2], bbox[3])
            ox.settings.use_cache = True
            ox.settings.log_console = False
            buildings = ox.features_from_polygon(poly, tags={"building": True})
            roads = ox.graph_from_polygon(poly, network_type="drive")
            edges = ox.graph_to_gdfs(roads, nodes=False)
            import geopandas as gpd

            gdf = gpd.GeoDataFrame(
                {"type": ["buildings", "roads"], "geometry": [buildings.unary_union, edges.unary_union]},
                crs="EPSG:4326",
            )
            gpkg_path = out_dir / "vectors" / "osm_features.gpkg"
            save_geopackage(gdf, gpkg_path)
            logger.info("OSM features saved to %s", gpkg_path)
        except Exception as exc:
            logger.warning("OSM fetch failed (%s) — using synthetic morphology grid.", exc)

    return _synthetic_morphology(config, out_path)


def _synthetic_morphology(config: dict, out_path: Path) -> Path:
    h, w = synthetic_grid_shape(config)
    rng = np.random.default_rng(11)
    y, x = np.mgrid[0:h, 0:w]
    urban = np.exp(-((x - w * 0.55) ** 2 + (y - h * 0.45) ** 2) / (2 * 22**2))
    flat = h * w
    df = pd.DataFrame(
        {
            "row": y.ravel(),
            "col": x.ravel(),
            "building_density": (0.1 + 0.8 * urban.ravel() + rng.normal(0, 0.05, flat)).clip(0, 1),
            "road_density": (0.05 + 0.6 * urban.ravel() + rng.normal(0, 0.04, flat)).clip(0, 1),
        }
    )
    save_parquet(df, out_path)
    return out_path
