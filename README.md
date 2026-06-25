# Optimizing Urban Heat Mitigation via AI/ML (UrbanCool)

End-to-end ISRO hackathon prototype: **hotspot detection**, **SHAP driver attribution**, **GHSL/ERA5 real-data layers**, **live XGBoost inference**, and **cooling scenario simulation** with ranked interventions.

## Stack

| Layer | Tools |
|-------|-------|
| LST | Landsat 8 C2 L2 via GEE |
| 10 m downscaling | Sentinel-2 NDVI/NDBI regression |
| LULC | ESA WorldCover 10 m |
| Meteo / heat stress | ERA5 UTCI (Drive cache) or ERA5-Land (GEE) |
| Morphology | GHSL Built-S, SMOD, population (Drive cache) + OSM |
| ML | XGBoost + Random Forest + spatial CV |
| External benchmarks | D-07 Kaggle UHI CSV, D-09 EY NYC labels |
| Explainability | SHAP |
| Scenarios | InVEST UCM-inspired ΔT + surrogate model |
| Dashboard | Next.js + Deck.gl map + FastAPI backend |

---

## Quick start (local)

```powershell
# 1. Python environment
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Run pipeline on one city (real data from Drive cache + GEE satellite)
py run_pipeline.py --city Mumbai --data-mode local --force

# 3. Start API
uvicorn backend.app.main:app --reload --port 8000

# 4. Start frontend (new terminal)
cd frontend
copy .env.example .env.local
npm install
npm run dev
# Open http://localhost:3000
```

**Port 8000 busy?** Use `--port 8001` and set `NEXT_PUBLIC_API_BASE=http://localhost:8001` in `frontend/.env.local`.

---

## Download real data (Google Drive)

Your shared **Urban Dataset** folder is pre-configured:

```
https://drive.google.com/drive/folders/1pM9UKiI03lm_4XhnSwmcAp8at1pz8REU
→ configs/remote_datasets.yaml → urban_dataset_folder
```

### What gets downloaded (first pipeline run)

| Dataset | ID | Cache path | Used for |
|---------|-----|------------|----------|
| GHSL Built-S | D-04 | `data/cache/urban_dataset/` (7 India zips) | Built-up density map layer |
| GHSL SMOD | D-04 | same folder | Settlement / urban-core map layer |
| GHSL Population | D-04 | clipped rasters in `outputs/{city}/rasters/` | Population exposure layer |
| ERA5 UTCI NetCDF | D-03 | `ECMWF_utci_*.nc` in cache | Heat-stress / meteo features |
| Kaggle UHI CSV | D-07 | `data/benchmarks/` (bundled in Git) | Training benchmark |
| EY NYC UHI labels | D-09 | `data/benchmarks/` (bundled in Git) | External validation benchmark |

### Download commands

```powershell
pip install gdown   # one-time, for Drive folder sync

# Single city — auto-syncs Drive on first run, then uses cache
py run_pipeline.py --city Mumbai --data-mode local --force

# All 10 configured cities
py run_pipeline.py --multi-city --data-mode local --force
```

**Share setting:** Drive folder must be **Anyone with the link → Viewer**.

**Local PC shortcut:** You can also point to extracted files in `configs/local_datasets.yaml` (see `docs/REAL_DATA_GUIDE.md`).

---

## Data modes

| Mode | GHSL / ERA5 | Satellite (LST, S2, WorldCover) |
|------|-------------|-----------------------------------|
| `local` | Google Drive cache | GEE |
| `gee` | GEE or Drive if configured | GEE |
| `synthetic` | Synthetic fallback | Synthetic fallback |

Recommended for hackathon demo: **`local`** (real GHSL + ERA5 from Drive, real Landsat from GEE).

---

## Pipeline outputs (`outputs/{city}/`)

| Path | Description |
|------|-------------|
| `tables/feature_table.parquet` | Pixel features + USP columns |
| `tables/intervention_rankings.csv` | Ranked cooling zones |
| `ranking/{city}.json` | Same rankings for API |
| `models/xgb_lst_regressor.joblib` | Live inference model |
| `models/benchmark_metrics.json` | City XGBoost + Kaggle/EY baselines |
| `benchmarks/` | D-07/D-09 summaries |
| `maps/thermal_satellite.png` | Landsat thermal overlay |
| `geojson/hotspots_*.geojson` | Hotspot pin locations |
| `summary.json` | Provenance manifest for dashboard |

---

## Dashboard map layers

| Layer | Source |
|-------|--------|
| Surface Temperature | Landsat LST (10 m downscaled) |
| Thermal View | Raw Landsat ST_B10 on satellite basemap |
| Heat Stress (UTCI) | ERA5 UTCI + LST proxy |
| Green Coverage (NDVI) | Sentinel-2 |
| GHSL Built-up | GHSL Built-S (Drive cache) |
| GHSL Population | GHSL population raster |
| GHSL Settlement (SMOD) | GHSL SMOD settlement degree |
| Risk Level | Hotspot class + LST composite |
| Heat hotspots (pins) | Getis-Ord Gi* severe/moderate pixels |

Right panel: **Ranked Interventions** table, SHAP drivers, cooling potential, climate trend.

---

## Deploy to Render + Vercel (production)

Architecture: **Vercel = frontend only** · **Render = FastAPI + precomputed `outputs/`**

### Recommended strategy (hackathon / free tier)

1. Run pipeline locally for all demo cities
2. Commit `outputs/{city}/` artifacts (Git LFS optional for large parquets)
3. Push to GitHub — Render serves API from committed outputs (no multi-GB Drive sync on server)

Bundled in Git by default (see `.gitignore` exceptions): `feature_table.parquet`, models, rankings, geojson, summary, benchmarks.

### Render (backend)

Uses `render.yaml` at repo root:

```yaml
buildCommand: pip install -r requirements-deploy.txt
startCommand: uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
```

**Environment variables (Render dashboard):**

| Variable | Value |
|----------|-------|
| `CORS_ALLOW_ORIGINS` | Your Vercel URL, e.g. `https://urbancool.vercel.app` |
| `GEE_PROJECT` | `western-avatar-491910-s2` (only if re-running pipeline on Render) |
| `URBANCOOL_DATA_CACHE` | `/opt/render/project/src/data/cache` |
| `OPENROUTER_API_KEY` | Optional — AI chat |

**Optional live Drive sync on Render** (slow, needs disk):

```powershell
pip install gdown
# Set GEE credentials if also fetching satellite on server
py run_pipeline.py --city Mumbai --data-mode local --force
```

### Vercel (frontend)

Deploy the `frontend/` directory (or use root `vercel.json`).

**Environment variable:**

```
NEXT_PUBLIC_API_BASE=https://urbancool-api.onrender.com
```

Copy from `frontend/.env.example`. Root `vercel.json` already defaults to the Render API URL.

### Verify deployment

```powershell
curl https://urbancool-api.onrender.com/cities
curl https://urbancool-api.onrender.com/cities/Mumbai/summary
curl https://urbancool-api.onrender.com/cities/Mumbai/interventions?limit=5
```

---

## API endpoints (selected)

| Endpoint | Description |
|----------|-------------|
| `GET /cities` | List cities with data |
| `GET /cities/{city}/summary` | Metrics + provenance |
| `GET /cities/{city}/wards` | 3-D map grid GeoJSON |
| `GET /cities/{city}/heatmap/{layer}/meta` | Layer bounds (incl. `ghsl_built`, `ghsl_population`, `ghsl_smod`) |
| `GET /cities/{city}/hotspots` | Hotspot pin GeoJSON |
| `GET /cities/{city}/interventions` | Ranked intervention table |
| `GET /cities/{city}/benchmarks` | D-07/D-09 + training pipeline metrics |
| `POST /predict/point` | Live XGBoost LST + hotspot |
| `POST /scenario` | Cooling simulator |

Full docs: `http://localhost:8000/docs`

---

## Multi-city run

```powershell
py run_pipeline.py --multi-city --data-mode local --cities Mumbai Pune Delhi_NCR Bengaluru Chennai Kolkata Hyderabad Visakhapatnam Ahmedabad Mangaluru
```

---

## Tests

```powershell
pytest tests/ -q
cd frontend && npx tsc --noEmit
```

---

## Docs

| File | Contents |
|------|----------|
| `docs/REAL_DATA_GUIDE.md` | Wiring GHSL, ERA5, GEE |
| `docs/CLOUD_DEPLOY.md` | Render/Vercel details |
| `docs/RUNBOOK.md` | Operational runbook |
| `docs/HACKATHON_NARRATIVE.md` | Pitch narrative |

---

## References

- [UHI-Analysis](https://github.com/ArhamOrioner/UHI-Analysis) — GEE + ML hotspot pipeline
- [WRI UrbanHeatMitigation](https://github.com/wri/UrbanHeatMitigation)
- [InVEST UCM calibration](https://github.com/martibosch/invest-ucm-calibration)
