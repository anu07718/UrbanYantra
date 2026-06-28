// API base URL
// - Local dev: localhost:8000 (or /api rewrite if NEXT_PUBLIC_API_BASE=/api)
// - Vercel prod: /api → next.config rewrites → HF Space (same-origin, no CORS)
const PRODUCTION_API_BASE = "/api";

function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:8000";
  return PRODUCTION_API_BASE;
}

export const apiBase = resolveApiBase();

// Cities
export async function getCities() {
  const res = await fetch(`${apiBase}/cities`);
  if (!res.ok) throw new Error(`Failed to fetch cities: ${res.statusText}`);
  return res.json();
}

// City Summary
export async function getCitySummary(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/summary`);
  if (!res.ok) throw new Error(`Failed to fetch summary for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Domains (Planning Wards)
export async function getDomains(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/domains`);
  if (!res.ok) throw new Error(`Failed to fetch domains for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Wards (Grid cells)
export async function getWards(cityKey: string, step: number = 4) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/wards?step=${step}`);
  if (!res.ok) throw new Error(`Failed to fetch wards for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Heatmap metadata
export async function getHeatmapMeta(cityKey: string, layer: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/heatmap/${layer}/meta`);
  if (!res.ok) throw new Error(`Failed to fetch heatmap meta for ${layer}: ${res.statusText}`);
  return res.json();
}

// Georeferenced Landsat thermal overlay (RGBA PNG on satellite basemap)
export async function getThermalOverlayMeta(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/thermal/overlay/meta`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch thermal overlay meta: ${res.status}${detail ? ` — ${detail.slice(0, 120)}` : ""}`
    );
  }
  return res.json();
}

export function thermalOverlayUrl(cityKey: string) {
  return `${apiBase}/cities/${cityKey}/thermal/overlay.png`;
}

/** @deprecated use getThermalOverlayMeta */
export async function getThermalTiles(cityKey: string) {
  return getThermalOverlayMeta(cityKey);
}

export function heatmapPngUrl(cityKey: string, layer: string) {
  return `${apiBase}/cities/${cityKey}/heatmap/${layer}.png`;
}

// Sample points
export async function getSamplePoints(cityKey: string, stride: number = 2) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/sample-points?stride=${stride}`);
  if (!res.ok) throw new Error(`Failed to fetch sample points for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Drivers
export async function getDrivers(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/drivers`);
  if (!res.ok) throw new Error(`Failed to fetch drivers for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Dataset audit: real vs synthetic, Drive/cache/bundled usage
export async function getDataAudit(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/data-audit`);
  if (!res.ok) throw new Error(`Failed to fetch data audit for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// D-07 Kaggle + D-09 EY benchmark summaries
export async function getBenchmarks(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/benchmarks`);
  if (!res.ok) throw new Error(`Failed to fetch benchmarks for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Hackathon USP metrics: green cooling, carbon, planning priority
export async function getUspMetrics(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/usp`);
  if (!res.ok) throw new Error(`Failed to fetch USP metrics for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Cooling potential
export async function getCoolingPotential(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/cooling-potential`);
  if (!res.ok) throw new Error(`Failed to fetch cooling potential for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Climate projection
export async function getClimate(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/climate`);
  if (!res.ok) throw new Error(`Failed to fetch climate for ${cityKey}: ${res.statusText}`);
  return res.json();
}

// Run scenario
export async function runScenario(
  cityKey: string,
  coolRoofsPct: number,
  greenRoofsPct: number,
  urbanGreeningPct: number,
  blueInfraPct: number,
  budgetMUsd: number
) {
  const res = await fetch(`${apiBase}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city_key: cityKey,
      cool_roofs_pct: coolRoofsPct,
      green_roofs_pct: greenRoofsPct,
      urban_greening_pct: urbanGreeningPct,
      blue_infra_pct: blueInfraPct,
      budget_m_usd: budgetMUsd,
    }),
  });
  if (!res.ok) throw new Error(`Failed to run scenario: ${res.statusText}`);
  return res.json();
}

// Run scenario comparison
export async function runScenarioComparison(
  cityKey: string,
  coolRoofsPct: number,
  greenRoofsPct: number,
  urbanGreeningPct: number,
  blueInfraPct: number,
  budgetMUsd: number
) {
  const res = await fetch(`${apiBase}/scenario/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city_key: cityKey,
      cool_roofs_pct: coolRoofsPct,
      green_roofs_pct: greenRoofsPct,
      urban_greening_pct: urbanGreeningPct,
      blue_infra_pct: blueInfraPct,
      budget_m_usd: budgetMUsd,
    }),
  });
  if (!res.ok) throw new Error(`Failed to run scenario comparison: ${res.statusText}`);
  return res.json();
}

// Chat
export async function sendChat(
  cityKey: string,
  message: string,
  history?: { role: string; content: string }[]
) {
  const res = await fetch(`${apiBase}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city_key: cityKey,
      message: message,
      history: history ?? [],
    }),
  });
  if (!res.ok) throw new Error(`Failed to send chat: ${res.statusText}`);
  return res.json();
}

// Download PDF Report
export async function downloadReport(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/report`);
  if (!res.ok) throw new Error(`Failed to generate report: ${res.statusText}`);
  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `UrbanYantra_${cityKey}_${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// AIML model metrics
export async function getModelMetrics(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/model-metrics`);
  if (!res.ok) throw new Error(`Failed to fetch model metrics: ${res.statusText}`);
  return res.json();
}

// AIML point prediction (LST + hotspot)
export async function predictPoint(cityKey: string, lon: number, lat: number) {
  const res = await fetch(`${apiBase}/predict/point`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_key: cityKey, lon, lat }),
  });
  if (!res.ok) throw new Error(`Prediction failed: ${res.statusText}`);
  return res.json();
}

// AIML prediction grid
export async function getPredictionsGrid(cityKey: string, stride: number = 4) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/predictions/grid?stride=${stride}`);
  if (!res.ok) throw new Error(`Failed to fetch prediction grid: ${res.statusText}`);
  return res.json();
}

// Hotspot points (Phase 2)
export async function getHotspots(cityKey: string) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/hotspots`);
  if (!res.ok) throw new Error(`Failed to fetch hotspots: ${res.statusText}`);
  return res.json();
}

// Intervention rankings (Phase 2)
export async function getInterventions(cityKey: string, limit = 15) {
  const res = await fetch(`${apiBase}/cities/${cityKey}/interventions?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch interventions: ${res.statusText}`);
  return res.json();
}

