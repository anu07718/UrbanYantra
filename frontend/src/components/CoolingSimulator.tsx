"use client";

import { useState } from "react";
import { Wrench, ChevronDown, ChevronUp, Info } from "lucide-react";
import type { SimulationState } from "@/types";

interface ScenarioResult {
  co2: number;
  investment: number;
  lst: number;       // simulated LST
  utci: number;
}

interface CoolingSimulatorProps {
  wards: string[];
  state: SimulationState;
  onChange: (patch: Partial<SimulationState>) => void;
  onRun: () => void;
  onReset: () => void;
  running?: boolean;
  scenarioResult?: ScenarioResult | null;
  baselineLst?: number;
}

/* ── Inline tooltip ──────────────────────────────────────────────────────── */
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative ml-1 inline-block align-middle">
      <Info
        size={11}
        className="cursor-help text-slate-500 hover:text-slate-300 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute left-4 top-0 z-50 w-52 rounded-lg border border-slate-600 bg-slate-900 p-2.5 text-[10px] leading-relaxed text-slate-300 shadow-2xl">
          {text}
        </div>
      )}
    </span>
  );
}

/* ── Slider row ──────────────────────────────────────────────────────────── */
function SliderRow({
  icon,
  label,
  tooltip,
  value,
  onChange,
  unit = "%",
  max = 100,
}: {
  icon: string;
  label: string;
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center font-medium text-slate-200">
          <span className="mr-1.5 text-sm">{icon}</span>
          {label}
          <InfoTip text={tooltip} />
        </span>
        <span className="font-mono text-cyan-300">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>None</span>
        <span>Full coverage</span>
      </div>
    </div>
  );
}

/* ── Result card ─────────────────────────────────────────────────────────── */
function ResultCard({
  result,
  baseline,
}: {
  result: ScenarioResult;
  baseline: number;
}) {
  const delta = parseFloat((baseline - result.lst).toFixed(2));
  const isGood = delta >= 1.0;

  return (
    <div className={`rounded-xl border p-3 ${isGood ? "border-emerald-700/60 bg-emerald-950/30" : "border-sky-700/60 bg-sky-950/20"}`}>
      <p className="text-xs font-bold text-emerald-300">✅ Simulation complete</p>

      {/* Before / After */}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Before</p>
          <p className="font-mono text-sm font-bold text-orange-400">{baseline.toFixed(1)}°C</p>
        </div>
        <div className="text-xl">→</div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">After</p>
          <p className="font-mono text-sm font-bold text-cyan-300">{result.lst.toFixed(1)}°C</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Savings</p>
          <p className={`font-mono text-sm font-bold ${isGood ? "text-emerald-400" : "text-yellow-400"}`}>
            −{delta}°C
          </p>
        </div>
      </div>

      {/* Impact rows */}
      <div className="mt-2 space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-400">🌱 CO₂ removed</span>
          <span className="font-mono text-emerald-400">
            {result.co2.toFixed(1)} t/yr
            <span className="ml-1 text-slate-500">(≈ {Math.round(result.co2 / 21)} trees)</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">💰 Est. cost</span>
          <span className="font-mono text-cyan-300">${result.investment.toFixed(2)}M</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">🌡️ Heat stress</span>
          <span className="font-mono text-slate-300">{result.utci.toFixed(1)}°C UTCI</span>
        </div>
      </div>

      {/* Interpretation */}
      <p className={`mt-2 rounded-lg p-2 text-[10px] leading-relaxed ${isGood ? "bg-emerald-900/30 text-emerald-200" : "bg-slate-800 text-slate-400"}`}>
        {delta >= 2.0
          ? "🌟 Excellent impact! This plan would make the city significantly cooler and more liveable."
          : delta >= 1.0
          ? "✅ Good impact. Residents will notice the improvement, especially during peak summer."
          : delta >= 0.3
          ? "💡 Moderate effect. Increase tree planting or cool-roof coverage to maximise impact."
          : "⚠️ Minimal effect. Try combining multiple strategies or increasing their coverage."}
      </p>
    </div>
  );
}

export default function CoolingSimulator({
  wards,
  state,
  onChange,
  onRun,
  onReset,
  running,
  scenarioResult,
  baselineLst = 0,
}: CoolingSimulatorProps) {
  const [advOpen, setAdvOpen] = useState(false);

  /* Rough live estimate: combine coverage percentages into a ΔT proxy */
  const liveEst = (
    (state.coolRoofs * 0.021) +
    (state.urbanGreening * 0.016) +
    (state.blueInfra * 0.03) +
    (state.greenRoofs * 0.012)
  );
  const hasChanges = state.coolRoofs > 0 || state.urbanGreening > 0 || state.blueInfra > 0 || state.greenRoofs > 0;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-700/60 bg-[#111827] p-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Wrench size={15} className="text-cyan-400" />
          Cooling Simulator
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
          Move the sliders to plan interventions, then hit <strong className="text-slate-200">Simulate</strong> to see the effect on the map.
        </p>
      </div>

      {/* Area selector */}
      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Target Area
        </label>
        <select
          value={state.targetWard}
          onChange={(e) => onChange({ targetWard: e.target.value })}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 transition-colors"
          suppressHydrationWarning
        >
          {wards.map((w) => (
            <option key={w} value={w}>
              {w === "Full City" ? "🏙️ Whole City" : `📍 ${w}`}
            </option>
          ))}
        </select>
      </div>

      {/* Live estimate banner */}
      {hasChanges && !scenarioResult && (
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-2 text-[11px]">
          <span className="text-slate-400">Estimated cooling: </span>
          <span className="font-mono font-bold text-cyan-300">~{liveEst.toFixed(1)}°C</span>
          <span className="ml-1 text-slate-500">(rough estimate — hit Simulate for AI result)</span>
        </div>
      )}

      {/* Main sliders */}
      <div className="space-y-4">
        <SliderRow
          icon="🏠"
          label="Cool Roofs"
          tooltip="Paint rooftops white or install reflective coatings so they reflect sunlight instead of absorbing heat. Very cost-effective in dense urban areas. Even 30% coverage makes a measurable difference."
          value={state.coolRoofs}
          onChange={(v) => onChange({ coolRoofs: v })}
        />
        <SliderRow
          icon="🌳"
          label="Plant Trees"
          tooltip="Increase the share of tree canopy cover. Trees provide shade, release moisture, and can cool local temperatures by 1–3°C. Each mature tree can cool air equivalent to 10 room-sized air conditioners."
          value={state.urbanGreening}
          onChange={(v) => onChange({ urbanGreening: v })}
        />
        <SliderRow
          icon="💧"
          label="Water Features"
          tooltip="Add ponds, wetlands, or permeable surfaces. Water evaporation removes heat from the air — a natural air conditioner. Especially effective near high-density residential areas."
          value={state.blueInfra}
          onChange={(v) => onChange({ blueInfra: v })}
          max={50}
        />
      </div>

      {/* Advanced (collapsible) */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30">
        <button
          type="button"
          suppressHydrationWarning
          onClick={() => setAdvOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Advanced Options
          </span>
          {advOpen ? (
            <ChevronUp size={12} className="text-slate-500" />
          ) : (
            <ChevronDown size={12} className="text-slate-500" />
          )}
        </button>
        {advOpen && (
          <div className="space-y-4 px-3 pb-3">
            <SliderRow
              icon="🌿"
              label="Green Roofs"
              tooltip="Install plants and soil on flat rooftops. Heavier and more expensive than cool roofs, but also insulates the building from heat in summer and cold in winter."
              value={state.greenRoofs}
              onChange={(v) => onChange({ greenRoofs: v })}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center font-medium text-slate-200">
                  💰 Budget
                  <InfoTip text="Maximum budget in million USD available for interventions. The AI will optimise the cooling effect within this financial constraint." />
                </span>
                <span className="font-mono text-cyan-300">${state.budget.toFixed(1)}M</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={state.budget}
                onChange={(e) => onChange({ budget: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>$0M</span>
                <span>$20M</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={onRun}
        disabled={running}
        suppressHydrationWarning
        className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 active:scale-95 disabled:opacity-60"
      >
        {running ? "⏳ Simulating…" : "▶ Simulate Cooling Impact"}
      </button>

      {/* Scenario result card */}
      {scenarioResult && baselineLst > 0 && (
        <ResultCard result={scenarioResult} baseline={baselineLst} />
      )}

      <button
        type="button"
        onClick={onReset}
        suppressHydrationWarning
        className="text-center text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors"
      >
        Reset all sliders
      </button>
    </aside>
  );
}
