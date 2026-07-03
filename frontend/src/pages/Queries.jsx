import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Download, Search, Loader2, Plus, Check, ChevronsUpDown } from "lucide-react";

const COLORS = {
  "Open": "#0ea5e9",
  "Awaiting Client": "#f59e0b",
  "Follow-up Required": "#f43f5e",
  "Closed": "#10b981",
};

export default function Queries() {
  const [queries, setQueries] = useState([]);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [pendingOnly, setPendingOnly] = useState(params.get("pending") === "true");
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (pendingOnly) q.set("pending", "true");
    else if (status !== "all") q.set("status", status);
    const [r, s] = await Promise.all([
      api.get(`/queries?${q.toString()}`),
      api.get(`/dropdown-options?category=query_status`),
    ]);
    setQueries(r.data);
    setStatuses(s.data);
    setLoading(false);
  };

  useEffect(() => {
    setSearch(params.get("search") || "");
    setStatus(params.get("status") || "all");
    setPendingOnly(params.get("pending") === "true");
  }, [params]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, pendingOnly]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);

  const onExport = async (format) => {
    const q = new URLSearchParams();
    q.set("format", format);
    if (pendingOnly) q.set("pending", "true");
    else if (status !== "all") q.set("status", status);
    const r = await api.get(`/queries/export/file?${q.toString()}`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = `queries.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Module</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Query Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="queries-export-csv" onClick={() => onExport("csv")}><Download className="w-4 h-4 mr-1.5" /> CSV</Button>
          <Button variant="outline" size="sm" data-testid="queries-export-xlsx" onClick={() => onExport("xlsx")}><Download className="w-4 h-4 mr-1.5" /> Excel</Button>
          <Button variant="outline" size="sm" data-testid="queries-export-pdf" onClick={() => onExport("pdf")}><Download className="w-4 h-4 mr-1.5" /> PDF</Button>
          <Button size="sm" data-testid="queries-add-button" className="bg-emerald-800 hover:bg-emerald-900" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Query
          </Button>
        </div>
      </div>

      <div className="dashboard-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search queries…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="queries-search" />
        </div>
        <Select value={pendingOnly ? "pending" : status} onValueChange={(v) => {
          if (v === "pending") {
            setPendingOnly(true);
            setStatus("all");
          } else {
            setPendingOnly(false);
            setStatus(v);
          }
        }}>
          <SelectTrigger data-testid="queries-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending only</SelectItem>
            {statuses.filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Client", "Description", "Status", "Raised By", "Raised On", "Follow-up", "Closed On"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>}
              {!loading && queries.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">No queries</td></tr>}
              {!loading && queries.map((q, idx) => {
                const c = COLORS[q.query_status] || "#64748b";
                return (
                  <tr key={q.id} data-testid={`query-row-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/returns/${q.return_id}`)}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{q.client_name || "—"}</div>
                      <div className="text-[11px] text-slate-500">
                        {q.return_inward_no || "—"}{q.file_no ? ` · ${q.file_no}` : ""}{q.group ? ` · ${q.group}` : ""}{q.fy ? ` · ${q.fy}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">{q.query_description}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold border rounded-full px-2.5 py-0.5" style={{ color: c, backgroundColor: c + "12", borderColor: c + "55" }}>{q.query_status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{q.query_raised_by_name || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(q.query_raised_date)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(q.follow_up_date)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(q.query_closed_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddQueryDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} statuses={statuses} />
    </div>
  );
}

function AddQueryDialog({ open, onClose, onSaved, statuses }) {
  const [returns, setReturns] = useState([]);
  const [returnId, setReturnId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Open");
  const [followUp, setFollowUp] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnId(""); setDescription(""); setStatus("Open"); setFollowUp(""); setRemarks("");
      api.get("/returns").then((r) => setReturns(r.data)).catch(() => setReturns([]));
    }
  }, [open]);

  const selected = returns.find((r) => r.id === returnId);

  const submit = async (e) => {
    e.preventDefault();
    if (!returnId) {
      toast.error("Please select a return");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a query description");
      return;
    }
    setSaving(true);
    try {
      await api.post("/queries", {
        return_id: returnId,
        query_description: description.trim(),
        query_status: status,
        follow_up_date: followUp || null,
        remarks,
      });
      toast.success("Query added");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add New Query</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Return picker - searchable */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
              Return <span className="text-rose-600">*</span>
            </Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  data-testid="add-query-return-trigger"
                  className="w-full mt-1 justify-between font-normal"
                >
                  {selected ? (
                    <span className="truncate text-left">
                      <span className="font-mono text-xs text-slate-500 mr-2">{selected.return_inward_no}</span>
                      <span className="text-slate-800">{selected.client_name}</span>
                      <span className="text-slate-400 text-xs ml-2">· {selected.fy}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Select a return…</span>
                  )}
                  <ChevronsUpDown className="w-4 h-4 ml-2 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                <Command>
                  <CommandInput placeholder="Search by RIN, client, file no…" data-testid="add-query-return-search" />
                  <CommandList>
                    <CommandEmpty>No returns found.</CommandEmpty>
                    <CommandGroup>
                      {returns.map((r) => (
                        <CommandItem
                          key={r.id}
                          value={`${r.return_inward_no} ${r.client_name} ${r.file_no}`}
                          data-testid={`add-query-return-option-${r.return_inward_no}`}
                          onSelect={() => { setReturnId(r.id); setPickerOpen(false); }}
                        >
                          <Check className={`w-4 h-4 mr-2 ${returnId === r.id ? "opacity-100" : "opacity-0"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-xs text-slate-500">{r.return_inward_no}</span>
                              <span className="text-sm font-medium text-slate-800 truncate">{r.client_name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {r.file_no} · {r.fy} · {r.current_stage_name}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selected && (
              <div className="mt-1.5 text-[11px] text-slate-500">
                Stage: <span className="font-medium text-slate-700">{selected.current_stage_name}</span>
                {" · "}Assignee: <span className="font-medium text-slate-700">{selected.person_assigned_name || "Unassigned"}</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
              Query Description <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              data-testid="add-query-description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={3}
              placeholder="e.g. Need PAN copy of co-owner / Confirm rental income for FY 2024-25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="add-query-status" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Follow-up Date</Label>
              <Input
                data-testid="add-query-followup"
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Remarks</Label>
            <Textarea
              data-testid="add-query-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="mt-1"
              rows={2}
              placeholder="Additional notes…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="add-query-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save Query
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
