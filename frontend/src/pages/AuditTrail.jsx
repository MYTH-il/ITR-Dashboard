import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { Search, Loader2 } from "lucide-react";

const MODULES = ["Auth", "Users", "Clients", "WorkflowStages", "DropdownOptions", "Returns", "Queries"];

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (moduleFilter !== "all") q.set("module", moduleFilter);
    if (userFilter !== "all") q.set("user_id", userFilter);
    q.set("limit", "1000");
    const [l, u] = await Promise.all([
      api.get(`/audit-logs?${q.toString()}`),
      api.get("/users"),
    ]);
    setLogs(l.data);
    setUsers(u.data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleFilter, userFilter]);

  const filtered = logs.filter((l) => !search || (l.action || "").toLowerCase().includes(search.toLowerCase()) || (l.user_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Compliance</div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Audit Trail</h1>
      </div>

      <div className="dashboard-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="audit-search" placeholder="Search action / user…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger data-testid="audit-module-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger data-testid="audit-user-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Time", "User", "Module", "Action", "Old", "New"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">No audit records</td></tr>}
              {!loading && filtered.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(l.timestamp)}</td>
                  <td className="px-4 py-2.5 text-slate-800">{l.user_name || "—"}</td>
                  <td className="px-4 py-2.5"><span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{l.module}</span></td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{l.action}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[260px] truncate" title={JSON.stringify(l.old_value)}>{l.old_value != null ? JSON.stringify(l.old_value) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[260px] truncate" title={JSON.stringify(l.new_value)}>{l.new_value != null ? JSON.stringify(l.new_value) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
