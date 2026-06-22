# Runbook — Urban Heat Mitigation Pipeline

## Prerequisites

- Python 3.10+
- 4 GB RAM minimum
- Optional: Google Earth Engine account (`earthengine authenticate`)

## One-command run

```bash
py run_pipeline.py --config configs/pilot_city.yaml
```

## Pipeline stages

| Step | Module | Output |
|------|--------|--------|
| 1 Ingest | `data_ingestion/` | GeoTIFF rasters, Parquet tables |
| 2 Downscale LST | `preprocessing/lst_downscale.py` | `rasters/lst_10m.tif` |
| 3 Features | `features/build_feature_table.py` | `tables/feature_table.parquet` |
| 4 Train | `models/train_baseline.py` | `models/*.joblib`, metrics |
| 5 SHAP | `explainability/shap_analysis.py` | PNG + driver raster |
| 6 Scenarios | `simulation/scenarios.py` | ΔT maps, rankings CSV |
| 7 Export | `outputs/export_maps.py` | Hotspot PNG, HTML |

## GEE mode

1. `pip install earthengine-api`
2. `earthengine authenticate`
3. Set GEE project in env or edit `gee_client.py`
4. `py run_pipeline.py --config configs/pilot_city.yaml --data-mode gee`

## Fallback

`data_mode: synthetic` generates reproducible demo data (seeded RNG) when GEE/OSM unavailable.

## Dashboard

```bash
streamlit run dashboard/app.py
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| GEE auth error | Use `--data-mode synthetic` or authenticate |
| OSM timeout | Falls back to synthetic morphology automatically |
| SHAP slow | `py run_pipeline.py --skip-shap` |
| Missing scipy | `pip install scipy` |
