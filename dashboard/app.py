"""Streamlit dashboard for interactive map viewing."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import rasterio
import streamlit as st
from matplotlib import cm
from matplotlib.colors import Normalize

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "outputs" / "pune"


@st.cache_data
def load_raster(path: str):
    with rasterio.open(path) as src:
        return src.read(1), src.bounds


def main():
    st.set_page_config(page_title="Urban Heat Mitigation", layout="wide")
    st.title("Optimizing Urban Heat Mitigation — Demo Dashboard")

    out_dir = Path(st.sidebar.text_input("Output directory", str(DEFAULT_OUT)))
    if not out_dir.exists():
        st.warning(f"Run pipeline first: `py run_pipeline.py --config configs/pilot_city.yaml`")
        st.stop()

    city = "Pilot City"
    cfg_path = ROOT / "configs" / "pilot_city.yaml"
    if cfg_path.exists():
        import yaml

        city = yaml.safe_load(cfg_path.read_text(encoding="utf-8")).get("city_name", city)

    st.subheader(city)

    col1, col2, col3 = st.columns(3)
    lst_path = out_dir / "rasters" / "lst_10m.tif"
    hotspot_path = out_dir / "maps" / "hotspot_class.tif"
    driver_path = out_dir / "rasters" / "driver_attribution.tif"

    if lst_path.exists():
        lst, _ = load_raster(str(lst_path))
        col1.image(lst, clamp=True, caption="LST (°C) — 10 m", use_container_width=True)

    if hotspot_path.exists():
        hs, _ = load_raster(str(hotspot_path))
        col2.image(hs, clamp=True, caption="Hotspot class (0=normal, 1=moderate, 2=severe)", use_container_width=True)

    if driver_path.exists():
        drv, _ = load_raster(str(driver_path))
        col3.image(drv, clamp=True, caption="Driver attribution (feature code)", use_container_width=True)

    st.markdown("### Scenario comparison")
    sim_dir = out_dir / "simulation"
    if sim_dir.exists():
        for png in sorted(sim_dir.glob("scenario_*.png")):
            st.image(str(png), caption=png.stem, use_container_width=True)

    rec_path = out_dir / "tables" / "intervention_rankings.csv"
    if rec_path.exists():
        st.markdown("### Ranked interventions")
        st.dataframe(pd.read_csv(rec_path).head(30), use_container_width=True)

    metrics_path = out_dir / "models" / "metrics.json"
    if metrics_path.exists():
        st.markdown("### Model metrics")
        st.json(json.loads(metrics_path.read_text(encoding="utf-8")))

    shap_path = out_dir / "explainability" / "shap_global_importance.png"
    if shap_path.exists():
        st.markdown("### SHAP global importance")
        st.image(str(shap_path), use_container_width=True)


if __name__ == "__main__":
    main()
