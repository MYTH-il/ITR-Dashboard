import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { stageBadgeStyle } from "@/lib/format";
import {
  Layers, FileCheck2, MessageSquareWarning, Rocket, ShieldCheck,
  CheckCircle2, AlertOctagon, TrendingUp, Loader2
} from "lucide-react";

const KPI_DEFS = [
  { key: "total_returns", label: "Total Returns", icon: Layers, color: "text-slate-600", bg: "bg-slate-50", to: "/returns" },
  { key: "pending_verification", label: "Pending Verification", icon: FileCheck2, color: "text-sky-700", bg: "bg-sky-50", to: "/returns?dashboard_filter=pending_verification" },
  { key: "queries_pending", label: "Queries Pending", icon: MessageSquareWarning, color: "text-indigo-700", bg: "bg-indigo-50", to: "/queries?pending=true" },
  { key: "ready_to_file", label: "Ready to File", icon: Rocket, color: "text-orange-700", bg: "bg-orange-50", to: "/returns?dashboard_filter=ready_to_file" },
  { key: "everification_pending", label: "E-verification Pending", icon: ShieldCheck, color: "text-amber-700", bg: "bg-amber-50", to: "/returns?dashboard_filter=everification_pending" },
  { key: "completed_returns", label: "Completed", icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50", to: "/returns?dashboard_filter=completed_returns" },
  { key: "overdue_returns", label: "Overdue", icon: AlertOctagon, color: "text-rose-700", bg: "bg-rose-50", to: "/returns?dashboard_filter=overdue_returns" },
];

const HEAT_BUCKETS = [
  { key: "0-3", label: "0 – 3 Days", color: "#10b981", desc: "Fresh" },
  { key: "4-7", label: "4 – 7 Days", color: "#fbbf24", desc: "Watch" },
  { key: "8-15", label: "8 – 15 Days", color: "#f97316", desc: "Delay" },
  { key: "15+", label: "15+ Days", color: "#e11d48", desc: "Critical" },
];

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [heat, setHeat] = useState({ buckets: {}, return_ids: {} });
  const [sla, setSla] = useState({ sla_breaches: [], upcoming_sla_breaches: [], stage_delays: [] });
  const [queries, setQueries] = useState({});
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    const [k, f, h, s, q, t] = await Promise.all([
      api.get("/dashboard/kpis"),
      api.get("/dashboard/funnel"),
      api.get("/dashboard/ageing-heatmap"),
      api.get("/dashboard/sla"),
      api.get("/dashboard/queries"),
      api.get("/dashboard/team"),
    ]);
    setKpis(k.data);
    setFunnel(f.data);
    setHeat(h.data);
    setSla(s.data);
    setQueries(q.data);
    setTeam(t.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
      </div>
    );
  }

  const maxStageCount = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Operations Overview</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Live Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Auto-refreshes every 30 seconds</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
        {KPI_DEFS.map((d) => {
          const Icon = d.icon;
          return (
            <button key={d.key} data-testid={`kpi-${d.key}`} onClick={() => navigate(d.to)} className="dashboard-card p-5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="text-data-label">{d.label}</div>
                <div className={`w-8 h-8 rounded-lg ${d.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${d.color}`} />
                </div>
              </div>
              <div className="kpi-value tabular-num mt-3">{kpis?.[d.key] ?? 0}</div>
            </button>
          );
        })}
      </div>

      {/* Workflow funnel */}
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Workflow Funnel</h2>
            <p className="text-xs text-slate-500 mt-1">Click any stage to view returns</p>
          </div>
          <TrendingUp className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {funnel.map((s) => {
            const widthPct = (s.count / maxStageCount) * 100;
            return (
              <button
                key={s.stage_id}
                data-testid={`funnel-stage-${s.stage_name.replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => navigate(`/returns?stage_id=${s.stage_id}`)}
                className="text-left p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                style={{ borderLeftWidth: 4, borderLeftColor: s.colour }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{s.sequence}. {s.stage_name}</div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-2xl font-bold tabular-num text-slate-900" style={{ fontFamily: "Outfit" }}>{s.count}</div>
                  <div className="text-xs text-slate-500">{s.percentage}%</div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, backgroundColor: s.colour }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heat map */}
        <div className="dashboard-card p-5">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-1" style={{ fontFamily: "Outfit" }}>Ageing Heat Map</h2>
          <p className="text-xs text-slate-500 mb-4">Returns by days in current stage</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {HEAT_BUCKETS.map((b) => (
              <button
                key={b.key}
                data-testid={`heatmap-bucket-${b.key}`}
                onClick={() => navigate(`/returns?stage_age_bucket=${encodeURIComponent(b.key)}`)}
                className="rounded-lg p-4 border text-left transition-colors hover:bg-white"
                style={{ borderColor: b.color + "55", backgroundColor: b.color + "12", borderTop: `4px solid ${b.color}` }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: b.color }}>{b.desc}</div>
                <div className="text-xs text-slate-600 mt-1">{b.label}</div>
                <div className="text-3xl font-bold tabular-num mt-2 text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {heat.buckets[b.key] || 0}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Query dashboard */}
        <div className="dashboard-card p-5">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-1" style={{ fontFamily: "Outfit" }}>Query Status</h2>
          <p className="text-xs text-slate-500 mb-4">Live query distribution</p>
          <div className="space-y-3">
            {["Open", "Awaiting Client", "Follow-up Required", "Closed"].map((status, idx) => {
              const colors = ["#0ea5e9", "#f59e0b", "#f43f5e", "#10b981"];
              const count = queries[status] || 0;
              const total = Object.values(queries).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <button
                  key={status}
                  data-testid={`query-status-${status.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => navigate(`/queries?status=${encodeURIComponent(status)}`)}
                  className="block w-full rounded-md p-2 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{status}</span>
                    <span className="tabular-num text-slate-600">{count} <span className="text-slate-400 text-xs">({pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors[idx] }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SLA Monitoring */}
      <div className="dashboard-card p-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-1" style={{ fontFamily: "Outfit" }}>SLA Monitoring</h2>
        <p className="text-xs text-slate-500 mb-4">Stage-wise performance vs SLA</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile label="SLA Breaches" count={sla.sla_breaches.length} color="#e11d48" testid="sla-breaches" onClick={() => navigate("/returns?dashboard_filter=sla_breaches")} />
          <StatTile label="Upcoming Breaches" count={sla.upcoming_sla_breaches.length} color="#f97316" testid="sla-upcoming" onClick={() => navigate("/returns?dashboard_filter=upcoming_sla")} />
          <StatTile label="Escalations Active" count={(sla.escalation_breaches || []).length} color="#7c3aed" testid="sla-escalations" onClick={() => navigate("/escalations")} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stage</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">In Stage</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Avg Age (d)</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">SLA (d)</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Breaches</th>
              </tr>
            </thead>
            <tbody>
              {sla.stage_delays.map((s) => (
                <tr key={s.stage_id} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/returns?stage_id=${s.stage_id}`)}>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-0.5" style={stageBadgeStyle(s.colour)}>{s.stage_name}</span>
                  </td>
                  <td className="text-right tabular-num px-4 py-2 text-slate-700">{s.count}</td>
                  <td className="text-right tabular-num px-4 py-2 text-slate-700">{s.avg_age_days}</td>
                  <td className="text-right tabular-num px-4 py-2 text-slate-500">{s.sla_days}</td>
                  <td className="text-right tabular-num px-4 py-2 font-semibold" style={{ color: s.breaches > 0 ? "#e11d48" : "#475569" }}>{s.breaches}</td>
                </tr>
              ))}
              {sla.stage_delays.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-slate-400">No active stages</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team workload */}
      <div className="dashboard-card p-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-4" style={{ fontFamily: "Outfit" }}>Team Workload</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Person</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Returns Assigned</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Queries Raised</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Closed</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pending</th>
              </tr>
            </thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.user_id} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/returns?person_id=${u.user_id}`)}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-[11px] text-slate-500">{u.email} · {u.role}</div>
                  </td>
                  <td className="text-right tabular-num px-4 py-2 text-slate-800 font-semibold">{u.returns_assigned}</td>
                  <td className="text-right tabular-num px-4 py-2 text-slate-700">{u.queries_raised}</td>
                  <td className="text-right tabular-num px-4 py-2 text-emerald-700">{u.queries_closed}</td>
                  <td className="text-right tabular-num px-4 py-2 text-rose-700">{u.queries_pending}</td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-slate-400">No team members</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, count, color, testid, onClick }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} className="rounded-lg p-4 border text-left transition-colors hover:bg-white" style={{ borderColor: color + "55", backgroundColor: color + "0F" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
      <div className="text-2xl font-bold tabular-num mt-1 text-slate-900" style={{ fontFamily: "Outfit" }}>{count}</div>
    </button>
  );
}
