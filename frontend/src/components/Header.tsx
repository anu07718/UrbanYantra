"use client";

import { Leaf, Shield, Thermometer, Zap, Coins } from "lucide-react";
import type { CitySummary } from "@/types";

interface HeaderProps {
  summary: CitySummary | null;
  scenarioMetrics?: {
    co2: number;
    investment: number;
    lst: number;
    utci: number;
  };
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[140px] flex-1 items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2">
      <div className="text-cyan-400">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm font-semibold text-white">{value}</div>
        {sub && <div className="mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Header({ summary, scenarioMetrics }: HeaderProps) {
  const m = summary?.metrics;
  const lst = scenarioMetrics?.lst ?? m?.avg_city_lst_c ?? 0;
  const utci = scenarioMetrics?.utci ?? m?.avg_heat_stress_utci_c ?? 0;
  const resilience = m?.resilience_index ?? 0;
  const co2 = scenarioMetrics?.co2 ?? m?.co2_sequestration_tons_yr ?? 0;
  const invest = scenarioMetrics?.investment ?? m?.total_investment_m_usd ?? 0;

  return (
    <header className="border-b border-slate-700/60 bg-[#121826] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-orange-500/20 text-xl">
            🛰️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">UrbanCool</h1>
              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
                ISRO-Grade
              </span>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              Urban Heat Mitigation & Physics-Informed AI Intelligence Platform
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <MetricCard icon={<Thermometer size={18} />} label="Avg City LST" value={`${lst.toFixed(1)}°C`} />
          <MetricCard icon={<Shield size={18} />} label="Avg Heat Stress (UTCI)" value={`${utci.toFixed(1)}°C`} />
          <MetricCard
            icon={<Zap size={18} />}
            label="Resilience Index"
            value={`${resilience}/100`}
            sub={
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-slate-700">
                <div className="h-full rounded bg-cyan-400" style={{ width: `${resilience}%` }} />
              </div>
            }
          />
          <MetricCard icon={<Leaf size={18} />} label="CO₂ Sequestration" value={`${co2.toFixed(1)} Tons/yr`} />
          <MetricCard icon={<Coins size={18} />} label="Total Investment" value={`$${invest.toFixed(2)}M`} />
        </div>
      </div>
    </header>
  );
}
