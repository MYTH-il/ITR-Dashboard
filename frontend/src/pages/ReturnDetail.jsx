import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stageBadgeStyle, fmtDate, fmtDateTime, ageingBucket } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft, Plus, Loader2, MessageSquare, Activity } from "lucide-react";

const QUERY_STATUS_COLORS = {
  "Open": "#0ea5e9",
  "Awaiting Client": "#f59e0b",
  "Follow-up Required": "#f43f5e",
  "Closed": "#10b981",
};

export default function ReturnDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [ret, setRet] = useState(null);
  const [queries, setQueries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [queryStatuses, setQueryStatuses] = useState([]);
  const [fyOptions, setFyOptions] = useState([]);
  const [itrForms, setItrForms] = useState([]);
  const [showAddQuery, setShowAddQuery] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const [r, q, s, u, qs, al, fy, itr] = await Promise.all([
      api.get(`/returns/${id}`),
      api.get(`/queries?return_id=${id}`),
      api.get(`/workflow-stages`),
      api.get(`/users`),
      api.get(`/dropdown-options?category=query_status`),
      api.get(`/audit-logs?entity_id=${id}&limit=500`),
      api.get(`/dropdown-options?category=fy`),
      api.get(`/dropdown-options?category=itr_form`),
    ]);
    setRet(r.data);
    setQueries(q.data);
    setStages(s.data);
    setUsers(u.data);
    setQueryStatuses(qs.data);
    setAuditLogs(al.data);
    setFyOptions(fy.data);
    setItrForms(itr.data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!ret) return <div className="text-slate-500 flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading…</div>;

  const bucket = ageingBucket(ret.stage_ageing_days || 0);

  const onStageChange = async (newStageId) => {
    if (!isAdmin) return;
    await api.patch(`/returns/${id}`, { current_stage_id: newStageId });
    toast.success("Stage updated");
    load();
  };

  const onReassign = async (uid) => {
    if (!isAdmin) return;
    await api.post(`/returns/${id}/reassign`, { person_assigned_id: uid === "none" ? null : uid });
    toast.success("Reassigned");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" data-testid="back-button" onClick={() => navigate(-1)} className="text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Return Inward</div>
      </div>

      <div className="dashboard-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-sm text-slate-500">{ret.return_inward_no}</div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>{ret.client_name}</h1>
            <div className="text-sm text-slate-500 mt-1">{ret.file_no} · {ret.group || "—"} · FY {ret.fy}</div>
          </div>
          <div className="text-right">
            <span data-testid="stage-badge" className="inline-flex items-center text-xs font-semibold border rounded-full px-3 py-1" style={stageBadgeStyle(ret.current_stage_colour)}>
              {ret.current_stage_name}
            </span>
            <div className="text-xs text-slate-500 mt-2">Next: <span className="text-slate-800 font-medium">{ret.next_action_required || "—"}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Info label="Task ID" value={ret.task_id} />
          <Info label="Return Type" value={ret.return_type} />
          <Info label="ITR Form" value={ret.itr_form} />
          <Info label="Inward Date" value={fmtDate(ret.return_inward_date)} />
          <Info label="Due Date" value={fmtDate(ret.due_date)} />
          <Info label="Assigned To" value={ret.person_assigned_name || "Unassigned"} />
          <Info label="Stage Age">
            <span className="tabular-num font-semibold" style={{ color: bucket.color }}>{ret.stage_ageing_days} days · {bucket.label}</span>
          </Info>
          <Info label="Total Age">
            <span className="tabular-num font-semibold text-slate-800">{ret.total_ageing_days} days</span>
          </Info>
        </div>

        {isAdmin && (
          <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Move to Stage</Label>
              <Select value={ret.current_stage_id} onValueChange={onStageChange}>
                <SelectTrigger data-testid="move-stage-trigger" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.sequence}. {s.stage_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Reassign</Label>
              <Select value={ret.person_assigned_id || "none"} onValueChange={onReassign}>
                <SelectTrigger data-testid="reassign-trigger" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.filter((u) => u.active).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" data-testid="detail-edit-button" onClick={() => setEditing(true)}>Edit Details</Button>
            </div>
          </div>
        )}
      </div>

      {/* Queries */}
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-700" />
            <h2 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Queries ({queries.length})</h2>
          </div>
          <Button size="sm" data-testid="add-query-button" className="bg-emerald-800 hover:bg-emerald-900" onClick={() => setShowAddQuery(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Query
          </Button>
        </div>

        <div className="space-y-3">
          {queries.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No queries raised yet</div>}
          {queries.map((q, idx) => (
            <QueryCard key={q.id} q={q} idx={idx} statuses={queryStatuses} onChange={load} />
          ))}
        </div>
      </div>

      {/* Audit */}
      <div className="dashboard-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-emerald-700" />
          <h2 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Activity</h2>
        </div>
        <div className="space-y-2">
          {auditLogs.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No activity logged</div>}
          {auditLogs.map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-100 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2" />
              <div className="flex-1">
                <div className="text-slate-800">
                  <span className="font-semibold">{a.action}</span>
                  {a.old_value != null && a.new_value != null && (
                    <span className="text-slate-500"> · {JSON.stringify(a.old_value)} → {JSON.stringify(a.new_value)}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">{fmtDateTime(a.timestamp)} · {a.user_name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddQueryDialog open={showAddQuery} onClose={() => setShowAddQuery(false)} onSaved={load} returnId={id} statuses={queryStatuses} />
      <EditReturnDialog open={editing} onClose={() => setEditing(false)} onSaved={load} ret={ret} stages={stages} users={users} fyOptions={fyOptions} itrForms={itrForms} />
    </div>
  );
}

function Info({ label, value, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 mt-1">{children || value || "—"}</div>
    </div>
  );
}

function QueryCard({ q, idx, statuses, onChange }) {
  const [status, setStatus] = useState(q.query_status);
  const [followUp, setFollowUp] = useState(q.follow_up_date || "");
  const [remarks, setRemarks] = useState(q.remarks || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/queries/${q.id}`, { query_status: status, follow_up_date: followUp || null, remarks });
      toast.success("Query updated");
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  const c = QUERY_STATUS_COLORS[status] || "#64748b";

  return (
    <div data-testid={`query-card-${idx}`} className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm text-slate-800">{q.query_description}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Raised by <span className="font-medium">{q.query_raised_by_name || "—"}</span> on {fmtDate(q.query_raised_date)}
            {q.query_closed_date && <> · Closed {fmtDate(q.query_closed_date)}</>}
          </div>
        </div>
        <span className="text-xs font-semibold border rounded-full px-2.5 py-0.5" style={{ color: c, backgroundColor: c + "12", borderColor: c + "55" }}>{status}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div>
          <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid={`query-status-${idx}`} className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{statuses.filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Follow-up Date</Label>
          <Input type="date" value={followUp || ""} onChange={(e) => setFollowUp(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 h-9" data-testid={`query-remarks-${idx}`} />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" data-testid={`query-save-${idx}`} disabled={saving} onClick={save} className="bg-emerald-800 hover:bg-emerald-900">
          {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
        </Button>
      </div>
    </div>
  );
}

function AddQueryDialog({ open, onClose, onSaved, returnId, statuses }) {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Open");
  const [followUp, setFollowUp] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDescription(""); setStatus("Open"); setFollowUp(""); setRemarks(""); }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/queries", {
        return_id: returnId,
        query_description: description,
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
      <DialogContent>
        <DialogHeader><DialogTitle>Add Query</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Description *</Label>
            <Textarea data-testid="add-query-description" required value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Follow-up Date</Label>
              <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="add-query-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditReturnDialog({ open, onClose, onSaved, ret, stages, users, fyOptions, itrForms }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && ret) {
      setForm({
        return_inward_no: ret.return_inward_no,
        return_inward_date: ret.return_inward_date,
        task_id: ret.task_id || "",
        fy: ret.fy, file_no: ret.file_no, group: ret.group || "",
        client_name: ret.client_name, return_type: ret.return_type, itr_form: ret.itr_form || "",
        due_date: ret.due_date || "", remarks: ret.remarks || "",
      });
    }
  }, [open, ret]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/returns/${ret.id}`, form);
      toast.success("Return updated");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit Return</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {[
            ["return_inward_no", "Return Inward No.", "text"],
            ["return_inward_date", "Inward Date", "date"],
            ["task_id", "Task ID", "text"],
            ["file_no", "File No.", "text"],
            ["group", "Group", "text"],
            ["client_name", "Client Name", "text"],
            ["due_date", "Due Date", "date"],
          ].map(([k, label, type]) => (
            <div key={k}>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</Label>
              <Input type={type} value={form[k] || ""} onChange={(e) => set(k, e.target.value)} className="mt-1" />
            </div>
          ))}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">FY</Label>
            <Select value={form.fy || ""} onValueChange={(v) => set("fy", v)}>
              <SelectTrigger data-testid="edit-return-fy" className="mt-1"><SelectValue placeholder="Select FY" /></SelectTrigger>
              <SelectContent>{(fyOptions || []).filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">ITR Form</Label>
            <Select value={form.itr_form || ""} onValueChange={(v) => set("itr_form", v)}>
              <SelectTrigger data-testid="edit-return-itr-form" className="mt-1"><SelectValue placeholder="Select ITR Form" /></SelectTrigger>
              <SelectContent>{(itrForms || []).filter((o) => o.active).map((o) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Remarks</Label>
            <Textarea value={form.remarks || ""} onChange={(e) => set("remarks", e.target.value)} className="mt-1" rows={2} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
