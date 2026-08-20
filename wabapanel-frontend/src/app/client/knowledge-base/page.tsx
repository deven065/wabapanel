"use client";
import React, { useState, useEffect } from "react";
import { Plus, Trash2, Edit, BookOpen, Save, X } from "lucide-react";
import { workspaceKbApi } from "@/lib/api";
import toast from "react-hot-toast";

interface KBItem { _id: string; title: string; content: string; category: string; status: string; updatedAt: string; }

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<KBItem | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });

  const load = async () => { try { const r = await workspaceKbApi.list(); setItems(r.data.data || []); } catch { /* */ } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) { toast.error("Title and content required"); return; }
    try {
      if (editing) { await workspaceKbApi.update(editing._id, form); } else { await workspaceKbApi.create(form); }
      toast.success(editing ? "Updated" : "Created");
      setShowForm(false); setEditing(null); setForm({ title: "", content: "", category: "general" }); load();
    } catch { toast.error("Failed"); }
  };

  const handleDelete = async (id: string) => { if (!confirm("Delete?")) return; await workspaceKbApi.delete(id); load(); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="page-hero"><div><h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1><p className="text-sm text-gray-500 mt-1">Add business info that AI will use to answer customer queries</p></div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ title: "", content: "", category: "general" }); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Article</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex justify-between"><h3 className="font-semibold">{editing ? "Edit" : "New"} Knowledge Article</h3><button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title (e.g. Pricing, Business Hours, Return Policy)" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
            <option value="general">General</option><option value="products">Products</option><option value="pricing">Pricing</option><option value="policies">Policies</option><option value="faq">FAQ</option><option value="support">Support</option>
          </select>
          <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Write the knowledge content here. AI will use this to answer customer queries." rows={8} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Save className="w-4 h-4" /> Save</button>
        </form>
      )}
      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border"><BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No knowledge articles yet</p><p className="text-sm text-gray-400 mt-1">Add articles about your business so AI can answer customer questions accurately</p></div>
      ) : (
        <div className="grid gap-4">
          {items.map(item => (
            <div key={item._id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0"><h3 className="font-semibold text-gray-900">{item.title}</h3><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mt-1 inline-block">{item.category}</span><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-3">{item.content}</p><p className="text-xs text-gray-400 mt-2">Updated {new Date(item.updatedAt).toLocaleDateString("en-IN")}</p></div>
                <div className="flex gap-1 ml-3">
                  <button onClick={() => { setEditing(item); setForm({ title: item.title, content: item.content, category: item.category }); setShowForm(true); }} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(item._id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
