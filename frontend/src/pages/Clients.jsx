import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload, Search, Loader2 } from "lucide-react";

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get(`/clients${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    setClients(r.data);
    setLoading(false);
  };

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this client?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("Deleted");
    load();
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/clients/import", fd);
      toast.success(`Imported: ${r.data.inserted} new, ${r.data.updated} updated`);
      e.target.value = "";
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    }
  };

  const onExport = async (format) => {
    const r = await api.get(`/clients/export?format=${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = `clients.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Master</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Client Master</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" data-testid="clients-export-csv" onClick={() => onExport("csv")}><Download className="w-4 h-4 mr-1.5" /> CSV</Button>
          <Button variant="outline" size="sm" data-testid="clients-export-xlsx" onClick={() => onExport("xlsx")}><Download className="w-4 h-4 mr-1.5" /> Excel</Button>
          <label>
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={onImport} data-testid="clients-import-input" />
            <span className="inline-flex items-center text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 h-9 px-3 rounded-md cursor-pointer text-slate-700">
              <Upload className="w-4 h-4 mr-1.5" /> Import
            </span>
          </label>
          <Button size="sm" data-testid="clients-add-button" className="bg-emerald-800 hover:bg-emerald-900" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Client
          </Button>
        </div>
      </div>

      <div className="dashboard-card p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="clients-search" />
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["File No.", "Group", "Client Name", "Category", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>}
              {!loading && clients.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">No clients</td></tr>}
              {!loading && clients.map((c, idx) => (
                <tr key={c.id} data-testid={`client-row-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{c.file_no}</td>
                  <td className="px-4 py-2.5 text-slate-700">{c.group}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.client_name}</td>
                  <td className="px-4 py-2.5"><span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{c.category}</span></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" data-testid={`client-edit-${idx}`} onClick={() => { setEditing(c); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" data-testid={`client-delete-${idx}`} onClick={() => onDelete(c.id)}><Trash2 className="w-4 h-4 text-rose-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ClientFormDialog open={showForm} onClose={() => setShowForm(false)} onSaved={load} editing={editing} />
    </div>
  );
}

function ClientFormDialog({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState({ file_no: "", group: "", client_name: "", category: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        file_no: editing.file_no, group: editing.group, client_name: editing.client_name, category: editing.category,
      } : { file_no: "", group: "", client_name: "", category: "" });
    }
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/clients/${editing.id}`, form);
      } else {
        await api.post("/clients", form);
      }
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
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Client</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {["file_no", "group", "client_name", "category"].map((k) => (
            <div key={k} className={k === "client_name" ? "col-span-2" : ""}>
              <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
                {k.replace("_", " ")}{["file_no", "client_name"].includes(k) && <span className="text-rose-600"> *</span>}
              </Label>
              <Input data-testid={`client-form-${k}`} value={form[k] || ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} required={["file_no", "client_name"].includes(k)} className="mt-1" />
            </div>
          ))}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="client-form-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
