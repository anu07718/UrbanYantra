"""Raster heatmap PNG + fine pixel-aligned grid for map visualization."""

from __future__ import annotations

import io
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio

from utils import load_city_config

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]

# step=2 → 60×60 cells (~3.6k); step=1 → full 120×120 (14.4k, heavier)
DEFAULT_GRID_STEP = 2
MAX_GRID_FEATURES = 14400


def _city_out_dir(city_key: str) -> Path:
    cfg = load_city_config(ROOT / "configs" / "cities.yaml", city_key)
    return ROOT / cfg["output_dir"]


def _read_raster(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        return src.read(1).astype(np.float32)


def _raster_bounds(city_key: str) -> tuple[float, float, float, float]:
    path = _city_out_dir(city_key) / "rasters" / "lst_10m.tif"
    with rasterio.open(path) as src:
        b = src.bounds
        return float(b.left), float(b.bottom), float(b.right), float(b.top)


def _layer_array(city_key: str, layer: str, df: pd.DataFrame) -> np.ndarray:
    raster_dir = _city_out_dir(city_key) / "rasters"
    h = int(df["row"].max()) + 1
    w = int(df["col"].max()) + 1

    if layer == "lst":
        return _read_raster(raster_dir / "lst_10m.tif")
    if layer == "ndvi":
        return _read_raster(raster_dir / "ndvi.tif")
    if layer == "utci":
        lst = _read_raster(raster_dir / "lst_10m.tif")
        humidity = float(df.get("humidity_proxy", pd.Series([0.55])).mean())
        return lst * 0.72 + humidity * 8.0 - 2.5
    if layer == "svf":
        imp = raster_dir / "impervious_frac.tif"
        if imp.exists():
            return _read_raster(imp)
        return _read_raster(raster_dir / "ndbi.tif")
    if layer == "vulnerability":
        hs = np.zeros((h, w), dtype=np.float32)
        for _, row in df.iterrows():
            hs[int(row["row"]), int(row["col"])] = float(row["hotspot_class"])
        return hs

    return _read_raster(raster_dir / "lst_10m.tif")


def _colormap_for_layer(layer: str):
    if layer == "ndvi":
        return "YlGn"
    if layer == "svf":
        return "Purples"
    if layer == "vulnerability":
        return "RdYlGn_r"
    return "RdYlBu_r"


@lru_cache(maxsize=64)
def get_heatmap_meta(city_key: str, layer: str = "lst") -> dict[str, Any]:
    df = pd.read_parquet(_city_out_dir(city_key) / "tables" / "feature_table.parquet")
    arr = _layer_array(city_key, layer, df)
    valid = arr[np.isfinite(arr)]
    vmin = float(np.percentile(valid, 2)) if valid.size else 0.0
    vmax = float(np.percentile(valid, 98)) if valid.size else 1.0
    left, bottom, right, top = _raster_bounds(city_key)
    return {
        "layer": layer,
        "bounds": [[bottom, left], [top, right]],
        "vmin": round(vmin, 2),
        "vmax": round(vmax, 2),
        "width": int(arr.shape[1]),
        "height": int(arr.shape[0]),
        "grid_step": DEFAULT_GRID_STEP,
    }


def get_heatmap_png(city_key: str, layer: str = "lst") -> bytes:
    """Render continuous heatmap PNG from pipeline raster (UHI-Analysis style)."""
    out_dir = _city_out_dir(city_key)
    maps_dir = out_dir / "maps"
    maps_dir.mkdir(parents=True, exist_ok=True)
    cache = maps_dir / f"overlay_{layer}.png"

    df = pd.read_parquet(out_dir / "tables" / "feature_table.parquet")
    arr = _layer_array(city_key, layer, df)
    meta = get_heatmap_meta(city_key, layer)

    if cache.exists() and cache.stat().st_mtime > (out_dir / "rasters" / "lst_10m.tif").stat().st_mtime:
        return cache.read_bytes()

    cmap = _colormap_for_layer(layer)
    norm_arr = np.flipud(arr)  # align PNG with geographic north-up for Leaflet

    fig = plt.figure(figsize=(norm_arr.shape[1] / 72, norm_arr.shape[0] / 72), dpi=72)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(
        norm_arr,
        cmap=cmap,
        vmin=meta["vmin"],
        vmax=meta["vmax"],
        interpolation="bilinear",
        aspect="auto",
    )
    ax.axis("off")
    buf = io.BytesIO()
    fig.savefig(buf, format="png", transparent=False, pad_inches=0)
    plt.close(fig)
    png_bytes = buf.getvalue()
    cache.write_bytes(png_bytes)
    logger.info("Heatmap overlay cached: %s (%dx%d)", cache, arr.shape[1], arr.shape[0])
    return png_bytes


def build_fine_grid_geojson(city_key: str, step: int | None = None) -> dict[str, Any]:
    """
    Pixel-aligned grid from pipeline feature table (10 m cells).
    step=1 → full 120×120 resolution; larger step aggregates blocks.
    """
    cfg = load_city_config(ROOT / "configs" / "cities.yaml", city_key)
    df = pd.read_parquet(_city_out_dir(city_key) / "tables" / "feature_table.parquet")
    bbox = cfg["bbox"]
    min_lon, min_lat, max_lon, max_lat = bbox
    h = int(df["row"].max()) + 1
    w = int(df["col"].max()) + 1

    if step is None:
        step = DEFAULT_GRID_STEP
    step = max(1, int(step))

    n_cells = (h // step) * (w // step)
    if n_cells > MAX_GRID_FEATURES:
        step = max(step, int(np.ceil(np.sqrt((h * w) / MAX_GRID_FEATURES))))

    d_lon = (max_lon - min_lon) / w
    d_lat = (max_lat - min_lat) / h
    features: list[dict[str, Any]] = []

    for r0 in range(0, h, step):
        for c0 in range(0, w, step):
            r1 = min(r0 + step, h)
            c1 = min(c0 + step, w)
            block = df[(df["row"] >= r0) & (df["row"] < r1) & (df["col"] >= c0) & (df["col"] < c1)]
            if block.empty:
                continue

            avg_lst = float(block["lst_c"].mean())
            avg_ndvi = float(block["ndvi"].mean())
            avg_ndbi = float(block["ndbi"].mean())
            hotspot_frac = float((block["hotspot_class"] >= 1).mean())
            humidity = float(block.get("humidity_proxy", pd.Series([0.55])).mean())
            utci = float(avg_lst * 0.72 + humidity * 8.0 - 2.5)

            if avg_lst >= 42 or hotspot_frac > 0.35:
                vuln = "CRITICAL"
            elif avg_lst >= 40 or hotspot_frac > 0.2:
                vuln = "HIGH"
            elif avg_lst >= 38:
                vuln = "MODERATE"
            else:
                vuln = "LOW"

            # Pixel corners in lon/lat (north-up raster)
            w_min_lon = min_lon + c0 * d_lon
            w_max_lon = min_lon + c1 * d_lon
            w_max_lat = max_lat - r0 * d_lat
            w_min_lat = max_lat - r1 * d_lat

            cell_id = f"{city_key}_r{r0}_c{c0}"
            polygon = [
                [w_min_lon, w_min_lat],
                [w_max_lon, w_min_lat],
                [w_max_lon, w_max_lat],
                [w_min_lon, w_max_lat],
                [w_min_lon, w_min_lat],
            ]

            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [polygon]},
                    "properties": {
                        "ward_id": cell_id,
                        "name": f"Cell {r0},{c0}",
                        "row": r0,
                        "col": c0,
                        "grid_step": step,
                        "avg_lst_c": round(avg_lst, 2),
                        "simulated_lst_c": round(avg_lst, 2),
                        "heat_stress_utci_c": round(utci, 2),
                        "cooling_delta_c": 0.0,
                        "ndvi": round(avg_ndvi, 3),
                        "ndbi": round(avg_ndbi, 3),
                        "vulnerability_class": vuln,
                        "hotspot_fraction": round(hotspot_frac, 3),
                        "hotspot_class": int(block["hotspot_class"].max()),
                        "gi_star_z": round(float(block["gi_star_z"].mean()), 3)
                        if "gi_star_z" in block.columns
                        else 0.0,
                    },
                }
            )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"grid_step": step, "rows": h, "cols": w, "cell_count": len(features)},
    }


def build_sample_points_geojson(city_key: str, stride: int = 4) -> dict[str, Any]:
    """Colored sample points for UHI-Analysis-style dot overlay."""
    df = pd.read_parquet(_city_out_dir(city_key) / "tables" / "feature_table.parquet")
    h = int(df["row"].max()) + 1
    w = int(df["col"].max()) + 1
    stride = max(1, stride)

    sampled = df[(df["row"] % stride == 0) & (df["col"] % stride == 0)]
    p33 = float(df["lst_c"].quantile(0.33))
    p66 = float(df["lst_c"].quantile(0.66))

    features = []
    for _, row in sampled.iterrows():
        lst = float(row["lst_c"])
        if lst >= p66:
            zone = "Hot Zone"
        elif lst >= p33:
            zone = "Mild Zone"
        else:
            zone = "Cool Zone"

        cluster = "normal"
        gi = float(row.get("gi_star_z", 0) or 0)
        hs = int(row.get("hotspot_class", 0))
        if hs >= 2 and gi > 0:
            cluster = "hot_spot"
        elif gi < -1.5:
            cluster = "cold_spot"

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(row["lon"]), float(row["lat"])]},
                "properties": {
                    "lst_c": round(lst, 2),
                    "zone": zone,
                    "cluster": cluster,
                    "hotspot_class": hs,
                    "ndvi": round(float(row["ndvi"]), 3),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"stride": stride, "point_count": len(features), "grid_size": f"{h}x{w}"},
    }
