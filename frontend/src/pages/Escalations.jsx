import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { stageBadgeStyle, fmtDateTime } from "@/lib/format";
import { Loader2, AlertTriangle, Mail } from "lucide-react";

export default function Escalations() {
  const [data, setData] = useState({ breaches: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const r = await api.get("/escalations");
    setData(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  if (loading) return <div className="text-slate-500 flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading…</div>;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Real-time Monitoring</div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Escalations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Returns past their configured escalation threshold per stage. {!process.env.REACT_APP_RESEND_KEY && (
            <span className="text-amber-700 font-medium">Email dispatch inactive (no API key configured) — escalations are logged for review.</span>
          )}
        </p>
      </div>

      <div className="dashboard-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <h2 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Current Escalation Breaches ({data.breaches.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["RIN", "Client", "Stage", "Days In Stage", "Escalation Threshold", "Notify"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.breaches.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No escalation breaches</td></tr>}
              {data.breaches.map((b, idx) => (
                <tr key={b.return_id} data-testid={`escalation-row-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/returns/${b.return_id}`)}>
                  <td className="px-4 py-2.5 font-mono text-xs">{b.return_inward_no}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{b.client_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex text-xs font-semibold border rounded-full px-2.5 py-0.5" style={stageBadgeStyle(b.stage_colour)}>{b.stage_name}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-num font-semibold text-rose-700">{b.days_in_stage}d</td>
                  <td className="px-4 py-2.5 tabular-num text-slate-700">{b.escalation_days}d</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {(b.escalation_emails || []).join(", ") || <span className="text-slate-400 italic">No recipients</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-emerald-700" />
          <h2 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Notification Log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Notified At", "RIN", "Client", "Stage", "Days", "Email Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No notifications logged yet</td></tr>}
              {data.logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDateTime(l.notified_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.return_inward_no}</td>
                  <td className="px-4 py-2.5 text-slate-800">{l.client_name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{l.stage_name}</td>
                  <td className="px-4 py-2.5 tabular-num text-slate-700">{l.days_in_stage}d</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">{l.email_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
