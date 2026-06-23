"use client";

import { useMemo, useState, useCallback } from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo, MapViewState } from "@deck.gl/core";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  HeatmapMeta,
  MapLayer,
  SamplePointCollection,
  WardCollection,
  WardProperties,
} from "@/types";

/* ── Carto Positron — white basemap, no token ──────────────────────────── */
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/* ── 5 discrete heat tiers exactly matching the reference image ────────── */
const TIERS = [
  { key: "critical", min: 40, max: Infinity, rgb: [255, 23, 68] as [number, number, number], label: "Critical", range: "≥ 40°C" },
  { key: "high", min: 38, max: 40, rgb: [255, 145, 0] as [number, number, number], label: "High", range: "38–40°C" },
  { key: "moderate", min: 36, max: 38, rgb: [255, 214, 0] as [number, number, number], label: "Moderate", range: "36–38°C" },
  { key: "normal", min: 34, max: 36, rgb: [0, 200, 83] as [number, number, number], label: "Normal", range: "34–36°C" },
  { key: "cool", min: -Infinity, max: 34, rgb: [41, 121, 255] as [number, number, number], label: "Cool", range: "< 34°C" },
];

function tierRgba(lst: number, alpha: number): [number, number, number, number] {
  const t = TIERS.find((t) => lst >= t.min && lst < t.max) ?? TIERS[TIERS.length - 1];
  return [t.rgb[0], t.rgb[1], t.rgb[2], alpha];
}

/* ── Build a dense regular grid from bbox + sample-point LST values ─────
   This is what produces the tight uniform cells visible in the screenshot.
   We divide the bbox into COLS × ROWS cells and interpolate LST from the
   nearest sample point (fast nearest-neighbour, no extra lib needed).      */
interface GridCell {
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

function buildRegularGrid(
  bbox: number[],
  samplePoints: SamplePointCollection | null,
  avgLst: number,
  cols = 60,
  rows = 60,
): FeatureCollection<Polygon, GridCell> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;

  /* build a fast lookup from sample points */
  const pts = samplePoints?.features ?? [];

  function nearestLst(cx: number, cy: number): number {
    if (pts.length === 0) return avgLst;
    let best = Infinity;
    let val = avgLst;
    for (const p of pts) {
      const [lon, lat] = p.geometry.coordinates;
      const d = (lon - cx) ** 2 + (lat - cy) ** 2;
      if (d < best) { best = d; val = p.properties.lst_c; }
    }
    return val;
  }

  const features: Feature<Polygon, GridCell>[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const west = minLon + c * dLon;
      const east = west + dLon;
      const south = minLat + r * dLat;
      const north = south + dLat;
      const cx = (west + east) / 2;
      const cy = (south + north) / 2;

      const lst = nearestLst(cx, cy);
      const vuln =
        lst >= 40 ? "CRITICAL" :
          lst >= 38 ? "HIGH" :
            lst >= 36 ? "MODERATE" : "NORMAL";

      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]],
        },
        properties: {
          ward_id: `cell_${r}_${c}`,
          name: `Cell ${r},${c}`,
          avg_lst_c: lst,
          simulated_lst_c: lst,
          heat_stress_utci_c: lst * 0.72,
          cooling_delta_c: 0,
          ndvi: 0,
          ndbi: 0,
          vulnerability_class: vuln,
          hotspot_fraction: lst >= 38 ? 1 : 0,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/* ── Layer / view constants ─────────────────────────────────────────────── */
const LAYER_LABELS: { id: MapLayer; label: string }[] = [
  { id: "lst", label: "Surface Temp (LST)" },
  { id: "utci", label: "Heat Stress (UTCI)" },
  { id: "ndvi", label: "Vegetation (NDVI)" },
  { id: "svf", label: "Morphology (SVF)" },
  { id: "vulnerability", label: "Heat Vulnerability" },
];

interface TooltipState {
  x: number; y: number;
  lst: number;
  vuln: string;
  name: string;
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface HeatMapProps {
  cityKey: string;
  cityName: string;
  domains: WardCollection | null;
  fineGrid: WardCollection | null;
  samplePoints: SamplePointCollection | null;
  heatmapMeta: HeatmapMeta | null;
  bbox: number[];
  layer: MapLayer;
  selectedWard: WardProperties | null;
  targetWard: string;
  onSelectWard: (p: WardProperties | null) => void;
  wardSimulations: Record<string, number>;
  onLayerChange: (l: MapLayer) => void;
}

export default function HeatMap({
  cityKey,
  cityName,
  domains,
  samplePoints,
  bbox,
  layer,
  selectedWard,
  onSelectWard,
  wardSimulations,
  onLayerChange,
}: HeatMapProps) {
  const [showGrid, setShowGrid] = useState(true);
  const [showDomains, setShowDomains] = useState(true);
  const [pitch, setPitch] = useState(45);
  const [viewState, setViewState] = useState<MapViewState>(() => ({
    longitude: bbox?.length === 4 ? (bbox[0] + bbox[2]) / 2 : 77.59,
    latitude: bbox?.length === 4 ? (bbox[1] + bbox[3]) / 2 : 12.97,
    zoom: 10.5,
    pitch: 45,
    bearing: -15,
    minZoom: 6,
    maxZoom: 18,
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
    latitude: bbox?.length === 4 ? (bbox[1] + bbox[3]) / 2 : 12.97,
    zoom: 10.5,
    pitch,
    bearing: -15,
    minZoom: 6,
    maxZoom: 18,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cityKey]);

  /* build the regular grid only when city / sample-points change */
  const avgLst = useMemo(() => {
    const pts = samplePoints?.features ?? [];
    if (pts.length === 0) return 37;
    return pts.reduce((s, p) => s + p.properties.lst_c, 0) / pts.length;
  }, [samplePoints]);

  const regularGrid = useMemo(
    () => bbox?.length === 4
      ? buildRegularGrid(bbox, samplePoints, avgLst, 60, 60)
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cityKey, samplePoints, avgLst],
  );

  /* hover handler */
  const handleHover = useCallback((info: PickingInfo) => {
    if (info.object && info.x != null && info.y != null) {
      const p = info.object.properties as GridCell;
      const lst = wardSimulations[p.ward_id] ?? p.avg_lst_c;
      setTooltip({ x: info.x, y: info.y, lst, vuln: p.vulnerability_class, name: p.name });
    } else {
      setTooltip(null);
    }
  }, [wardSimulations]);

  /* deck.gl layers */
  const layers = useMemo(() => {
    const out = [];

    /* ── 3-D extruded regular grid ─────────────────────────────────── */
    if (showGrid && regularGrid) {
      out.push(
        new GeoJsonLayer<GridCell>({
          id: `grid-3d-${cityKey}`,
          data: regularGrid as FeatureCollection<Polygon, GridCell>,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: true,
          wireframe: true,
          lineWidthMinPixels: 1,
          /* white wire between cells */
          getLineColor: [255, 255, 255, 25] as [number, number, number, number],
          getFillColor: (f) => {
            const lst = wardSimulations[f.properties.ward_id] ?? f.properties.avg_lst_c;
            return tierRgba(lst, 235);
          },
          /* height = 0 at 30°C, rises ~2 100 m at 44°C (exaggerated for drama) */
          getElevation: (f) => {
            const lst = wardSimulations[f.properties.ward_id] ?? f.properties.avg_lst_c;
            return Math.max(0, (lst - 30) * 200);
          },
          elevationScale: 1,
          updateTriggers: { getFillColor: wardSimulations, getElevation: wardSimulations },
          transitions: { getFillColor: 400, getElevation: 400 },
          onHover: handleHover,
          onClick: (info: PickingInfo) => {
            if (info.object) onSelectWard(info.object.properties as WardProperties);
          },
        })
      );
    }

    /* ── Named ward outlines (flat, almost transparent) ────────────── */
    if (showDomains && domains) {
      out.push(
        new GeoJsonLayer({
          id: `wards-${cityKey}`,
          data: domains as unknown as FeatureCollection,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: false,
          lineWidthMinPixels: 2,
          getLineColor: (f: { properties: WardProperties }) =>
            (selectedWard?.ward_id === f.properties.ward_id
              ? [8, 145, 178, 255]
              : [60, 80, 120, 140]) as [number, number, number, number],
          getFillColor: (_f: unknown) => [0, 0, 0, 0] as [number, number, number, number],
          updateTriggers: { getLineColor: selectedWard?.ward_id },
          onHover: handleHover,
          onClick: (info: PickingInfo) => {
            if (info.object) onSelectWard(info.object.properties as WardProperties);
          },
        })
      );
    }

    return out;
  }, [cityKey, regularGrid, domains, showGrid, showDomains, wardSimulations, selectedWard, handleHover, onSelectWard]);

  const vulnCls = (v: string) =>
    v === "CRITICAL" ? "text-red-500" : v === "HIGH" ? "text-orange-500" :
      v === "MODERATE" ? "text-yellow-600" : "text-green-600";

  return (
    <div className="relative min-h-0 flex-1">

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="absolute left-3 top-3 z-10 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white/96 p-3 text-xs shadow-xl backdrop-blur-sm">
        <p className="mb-2 font-semibold text-slate-700">{cityName}</p>

        {LAYER_LABELS.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-500 hover:text-slate-900">
            <input type="radio" name="mapLayer" checked={layer === l.id} onChange={() => onLayerChange(l.id)} className="accent-cyan-600" />
            {l.label}
          </label>
        ))}

        <div className="my-2 space-y-1.5 border-t border-slate-100 pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-slate-500">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-cyan-600" />
            3-D heat grid
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-500">
            <input type="checkbox" checked={showDomains} onChange={(e) => setShowDomains(e.target.checked)} className="accent-cyan-600" />
            Ward outlines
          </label>
        </div>

        <div className="border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] uppercase text-slate-400">View angle</p>
          <div className="flex gap-1">
            {([0, 30, 45, 60] as number[]).map((p) => (
              <button key={p} type="button" onClick={() => applyPitch(p)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${pitch === p ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                {p === 0 ? "Top" : `${p}°`}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[9px] text-slate-400">Drag to rotate · scroll to zoom</p>
      </div>

      {/* ── Selected ward ─────────────────────────────────────────────── */}
      {selectedWard && (
        <div className="absolute right-3 top-3 z-10 w-56 rounded-xl border border-slate-200 bg-white/96 p-3 text-xs shadow-xl backdrop-blur-sm">
          <p className="text-sm font-semibold text-slate-800">{selectedWard.name}</p>
          <p className={`mt-0.5 text-[10px] font-semibold uppercase ${vulnCls(selectedWard.vulnerability_class)}`}>
            {selectedWard.vulnerability_class}
          </p>
          <table className="mt-2 w-full text-left">
            <tbody>
              {([
                ["Observed LST", `${selectedWard.avg_lst_c}°C`],
                ["Simulated LST", `${(wardSimulations[selectedWard.ward_id] ?? selectedWard.simulated_lst_c).toFixed(1)}°C`],
                ["Heat Stress", `${selectedWard.heat_stress_utci_c}°C`],
                ["NDVI", String(selectedWard.ndvi)],
              ] as [string, string][]).map(([lbl, val]) => (
                <tr key={lbl}>
                  <td className="py-0.5 text-slate-400">{lbl}</td>
                  <td className="py-0.5 text-right font-mono text-slate-700">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => onSelectWard(null)} className="mt-2 text-[10px] text-slate-400 hover:text-slate-700">
            ✕ Close
          </button>
        </div>
      )}

      {/* ── Tier legend ───────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-slate-200 bg-white/96 px-3 py-2.5 text-[10px] shadow-xl backdrop-blur-sm">
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-slate-500">Heat Tiers (LST)</p>
        {TIERS.map((t) => (
          <div key={t.key} className="flex items-center gap-2 py-[3px]">
            <span className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})` }} />
            <span className="w-14 font-medium text-slate-700">{t.label}</span>
            <span className="text-slate-400">{t.range}</span>
          </div>
        ))}
        <p className="mt-1.5 text-[9px] text-slate-400">Height ∝ temperature</p>
      </div>

      {/* ── Hover tooltip ─────────────────────────────────────────────── */}
      {tooltip && (
        <div className="pointer-events-none absolute z-20 rounded-lg border border-slate-200 bg-white/98 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <p className="font-semibold text-slate-800">{tooltip.name}</p>
          <p className="text-slate-500">LST: <span className="font-mono text-slate-700">{tooltip.lst.toFixed(1)}°C</span></p>
          <p className={`font-medium ${vulnCls(tooltip.vuln)}`}>{tooltip.vuln}</p>
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
