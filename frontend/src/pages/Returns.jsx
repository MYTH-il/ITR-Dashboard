import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { stageBadgeStyle, fmtDate, ageingBucket } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Search, Download, Upload, Plus, RefreshCw, Loader2 } from "lucide-react";

export default function Returns() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [returns, setReturns] = useState([]);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [returnTypes, setReturnTypes] = useState([]);
  const [fyOptions, setFyOptions] = useState([]);
  const [itrForms, setItrForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("search") || "");
  const [stageFilter, setStageFilter] = useState(params.get("stage_id") || "all");
  const [personFilter, setPersonFilter] = useState(params.get("person_id") || "all");
  const [overdueOnly, setOverdueOnly] = useState(params.get("overdue") === "true");
  const [fyFilter, setFyFilter] = useState(params.get("fy") || "all");
  const [dashboardFilter, setDashboardFilter] = useState(params.get("dashboard_filter") || "");
  const [stageAgeBucket, setStageAgeBucket] = useState(params.get("stage_age_bucket") || "");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (stageFilter !== "all") q.set("stage_id", stageFilter);
    if (personFilter !== "all") q.set("person_id", personFilter);
    if (fyFilter !== "all") q.set("fy", fyFilter);
    if (overdueOnly) q.set("overdue", "true");
    if (dashboardFilter) q.set("dashboard_filter", dashboardFilter);
    if (stageAgeBucket) q.set("stage_age_bucket", stageAgeBucket);
    const [r, s, u, rt, fy, itr] = await Promise.all([
      api.get(`/returns?${q.toString()}`),
      api.get("/workflow-stages"),
      api.get("/users"),
      api.get("/dropdown-options?category=return_type"),
      api.get("/dropdown-options?category=fy"),
      api.get("/dropdown-options?category=itr_form"),
    ]);
    setReturns(r.data);
    setStages(s.data);
    setUsers(u.data);
    setReturnTypes(rt.data);
    setFyOptions(fy.data);
    setItrForms(itr.data);
    setLoading(false);
  };

  useEffect(() => {
    setSearch(params.get("search") || "");
    setStageFilter(params.get("stage_id") || "all");
    setPersonFilter(params.get("person_id") || "all");
    setOverdueOnly(params.get("overdue") === "true");
    setFyFilter(params.get("fy") || "all");
    setDashboardFilter(params.get("dashboard_filter") || "");
    setStageAgeBucket(params.get("stage_age_bucket") || "");
  }, [params]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [stageFilter, personFilter, overdueOnly, fyFilter, dashboardFilter, stageAgeBucket]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const onDownload = async (format) => {
    const r = await api.get(`/returns/export/file?format=${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `returns.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/returns/import", fd);
      toast.success(`Imported ${r.data.inserted} returns, skipped ${r.data.skipped}`);
      e.target.value = "";
      load();
    } catch (err) {
      toast.error("Import failed: " + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Operations</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl" style={{ fontFamily: "Outfit" }}>Return Master</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:w-auto">
          <Button variant="outline" size="sm" className="w-full justify-center" data-testid="returns-refresh" onClick={load}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>
          <Button variant="outline" size="sm" className="w-full justify-center" data-testid="returns-export-csv" onClick={() => onDownload("csv")}><Download className="w-4 h-4 mr-1.5" /> CSV</Button>
          <Button variant="outline" size="sm" className="w-full justify-center" data-testid="returns-export-xlsx" onClick={() => onDownload("xlsx")}><Download className="w-4 h-4 mr-1.5" /> Excel</Button>
          <Button variant="outline" size="sm" className="w-full justify-center" data-testid="returns-export-pdf" onClick={() => onDownload("pdf")}><Download className="w-4 h-4 mr-1.5" /> PDF</Button>
          {isAdmin && (
            <>
              <label className="block">
                <input type="file" accept=".csv,.xlsx" className="hidden" onChange={onImport} data-testid="returns-import-input" />
                <span className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="w-4 h-4 mr-1.5" /> Import
                </span>
              </label>
              <Button size="sm" className="w-full justify-center bg-emerald-800 hover:bg-emerald-900" data-testid="new-return-button" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> New Return
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="dashboard-card p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,2fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
          <div className="relative min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="returns-search" placeholder="Search by RIN, client, file no., task id…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={stageFilter} onValueChange={(v) => { setDashboardFilter(""); setStageAgeBucket(""); setStageFilter(v); }}>
            <SelectTrigger data-testid="returns-stage-filter"><SelectValue placeholder="All stages" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.sequence}. {s.stage_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={personFilter} onValueChange={(v) => { setDashboardFilter(""); setStageAgeBucket(""); setPersonFilter(v); }}>
            <SelectTrigger data-testid="returns-person-filter"><SelectValue placeholder="All assignees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <Select value={fyFilter} onValueChange={(v) => { setDashboardFilter(""); setStageAgeBucket(""); setFyFilter(v); }}>
            <SelectTrigger data-testid="returns-fy-filter" className="h-9 w-[160px]"><SelectValue placeholder="All FY" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All FY</SelectItem>
              {fyOptions.filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => { setDashboardFilter(""); setStageAgeBucket(""); setOverdueOnly(e.target.checked); }} className="rounded border-slate-300" data-testid="returns-overdue-filter" />
            Overdue only
          </label>
          {(dashboardFilter || stageAgeBucket) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDashboardFilter("");
                setStageAgeBucket("");
                setParams({});
              }}
            >
              Clear dashboard filter
            </Button>
          )}
          <div className="text-xs text-slate-500 ml-auto tabular-num">{returns.length} records</div>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="max-h-[65vh] overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[19%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                {["RIN", "Inward", "Client", "FY", "Type", "ITR", "Due", "Stage", "Assignee", "Stage Age", "Action"].map((h) => (
                  <th key={h} className="truncate px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
              )}
              {!loading && returns.length === 0 && (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400">No returns match the filters</td></tr>
              )}
              {!loading && returns.map((r, idx) => {
                const bucket = ageingBucket(r.stage_ageing_days);
                return (
                  <tr
                    key={r.id}
                    data-testid={`return-row-${idx}`}
                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/returns/${r.id}`)}
                  >
                    <td className="truncate px-3 py-2.5 font-mono text-xs text-slate-700">{r.return_inward_no}</td>
                    <td className="truncate px-3 py-2.5 text-slate-600">{fmtDate(r.return_inward_date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="truncate font-medium text-slate-800" title={r.client_name}>{r.client_name}</div>
                      <div className="truncate text-[11px] text-slate-500" title={`${r.file_no} · ${r.group}`}>{r.file_no} · {r.group}</div>
                    </td>
                    <td className="truncate px-3 py-2.5 text-slate-700">{r.fy}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r.return_type}</span></td>
                    <td className="truncate px-3 py-2.5 text-slate-700">{r.itr_form || "—"}</td>
                    <td className="truncate px-3 py-2.5 text-slate-700">{fmtDate(r.due_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-semibold" style={stageBadgeStyle(r.current_stage_colour)} title={r.current_stage_name}>
                        {r.current_stage_name}
                      </span>
                    </td>
                    <td className="truncate px-3 py-2.5 text-slate-700" title={r.person_assigned_name || ""}>{r.person_assigned_name || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-num" style={{ color: bucket.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bucket.color }} /> {r.stage_ageing_days}d
                      </span>
                    </td>
                    <td className="truncate px-3 py-2.5 text-xs text-slate-600" title={r.next_action_required}>{r.next_action_required}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddReturnDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} stages={stages} users={users} returnTypes={returnTypes} fyOptions={fyOptions} itrForms={itrForms} />
    </div>
  );
}

function AddReturnDialog({ open, onClose, onSaved, stages, users, returnTypes, fyOptions, itrForms }) {
  const blank = useMemo(() => ({
    return_inward_no: "", return_inward_date: new Date().toISOString().slice(0, 10), task_id: "",
    fy: "", file_no: "", group: "", client_name: "", return_type: "Original", itr_form: "",
    due_date: "", current_stage_id: "", person_assigned_id: null, remarks: "",
  }), []);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [clientLookup, setClientLookup] = useState({ loading: false, message: "" });

  useEffect(() => {
    if (open) {
      setForm({
        ...blank,
        current_stage_id: stages[0]?.id || "",
        fy: fyOptions.find((o) => o.active)?.value || "",
        itr_form: itrForms.find((o) => o.active)?.value || "",
      });
    }
  }, [open, stages, blank, fyOptions, itrForms]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    const fileNo = form.file_no.trim();
    if (!fileNo) {
      setClientLookup({ loading: false, message: "" });
      return;
    }

    let cancelled = false;
    setClientLookup({ loading: true, message: "" });
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/clients?search=${encodeURIComponent(fileNo)}`);
        if (cancelled) return;
        const exact = r.data.find((c) => String(c.file_no || "").trim().toLowerCase() === fileNo.toLowerCase());
        if (exact) {
          setForm((f) => ({
            ...f,
            group: exact.group || "",
            client_name: exact.client_name || "",
          }));
          setClientLookup({ loading: false, message: "Client details filled from Client Master" });
        } else {
          setClientLookup({ loading: false, message: "No exact client found for this file no." });
        }
      } catch {
        if (!cancelled) setClientLookup({ loading: false, message: "Client lookup failed" });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, form.file_no]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.person_assigned_id) payload.person_assigned_id = null;
      await api.post("/returns", payload);
      toast.success("Return created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Save failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Return</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Return Inward No." required><Input data-testid="add-return-rin" value={form.return_inward_no} onChange={(e) => set("return_inward_no", e.target.value)} required /></Field>
          <Field label="Inward Date"><Input type="date" value={form.return_inward_date} onChange={(e) => set("return_inward_date", e.target.value)} /></Field>
          <Field label="Task ID"><Input value={form.task_id} onChange={(e) => set("task_id", e.target.value)} /></Field>
          <Field label="FY">
            <Select value={form.fy} onValueChange={(v) => set("fy", v)}>
              <SelectTrigger data-testid="add-return-fy"><SelectValue placeholder="Select FY" /></SelectTrigger>
              <SelectContent>{fyOptions.filter(o => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="File No." required>
            <Input value={form.file_no} onChange={(e) => set("file_no", e.target.value)} required />
            {(clientLookup.loading || clientLookup.message) && (
              <div className="mt-1 text-[11px] text-slate-500">
                {clientLookup.loading ? "Looking up client..." : clientLookup.message}
              </div>
            )}
          </Field>
          <Field label="Group"><Input value={form.group} onChange={(e) => set("group", e.target.value)} /></Field>
          <Field label="Client Name" required full><Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required /></Field>
          <Field label="Return Type">
            <Select value={form.return_type} onValueChange={(v) => set("return_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{returnTypes.filter(o => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="ITR Form">
            <Select value={form.itr_form} onValueChange={(v) => set("itr_form", v)}>
              <SelectTrigger data-testid="add-return-itr-form"><SelectValue placeholder="Select ITR Form" /></SelectTrigger>
              <SelectContent>{itrForms.filter(o => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Due Date"><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
          <Field label="Current Stage">
            <Select value={form.current_stage_id} onValueChange={(v) => set("current_stage_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.sequence}. {s.stage_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Assignee">
            <Select value={form.person_assigned_id || "none"} onValueChange={(v) => set("person_assigned_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.filter((u) => u.active && u.role === "user").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="col-span-2 mt-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="add-return-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
        {label} {required && <span className="text-rose-600">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
