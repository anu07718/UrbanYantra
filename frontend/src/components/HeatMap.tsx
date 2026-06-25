"use client";

import { useMemo, useState, useCallback } from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo, MapViewState } from "@deck.gl/core";
import type { FeatureCollection, Polygon } from "geojson";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  HeatmapMeta,
  HotspotCollection,
  MapLayer,
  PointPrediction,
  SamplePointCollection,
  WardCollection,
  WardProperties,
} from "@/types";

/* ── Carto Positron — white basemap, no token ──────────────────────────── */
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/* ── 5 discrete heat tiers exactly matching the reference image ────────── */
const TIERS = [
  { key: "critical", min: 40,        max: Infinity, rgb: [255,  23,  68] as [number,number,number], label: "Critical", range: "≥ 40°C"  },
  { key: "high",     min: 38,        max: 40,        rgb: [255, 145,   0] as [number,number,number], label: "High",     range: "38–40°C" },
  { key: "moderate", min: 36,        max: 38,        rgb: [255, 214,   0] as [number,number,number], label: "Moderate", range: "36–38°C" },
  { key: "normal",   min: 34,        max: 36,        rgb: [  0, 200,  83] as [number,number,number], label: "Normal",   range: "34–36°C" },
  { key: "cool",     min: -Infinity, max: 34,        rgb: [ 41, 121, 255] as [number,number,number], label: "Cool",     range: "< 34°C"  },
];

function displayLst(p: WardProperties): number {
  return p.lst_calibrated_c ?? p.avg_lst_c;
}

function tierRgba(lst: number, alpha: number): [number,number,number,number] {
  const t = TIERS.find((t) => lst >= t.min && lst < t.max) ?? TIERS[TIERS.length - 1];
  return [t.rgb[0], t.rgb[1], t.rgb[2], alpha];
}

/* ── Layer / view constants ─────────────────────────────────────────────── */
const LAYER_LABELS: { id: MapLayer; label: string; tip: string }[] = [
  { id: "lst",           label: "Surface Temperature",    tip: "How hot the ground surface is (°C) from satellite data." },
  { id: "utci",          label: "Heat Stress on People",  tip: "How uncomfortable the heat feels to a person outdoors." },
  { id: "ndvi",          label: "Green Coverage",         tip: "How much vegetation (trees, grass) is in each area. Higher = cooler." },
  { id: "svf",           label: "Building Density",       tip: "How densely built the area is. Dense areas trap more heat." },
  { id: "vulnerability", label: "Risk Level",             tip: "Combined heat risk score — red areas need urgent intervention." },
];

interface TooltipState {
  x: number; y: number;
  lst: number;
  vuln: string;
  name: string;
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface HeatMapProps {
  cityKey:         string;
  cityName:        string;
  domains:         WardCollection | null;
  fineGrid:        WardCollection | null;
  samplePoints:    SamplePointCollection | null;
  hotspots:        HotspotCollection | null;
  heatmapMeta:     HeatmapMeta | null;
  bbox:            number[];
  layer:           MapLayer;
  selectedWard:    WardProperties | null;
  targetWard:      string;
  onSelectWard:    (p: WardProperties | null) => void;
  wardSimulations: Record<string, number>;
  onLayerChange:   (l: MapLayer) => void;
  pointPrediction: PointPrediction | null;
  predicting:      boolean;
  onMapClick:      (lon: number, lat: number) => void;
}

export default function HeatMap({
  cityKey,
  cityName,
  domains,
  fineGrid,
  hotspots,
  samplePoints,
  bbox,
  layer,
  selectedWard,
  onSelectWard,
  wardSimulations,
  onLayerChange,
  pointPrediction,
  predicting,
  onMapClick,
}: HeatMapProps) {
  const [showGrid,      setShowGrid]      = useState(true);
  const [showDomains,   setShowDomains]   = useState(true);
  const [showHotspots,  setShowHotspots]  = useState(false);
  const [pitch,       setPitch]       = useState(45);
  const [viewState,   setViewState]   = useState<MapViewState>(() => ({
    longitude: bbox?.length === 4 ? (bbox[0] + bbox[2]) / 2 : 77.59,
    latitude:  bbox?.length === 4 ? (bbox[1] + bbox[3]) / 2 : 12.97,
    zoom:      11.2,
    pitch:     45,
    bearing:   -15,
    minZoom:   6,
    maxZoom:   18,
  }));
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  /* sync pitch into viewState when user clicks a button */
  const applyPitch = useCallback((p: number) => {
    setPitch(p);
    setViewState((v) => ({ ...v, pitch: p }));
  }, []);

  /* recenter when city changes */
  const centeredView = useMemo<MapViewState>(() => ({
    longitude: bbox?.length === 4 ? (bbox[0] + bbox[2]) / 2 : 77.59,
    latitude:  bbox?.length === 4 ? (bbox[1] + bbox[3]) / 2 : 12.97,
    zoom:      11.2,
    pitch,
    bearing:   -15,
    minZoom:   6,
    maxZoom:   18,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cityKey, bbox, pitch]);

  /* Use API pixel-aligned grid only — no client-side bbox fallback (misaligns) */
  const displayGrid = useMemo<WardCollection | null>(() => {
    if (fineGrid?.features?.length) return fineGrid;
    return null;
  }, [fineGrid]);

  const handleGridHover = useCallback((info: PickingInfo) => {
    if (info.object && info.x != null && info.y != null) {
      const p = info.object.properties as WardProperties;
      const lst = wardSimulations[p.ward_id] ?? displayLst(p);
      setTooltip({ x: info.x, y: info.y, lst, vuln: p.vulnerability_class, name: p.name });
    } else {
      setTooltip(null);
    }
  }, [wardSimulations]);

  const handleWardHover = useCallback((info: PickingInfo) => {
    if (!showGrid && info.object && info.x != null && info.y != null) {
      const p = info.object.properties as WardProperties;
      const lst = wardSimulations[p.ward_id] ?? displayLst(p);
      setTooltip({ x: info.x, y: info.y, lst, vuln: p.vulnerability_class, name: p.name });
    } else if (showGrid) {
      setTooltip(null);
    }
  }, [wardSimulations, showGrid]);

  /* deck.gl layers */
  const layers = useMemo(() => {
    const out = [];

    /* ── 3-D extruded regular grid ─────────────────────────────────── */
    if (showGrid && displayGrid) {
      out.push(
        new GeoJsonLayer<WardProperties>({
          id:                 `grid-3d-${cityKey}`,
          data:               displayGrid as FeatureCollection<Polygon, WardProperties>,
          pickable:           true,
          stroked:            true,
          filled:             true,
          extruded:           true,
          wireframe:          true,
          lineWidthMinPixels: 1,
          /* white wire between cells */
          getLineColor:  [255, 255, 255, 25] as [number,number,number,number],
          getFillColor:  (f) => {
            const p = f.properties as WardProperties;
            const lst = wardSimulations[p.ward_id] ?? displayLst(p);
            return tierRgba(lst, 235);
          },
          /* height = 0 at 30°C, rises ~2 100 m at 44°C (exaggerated for drama) */
          getElevation:  (f) => {
            const p = f.properties as WardProperties;
            const lst = wardSimulations[p.ward_id] ?? displayLst(p);
            return Math.max(0, (lst - 30) * 200);
          },
          elevationScale: 1,
          updateTriggers: { getFillColor: wardSimulations, getElevation: wardSimulations },
          transitions:    { getFillColor: 400, getElevation: 400 },
          onHover:  handleGridHover,
          onClick:  (info: PickingInfo) => {
            if (info.object) onSelectWard(info.object.properties as WardProperties);
            if (info.coordinate) onMapClick(info.coordinate[0], info.coordinate[1]);
          },
        })
      );
    }

    /* ── Named ward outlines (labels only when grid hidden) ───────── */
    if (showDomains && domains) {
      out.push(
        new GeoJsonLayer({
          id:                 `wards-${cityKey}`,
          data:               domains as unknown as FeatureCollection,
          pickable:           !showGrid,
          stroked:            true,
          filled:             true,
          extruded:           false,
          lineWidthMinPixels: 2,
          getLineColor: (f: { properties: WardProperties }) =>
            (selectedWard?.ward_id === f.properties.ward_id
              ? [8, 145, 178, 255]
              : [60, 80, 120, 140]) as [number,number,number,number],
          getFillColor: (_f: unknown) => [0, 0, 0, 0] as [number,number,number,number],
          updateTriggers: { getLineColor: selectedWard?.ward_id },
          onHover: handleWardHover,
          onClick: (info: PickingInfo) => {
            if (info.object) onSelectWard(info.object.properties as WardProperties);
            if (info.coordinate) onMapClick(info.coordinate[0], info.coordinate[1]);
          },
        })
      );
    }

    /* ── Hotspot scatter layer ───────────────────────────────────────── */
    if (showHotspots && hotspots && hotspots.features.length > 0) {
      out.push(
        new ScatterplotLayer({
          id:              `hotspots-${cityKey}`,
          data:            hotspots.features,
          getPosition:     (f) => f.geometry.coordinates as [number, number],
          getRadius:       80,
          radiusMinPixels: 5,
          radiusMaxPixels: 18,
          getFillColor:    (f) =>
            f.properties.hotspot_class >= 2
              ? [255, 23, 68, 220]
              : [255, 140, 0, 180],
          getLineColor:    [255, 255, 255, 160],
          stroked:         true,
          lineWidthMinPixels: 1,
          pickable:        false,
        })
      );
    }

    return out;
  }, [cityKey, displayGrid, domains, showGrid, showDomains, showHotspots, hotspots, wardSimulations, selectedWard, handleGridHover, handleWardHover, onSelectWard, onMapClick]);

  const vulnCls = (v: string) =>
    v === "CRITICAL" ? "text-red-400 font-bold" : v === "HIGH" ? "text-orange-400 font-bold" :
    v === "MODERATE" ? "text-yellow-400 font-bold" : "text-green-400 font-bold";

  const getWardRecommendation = (vuln: string) => {
    const v = vuln.toUpperCase();
    if (v === "CRITICAL") return "🚨 Critical Heat: Paint rooftops white (reflective paint) & prioritize dense street tree planting immediately.";
    if (v === "HIGH") return "⚠️ High Risk: Expand vegetative canopy cover by 20% & establish community pocket parks.";
    if (v === "MODERATE") return "⚡ Moderate: Consider building green roofs or installing local mist/water cooling corridors.";
    return "✅ Low Risk: Maintain current urban vegetation canopy and water bodies.";
  };

  return (
    <div className="relative h-full min-h-0 w-full flex-1">

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="absolute left-3 top-3 z-10 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900/95 p-3 text-xs shadow-2xl text-slate-200 backdrop-blur-md">
        <p className="mb-2 font-semibold text-white text-sm">{cityName}</p>

        {LAYER_LABELS.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-300 hover:text-white" title={l.tip}>
            <input type="radio" name="mapLayer" checked={layer === l.id} onChange={() => onLayerChange(l.id)} className="accent-cyan-400" />
            {l.label}
          </label>
        ))}

        <div className="my-2 space-y-1.5 border-t border-slate-800 pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-cyan-400" />
            3-D heat grid
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={showDomains} onChange={(e) => setShowDomains(e.target.checked)} className="accent-cyan-400" />
            Area outlines
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={showHotspots} onChange={(e) => setShowHotspots(e.target.checked)} className="accent-red-500" />
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Heat hotspots
            </span>
          </label>
        </div>

        <div className="border-t border-slate-800 pt-2">
          <p className="mb-1 text-[10px] uppercase text-slate-500">View angle</p>
          <div className="flex gap-1">
            {([0, 30, 45, 60] as number[]).map((p) => (
              <button key={p} type="button" onClick={() => applyPitch(p)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  pitch === p ? "bg-cyan-500 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}>
                {p === 0 ? "Top" : `${p}°`}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[9px] text-slate-500">Drag to rotate · scroll to zoom</p>
      </div>

      {/* ── Selected ward + AIML prediction ─────────────────────────── */}
      {(selectedWard || pointPrediction) && (
        <div className="absolute right-3 top-3 z-10 w-64 rounded-xl border border-slate-700/60 bg-slate-900/95 p-3 text-xs shadow-2xl text-slate-200 backdrop-blur-md">
          {selectedWard && (
            <>
              <p className="text-sm font-semibold text-white">{selectedWard.name}</p>
              <p className={`mt-0.5 text-[10px] font-semibold uppercase ${vulnCls(selectedWard.vulnerability_class)}`}>
                {selectedWard.vulnerability_class}
              </p>
              <table className="mt-2 w-full text-left">
                <tbody>
                  {([
                    ["Satellite LST",  `${selectedWard.avg_lst_c.toFixed(1)}°C`],
                    ["Calibrated LST", `${(selectedWard.lst_calibrated_c ?? selectedWard.avg_lst_c).toFixed(1)}°C`],
                    ["Simulated LST", `${(wardSimulations[selectedWard.ward_id] ?? selectedWard.simulated_lst_c).toFixed(1)}°C`],
                    ["Heat Stress",   `${selectedWard.heat_stress_utci_c.toFixed(1)}°C UTCI`],
                    ["NDVI (Greenery)",  selectedWard.ndvi.toFixed(2)],
                  ] as [string,string][]).map(([lbl, val]) => (
                    <tr key={lbl}>
                      <td className="py-0.5 text-slate-400 text-[11px]">{lbl}</td>
                      <td className="py-0.5 text-right font-mono text-white text-[11px]">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-2.5 rounded bg-slate-800/60 p-2 text-[10px] text-slate-300 leading-relaxed border border-slate-700/40">
                {getWardRecommendation(selectedWard.vulnerability_class)}
              </div>
            </>
          )}

          <div className={`${selectedWard ? "mt-3.5 border-t border-slate-800 pt-3" : ""}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-400">
              AIML Prediction {predicting && <span className="text-slate-500">· running…</span>}
            </p>
            {pointPrediction ? (
              <div className="space-y-2 mt-2">
                <table className="w-full text-left">
                  <tbody>
                    {([
                      ["AI LST",       `${pointPrediction.predicted_lst_c.toFixed(1)}°C`],
                      ["Calibrated LST", `${(pointPrediction.observed_lst_calibrated_c ?? pointPrediction.observed_lst_c).toFixed(1)}°C`],
                      ["Satellite LST", `${pointPrediction.observed_lst_c.toFixed(1)}°C`],
                      ["Hotspot Label", pointPrediction.hotspot_label],
                    ] as [string,string][]).map(([lbl, val]) => (
                      <tr key={lbl}>
                        <td className="py-0.5 text-slate-400 text-[11px]">{lbl}</td>
                        <td className={`py-0.5 text-right font-mono text-[11px] ${
                          lbl === "AI LST" ? "font-bold text-cyan-400" : "text-white"
                        }`}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Residual explanation */}
                <div className="rounded bg-slate-800/40 p-1.5 text-[9px] text-slate-400 border border-slate-800/80 leading-normal">
                  <span className="font-semibold text-slate-300">Residual: </span>
                  {pointPrediction.residual_c.toFixed(2)}°C
                  <p className="mt-0.5 text-slate-500">
                    {pointPrediction.residual_c > 0.5 
                      ? "💡 Local building features are absorbing more heat than predicted."
                      : pointPrediction.residual_c < -0.5 
                      ? "💡 Local canopy or shade cooling is performing better than predicted."
                      : "💡 Surface matches the regional baseline projection."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-slate-500">Click any map cell for live XGBoost inference</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelectWard(null)}
            className="mt-3.5 block w-full text-center py-1 rounded bg-slate-800 text-[10px] text-slate-400 hover:text-white transition-colors border border-slate-700/40"
          >
            ✕ Close Details
          </button>
        </div>
      )}

      {/* ── Tier legend ───────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-slate-700/60 bg-slate-900/95 px-3 py-2.5 text-[10px] text-slate-200 shadow-2xl backdrop-blur-md">
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-white">Heat Tiers (LST)</p>
        {TIERS.map((t) => (
          <div key={t.key} className="flex items-center gap-2 py-[3px]">
            <span className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})` }} />
            <span className="w-14 font-medium text-slate-300">{t.label}</span>
            <span className="text-slate-500">{t.range}</span>
          </div>
        ))}
        <p className="mt-1.5 text-[9px] text-slate-500">Height ∝ temperature</p>
      </div>

      {/* ── Hover tooltip ─────────────────────────────────────────────── */}
      {tooltip && (
        <div className="pointer-events-none absolute z-20 rounded-lg border border-slate-700/60 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-200 shadow-2xl backdrop-blur-sm"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <p className="font-semibold text-white">{tooltip.name}</p>
          <p className="text-slate-400 mt-0.5">LST: <span className="font-mono text-white font-bold">{tooltip.lst.toFixed(1)}°C</span></p>
          <p className={`font-semibold text-[10px] mt-0.5 ${vulnCls(tooltip.vuln)}`}>{tooltip.vuln}</p>
        </div>
      )}

      {/* ── DeckGL canvas ─────────────────────────────────────────────── */}
      <DeckGL
        key={cityKey}
        initialViewState={centeredView}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
        controller={{ dragRotate: true, touchRotate: true, keyboard: true }}
        layers={layers}
        style={{ position: "absolute", top: "0", left: "0", right: "0", bottom: "0" }}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>
    </div>
  );
}
