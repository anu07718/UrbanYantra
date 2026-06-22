"use client";

import { Wrench } from "lucide-react";
import type { SimulationState } from "@/types";

interface CoolingSimulatorProps {
  wards: string[];
  state: SimulationState;
  onChange: (patch: Partial<SimulationState>) => void;
  onRun: () => void;
  onReset: () => void;
  running?: boolean;
}

function SliderRow({
  label,
  hint,
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-200">{label}</span>
        <span className="font-mono text-cyan-300">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
      />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{leftLabel}</span>
        <span className="text-slate-600">{hint}</span>
        <span>{rightLabel}</span>
      </div>
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
}: CoolingSimulatorProps) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700/60 bg-[#151b28] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Wrench size={16} className="text-cyan-400" />
        Cooling Simulator
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">Target Domain</label>
        <select
          value={state.targetWard}
          onChange={(e) => onChange({ targetWard: e.target.value })}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
        >
          {wards.map((w) => (
            <option key={w} value={w}>
              {w === "Full City" ? "Full City" : `${w} Ward`}
            </option>
          ))}
        </select>
      </div>

      <SliderRow
        label="Cool Roofs (Albedo change)"
        hint="Asphalt → High Albedo"
        value={state.coolRoofs}
        onChange={(v) => onChange({ coolRoofs: v })}
        leftLabel="0%"
        rightLabel="100%"
      />
      <SliderRow
        label="Green Roofs (Vegetated)"
        hint="Concrete → Sedum layers"
        value={state.greenRoofs}
        onChange={(v) => onChange({ greenRoofs: v })}
        leftLabel="0%"
        rightLabel="100%"
      />
      <SliderRow
        label="Urban Greening (Tree canopy)"
        hint="Low NDVI → Dense canopy"
        value={state.urbanGreening}
        onChange={(v) => onChange({ urbanGreening: v })}
        leftLabel="0%"
        rightLabel="100%"
      />
      <SliderRow
        label="Blue Infra (Water retention)"
        hint="Scale up to 50% max wetland/pond"
        value={state.blueInfra}
        onChange={(v) => onChange({ blueInfra: v })}
        leftLabel="0%"
        rightLabel="50%"
      />

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium text-slate-200">AI Budget Constraint</span>
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
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={running}
        className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60"
      >
        {running ? "Running solver…" : "Run Physics-Informed AI Solver"}
      </button>

      <button type="button" onClick={onReset} className="text-center text-xs text-slate-400 underline hover:text-cyan-300">
        Reset Simulation Variables
      </button>
    </aside>
  );
}
