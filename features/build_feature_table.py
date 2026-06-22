"""Build pixel-level feature table from raster stack."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

from data_ingestion.cache import save_geotiff, save_parquet
from features.hotspot_detection import classify_hotspots_from_gi, getis_ord_gi_star
from features.lcz_proxy import derive_lcz_proxy
from features.morphology import compute_morphology_rasters
from features.temporal import summarize_meteo_for_pixels

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "ndvi",
    "ndbi",
    "ndwi",
    "utfvi",
    "building_density",
    "road_density",
    "dist_green_m",
    "dist_water_m",
    "impervious_frac",
    "vegetation_frac",
    "building_height",
    "population",
    "temp_2m_c",
    "dewpoint_c",
    "humidity_proxy",
    "wind_ms",
    "solar_radiation_wm2",
    "hour",
    "month",
    "season",
    "heatwave_flag",
    "lcz_class",
]


def _read_raster(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        return src.read(1).astype(np.float32)


def build_feature_stack(config: dict, out_dir: Path) -> tuple[pd.DataFrame, Path]:
    """Assemble features + LST target into parquet; export driver attribution raster."""
    raster_dir = out_dir / "rasters"
    table_path = out_dir / "tables" / "feature_table.parquet"
    lst_path = out_dir / "rasters" / "lst_10m.tif"

    if table_path.exists() and lst_path.exists():
        cached = pd.read_parquet(table_path)
        missing = [c for c in FEATURE_COLUMNS if c not in cached.columns]
        if not missing:
            return cached, lst_path
        logger.info("Rebuilding feature table — cached parquet missing: %s", missing)

    ndvi = _read_raster(raster_dir / "ndvi.tif")
    ndbi = _read_raster(raster_dir / "ndbi.tif")
    ndwi = _read_raster(raster_dir / "ndwi.tif")
    utfvi = _read_raster(raster_dir / "utfvi.tif")
    lulc = _read_raster(raster_dir / "worldcover.tif")
    bheight = _read_raster(raster_dir / "ghsl_building_height.tif")
    pop = _read_raster(raster_dir / "ghsl_population.tif")

    # Resize GHSL to match 10 m stack if needed
    if bheight.shape != ndvi.shape:
        from scipy.ndimage import zoom

        zy = ndvi.shape[0] / bheight.shape[0]
        zx = ndvi.shape[1] / bheight.shape[1]
        bheight = zoom(bheight, (zy, zx), order=1)
        pop = zoom(pop, (zy, zx), order=1)

    osm_path = out_dir / "tables" / "osm_morphology.parquet"
    osm_df = pd.read_parquet(osm_path)
    h, w = ndvi.shape
    building_density = osm_df["building_density"].values.reshape(h, w) if len(osm_df) == h * w else None
    road_density = osm_df["road_density"].values.reshape(h, w) if len(osm_df) == h * w else None

    morph = compute_morphology_rasters(lulc, building_density, road_density)
    for name, arr in morph.items():
        save_geotiff(arr, raster_dir / f"{name}.tif", config["bbox"])

    meteo = pd.read_parquet(out_dir / "tables" / "era5_land_hourly.parquet")
    meteo_summary = summarize_meteo_for_pixels(meteo)

    lst_coarse = _read_raster(raster_dir / "landsat_lst_c.tif")
    if lst_coarse.shape != ndvi.shape:
        from scipy.ndimage import zoom

        zy = ndvi.shape[0] / lst_coarse.shape[0]
        zx = ndvi.shape[1] / lst_coarse.shape[1]
        lst_coarse = zoom(lst_coarse, (zy, zx), order=1)

    # 10 m LST downscaling: regression-style residual from NDVI/NDBI (PDF recommended path)
    from preprocessing.lst_downscale import downscale_lst

    lst_10m = downscale_lst(lst_coarse, ndvi, ndbi)
    save_geotiff(lst_10m, lst_path, config["bbox"])

    rows = []
    for r in range(h):
        for c in range(w):
            row = {
                "row": r,
                "col": c,
                "lon": config["bbox"][0] + (c + 0.5) * (config["bbox"][2] - config["bbox"][0]) / w,
                "lat": config["bbox"][3] - (r + 0.5) * (config["bbox"][3] - config["bbox"][1]) / h,
                "lst_c": float(lst_10m[r, c]),
                "ndvi": float(ndvi[r, c]),
                "ndbi": float(ndbi[r, c]),
                "ndwi": float(ndwi[r, c]),
                "utfvi": float(utfvi[r, c]),
                **{k: float(v[r, c]) for k, v in morph.items()},
                "building_height": float(bheight[r, c]),
                "population": float(pop[r, c]),
                **meteo_summary,
            }
            rows.append(row)

    df = pd.DataFrame(rows)
    df["city"] = config.get("city_name", "city")
    lcz_grid = derive_lcz_proxy(bheight, morph["impervious_frac"])
    df["lcz_class"] = [int(lcz_grid[int(r["row"]), int(r["col"])]) for r in rows]

    hs_cfg = config.get("hotspot", {})
    gi_z, gi_p = getis_ord_gi_star(
        lst_10m,
        kernel_size=int(hs_cfg.get("gi_star_kernel", 5)),
    )
    hotspot_grid = classify_hotspots_from_gi(
        lst_10m,
        gi_z,
        gi_p,
        moderate_delta_c=hs_cfg.get("moderate_delta_c", 2.0),
        severe_delta_c=hs_cfg.get("severe_delta_c", 4.0),
        p_threshold=hs_cfg.get("gi_star_p_threshold", 0.05),
    )
    df["gi_star_z"] = [float(gi_z[int(r["row"]), int(r["col"])]) for r in rows]
    df["hotspot_class"] = [int(hotspot_grid[int(r["row"]), int(r["col"])]) for r in rows]
    df["thermal_stress_class"] = np.where(df["lst_c"] >= 40, 2, np.where(df["lst_c"] >= 37, 1, 0))
    df["tile_id"] = (
        (df["lon"] // config["spatial_cv"]["tile_size_deg"]).astype(int).astype(str)
        + "_"
        + (df["lat"] // config["spatial_cv"]["tile_size_deg"]).astype(int).astype(str)
    )

    save_parquet(df, table_path)
    logger.info("Feature table: %d pixels, %d features", len(df), len(FEATURE_COLUMNS))
    return df, lst_path
