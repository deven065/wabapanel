"use client";
import React, { useState, useEffect } from "react";
import { badgeApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Badge { _id: string; name: string; description: string; color: string; icon: string; contactCount: number; isActive: boolean; criteria: { type: string; value: number }; }

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Badge | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "#10b981", icon: "award", criteriaType: "manual", criteriaValue: 0, autoAssign: false });

  const fetchBadges = async () => { try { const res = await badgeApi.list(); setBadges(res.data.data || []); } catch { /* empty */ } finally { setLoading(false); } };
  useEffect(() => { fetchBadges(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: form.name, description: form.description, color: form.color, icon: form.icon, autoAssign: form.autoAssign, criteria: { type: form.criteriaType, value: Number(form.criteriaValue) || 0 } };
      if (editing) { await badgeApi.update(editing._id, payload); } else { await badgeApi.create(payload); }
      setShowForm(false); setEditing(null); setForm({ name: "", description: "", color: "#10b981", icon: "award", criteriaType: "manual", criteriaValue: 0, autoAssign: false }); fetchBadges();
    } catch { /* empty */ }
  };

  const handleDelete = async (id: string) => { if (!confirm("Delete this badge?")) return; await badgeApi.delete(id); fetchBadges(); };

  const handleRun = async (id: string) => {
    try { const r = await badgeApi.run(id); toast.success(`Assigned to ${r.data.assigned} contact(s)`); fetchBadges(); }
    catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; toast.error(e.response?.data?.message || "Failed"); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Badges</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage contact badges</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", description: "", color: "#10b981", icon: "award", criteriaType: "manual", criteriaValue: 0, autoAssign: false }); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Badge
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editing ? "Edit Badge" : "New Badge"}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Color</label><input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer" /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Auto-assign rule</label><select value={form.criteriaType} onChange={e => setForm({ ...form, criteriaType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="manual">Manual (assign yourself)</option><option value="messages_count">Messages sent/received ≥</option><option value="purchase_amount">Total purchase amount ≥</option><option value="days_active">Days since added ≥</option></select></div>
            {form.criteriaType !== "manual" && <div><label className="block text-sm font-medium text-gray-700 mb-1">Value</label><input type="number" min={0} value={form.criteriaValue} onChange={e => setForm({ ...form, criteriaValue: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{editing ? "Update" : "Create"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.length === 0 ? (
          <div className="md:col-span-3 bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">No badges yet.</div>
        ) : badges.map(b => (
          <div key={b._id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: b.color + "20" }}>
                <svg className="w-5 h-5" style={{ color: b.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{b.name}</h3>
                <p className="text-xs text-gray-500">{b.contactCount || 0} contacts</p>
              </div>
            </div>
            {b.description && <p className="text-sm text-gray-600 mb-3">{b.description}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setEditing(b); setForm({ name: b.name, description: b.description, color: b.color, icon: b.icon, criteriaType: b.criteria?.type || "manual", criteriaValue: b.criteria?.value || 0, autoAssign: b.isActive === undefined ? false : (b as unknown as { autoAssign?: boolean }).autoAssign || false }); setShowForm(true); }} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
              <button onClick={() => handleDelete(b._id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>
              {b.criteria?.type && b.criteria.type !== "manual" && <button onClick={() => handleRun(b._id)} className="text-sm text-emerald-600 hover:text-emerald-800 ml-auto">Run now</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
