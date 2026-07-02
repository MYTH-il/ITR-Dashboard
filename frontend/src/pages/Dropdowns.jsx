import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

const CATEGORIES = [
  { key: "return_type", label: "Return Type" },
  { key: "query_status", label: "Query Status" },
  { key: "fy", label: "Financial Year" },
  { key: "itr_form", label: "ITR Form" },
];

export default function Dropdowns() {
  const [tab, setTab] = useState("return_type");

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Configuration</div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Dropdown Options</h1>
        <p className="text-sm text-slate-500 mt-1">Manage editable values used across the application.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {CATEGORIES.map((c) => <TabsTrigger key={c.key} value={c.key} data-testid={`dropdown-tab-${c.key}`}>{c.label}</TabsTrigger>)}
        </TabsList>
        {CATEGORIES.map((c) => (
          <TabsContent key={c.key} value={c.key}>
            <OptionList category={c.key} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function OptionList({ category }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get(`/dropdown-options?category=${category}`);
    setItems(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category]);

  const add = async () => {
    if (!newValue.trim()) return;
    setAdding(true);
    try {
      await api.post("/dropdown-options", { category, value: newValue.trim(), sequence: items.length, active: true });
      setNewValue("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setAdding(false);
    }
  };

  const update = async (id, payload) => {
    await api.patch(`/dropdown-options/${id}`, payload);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this option?")) return;
    await api.delete(`/dropdown-options/${id}`);
    load();
  };

  return (
    <div className="dashboard-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Input placeholder="New value…" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="max-w-xs" data-testid={`dropdown-new-${category}`} />
        <Button data-testid={`dropdown-add-${category}`} className="bg-emerald-800 hover:bg-emerald-900" onClick={add} disabled={adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />} Add
        </Button>
      </div>
      <div className="space-y-2">
        {loading && <div className="text-slate-400 text-sm text-center py-4">Loading…</div>}
        {!loading && items.length === 0 && <div className="text-slate-400 text-sm text-center py-4">No values</div>}
        {items.map((it, idx) => (
          <div key={it.id} data-testid={`dropdown-item-${category}-${idx}`} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
            <Input value={it.value} onChange={(e) => update(it.id, { value: e.target.value })} className="flex-1" />
            <Switch checked={!!it.active} onCheckedChange={(v) => update(it.id, { active: v })} />
            <Button variant="ghost" size="sm" onClick={() => remove(it.id)}><Trash2 className="w-4 h-4 text-rose-600" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
