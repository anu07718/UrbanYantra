"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ClimatePoint, CoolingStrategy, Driver } from "@/types";
import { DRIVER_COLORS } from "@/lib/colors";

interface RightPanelProps {
  cooling: CoolingStrategy[];
  drivers: Driver[];
  climate: ClimatePoint[];
  dataMode?: string;
}

export default function RightPanel({ cooling, drivers, climate, dataMode }: RightPanelProps) {
  const driverData = drivers.map((d, i) => ({
    name: d.feature.replace(/\(.*\)/, "").trim().slice(0, 22),
    pct: Math.max(0, Math.min(100, d.importance_pct)),
    fill: DRIVER_COLORS[i % DRIVER_COLORS.length],
  }));

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-700/60 bg-[#151b28] p-3">
      <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-200">Cooling Potential by Strategy</h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={cooling} layout="vertical" margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} unit="°C" />
            <YAxis type="category" dataKey="strategy" width={72} tick={{ fill: "#94a3b8", fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #475569", fontSize: 11 }}
              formatter={(v) => [`${v ?? 0}°C cooling`, "ΔT"]}
            />
            <Bar dataKey="delta_t_c" radius={[0, 4, 4, 0]}>
              {cooling.map((_, i) => (
                <Cell key={i} fill={["#22d3ee", "#22c55e", "#3b82f6"][i % 3]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-200">AI Hotspot Driver Explanation</h3>
        <div className="space-y-2">
          {driverData.map((d) => (
            <div key={d.name}>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span className="truncate pr-2">{d.name}</span>
                <span>{d.pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.fill }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-200">Climate Projection (2020 – 2050)</h3>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={climate} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 9 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} domain={["auto", "auto"]} unit="°" />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #475569", fontSize: 11 }}
              formatter={(v) => [`${v ?? 0}°C`, "LST"]}
            />
            <Line type="monotone" dataKey="lst_c" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </aside>
  );
}
