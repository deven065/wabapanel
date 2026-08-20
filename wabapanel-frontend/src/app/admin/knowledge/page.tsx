/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Save, X, Send } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface Article { _id?: string; title: string; slug: string; content: string; excerpt: string; category: string; tags: string[]; status: string; order: number; }
interface VendorLite { _id: string; name: string; email: string; companyName?: string; }

export default function AdminKnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [editing, setEditing] = useState<Article | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [pushArticle, setPushArticle] = useState<Article | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [vSearch, setVSearch] = useState('');
  const [pushing, setPushing] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

  const load = () => {
    fetch(`${API}/admin/knowledge`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => { if (d.success) setArticles(d.data); });
  };
  useEffect(load, []);

  const saveArticle = async () => {
    if (!editing) return;
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API}/admin/knowledge` : `${API}/admin/knowledge/${editing._id}`;
    const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(editing) });
    const d = await r.json();
    if (d.success) { load(); setEditing(null); setIsNew(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this article?')) return;
    await fetch(`${API}/admin/knowledge/${id}`, { method: 'DELETE', headers: headers() });
    load();
  };

  const openPush = (a: Article) => {
    setPushArticle(a);
    setSelected({});
    fetch(`${API}/admin/vendor-ai`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => { if (d.success) setVendors(d.data); });
  };

  const doPush = async () => {
    if (!pushArticle) return;
    const vendorIds = Object.keys(selected).filter(id => selected[id]);
    if (!vendorIds.length) { alert('Select at least one vendor'); return; }
    setPushing(true);
    const r = await fetch(`${API}/admin/push-knowledge`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ vendorIds, articles: [{ title: pushArticle.title, content: pushArticle.content, category: pushArticle.category }] }),
    });
    const d = await r.json();
    setPushing(false);
    if (d.success) { alert(`Pushed to ${d.data.vendors} vendor(s).`); setPushArticle(null); }
    else alert(d.message || 'Push failed');
  };

  const filteredVendors = vendors.filter(v => {
    const q = vSearch.toLowerCase();
    return !q || v.name?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q) || v.companyName?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="w-6 h-6 text-blue-600" /> Knowledge Base</h1>
          <p className="text-sm text-gray-500">Manage knowledge base articles for your website</p>
        </div>
        <button onClick={() => { setEditing({ title: '', slug: '', content: '', excerpt: '', category: 'general', tags: [], status: 'draft', order: 0 }); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {/* Editor Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{isNew ? 'New Article' : 'Edit Article'}</h2>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div><label className="text-sm font-medium text-gray-700">Title</label><input type="text" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="off" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium text-gray-700">Category</label><input type="text" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="off" placeholder="general, setup, api, etc." /></div>
              <div><label className="text-sm font-medium text-gray-700">Status</label><select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm"><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </div>
            <div><label className="text-sm font-medium text-gray-700">Excerpt (short summary)</label><input type="text" value={editing.excerpt} onChange={e => setEditing({ ...editing, excerpt: e.target.value })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="off" /></div>
            <div><label className="text-sm font-medium text-gray-700">Content (HTML)</label><textarea rows={12} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono resize-none" /></div>
            <div><label className="text-sm font-medium text-gray-700">Tags (comma-separated)</label><input type="text" value={editing.tags?.join(', ') || ''} onChange={e => setEditing({ ...editing, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} className="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="off" /></div>
            <div><label className="text-sm font-medium text-gray-700">Order</label><input type="number" value={editing.order} onChange={e => setEditing({ ...editing, order: parseInt(e.target.value) || 0 })} className="mt-1 w-32 px-4 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveArticle} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Save className="w-4 h-4" /> Save</button>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Push to Vendors Modal */}
      {pushArticle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Push to Vendors</h2>
              <button onClick={() => setPushArticle(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500">Copies &ldquo;<span className="font-medium text-gray-700">{pushArticle.title}</span>&rdquo; into each selected vendor&rsquo;s private AI knowledge base (Client &rarr; Knowledge Base). Their AI will use it for replies.</p>
            <input type="text" value={vSearch} onChange={e => setVSearch(e.target.value)} placeholder="Search vendors" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="off" />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <button onClick={() => { const m: Record<string, boolean> = {}; filteredVendors.forEach(v => { m[v._id] = true; }); setSelected(m); }} className="text-blue-600 font-medium">Select all</button>
              <button onClick={() => setSelected({})} className="text-gray-500 font-medium">Clear</button>
            </div>
            <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto divide-y">
              {filteredVendors.map(v => (
                <label key={v._id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={!!selected[v._id]} onChange={e => setSelected(prev => ({ ...prev, [v._id]: e.target.checked }))} className="rounded text-emerald-600" />
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-900 truncate">{v.name || v.companyName || v.email}</div><div className="text-xs text-gray-500 truncate">{v.email}</div></div>
                </label>
              ))}
              {filteredVendors.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">No vendors</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={doPush} disabled={pushing} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"><Send className="w-4 h-4" /> {pushing ? 'Pushing...' : 'Push'}</button>
              <button onClick={() => setPushArticle(null)} className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Articles List */}
      <div className="space-y-3">
        {articles.length === 0 && <p className="text-center text-gray-400 py-12">No articles yet. Create your first knowledge base article.</p>}
        {articles.map(a => (
          <div key={a._id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:shadow-sm transition-shadow">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
              </div>
              <p className="text-sm text-gray-500 truncate">{a.category} • {a.excerpt || 'No excerpt'}</p>
            </div>
            <div className="flex gap-2 ml-4">
              <button onClick={() => openPush(a)} title="Push to vendors" className="p-2 hover:bg-emerald-50 rounded-lg text-emerald-600"><Send className="w-4 h-4" /></button>
              <button onClick={() => { setEditing(a); setIsNew(false); }} className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => del(a._id!)} className="p-2 hover:bg-red-50 rounded-lg text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
