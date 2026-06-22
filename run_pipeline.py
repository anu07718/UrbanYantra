#!/usr/bin/env python3
"""
One-command urban heat mitigation pipeline.

Usage:
  py run_pipeline.py --config configs/pilot_city.yaml
  py run_pipeline.py --config configs/pilot_city.yaml --data-mode gee
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data_ingestion import run_ingestion
from explainability.shap_analysis import run_shap_analysis
from features.build_feature_table import build_feature_stack
from models.train_baseline import train_baselines
from outputs.export_maps import export_outputs
from simulation.scenarios import run_scenarios
from simulation.solweig_stub import run_solweig_treeplanter
from utils import ensure_dir, load_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pipeline")


def main() -> int:
    parser = argparse.ArgumentParser(description="Urban heat mitigation pipeline")
    parser.add_argument("--config", default="configs/pilot_city.yaml", help="City YAML config")
    parser.add_argument("--data-mode", choices=["synthetic", "gee"], help="Override data_mode")
    parser.add_argument("--skip-shap", action="store_true", help="Skip SHAP (faster)")
    args = parser.parse_args()

    config = load_config(ROOT / args.config)
    if args.data_mode:
        config["data_mode"] = args.data_mode

    out_dir = ensure_dir(ROOT / config["output_dir"])
    logger.info("Running pipeline for %s (mode=%s)", config.get("city_name"), config.get("data_mode"))

    run_ingestion(config)
    df, _ = build_feature_stack(config, out_dir)
    result = train_baselines(config, df, out_dir)
    df = result["df"]

    if not args.skip_shap:
        run_shap_analysis(config, df, result["xgb_reg"], out_dir)

    run_scenarios(config, out_dir)
    run_solweig_treeplanter(config, out_dir)
    export_outputs(config, df, out_dir)

    logger.info("Pipeline complete. Outputs: %s", out_dir)
    logger.info("Dashboard: streamlit run dashboard/app.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
