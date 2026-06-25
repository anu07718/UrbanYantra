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
  getBenchmarks,
  getDataAudit,
  getDomains,
  getDrivers,
  getHeatmapMeta,
  getHotspots,
  getInterventions,
  getModelMetrics,
  getSamplePoints,
  getUspMetrics,
  getWards,
  predictPoint,
  runScenario,
} from "@/lib/api";
import type {
  BenchmarkSummary,
  CityInfo,
  CitySummary,
  ClimatePoint,
  CoolingStrategy,
  DataAudit,
  Driver,
  HeatmapMeta,
  HotspotCollection,
  InterventionRanking,
  MapLayer,
  ModelMetrics,
  PointPrediction,
  SamplePointCollection,
  SimulationState,
  UspMetrics,
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

function dataStatusClass(status: string) {
  if (["real", "cached_real", "bundled_real"].includes(status)) return "text-emerald-300";
  if (status === "synthetic") return "text-red-300";
  if (status === "fallback") return "text-amber-300";
  return "text-slate-500";
}

export default function Dashboard() {
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [cityKey, setCityKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<CitySummary | null>(null);
  const [domains, setDomains] = useState<WardCollection | null>(null);
  const [fineGrid, setFineGrid] = useState<WardCollection | null>(null);
  const [heatmapMeta, setHeatmapMeta] = useState<HeatmapMeta | null>(null);
  const [samplePoints, setSamplePoints] = useState<SamplePointCollection | null>(null);
  const [hotspots, setHotspots] = useState<HotspotCollection | null>(null);
  const [interventions, setInterventions] = useState<InterventionRanking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dataAudit, setDataAudit] = useState<DataAudit | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary | null>(null);
  const [uspMetrics, setUspMetrics] = useState<UspMetrics | null>(null);
  const [showDataDetails, setShowDataDetails] = useState(false);
  const [cooling, setCooling] = useState<CoolingStrategy[]>([]);
  const [climate, setClimate] = useState<ClimatePoint[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);
  const [pointPrediction, setPointPrediction] = useState<PointPrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
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

  const cityGroups = useMemo(() => {
    const groups: Record<string, CityInfo[]> = {};
    for (const c of cities) {
      const state = c.state || "Other";
      if (!groups[state]) groups[state] = [];
      groups[state].push(c);
    }
    return groups;
  }, [cities]);

  const loadCity = useCallback(async (key: string, layer: MapLayer) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    setDomains(null);
    setFineGrid(null);
    setHeatmapMeta(null);
    setSamplePoints(null);
    setHotspots(null);
    setInterventions([]);
    setSelectedWard(null);
    setModelMetrics(null);
    setDataAudit(null);
    setBenchmarks(null);
    setUspMetrics(null);
    setPointPrediction(null);

    const results = await Promise.allSettled([
      getCitySummary(key),        // 0
      getDomains(key),            // 1
      getWards(key, 2),           // step=2 — ~20 m cells, stable
      getDrivers(key),            // 3
      getCoolingPotential(key),   // 4
      getClimate(key),            // 5
      getHeatmapMeta(key, layer), // 6
      getSamplePoints(key, 2),    // 7
      getModelMetrics(key),       // 8
      getHotspots(key),           // 9
      getDataAudit(key),          // 10
      getBenchmarks(key),         // 11
      getUspMetrics(key),         // 12
      getInterventions(key, 15),  // 13
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
    setModelMetrics(val<ModelMetrics>(8));
    setHotspots(val<HotspotCollection>(9));
    setDataAudit(val<DataAudit>(10));
    setBenchmarks(val<BenchmarkSummary>(11));
    setUspMetrics(val<UspMetrics>(12));
    setInterventions(val<InterventionRanking[]>(13) ?? []);

    const firstDomain = dom?.features[0]?.properties;
    setSim((prev) => ({
      ...prev,
      targetWard: "Full City",
    }));
    if (firstDomain) {
      setSelectedWard(firstDomain);
    }

    const errs = results
      .map((r, i) => (r.status === "rejected" && i === 0 ? (r.reason as Error)?.message : null))
      .filter(Boolean);
    if (errs.length) setError(errs[0] as string);

    setWardSimulations({});
    setScenarioMetrics(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    getCities()
      .then((list: CityInfo[]) => {
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
    const unique = [...new Set(names)];
    return ["Full City", ...unique];
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
      const result = await runScenario(
        cityKey,
        sim.coolRoofs,
        sim.greenRoofs,
        sim.urbanGreening,
        sim.blueInfra,
        sim.budget
      );
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

  const handleMapClick = useCallback(
    async (lon: number, lat: number) => {
      if (!cityKey) return;
      setPredicting(true);
      try {
        const pred = await predictPoint(cityKey, lon, lat);
        setPointPrediction(pred);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Prediction failed");
      } finally {
        setPredicting(false);
      }
    },
    [cityKey]
  );

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
          suppressHydrationWarning
        >
          {Object.entries(cityGroups).map(([state, group]) => (
            <optgroup key={state} label={state}>
              {group.map((c) => (
                <option key={c.city_key} value={c.city_key} disabled={!c.has_data}>
                  {c.city_name} {c.has_data ? "" : "(run pipeline)"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {summary && (
          <span className="text-[10px] text-slate-500">
            Data:{" "}
            <span className={summary.data_mode === "gee" ? "text-green-400" : "text-amber-400"}>
              {summary.data_mode === "gee" || summary.is_real_data
                ? "Satellite + ERA5 (real)"
                : "Run pipeline with --data-mode gee"}
            </span>
            {summary.data_mode !== "gee" && (
              <> · For real LST: <code className="text-cyan-500">py run_pipeline.py --city {cityKey} --data-mode gee</code></>
            )}
          </span>
        )}
        {loading && <span className="text-xs text-cyan-400">Loading…</span>}
        {error && !loading && <span className="text-xs text-amber-400">{error}</span>}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
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
          scenarioResult={scenarioMetrics}
          baselineLst={summary?.metrics?.avg_city_lst_c}
        />

        <main className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          {summary && (
            <HeatMap
              key={`${cityKey}-${mapLayer}-${summary.bbox.join(",")}`}
              cityKey={cityKey}
              cityName={summary.city_name}
              domains={domains}
              fineGrid={fineGrid}
              samplePoints={samplePoints}
              hotspots={hotspots}
              heatmapMeta={heatmapMeta}
              bbox={summary.bbox}
              layer={mapLayer}
              selectedWard={selectedWard}
              targetWard={sim.targetWard}
              onSelectWard={(w) => {
                setSelectedWard(w);
                if (!w) setPointPrediction(null);
                if (w) setSim((s) => ({ ...s, targetWard: w.name }));
                else setSim((s) => ({ ...s, targetWard: "Full City" }));
              }}
              wardSimulations={wardSimulations}
              onLayerChange={setMapLayer}
              pointPrediction={pointPrediction}
              predicting={predicting}
              onMapClick={handleMapClick}
            />
          )}
          {!summary && !loading && (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a city with pipeline data
            </div>
          )}
        </main>

        <RightPanel
          cooling={cooling}
          drivers={drivers}
          climate={climate}
          interventions={interventions}
          dataMode={summary?.data_mode}
          summary={summary}
          onOpenDataDetails={() => setShowDataDetails(true)}
        />
      </div>

      {summary && <AIChat cityKey={cityKey} cityName={summary.city_name} />}

      {showDataDetails && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-8 backdrop-blur-md">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-700/70 bg-[#111827]/95 p-5 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-700/60 pb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-300">UrbanCool Data Details</p>
                <h2 className="mt-1 text-xl font-bold text-white">{summary?.city_name ?? "City"} real-data pipeline</h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                  These datasets are not just stored in cache — they feed the map layers, hotspot model, driver analysis,
                  intervention rankings, and judge-facing benchmark evidence.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDataDetails(false)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
                aria-label="Close data details"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-xl border border-cyan-700/40 bg-cyan-950/15 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Dataset Usage Audit</h3>
                  {dataAudit && (
                    <span className={`text-[10px] font-bold uppercase ${dataAudit.synthetic_used ? "text-red-300" : "text-emerald-300"}`}>
                      {dataAudit.synthetic_used ? "Synthetic present" : "No synthetic in selected city"}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(dataAudit?.datasets ?? []).map((item) => (
                    <div key={item.dataset_id} className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {item.dataset_id} · {item.name}
                        </p>
                        <span className={`shrink-0 text-[10px] font-mono ${dataStatusClass(item.status)}`}>
                          {item.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-slate-400">
                        <span className="font-semibold text-cyan-300">Used for: </span>
                        {item.used_for}
                      </p>
                      <p className="mt-1 truncate text-[9px] text-slate-500" title={item.source}>
                        {item.source}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-emerald-700/40 bg-emerald-950/15 p-4">
                <h3 className="text-sm font-semibold text-white">Map + Model Value</h3>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <div className="rounded-lg bg-slate-900/50 p-3">
                    <p className="font-semibold text-emerald-300">Map layers</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Landsat LST drives the thermal/surface-temperature layers; WorldCover masks water; GHSL + OSM shape building density and planning risk.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/50 p-3">
                    <p className="font-semibold text-emerald-300">Heat-stress scoring</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      ERA5 UTCI cache supplies meteorological context, converted into air-temperature, humidity, wind, solar, and heatwave features.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/50 p-3">
                    <p className="font-semibold text-emerald-300">AIML + planning</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      The model learns from LST, NDVI/NDBI, GHSL morphology, OSM morphology, and meteo features; USP scores rank where interventions matter most.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {uspMetrics && (
                <section className="rounded-xl border border-lime-700/40 bg-lime-950/15 p-4">
                  <h3 className="text-sm font-semibold text-white">Hackathon USP Metrics</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-900/55 p-3">
                      <div className="text-slate-500">Green ΔT</div>
                      <div className="mt-1 font-mono text-lg text-lime-300">{uspMetrics.tree_green_cooling.avg_potential_c.toFixed(2)}°C</div>
                    </div>
                    <div className="rounded-lg bg-slate-900/55 p-3">
                      <div className="text-slate-500">CO₂ saved</div>
                      <div className="mt-1 font-mono text-lg text-lime-300">{uspMetrics.carbon_mitigation.co2_tons_yr.toFixed(1)}t/yr</div>
                    </div>
                    <div className="rounded-lg bg-slate-900/55 p-3">
                      <div className="text-slate-500">High priority</div>
                      <div className="mt-1 font-mono text-lg text-lime-300">{uspMetrics.urban_planning.high_priority_pixel_pct.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-900/45 p-3">
                    <p className="text-xs font-semibold text-slate-200">Top intervention zones</p>
                    <div className="mt-2 space-y-1">
                      {uspMetrics.urban_planning.top_zones.slice(0, 5).map((zone, index) => (
                        <div key={`${zone.lon}-${zone.lat}-${index}`} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-400">{zone.name}</span>
                          <span className="font-mono text-lime-300">priority {zone.planning_priority.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {benchmarks && (
                <section className="rounded-xl border border-violet-700/40 bg-violet-950/15 p-4">
                  <h3 className="text-sm font-semibold text-white">External Benchmarks</h3>
                  <div className="mt-3 space-y-2">
                    {benchmarks.kaggle_uhi && (
                      <div className="rounded-lg bg-slate-900/55 p-3">
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-100">D-07 Kaggle UHI Monitoring</span>
                          <span className="font-mono text-violet-300">{benchmarks.kaggle_uhi.rows} rows</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Used as a compact real tabular benchmark for EDA and baseline modeling narrative.
                        </p>
                      </div>
                    )}
                    {benchmarks.ey_uhi && (
                      <div className="rounded-lg bg-slate-900/55 p-3">
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-100">D-09 EY NYC UHI Ground Truth</span>
                          <span className="font-mono text-violet-300">{benchmarks.ey_uhi.rows} labels</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          External validation with labeled UHI Index — trained in pipeline as spatial baseline.
                        </p>
                      </div>
                    )}
                    {benchmarks.training_pipeline?.external_baselines && (
                      <div className="rounded-lg bg-slate-900/55 p-3 text-[11px]">
                        <p className="font-semibold text-violet-200">Pipeline benchmark training</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-violet-300">
                          {benchmarks.training_pipeline.external_baselines.kaggle_uhi && (
                            <div>
                              Kaggle MAE{" "}
                              {benchmarks.training_pipeline.external_baselines.kaggle_uhi.mae_c?.toFixed(2)}°C
                            </div>
                          )}
                          {benchmarks.training_pipeline.external_baselines.ey_uhi && (
                            <div>
                              EY MAE{" "}
                              {benchmarks.training_pipeline.external_baselines.ey_uhi.mae?.toFixed(4)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
