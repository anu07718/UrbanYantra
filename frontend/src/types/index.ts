export interface CityInfo {
  city_key: string;
  city_name: string;
  has_data: boolean;
  avg_lst_c: number | null;
}

export interface CitySummary {
  city_key: string;
  city_name: string;
  bbox: number[];
  data_mode: string;
  metrics: {
    avg_city_lst_c: number;
    avg_heat_stress_utci_c: number;
    resilience_index: number;
    co2_sequestration_tons_yr: number;
    total_investment_m_usd: number;
  };
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

export type MapLayer = "lst" | "utci" | "ndvi" | "svf" | "vulnerability";

export interface SimulationState {
  coolRoofs: number;
  greenRoofs: number;
  urbanGreening: number;
  blueInfra: number;
  budget: number;
  targetWard: string;
}
