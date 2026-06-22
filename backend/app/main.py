"""FastAPI backend — serves precomputed pipeline outputs + live scenario scoring."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services import city_data, heatmap

app = FastAPI(
    title="UrbanCool API",
    description="Urban Heat Mitigation — physics-informed AI intelligence platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScenarioRequest(BaseModel):
    city_key: str = "Bengaluru"
    cool_roofs_pct: float = Field(0, ge=0, le=100)
    green_roofs_pct: float = Field(0, ge=0, le=100)
    urban_greening_pct: float = Field(0, ge=0, le=100)
    blue_infra_pct: float = Field(0, ge=0, le=100)
    budget_m_usd: float = Field(5.0, ge=0, le=50)


class ChatRequest(BaseModel):
    city_key: str = "Bengaluru"
    message: str


@app.get("/")
def root():
    return {"service": "UrbanCool API", "docs": "/docs"}


@app.get("/cities")
def list_cities():
    return city_data.list_cities()


@app.get("/cities/{city_key}/summary")
def city_summary(city_key: str):
    try:
        return city_data.get_city_summary(city_key)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/domains")
def city_domains(city_key: str):
    """Named planning wards for simulator target domain (e.g. Borivali, Colaba)."""
    try:
        return city_data.build_ward_geojson(city_key, rows=5, cols=4)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/wards")
def city_wards(city_key: str, step: int | None = Query(4, ge=1, le=20)):
    try:
        return heatmap.build_fine_grid_geojson(city_key, step=step)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/heatmap/{layer}.png")
def heatmap_png(city_key: str, layer: str):
    try:
        png = heatmap.get_heatmap_png(city_key, layer)
        return Response(content=png, media_type="image/png")
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/cities/{city_key}/heatmap/{layer}/meta")
def heatmap_meta(city_key: str, layer: str):
    try:
        return heatmap.get_heatmap_meta(city_key, layer)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/sample-points")
def sample_points(city_key: str, stride: int = Query(2, ge=1, le=12)):
    try:
        return heatmap.build_sample_points_geojson(city_key, stride=stride)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/hotspots")
def city_hotspots(city_key: str):
    try:
        return city_data.get_hotspots(city_key)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/drivers")
def city_drivers(city_key: str):
    try:
        return city_data.get_drivers(city_key)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/cooling-potential")
def cooling_potential(city_key: str):
    try:
        return city_data.get_cooling_potential(city_key)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/cities/{city_key}/climate")
def climate_projection(city_key: str):
    try:
        return city_data.get_climate_projection(city_key)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/ranking/{city_key}")
def ranking(city_key: str, limit: int = 30):
    try:
        return city_data.get_ranking(city_key, limit=limit)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/scenario")
def scenario(body: ScenarioRequest):
    try:
        return city_data.run_scenario(
            body.city_key,
            body.cool_roofs_pct,
            body.green_roofs_pct,
            body.urban_greening_pct,
            body.blue_infra_pct,
            body.budget_m_usd,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/chat")
def chat(body: ChatRequest):
    try:
        reply = city_data.chat_response(body.message, body.city_key)
        return {"reply": reply}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
