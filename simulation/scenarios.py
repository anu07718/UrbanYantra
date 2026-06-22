"""Cooling intervention scenarios and ranking."""

from __future__ import annotations

import logging
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio

from data_ingestion.cache import save_geotiff
from simulation.invest_ucm import apply_scenario, invest_ucm_delta_t

logger = logging.getLogger(__name__)

SCENARIO_COMPLEXITY = {
    "urban_greening": ("medium", "Tree planting, green corridors"),
    "cool_roof": ("low", "Reflective roof coatings"),
    "blue_infrastructure": ("high", "Ponds, bioswales, water features"),
}


def _read(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        return src.read(1).astype(np.float32)


def run_scenarios(config: dict, out_dir: Path) -> pd.DataFrame:
    """Run 3 intervention scenarios; export maps and ranked recommendations."""
    sim_dir = out_dir / "simulation"
    sim_dir.mkdir(parents=True, exist_ok=True)
    raster_dir = out_dir / "rasters"

    lst = _read(raster_dir / "lst_10m.tif")
    ndvi = _read(raster_dir / "ndvi.tif")
    impervious = _read(raster_dir / "impervious_frac.tif") if (raster_dir / "impervious_frac.tif").exists() else 1 - ndvi

    if impervious.shape != lst.shape:
        from scipy.ndimage import zoom

        zy = lst.shape[0] / impervious.shape[0]
        zx = lst.shape[1] / impervious.shape[1]
        impervious = zoom(impervious, (zy, zx), order=1)

    h, w = lst.shape
    df_pixels = pd.read_parquet(out_dir / "tables" / "feature_table.parquet")
    recommendations = []

    for scenario_name, params in config.get("scenarios", {}).items():
        delta = invest_ucm_delta_t(lst, ndvi, impervious, scenario_name, params)
        lst_new = apply_scenario(lst, delta)
        save_geotiff(delta, sim_dir / f"delta_t_{scenario_name}.tif", config["bbox"])
        save_geotiff(lst_new, sim_dir / f"lst_{scenario_name}.tif", config["bbox"])

        # Comparison plot
        fig, axes = plt.subplots(1, 3, figsize=(12, 4))
        for ax, data, title in zip(
            axes,
            [lst, delta, lst_new],
            ["Baseline LST (°C)", f"ΔT {scenario_name}", "Post-intervention LST (°C)"],
            strict=True,
        ):
            im = ax.imshow(data, cmap="RdYlBu_r" if "Δ" not in title else "PiYG")
            ax.set_title(title)
            ax.axis("off")
            plt.colorbar(im, ax=ax, fraction=0.046)
        plt.tight_layout()
        plt.savefig(sim_dir / f"scenario_{scenario_name}.png", dpi=150)
        plt.close()

        benefit = -delta  # positive = cooling
        complexity, desc = SCENARIO_COMPLEXITY.get(scenario_name, ("medium", ""))
        # Rank top zones by benefit per unit area (pixel)
        flat_idx = np.argsort(benefit.ravel())[::-1][:50]
        for rank, idx in enumerate(flat_idx[:20], start=1):
            r, c = divmod(int(idx), w)
            recommendations.append(
                {
                    "rank": rank,
                    "intervention_type": scenario_name,
                    "intervention_description": desc,
                    "target_row": r,
                    "target_col": c,
                    "lon": config["bbox"][0] + (c + 0.5) * (config["bbox"][2] - config["bbox"][0]) / w,
                    "lat": config["bbox"][3] - (r + 0.5) * (config["bbox"][3] - config["bbox"][1]) / h,
                    "estimated_temp_reduction_c": float(benefit[r, c]),
                    "baseline_lst_c": float(lst[r, c]),
                    "post_lst_c": float(lst_new[r, c]),
                    "confidence": "medium" if config.get("data_mode") == "gee" else "demo-synthetic",
                    "implementation_complexity": complexity,
                }
            )

    rec_df = pd.DataFrame(recommendations)
    rec_df = rec_df.sort_values("estimated_temp_reduction_c", ascending=False).reset_index(drop=True)
    rec_df["rank"] = np.arange(1, len(rec_df) + 1)
    rec_path = out_dir / "tables" / "intervention_rankings.csv"
    rec_df.to_csv(rec_path, index=False)
    logger.info("Scenario simulation complete. Rankings: %s", rec_path)
    return rec_df
