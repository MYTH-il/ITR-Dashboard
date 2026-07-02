import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, ArrowUp, ArrowDown, Loader2 } from "lucide-react";

export default function WorkflowStages() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get("/workflow-stages");
    setStages(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reorder = async (idx, dir) => {
    const newOrder = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    await api.post("/workflow-stages/reorder", { ordered_ids: newOrder.map((s) => s.id) });
    load();
  };

  const toggleActive = async (s) => {
    await api.patch(`/workflow-stages/${s.id}`, { active: !s.active });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Central Workflow Control</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Workflow Stage Master</h1>
          <p className="text-sm text-slate-500 mt-1">Drives the workflow funnel, next-action mapping, SLA &amp; escalation rules across the system.</p>
        </div>
        <Button data-testid="stages-add-button" className="bg-emerald-800 hover:bg-emerald-900" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Stage
        </Button>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Seq", "Stage", "Next Action", "Colour", "SLA (d)", "Escalation (d)", "Active", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>}
              {!loading && stages.map((s, idx) => (
                <tr key={s.id} data-testid={`stage-row-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 tabular-num text-slate-600">
                    <div className="flex items-center gap-1">
                      <span>{s.sequence}</span>
                      <Button variant="ghost" size="sm" data-testid={`stage-up-${idx}`} className="h-6 w-6 p-0" onClick={() => reorder(idx, -1)} disabled={idx === 0}><ArrowUp className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" data-testid={`stage-down-${idx}`} className="h-6 w-6 p-0" onClick={() => reorder(idx, 1)} disabled={idx === stages.length - 1}><ArrowDown className="w-3 h-3" /></Button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{s.stage_name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.next_action_required}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded" style={{ backgroundColor: s.dashboard_colour }} />
                      <span className="font-mono text-xs text-slate-500">{s.dashboard_colour}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-num text-slate-700">{s.sla_days}</td>
                  <td className="px-4 py-2.5 tabular-num text-slate-700">{s.escalation_days}</td>
                  <td className="px-4 py-2.5"><Switch data-testid={`stage-active-${idx}`} checked={!!s.active} onCheckedChange={() => toggleActive(s)} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" data-testid={`stage-edit-${idx}`} onClick={() => { setEditing(s); setShowForm(true); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <StageFormDialog open={showForm} onClose={() => setShowForm(false)} onSaved={load} editing={editing} nextSeq={(stages[stages.length - 1]?.sequence || 0) + 1} />
    </div>
  );
}

function StageFormDialog({ open, onClose, onSaved, editing, nextSeq }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? { ...editing, escalation_emails: (editing.escalation_emails || []).join(", ") } : {
        stage_name: "", sequence: nextSeq, next_action_required: "", dashboard_colour: "#10b981",
        sla_days: 7, escalation_days: 14, escalation_emails: "", active: true,
      });
    }
  }, [open, editing, nextSeq]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        stage_name: form.stage_name,
        sequence: Number(form.sequence),
        next_action_required: form.next_action_required,
        dashboard_colour: form.dashboard_colour,
        sla_days: Number(form.sla_days),
        escalation_days: Number(form.escalation_days),
        escalation_emails: String(form.escalation_emails || "").split(",").map((s) => s.trim()).filter(Boolean),
        active: !!form.active,
      };
      if (editing) await api.patch(`/workflow-stages/${editing.id}`, payload);
      else await api.post("/workflow-stages", payload);
      toast.success("Saved");
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
        <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Stage</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <FieldX label="Stage Name *" full><Input data-testid="stage-form-name" required value={form.stage_name || ""} onChange={(e) => set("stage_name", e.target.value)} /></FieldX>
          <FieldX label="Sequence"><Input type="number" min={1} value={form.sequence || 1} onChange={(e) => set("sequence", e.target.value)} /></FieldX>
          <FieldX label="Dashboard Colour">
            <div className="flex gap-2">
              <Input type="color" value={form.dashboard_colour || "#10b981"} onChange={(e) => set("dashboard_colour", e.target.value)} className="w-16 h-9 p-1" />
              <Input value={form.dashboard_colour || ""} onChange={(e) => set("dashboard_colour", e.target.value)} className="flex-1 font-mono" />
            </div>
          </FieldX>
          <FieldX label="Next Action Required" full><Input value={form.next_action_required || ""} onChange={(e) => set("next_action_required", e.target.value)} /></FieldX>
          <FieldX label="SLA Days"><Input type="number" min={0} value={form.sla_days ?? 0} onChange={(e) => set("sla_days", e.target.value)} /></FieldX>
          <FieldX label="Escalation Days"><Input type="number" min={0} value={form.escalation_days ?? 0} onChange={(e) => set("escalation_days", e.target.value)} /></FieldX>
          <FieldX label="Escalation Emails (comma separated)" full><Textarea value={form.escalation_emails || ""} onChange={(e) => set("escalation_emails", e.target.value)} rows={2} /></FieldX>
          <div className="col-span-2 flex items-center gap-2">
            <Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} />
            <Label className="text-sm">Active</Label>
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="stage-form-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldX({ label, full, children }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
