# Cloud Deployment — Vercel + Render

> See also the **Deploy to Render + Vercel** section in the root `README.md`.

## How it works (important)

| Service | Role | Needs your CSV/rasters? |
|---------|------|-------------------------|
| **Vercel** | Next.js frontend only | **No** — calls backend API |
| **Render** | FastAPI backend | **Yes** — reads `outputs/{city}/` precomputed by pipeline |

**Vercel never runs Python or reads Google Drive.**  
**Render serves committed `outputs/` artifacts** (recommended) or can sync Drive on first pipeline run.

---

## Data strategy (3 tiers)

```
Tier 1 — Bundled in Git (works everywhere)
  data/benchmarks/urban_heat_island_dataset.csv   ← D-07 ✅ committed
  data/benchmarks/Training_data_uhi_index_*.csv   ← D-09 ✅ committed
  outputs/{city}/tables/feature_table.parquet     ← precomputed city outputs ✅
  outputs/{city}/ranking/*.json                   ← intervention rankings ✅
  outputs/{city}/models/*.joblib                    ← XGBoost inference ✅

Tier 2 — Google Drive → auto-download to data/cache/ (first pipeline run)
  configs/remote_datasets.yaml  ← folder ID 1pM9UKiI03lm_4XhnSwmcAp8at1pz8REU

Tier 3 — Google Earth Engine (satellite LST, S2, WorldCover)
  data_mode: gee|local  +  GEE_PROJECT env var on Render (optional)
```

---

## Render deploy checklist

1. Push repo with `outputs/mumbai/` (and other demo cities) committed
2. Create Web Service from `render.yaml` or manually:
   - **Build:** `pip install -r requirements-deploy.txt`
   - **Start:** `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
3. Set env vars:
   - `CORS_ALLOW_ORIGINS` = your Vercel URL
   - `URBANCOOL_DATA_CACHE` = `/opt/render/project/src/data/cache`
   - `GEE_PROJECT` (only if running pipeline on Render)
4. Health check: `GET /` → `{"service":"UrbanCool API"}`

---

## Vercel deploy checklist

1. Connect repo; set root to `frontend/` or use root `vercel.json`
2. Set `NEXT_PUBLIC_API_BASE=https://your-render-service.onrender.com`
3. Build command: `npm run build` (default for Next.js)

---

## Priority order (dataset resolution)

1. `data/benchmarks/` (bundled)
2. `local_data` path (dev PC only)
3. `data/cache/` (Drive sync)
4. `remote_data` Google Drive download via gdown

This means teammates, judges, Render, and Vercel all work without your Downloads folder.
