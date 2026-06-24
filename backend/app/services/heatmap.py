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

from geography.ward_seeds import nearest_ward_name as _nearest_ward_name
from features.display_pixels import visible_pixels
from utils import load_city_config

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]

# step=2 → 60×60 cells (~3.6k); step=1 → full 120×120 (14.4k, heavier)
DEFAULT_GRID_STEP = 2
MAX_GRID_FEATURES = 14400
MAX_SAMPLE_POINTS = 12000


def _city_out_dir(city_key: str) -> Path:
    cfg = load_city_config(ROOT / "configs" / "cities.yaml", city_key)
    return ROOT / cfg["output_dir"]


def _read_raster(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        return src.read(1).astype(np.float32)


@lru_cache(maxsize=16)
def _load_feature_table(city_key: str) -> pd.DataFrame:
    return pd.read_parquet(_city_out_dir(city_key) / "tables" / "feature_table.parquet")


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
    df = _load_feature_table(city_key)
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

    df = _load_feature_table(city_key)
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


def build_fine_grid_geojson(
    city_key: str, step: int | None = None, mask_water: bool = True
) -> dict[str, Any]:
    """
    Pixel-aligned grid from pipeline feature table (10 m cells).
    step=1 → full resolution; larger step aggregates blocks.
    """
    cfg = load_city_config(ROOT / "configs" / "cities.yaml", city_key)
    df = _load_feature_table(city_key)
    if mask_water:
        df = visible_pixels(df)
    h = int(df["row"].max()) + 1 if len(df) else 0
    w = int(df["col"].max()) + 1 if len(df) else 0

    if step is None:
        step = DEFAULT_GRID_STEP
    step = max(1, int(step))

    n_cells = (h // step) * (w // step) if h and w else 0
    if n_cells > MAX_GRID_FEATURES:
        step = max(step, int(np.ceil(np.sqrt((h * w) / MAX_GRID_FEATURES))))

    features: list[dict[str, Any]] = []

    lst_col = "lst_calibrated_c" if "lst_calibrated_c" in df.columns else "lst_c"
    grouped_df = df.assign(
        row_bin=(df["row"] // step) * step,
        col_bin=(df["col"] // step) * step,
        hotspot_flag=(df["hotspot_class"] >= 1).astype(float),
    )
    agg_kwargs: dict[str, Any] = {
        "lst_display": (lst_col, "mean"),
        "lst_sat": ("lst_c", "mean"),
        "ndvi": ("ndvi", "mean"),
        "ndbi": ("ndbi", "mean"),
        "hotspot_flag": ("hotspot_flag", "mean"),
        "hotspot_class": ("hotspot_class", "max"),
        "lon_min": ("lon", "min"),
        "lon_max": ("lon", "max"),
        "lat_min": ("lat", "min"),
        "lat_max": ("lat", "max"),
    }
    if "humidity_proxy" in grouped_df.columns:
        agg_kwargs["humidity_proxy"] = ("humidity_proxy", "mean")
    if "gi_star_z" in grouped_df.columns:
        agg_kwargs["gi_star_z"] = ("gi_star_z", "mean")
    if "is_water" in grouped_df.columns:
        agg_kwargs["is_water"] = ("is_water", "mean")

    blocks = grouped_df.groupby(["row_bin", "col_bin"], sort=False).agg(**agg_kwargs).reset_index()

    for block in blocks.itertuples(index=False):
        if mask_water and hasattr(block, "is_water") and float(block.is_water) > 0.5:
            continue

        r0 = int(block.row_bin)
        c0 = int(block.col_bin)

        avg_lst = float(np.nan_to_num(block.lst_display, nan=35.0))
        avg_raw = float(np.nan_to_num(block.lst_sat, nan=avg_lst))
        avg_ndvi = float(np.nan_to_num(block.ndvi, nan=0.3))
        avg_ndbi = float(np.nan_to_num(block.ndbi, nan=0.1))
        hotspot_frac = float(np.nan_to_num(block.hotspot_flag, nan=0.0))
        humidity = float(np.nan_to_num(getattr(block, "humidity_proxy", 0.55), nan=0.55))
        utci = float(np.nan_to_num(avg_lst * 0.72 + humidity * 8.0 - 2.5, nan=35.0))

        if avg_lst >= 42 or hotspot_frac > 0.35:
            vuln = "CRITICAL"
        elif avg_lst >= 40 or hotspot_frac > 0.2:
            vuln = "HIGH"
        elif avg_lst >= 38:
            vuln = "MODERATE"
        else:
            vuln = "LOW"

        w_min_lon = float(block.lon_min)
        w_max_lon = float(block.lon_max)
        w_min_lat = float(block.lat_min)
        w_max_lat = float(block.lat_max)
        centroid_lon = (w_min_lon + w_max_lon) / 2
        centroid_lat = (w_min_lat + w_max_lat) / 2
        area_name = _nearest_ward_name(cfg["city_name"], centroid_lon, centroid_lat, f"Cell {r0},{c0}")

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
                    "name": area_name,
                    "row": r0,
                    "col": c0,
                    "grid_step": step,
                    "avg_lst_c": round(np.nan_to_num(avg_raw, nan=35.0), 2),
                    "lst_calibrated_c": round(np.nan_to_num(avg_lst, nan=35.0), 2),
                    "simulated_lst_c": round(np.nan_to_num(avg_lst, nan=35.0), 2),
                    "heat_stress_utci_c": round(np.nan_to_num(utci, nan=35.0), 2),
                    "cooling_delta_c": 0.0,
                    "ndvi": round(np.nan_to_num(avg_ndvi, nan=0.3), 3),
                    "ndbi": round(np.nan_to_num(avg_ndbi, nan=0.1), 3),
                    "vulnerability_class": vuln,
                    "hotspot_fraction": round(np.nan_to_num(hotspot_frac, nan=0.0), 3),
                    "hotspot_class": int(getattr(block, "hotspot_class", 0)),
                    "gi_star_z": round(float(np.nan_to_num(getattr(block, "gi_star_z", 0.0), nan=0.0)), 3),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "grid_step": step,
            "rows": h,
            "cols": w,
            "cell_count": len(features),
            "mask_water": mask_water,
            "resolution_m": cfg.get("target_resolution_m", 10) * step,
        },
    }


def build_sample_points_geojson(city_key: str, stride: int = 4, mask_water: bool = True) -> dict[str, Any]:
    """Colored sample points for UHI-Analysis-style dot overlay."""
    df = _load_feature_table(city_key)
    if mask_water:
        df = visible_pixels(df)
    h = int(df["row"].max()) + 1
    w = int(df["col"].max()) + 1
    stride = max(1, stride)
    stride = max(stride, int(np.ceil(np.sqrt(len(df) / MAX_SAMPLE_POINTS))))

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
        "meta": {
            "stride": stride,
            "point_count": len(features),
            "grid_size": f"{h}x{w}",
            "max_points": MAX_SAMPLE_POINTS,
        },
    }
