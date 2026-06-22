"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Layer, LatLngBoundsExpression, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import type { HeatmapMeta, MapLayer, SamplePointCollection, WardCollection, WardProperties } from "@/types";
import { lstToColor } from "@/lib/colors";
import { apiBase } from "@/lib/api";

const LAYER_LABELS: { id: MapLayer; label: string }[] = [
  { id: "lst", label: "Surface Temp (LST)" },
  { id: "utci", label: "Heat Stress (UTCI)" },
  { id: "ndvi", label: "Vegetation (NDVI)" },
  { id: "svf", label: "Morphology (SVF)" },
  { id: "vulnerability", label: "Heat Vulnerability" },
];

function zoneColor(zone: string): string {
  if (zone === "Hot Zone") return "#ef4444";
  if (zone === "Mild Zone") return "#eab308";
  return "#3b82f6";
}

function FlyToWard({ ward, bbox }: { ward: WardProperties | null; bbox: number[] }) {
  const map = useMap();
  useEffect(() => {
    if (ward?.ward_id) {
      // bounds from ward not stored — use city bbox as fallback; domain click uses fitBounds via parent
    } else if (bbox?.length === 4) {
      map.fitBounds([
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ]);
    }
  }, [map, ward, bbox]);
  return null;
}

function FlyToDomain({ domains, targetWard }: { domains: WardCollection | null; targetWard: string }) {
  const map = useMap();
  useEffect(() => {
    if (!domains || targetWard === "Full City") return;
    const f = domains.features.find((x) => x.properties.name === targetWard);
    if (!f) return;
    const coords = f.geometry.coordinates[0] as [number, number][];
    const lats = coords.map((c) => c[1]);
    const lons = coords.map((c) => c[0]);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ], { padding: [40, 40], maxZoom: 14 });
  }, [map, domains, targetWard]);
  return null;
}

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
  onSelectWard: (props: WardProperties | null) => void;
  wardSimulations: Record<string, number>;
  onLayerChange: (layer: MapLayer) => void;
}

export default function HeatMap({
  cityKey,
  cityName,
  domains,
  fineGrid,
  samplePoints,
  heatmapMeta,
  bbox,
  layer,
  selectedWard,
  targetWard,
  onSelectWard,
  wardSimulations,
  onLayerChange,
}: HeatMapProps) {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showDomains, setShowDomains] = useState(true);
  const [showFineGrid, setShowFineGrid] = useState(false);
  const [showPoints, setShowPoints] = useState(true);

  const center = useMemo(() => {
    if (bbox?.length === 4) return [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2] as [number, number];
    return [19.08, 72.87] as [number, number];
  }, [bbox]);

  const overlayBounds = (heatmapMeta?.bounds ?? [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ]) as LatLngBoundsExpression;

  const overlayUrl = `${apiBase()}/cities/${cityKey}/heatmap/${layer}.png?t=${heatmapMeta?.vmax ?? 0}`;

  const domainStyle = (feature?: Feature<Geometry, GeoJsonProperties>): PathOptions => {
    const props = feature?.properties as WardProperties | undefined;
    if (!props) return { fillOpacity: 0.1, weight: 1, color: "#94a3b8" };
    const selected = selectedWard?.ward_id === props.ward_id;
    const sim = wardSimulations[props.ward_id];
    return {
      fillColor: sim !== undefined ? lstToColor(sim) : lstToColor(props.avg_lst_c),
      fillOpacity: showHeatmap ? 0.08 : 0.45,
      color: selected ? "#22d3ee" : "#e2e8f0",
      weight: selected ? 2.5 : 1.2,
    };
  };

  const gridStyle = (feature?: Feature<Geometry, GeoJsonProperties>): PathOptions => {
    const props = feature?.properties as WardProperties | undefined;
    if (!props) return { fillOpacity: 0, weight: 0.3, color: "#475569" };
    const sim = wardSimulations[props.ward_id];
    return {
      fillColor: sim !== undefined ? lstToColor(sim) : lstToColor(props.avg_lst_c),
      fillOpacity: 0.35,
      color: "rgba(71,85,105,0.6)",
      weight: 0.4,
    };
  };

  const bindDomain = (feature: Feature<Geometry, GeoJsonProperties>, layerInst: Layer) => {
    const props = feature.properties as WardProperties;
    const sim = wardSimulations[props.ward_id];
    const lst = sim ?? props.avg_lst_c;
    layerInst.bindPopup(
      `<strong>${props.name}</strong><br/>LST: ${lst}°C<br/>UTCI: ${props.heat_stress_utci_c}°C<br/>Vulnerability: ${props.vulnerability_class}`
    );
    layerInst.on({
      click: () => onSelectWard(props),
      mouseover: (e) => {
        e.target.setStyle({ weight: 2.5, color: "#67e8f9", fillOpacity: 0.25 });
        e.target.openPopup();
      },
      mouseout: (e) => {
        const selected = selectedWard?.ward_id === props.ward_id;
        e.target.setStyle({
          weight: selected ? 2.5 : 1.2,
          color: selected ? "#22d3ee" : "#e2e8f0",
          fillOpacity: showHeatmap ? 0.08 : 0.45,
        });
      },
    });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute left-3 top-3 z-[1000] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-600/80 bg-slate-900/90 p-2 text-xs shadow-xl backdrop-blur">
        <div className="mb-1 font-semibold text-slate-300">{cityName} — Map Layers</div>
        {LAYER_LABELS.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-400 hover:text-white">
            <input type="radio" name="mapLayer" checked={layer === l.id} onChange={() => onLayerChange(l.id)} className="accent-cyan-400" />
            {l.label}
          </label>
        ))}
        <div className="my-2 space-y-1 border-t border-slate-700 pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-slate-400">
            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} className="accent-cyan-400" />
            Continuous heatmap
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-400">
            <input type="checkbox" checked={showDomains} onChange={(e) => setShowDomains(e.target.checked)} className="accent-cyan-400" />
            Named wards (clickable)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-400">
            <input type="checkbox" checked={showFineGrid} onChange={(e) => setShowFineGrid(e.target.checked)} className="accent-cyan-400" />
            Fine 10 m grid
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-400">
            <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} className="accent-cyan-400" />
            Sample points (Gi*)
          </label>
        </div>
        <p className="text-[9px] text-slate-500">Click a ward or point for LST details</p>
      </div>

      {selectedWard && (
        <div className="absolute right-3 top-3 z-[1000] w-56 rounded-lg border border-slate-600/80 bg-slate-900/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="text-sm font-semibold text-white">{selectedWard.name}</div>
          <div className="mt-1 text-[10px] uppercase text-red-400">Vulnerability: {selectedWard.vulnerability_class}</div>
          <table className="mt-2 w-full text-left text-[11px]">
            <tbody className="text-slate-300">
              <tr><td className="text-slate-500">Observed LST</td><td className="text-right font-mono">{selectedWard.avg_lst_c}°C</td></tr>
              <tr><td className="text-slate-500">Simulated LST</td><td className="text-right font-mono text-cyan-300">{(wardSimulations[selectedWard.ward_id] ?? selectedWard.simulated_lst_c).toFixed(1)}°C</td></tr>
              <tr><td className="text-slate-500">Heat Stress</td><td className="text-right font-mono">{selectedWard.heat_stress_utci_c}°C</td></tr>
              <tr><td className="text-slate-500">NDVI</td><td className="text-right font-mono">{selectedWard.ndvi}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-600/80 bg-slate-900/90 px-3 py-2 text-[10px] shadow-xl backdrop-blur">
        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Surface Temp (°C)</div>
        <div className="flex h-3 w-48 overflow-hidden rounded">
          {["#1e3a8a", "#38bdf8", "#eab308", "#f97316", "#dc2626"].map((c) => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-slate-500">
          <span>{heatmapMeta?.vmin?.toFixed(1) ?? "cool"}</span>
          <span>{heatmapMeta?.vmax?.toFixed(1) ?? "hot"}</span>
        </div>
      </div>

      <MapContainer key={cityKey} center={center} zoom={12} className="h-full w-full" zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showHeatmap && heatmapMeta && (
          <ImageOverlay key={overlayUrl} url={overlayUrl} bounds={overlayBounds} opacity={0.78} zIndex={200} />
        )}
        {showDomains && domains && (
          <GeoJSON
            key={`domains-${cityKey}-${selectedWard?.ward_id ?? "none"}`}
            data={domains as unknown as FeatureCollection}
            style={domainStyle}
            onEachFeature={bindDomain}
          />
        )}
        {showFineGrid && fineGrid && (
          <GeoJSON
            key={`grid-${cityKey}-${fineGrid.meta?.cell_count}`}
            data={fineGrid as unknown as FeatureCollection}
            style={gridStyle}
          />
        )}
        {showPoints &&
          samplePoints?.features.map((f, i) => {
            const [lon, lat] = f.geometry.coordinates;
            const p = f.properties;
            const isHotSpot = p.cluster === "hot_spot";
            const isColdSpot = p.cluster === "cold_spot";
            return (
              <CircleMarker
                key={`pt-${cityKey}-${i}`}
                center={[lat, lon]}
                radius={isHotSpot || isColdSpot ? 5 : 4}
                pathOptions={{
                  color: isHotSpot ? "#ef4444" : isColdSpot ? "#3b82f6" : zoneColor(p.zone),
                  fillColor: zoneColor(p.zone),
                  fillOpacity: 0.9,
                  weight: isHotSpot || isColdSpot ? 2.5 : 1,
                }}
                eventHandlers={{
                  click: () => {
                    onSelectWard({
                      ward_id: `point_${i}`,
                      name: `Sample ${p.lst_c}°C`,
                      avg_lst_c: p.lst_c,
                      simulated_lst_c: p.lst_c,
                      heat_stress_utci_c: p.lst_c * 0.72,
                      cooling_delta_c: 0,
                      ndvi: p.ndvi,
                      ndbi: 0,
                      vulnerability_class: p.zone === "Hot Zone" ? "HIGH" : "LOW",
                      hotspot_fraction: 0,
                    });
                  },
                }}
              >
                <Tooltip direction="top" sticky>
                  <span className="text-xs font-medium">
                    LST: {p.lst_c}°C — {p.zone}
                    {isHotSpot && " · Hot Spot"}
                  </span>
                </Tooltip>
                <Popup>
                  <div className="text-xs">
                    <strong>{p.lst_c}°C</strong> — {p.zone}<br />
                    NDVI: {p.ndvi}<br />
                    {isHotSpot && <span className="text-red-600">Gi* Hot Spot</span>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        <FlyToWard ward={selectedWard} bbox={bbox} />
        <FlyToDomain domains={domains} targetWard={targetWard} />
      </MapContainer>
    </div>
  );
}
