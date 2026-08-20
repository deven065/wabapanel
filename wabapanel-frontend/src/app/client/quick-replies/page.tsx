"use client";
import toast from 'react-hot-toast';
import React, { useState, useEffect } from "react";
import { quickReplyClientApi, uploadApi } from "@/lib/api";

interface QuickReply {
  _id: string;
  title: string;
  message: string;
  stickerUrl?: string;
  shortcut: string;
  isGlobal: boolean;
}

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ title: "", message: "", stickerUrl: "", shortcut: "" });
  const [qrUploading, setQrUploading] = useState(false);
  const qrFileRef = React.useRef<HTMLInputElement>(null);
  const handleQrSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "stickers");
      const res = await uploadApi.uploadFile(fd);
      setForm(f => ({ ...f, stickerUrl: res.data.data.url }));
      toast.success("Sticker uploaded");
    } catch { toast.error("Upload failed"); }
    setQrUploading(false);
    if (qrFileRef.current) qrFileRef.current.value = "";
  };
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchReplies = async () => {
    try {
      const res = await quickReplyClientApi.list();
      setReplies(res.data.data || []);
    } catch { /* empty */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchReplies(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    if (submitting) return;
    setSubmitting(true);

    e.preventDefault();
    try {
      if (editing) { await quickReplyClientApi.update(editing._id, form); }
      else { await quickReplyClientApi.create(form); }
      setShowForm(false); setEditing(null); setForm({ title: "", message: "", stickerUrl: "", shortcut: "" }); fetchReplies();
      toast.success(editing ? 'Quick reply updated' : 'Quick reply created');
    } catch { toast.error('Failed to save'); } finally { setSubmitting(false); }
  };

  const handleEdit = (r: QuickReply) => {
    setEditing(r); setForm({ title: r.title, message: r.message, stickerUrl: r.stickerUrl || "", shortcut: r.shortcut }); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("Delete this quick reply?")) { setSubmitting(false); return; }
    try { await quickReplyClientApi.delete(id); fetchReplies(); toast.success('Quick reply deleted'); }
    catch { toast.error('Delete failed'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectableIds = replies.filter(r => !r.isGlobal).map(r => r._id);
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : selectableIds);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => quickReplyClientApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchReplies();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quick Replies</h1>
          <p className="text-sm text-gray-500 mt-1">Pre-saved message templates for fast replies in chat</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ title: "", message: "", stickerUrl: "", shortcut: "" }); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Quick Reply
        </button>
      </div>

      {selectableIds.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border mb-6 ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} selected</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Clear</button>
              <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete selected</button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editing ? "Edit Quick Reply" : "New Quick Reply"}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Welcome Message" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shortcut</label>
                <input type="text" value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g. /welcome" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="Type your quick reply message..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sticker (optional)</label>
              <input ref={qrFileRef} type="file" className="hidden" accept="image/*,.webp,.gif" onChange={handleQrSticker} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => qrFileRef.current?.click()} disabled={qrUploading} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">{qrUploading ? "Uploading..." : "Upload sticker"}</button>
                {form.stickerUrl && (
                  <>
                    <img src={form.stickerUrl} alt="" className="w-12 h-12 object-contain border border-gray-200 rounded-lg" />
                    <button type="button" className="text-xs text-red-500" onClick={() => setForm(f => ({ ...f, stickerUrl: "" }))}>Remove</button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">If a sticker is set, clicking this quick reply in chat sends the sticker instantly.</p>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{editing ? "Update" : "Create"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {replies.length === 0 ? (
          <div className="md:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">No quick replies yet. Create one to use in chat.</div>
        ) : replies.map(r => (
          <div key={r._id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-2 min-w-0">
                {!r.isGlobal && <input type="checkbox" checked={selectedIds.includes(r._id)} onChange={() => toggleSelect(r._id)} className="mt-1 w-4 h-4 accent-red-500 cursor-pointer shrink-0" />}
                <h3 className="font-semibold text-gray-900">{r.title}</h3>
              </div>
              {r.shortcut && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{r.shortcut}</span>}
            </div>
            <p className="text-sm text-gray-600 mb-3 line-clamp-3">{r.message}</p>
            {r.isGlobal && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full mr-2">Global</span>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => handleEdit(r)} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
              {!r.isGlobal && <button onClick={() => handleDelete(r._id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
