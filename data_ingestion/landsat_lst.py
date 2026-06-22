"""Landsat 8 Collection 2 Level-2 LST ingestion via GEE."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from data_ingestion.cache import save_geotiff
from data_ingestion.gee_client import get_study_region, init_gee

logger = logging.getLogger(__name__)


def _lst_kelvin_to_celsius(k: np.ndarray) -> np.ndarray:
    return k - 273.15


def fetch_landsat_lst_gee(config: dict, out_dir: Path) -> Path:
    """Fetch median LST composite from Landsat 8 C2 L2."""
    import ee

    if not init_gee():
        raise RuntimeError("GEE not available")

    bbox = config["bbox"]
    region = get_study_region(bbox)
    ls_cfg = config["landsat"]
    scale_factor = ls_cfg["scale_factor"]
    offset = ls_cfg["offset"]

    collection = (
        ee.ImageCollection(ls_cfg["collection"])
        .filterBounds(region)
        .filterDate(config["date_range"]["start"], config["date_range"]["end"])
        .filter(ee.Filter.lt("CLOUD_COVER", ls_cfg["cloud_cover_max"]))
    )

    def apply_scale(img):
        lst = img.select(ls_cfg["lst_band"]).multiply(scale_factor).add(offset)
        return lst.rename("LST_K").copyProperties(img, ["system:time_start"])

    lst_median = collection.map(apply_scale).median().clip(region)

    res_m = config.get("target_resolution_m", 30)
    # Landsat native ~30 m; export at 30 for baseline before downscaling
    export_scale = max(res_m, 30)

    url = lst_median.getDownloadURL(
        {
            "scale": export_scale,
            "crs": config.get("crs", "EPSG:4326"),
            "region": region,
            "format": "GEO_TIFF",
        }
    )

    import requests

    resp = requests.get(url, timeout=300)
    resp.raise_for_status()
    raw_path = out_dir / "raw" / "landsat_lst_raw.tif"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_bytes(resp.content)
    logger.info("Saved Landsat LST to %s", raw_path)
    return raw_path


def generate_synthetic_lst(config: dict, shape: tuple[int, int] = (120, 120)) -> np.ndarray:
    """Synthetic LST field with urban heat island pattern for demo fallback."""
    rng = np.random.default_rng(42)
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    cx, cy = w * 0.55, h * 0.45
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    urban_core = 38 + 4 * np.exp(-dist / 25)
    rural = 32 + 0.02 * x
    lst = urban_core * 0.7 + rural * 0.3 + rng.normal(0, 0.5, (h, w))
    return lst.astype(np.float32)


def ingest_landsat_lst(config: dict, out_dir: Path) -> Path:
    """Ingest Landsat LST; synthetic fallback when data_mode != gee."""
    out_path = out_dir / "rasters" / "landsat_lst_c.tif"
    if out_path.exists():
        return out_path

    mode = config.get("data_mode", "synthetic")
    if mode == "gee":
        try:
            return fetch_landsat_lst_gee(config, out_dir)
        except Exception as exc:
            logger.warning("GEE Landsat fetch failed: %s — using synthetic.", exc)

    lst = generate_synthetic_lst(config)
    save_geotiff(lst, out_path, config["bbox"])
    logger.info("Synthetic Landsat LST saved to %s", out_path)
    return out_path
