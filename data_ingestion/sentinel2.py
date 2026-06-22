"""Sentinel-2 surface reflectance and spectral indices via GEE."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from data_ingestion.cache import save_geotiff
from data_ingestion.gee_client import get_study_region, init_gee
from features.spectral_indices import compute_indices_from_bands

logger = logging.getLogger(__name__)


def generate_synthetic_s2_bands(config: dict, shape: tuple[int, int] = (120, 120)) -> dict[str, np.ndarray]:
    """Synthetic Sentinel-2-like bands for fallback."""
    rng = np.random.default_rng(7)
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    urban = np.exp(-((x - w * 0.55) ** 2 + (y - h * 0.45) ** 2) / (2 * 20**2))
    green = (0.15 + 0.25 * (1 - urban) + rng.normal(0, 0.02, (h, w))).clip(0.01, 0.5)
    nir = (0.2 + 0.35 * (1 - urban) + rng.normal(0, 0.02, (h, w))).clip(0.05, 0.7)
    swir = (0.1 + 0.2 * urban + rng.normal(0, 0.02, (h, w))).clip(0.02, 0.5)
    blue = (0.05 + 0.05 * urban + rng.normal(0, 0.01, (h, w))).clip(0.01, 0.2)
    return {"B2": blue.astype(np.float32), "B3": green.astype(np.float32), "B4": green * 0.9, "B8": nir, "B11": swir}


def fetch_sentinel2_gee(config: dict, out_dir: Path) -> dict[str, Path]:
    import ee

    if not init_gee():
        raise RuntimeError("GEE not available")

    bbox = config["bbox"]
    region = get_study_region(bbox)
    s2_cfg = config["sentinel2"]
    res_m = config.get("target_resolution_m", 10)

    def mask_clouds(img):
        qa = img.select("QA60")
        mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
        return img.updateMask(mask).divide(10000)

    collection = (
        ee.ImageCollection(s2_cfg["collection"])
        .filterBounds(region)
        .filterDate(config["date_range"]["start"], config["date_range"]["end"])
        .map(mask_clouds)
    )
    composite = collection.median().clip(region)
    bands = ["B2", "B3", "B4", "B8", "B11"]
    paths = {}
    for band in bands:
        url = composite.select(band).getDownloadURL(
            {"scale": res_m, "crs": config.get("crs", "EPSG:4326"), "region": region, "format": "GEO_TIFF"}
        )
        import requests

        resp = requests.get(url, timeout=300)
        resp.raise_for_status()
        p = out_dir / "rasters" / f"s2_{band.lower()}.tif"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(resp.content)
        paths[band] = p
    return paths


def ingest_sentinel2_indices(config: dict, out_dir: Path) -> dict[str, Path]:
    """Ingest S2 and export NDVI, NDBI, NDWI, UTFVI rasters."""
    raster_dir = out_dir / "rasters"
    raster_dir.mkdir(parents=True, exist_ok=True)
    index_names = ["ndvi", "ndbi", "ndwi", "utfvi"]
    existing = {n: raster_dir / f"{n}.tif" for n in index_names}
    if all(p.exists() for p in existing.values()):
        return existing

    mode = config.get("data_mode", "synthetic")
    bands = None
    if mode == "gee":
        try:
            band_paths = fetch_sentinel2_gee(config, out_dir)
            import rasterio

            bands = {}
            for b, p in band_paths.items():
                with rasterio.open(p) as src:
                    bands[b] = src.read(1).astype(np.float32)
        except Exception as exc:
            logger.warning("GEE Sentinel-2 failed: %s — synthetic.", exc)

    if bands is None:
        bands = generate_synthetic_s2_bands(config)

    indices = compute_indices_from_bands(bands)
    paths = {}
    for name, arr in indices.items():
        p = raster_dir / f"{name}.tif"
        save_geotiff(arr, p, config["bbox"])
        paths[name] = p
    return paths
