# Optimizing Urban Heat Mitigation via AI/ML

End-to-end prototype for ISRO hackathon: hotspot detection, driver attribution (SHAP), and cooling scenario simulation (InVEST UCM-inspired).

## Stack (from resource map)

| Layer | Tools |
|-------|-------|
| LST | Landsat 8 C2 L2 via GEE |
| 10 m downscaling | Sentinel-2 NDVI/NDBI regression |
| LULC | ESA WorldCover 10 m |
| Meteo | ERA5-Land |
| Morphology | GHSL + OSM (osmnx) |
| ML | XGBoost + Random Forest |
| Explainability | SHAP |
| Scenarios | InVEST UCM (simplified ΔT) |
| Optional | SOLWEIG/TreePlanter, IBM Granite, PINN, VoxCity |

## Quick start

```bash
# Create venv and install
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Run on pilot city (Pune) — synthetic fallback, no GEE credentials needed
py run_pipeline.py --config configs/pilot_city.yaml

# With Google Earth Engine (after: earthengine authenticate)
py run_pipeline.py --config configs/pilot_city.yaml --data-mode gee

# Dashboard
streamlit run dashboard/app.py

# Full-stack dashboard (recommended for demo)
# Terminal 1 — API (only one instance; if port 8000 is busy, see note below)
uvicorn backend.app.main:app --reload --port 8000
# Terminal 2 — Next.js UI
cd frontend && npm run dev
# Open http://localhost:3000

# Port 8000 already in use? Either use the running API, or stop it then restart:
#   netstat -ano | findstr :8000
#   taskkill /PID <pid> /F
# Or use another port: uvicorn backend.app.main:app --reload --port 8001
#   then set frontend/.env.local → NEXT_PUBLIC_API_URL=http://localhost:8001

# Tests
pytest tests/ -q
```

## Outputs (`outputs/pune/`)

- `maps/heat_hotspot_map.png` — LST hotspot map
- `explainability/shap_*.png` — driver attribution
- `simulation/delta_t_*.tif` — scenario cooling ΔT
- `tables/intervention_rankings.csv` — ranked recommendations
- `dashboard/summary.html` — static report

## Notebooks

1. `notebooks/01_data_preparation.ipynb`
2. `notebooks/02_training_shap.ipynb`
3. `notebooks/03_scenario_simulation.ipynb`

## Docs

- `docs/RUNBOOK.md` — operational runbook
- `docs/TECHNICAL_REPORT.md` — methods and assumptions
- `docs/HACKATHON_NARRATIVE.md` — pitch narrative
- `docs/SLIDES_SUMMARY.md` — slide-ready summary

## Custom city

Copy `configs/pilot_city.yaml`, set `bbox`, `city_name`, and `output_dir`.

## References

- [UHI-Analysis](https://github.com/ArhamOrioner/UHI-Analysis) — GEE + ML hotspot pipeline (Getis-Ord Gi*, SHAP)
- [WRI UrbanHeatMitigation](https://github.com/wri/UrbanHeatMitigation)
- [GEE UHI ML](https://github.com/KonlavachMengsuwan/-Urban-Heat-Island-Mapping-with-Machine-Learning-using-Google-Earth-Engine)
- [InVEST UCM calibration](https://github.com/martibosch/invest-ucm-calibration)
- [SOLWEIG](https://github.com/UMEP-dev/solweig)
