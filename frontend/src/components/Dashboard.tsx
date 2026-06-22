"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import CoolingSimulator from "@/components/CoolingSimulator";
import RightPanel from "@/components/RightPanel";
import AIChat from "@/components/AIChat";
import {
  getCities,
  getCitySummary,
  getClimate,
  getCoolingPotential,
  getDomains,
  getDrivers,
  getHeatmapMeta,
  getSamplePoints,
  getWards,
  runScenario,
} from "@/lib/api";
import type {
  CityInfo,
  CitySummary,
  ClimatePoint,
  CoolingStrategy,
  Driver,
  HeatmapMeta,
  MapLayer,
  SamplePointCollection,
  SimulationState,
  WardCollection,
  WardProperties,
} from "@/types";

const HeatMap = dynamic(() => import("@/components/HeatMap"), { ssr: false });

const DEFAULT_SIM: SimulationState = {
  coolRoofs: 0,
  greenRoofs: 0,
  urbanGreening: 0,
  blueInfra: 0,
  budget: 5,
  targetWard: "Full City",
};

export default function Dashboard() {
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [cityKey, setCityKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<CitySummary | null>(null);
  const [domains, setDomains] = useState<WardCollection | null>(null);
  const [fineGrid, setFineGrid] = useState<WardCollection | null>(null);
  const [heatmapMeta, setHeatmapMeta] = useState<HeatmapMeta | null>(null);
  const [samplePoints, setSamplePoints] = useState<SamplePointCollection | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cooling, setCooling] = useState<CoolingStrategy[]>([]);
  const [climate, setClimate] = useState<ClimatePoint[]>([]);
  const [sim, setSim] = useState<SimulationState>(DEFAULT_SIM);
  const [mapLayer, setMapLayer] = useState<MapLayer>("lst");
  const [selectedWard, setSelectedWard] = useState<WardProperties | null>(null);
  const [wardSimulations, setWardSimulations] = useState<Record<string, number>>({});
  const [scenarioMetrics, setScenarioMetrics] = useState<{
    co2: number;
    investment: number;
    lst: number;
    utci: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCity = useCallback(async (key: string, layer: MapLayer) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    setDomains(null);
    setFineGrid(null);
    setHeatmapMeta(null);
    setSamplePoints(null);
    setSelectedWard(null);

    const results = await Promise.allSettled([
      getCitySummary(key),
      getDomains(key),
      getWards(key, 4),
      getDrivers(key),
      getCoolingPotential(key),
      getClimate(key),
      getHeatmapMeta(key, layer),
      getSamplePoints(key, 2),
    ]);

    const val = <T,>(i: number): T | null =>
      results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<T>).value : null;

    if (results[0].status === "rejected") {
      setError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "Failed to load city — start API: uvicorn backend.app.main:app --reload --port 8000"
      );
      setLoading(false);
      return;
    }

    const s = val<CitySummary>(0)!;
    const dom = val<WardCollection>(1);
    setSummary(s);
    setDomains(dom);
    setFineGrid(val<WardCollection>(2));
    const driversRes = val<{ source: string; drivers: Driver[] }>(3);
    setDrivers(driversRes?.drivers ?? []);
    setCooling(val<CoolingStrategy[]>(4) ?? []);
    setClimate(val<ClimatePoint[]>(5) ?? []);
    setHeatmapMeta(val<HeatmapMeta>(6));
    setSamplePoints(val<SamplePointCollection>(7));

    const firstDomain = dom?.features[0]?.properties;
    setSim((prev) => ({
      ...prev,
      targetWard: "Full City",
    }));
    if (firstDomain) {
      setSelectedWard(firstDomain);
    }

    const errs = results
      .map((r, i) => (r.status === "rejected" && i > 0 ? (r.reason as Error)?.message : null))
      .filter(Boolean);
    if (errs.length) setError(errs[0] as string);

    setWardSimulations({});
    setScenarioMetrics(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    getCities()
      .then((list) => {
        setCities(list);
        const withData = list.find((c) => c.has_data);
        if (withData) setCityKey(withData.city_key);
      })
      .catch(() => setError("API offline — run: uvicorn backend.app.main:app --reload --port 8000"));
  }, []);

  useEffect(() => {
    if (cityKey) loadCity(cityKey, mapLayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey]);

  useEffect(() => {
    if (!cityKey) return;
    getHeatmapMeta(cityKey, mapLayer)
      .then(setHeatmapMeta)
      .catch(() => undefined);
  }, [cityKey, mapLayer]);

  const wardNames = useMemo(() => {
    const names = domains?.features.map((f) => f.properties.name) ?? [];
    return ["Full City", ...names];
  }, [domains]);

  const handleTargetWardChange = (name: string) => {
    setSim((s) => ({ ...s, targetWard: name }));
    if (name === "Full City") {
      setSelectedWard(null);
      return;
    }
    const match = domains?.features.find((f) => f.properties.name === name);
    if (match) setSelectedWard(match.properties);
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runScenario(cityKey, {
        cool_roofs_pct: sim.coolRoofs,
        green_roofs_pct: sim.greenRoofs,
        urban_greening_pct: sim.urbanGreening,
        blue_infra_pct: sim.blueInfra,
        budget_m_usd: sim.budget,
      });
      const updates: Record<string, number> = {};
      for (const u of result.ward_updates) {
        updates[u.ward_id] = u.simulated_lst_c;
      }
      setWardSimulations(updates);
      setScenarioMetrics({
        co2: result.co2_sequestration_tons_yr,
        investment: result.total_investment_m_usd,
        lst: result.simulated_avg_lst_c,
        utci: result.simulated_utci_c,
      });
      if (selectedWard) {
        setSelectedWard({
          ...selectedWard,
          simulated_lst_c: updates[selectedWard.ward_id] ?? selectedWard.simulated_lst_c,
          cooling_delta_c: result.mean_cooling_delta_c,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario failed");
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setSim(DEFAULT_SIM);
    setWardSimulations({});
    setScenarioMetrics(null);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1419] text-slate-100">
      <Header summary={summary} scenarioMetrics={scenarioMetrics ?? undefined} />

      <div className="flex items-center gap-2 border-b border-slate-700/40 bg-[#121826] px-4 py-1.5">
        <span className="text-[10px] uppercase text-slate-500">City</span>
        <select
          value={cityKey}
          onChange={(e) => setCityKey(e.target.value)}
          disabled={loading}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {cities.map((c) => (
            <option key={c.city_key} value={c.city_key} disabled={!c.has_data}>
              {c.city_name} {c.has_data ? "" : "(run pipeline first)"}
            </option>
          ))}
        </select>
        {summary && (
          <span className="text-[10px] text-slate-500">
            Data:{" "}
            <span className={summary.data_mode === "gee" ? "text-green-400" : "text-amber-400"}>
              {summary.data_mode === "gee" ? "Landsat/GEE (real)" : "synthetic demo"}
            </span>
            {summary.data_mode !== "gee" && (
              <> · For real LST: <code className="text-cyan-500">py run_pipeline.py --city {cityKey} --data-mode gee</code></>
            )}
          </span>
        )}
        {loading && <span className="text-xs text-cyan-400">Loading…</span>}
        {error && !loading && <span className="text-xs text-amber-400">{error}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        <CoolingSimulator
          wards={wardNames}
          state={sim}
          onChange={(patch) => {
            if (patch.targetWard !== undefined) {
              handleTargetWardChange(patch.targetWard);
            } else {
              setSim((s) => ({ ...s, ...patch }));
            }
          }}
          onRun={handleRun}
          onReset={handleReset}
          running={running}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {summary && (
            <HeatMap
              cityKey={cityKey}
              cityName={summary.city_name}
              domains={domains}
              fineGrid={fineGrid}
              samplePoints={samplePoints}
              heatmapMeta={heatmapMeta}
              bbox={summary.bbox}
              layer={mapLayer}
              selectedWard={selectedWard}
              targetWard={sim.targetWard}
              onSelectWard={(w) => {
                setSelectedWard(w);
                if (w) setSim((s) => ({ ...s, targetWard: w.name }));
                else setSim((s) => ({ ...s, targetWard: "Full City" }));
              }}
              wardSimulations={wardSimulations}
              onLayerChange={setMapLayer}
            />
          )}
          {!summary && !loading && (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a city with pipeline data
            </div>
          )}
        </main>

        <RightPanel cooling={cooling} drivers={drivers} climate={climate} dataMode={summary?.data_mode} />
      </div>

      {summary && <AIChat cityKey={cityKey} cityName={summary.city_name} />}
    </div>
  );
}
