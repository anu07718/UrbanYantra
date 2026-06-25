export interface CityInfo {
  city_key: string;
  city_name: string;
  state?: string;
  has_data: boolean;
  avg_lst_c: number | null;
}

export interface CitySummary {
  city_key: string;
  city_name: string;
  bbox: number[];
  data_mode: string;
  grid_resolution_m?: number;
  ward_boundaries?: string;
  calibration?: {
    bias_c: number;
    method: string;
    station_count: number;
  };
  metrics: {
    avg_city_lst_c: number;
    avg_heat_stress_utci_c: number;
    resilience_index: number;
    co2_sequestration_tons_yr: number;
    total_investment_m_usd: number;
  };
  is_real_data?: boolean;
  data_sources?: Record<string, string>;
  artifacts_present?: Record<string, boolean>;
}

export interface WardProperties {
  ward_id: string;
  name: string;
  avg_lst_c: number;
  simulated_lst_c: number;
  heat_stress_utci_c: number;
  cooling_delta_c: number;
  ndvi: number;
  ndbi: number;
  vulnerability_class: string;
  hotspot_fraction: number;
  impervious_frac?: number;
  lst_calibrated_c?: number;
  boundary_source?: string;
  hotspot_class?: number;
}

export interface WardFeature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: WardProperties;
}

export interface WardCollection {
  type: "FeatureCollection";
  features: WardFeature[];
  meta?: { grid_step: number; rows: number; cols: number; cell_count: number };
}

export interface HeatmapMeta {
  layer: string;
  bounds: [[number, number], [number, number]];
  vmin: number;
  vmax: number;
  width: number;
  height: number;
  grid_step: number;
  unit?: string;
  source?: string;
}

export interface ThermalOverlayMeta {
  city_key: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  bounds: { west: number; south: number; east: number; north: number };
  vmin_k: number;
  vmax_k: number;
  unit: string;
  source: string;
  width: number;
  height: number;
}

export interface ThermalTilesMeta {
  city_key: string;
  tile_url: string;
  vmin_k: number;
  vmax_k: number;
  unit: string;
  source: string;
  palette?: string[];
  bounds: { west: number; south: number; east: number; north: number };
  coordinates?: [[number, number], [number, number], [number, number], [number, number]];
  overlay_url?: string;
}

export interface SamplePoint {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    lst_c: number;
    zone: string;
    cluster: string;
    hotspot_class: number;
    ndvi: number;
  };
}

export interface SamplePointCollection {
  type: "FeatureCollection";
  features: SamplePoint[];
  meta?: { stride: number; point_count: number; grid_size: string };
}

export interface Driver {
  feature: string;
  importance_pct: number;
}

export interface CoolingStrategy {
  strategy: string;
  delta_t_c: number;
}

export interface ClimatePoint {
  year: number;
  lst_c: number;
}

export interface ScenarioResult {
  mean_cooling_delta_c: number;
  simulated_avg_lst_c: number;
  baseline_avg_lst_c: number;
  simulated_utci_c: number;
  co2_sequestration_tons_yr: number;
  total_investment_m_usd: number;
  ward_updates: { ward_id: string; simulated_lst_c: number; cooling_delta_c: number }[];
}

export type MapLayer = "lst" | "thermal" | "utci" | "ndvi" | "svf" | "vulnerability";

export interface SimulationState {
  coolRoofs: number;
  greenRoofs: number;
  urbanGreening: number;
  blueInfra: number;
  budget: number;
  targetWard: string;
}

export interface ModelMetrics {
  city_key: string;
  model: string;
  validation: string;
  lst_regression: {
    mae_c: number;
    r2: number;
    rf_mae_c: number;
    rf_r2: number;
  };
  hotspot_classifier: {
    accuracy: number;
  };
  feature_count: number;
}

export interface PointPrediction {
  city_key: string;
  lon: number;
  lat: number;
  pixel_lon: number;
  pixel_lat: number;
  observed_lst_c: number;
  observed_lst_calibrated_c?: number;
  predicted_lst_c: number;
  residual_c: number;
  observed_hotspot_class: number;
  predicted_hotspot_class: number;
  hotspot_label: string;
  probabilities: { class: number; label: string; probability: number }[];
  lst_model: string;
  hotspot_model: string;
}

// Phase 2 — Hotspot overlay
export interface HotspotFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { hotspot_id: string; lst_c: number; hotspot_class: number };
}

export interface HotspotCollection {
  type: "FeatureCollection";
  features: HotspotFeature[];
}

