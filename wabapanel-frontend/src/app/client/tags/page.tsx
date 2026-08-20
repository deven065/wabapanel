'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Edit, Tags, Hash } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import { tagApi } from '@/lib/api';
import type { Tag } from '@/types';
import toast from 'react-hot-toast';

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'];

export default function TagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [form, setForm] = useState({ name: '', color: '#10B981' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchTags = async () => {
    try { const res = await tagApi.list(); setTags(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editTag) { await tagApi.update(editTag._id, form); toast.success('Label updated'); }
      else { await tagApi.create(form); toast.success('Label created'); }
      setShowModal(false); setEditTag(null); setForm({ name: '', color: '#10B981' }); fetchTags();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this label?')) return;
    try { await tagApi.delete(id); toast.success('Deleted'); fetchTags(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = tags.length > 0 && selectedIds.length === tags.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : tags.map(t => t._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => tagApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchTags();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labels</h1>
          <p className="text-gray-500 text-sm mt-1">Label and organize contacts (products / services)</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditTag(null); setForm({ name: '', color: '#10B981' }); setShowModal(true); }}>
          Create Label
        </Button>
      </div>

      {!loading && tags.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} selected</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])}>Clear</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleBulkDelete} disabled={submitting}>Delete selected</Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : tags.length === 0 ? (
        <Card className="text-center py-12">
          <Tags className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No labels created yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tags.map((tag) => (
            <Card key={tag._id}>
              <div className="flex items-center justify-between">
                <input type="checkbox" checked={selectedIds.includes(tag._id)} onChange={() => toggleSelect(tag._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0 mr-2" />
                <button
                  type="button"
                  onClick={() => router.push(`/client/contacts?tag=${tag._id}`)}
                  className="flex items-center gap-3 text-left flex-1 min-w-0 group"
                  title="View contacts with this label"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (tag.color || '#10B981') + '20' }}>
                    <Hash className="w-4 h-4" style={{ color: tag.color || '#10B981' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate group-hover:text-emerald-600">{tag.name}</p>
                    <p className="text-xs text-gray-500">{tag.contactCount || 0} contacts</p>
                  </div>
                </button>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditTag(tag); setForm({ name: tag.name, color: tag.color }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(tag._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editTag ? 'Edit Label' : 'Create Label'} size="sm">
        <div className="space-y-4">
          <Input label="Label Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                title="Custom colour" className="w-8 h-8 p-0 border border-gray-200 rounded cursor-pointer" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editTag ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
