"""Export pipeline outputs including maps, rankings, and summaries."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger("export_maps")


def export_outputs(config: dict, df: pd.DataFrame, out_dir: Path) -> None:
    """
    Export pipeline outputs to disk.

    Args:
        config: Configuration dictionary with city settings
        df: Feature dataframe with model predictions
        out_dir: Output directory for all exports
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    city_key = config.get("city_key", "unknown")
    city_name = config.get("city_name", city_key)

    logger.info(f"Exporting outputs for {city_name} to {out_dir}")

    # Export features table
    features_path = out_dir / "features.csv"
    df.to_csv(features_path, index=False)
    logger.info(f"Exported features: {features_path}")

    # Create summary JSON
    summary = {
        "city_key": city_key,
        "city_name": city_name,
        "data_mode": config.get("data_mode", "unknown"),
        "num_features": df.shape[1],
        "num_samples": df.shape[0],
        "output_dir": str(out_dir),
    }

    summary_path = out_dir / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Exported summary: {summary_path}")

    # Create output subdirectories if they don't exist
    for subdir in ["rasters", "tables", "simulation", "vectors", "ranking", "explainability", "models", "maps", "raw"]:
        (out_dir / subdir).mkdir(parents=True, exist_ok=True)

    logger.info(f"Export complete for {city_name}")
