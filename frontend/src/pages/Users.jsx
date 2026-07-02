import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get("/users");
    setUsers(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (u) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Master</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>User Directory</h1>
        </div>
        <Button data-testid="users-add-button" className="bg-emerald-800 hover:bg-emerald-900" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add User
        </Button>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Name", "Email", "Role", "Active", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>}
              {!loading && users.map((u, idx) => (
                <tr key={u.id} data-testid={`user-row-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 border ${u.role === "admin" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><Switch data-testid={`user-active-${idx}`} checked={!!u.active} onCheckedChange={() => toggleActive(u)} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" data-testid={`user-edit-${idx}`} onClick={() => { setEditing(u); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserFormDialog open={showForm} onClose={() => setShowForm(false)} onSaved={load} editing={editing} />
    </div>
  );
}

function UserFormDialog({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState({ name: "", email: "", role: "user", active: true, password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? { name: editing.name, email: editing.email, role: editing.role, active: editing.active, password: "" } : { name: "", email: "", role: "user", active: true, password: "" });
    }
  }, [open, editing]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, role: form.role, active: form.active };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editing.id}`, payload);
      } else {
        await api.post("/users", form);
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
        <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} User</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Name *</Label><Input data-testid="user-form-name" required value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Email *</Label><Input data-testid="user-form-email" required type="email" disabled={!!editing} value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Role</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger data-testid="user-form-role" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Password {editing ? "(leave blank to keep current)" : "*"}</Label>
            <Input data-testid="user-form-password" required={!editing} type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center gap-2"><Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} /><Label>Active</Label></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="user-form-submit" className="bg-emerald-800 hover:bg-emerald-900">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
