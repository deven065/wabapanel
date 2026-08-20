"use client";
import React, { useState, useEffect } from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { platformApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Announcement { _id: string; title: string; message: string; type: string; isActive: boolean; expiresAt?: string; createdAt: string; }

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", type: "info", expiresAt: "" });

  const load = () => platformApi.adminAnnouncements().then(r => setItems(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      await platformApi.adminCreateAnnouncement({ ...form, expiresAt: form.expiresAt || null });
      toast.success("Announcement published to all vendors");
      setShowForm(false); setForm({ title: "", message: "", type: "info", expiresAt: "" }); load();
    } catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const toggle = async (a: Announcement) => { try { await platformApi.adminUpdateAnnouncement(a._id, { isActive: !a.isActive }); load(); } catch { toast.error("Failed"); } };
  const remove = async (id: string) => { if (!confirm("Delete this announcement?")) return; try { await platformApi.adminDeleteAnnouncement(id); toast.success("Deleted"); load(); } catch { toast.error("Failed"); } };

  const typeColor: Record<string, string> = { info: "bg-blue-100 text-blue-700", success: "bg-emerald-100 text-emerald-700", warning: "bg-amber-100 text-amber-700", danger: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Announcements</h1><p className="text-sm text-gray-500 mt-1">Broadcast notices shown as a banner in every vendor&apos;s panel</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Announcement</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-500 block mb-1">Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="New feature launched" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-gray-500 block mb-1">Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="info">Info (blue)</option><option value="success">Success (green)</option><option value="warning">Warning (amber)</option><option value="danger">Critical (red)</option></select></div>
              <div><label className="text-xs text-gray-500 block mb-1">Expires At</label><input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
          </div>
          <div><label className="text-xs text-gray-500 block mb-1">Message</label><textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{saving ? "Publishing..." : "Publish"}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div> : items.length === 0 ? (
          <div className="text-center py-10"><Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">No announcements yet</p></div>
        ) : (
          <div className="divide-y">
            {items.map(a => (
              <div key={a._id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor[a.type] || typeColor.info}`}>{a.type}</span>
                    <h3 className="font-semibold text-gray-900 text-sm">{a.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(a.createdAt).toLocaleString()}{a.expiresAt ? ` · expires ${new Date(a.expiresAt).toLocaleDateString()}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle(a)} className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{a.isActive ? "Live" : "Off"}</button>
                  <button onClick={() => remove(a._id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
