'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Copy } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { shortLinkApi } from '@/lib/api';
import type { ShortLink } from '@/types';
import toast from 'react-hot-toast';

export default function ShortLinksPage() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLink, setEditLink] = useState<ShortLink | null>(null);
  const [form, setForm] = useState({ title: '', originalUrl: '', customSlug: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchLinks = async () => {
    try { const res = await shortLinkApi.list(); setLinks(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editLink) { await shortLinkApi.update(editLink._id, form); }
      else { await shortLinkApi.create(form); }
      toast.success(editLink ? 'Updated' : 'Created');
      setShowModal(false); fetchLinks();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'title', title: 'Title', render: (l: ShortLink) => (
      <div>
        <p className="font-medium text-gray-900">{l.title || 'Untitled'}</p>
        <p className="text-xs text-gray-400 truncate max-w-[200px]">{l.originalUrl}</p>
      </div>
    )},
    { key: 'short', title: 'Short URL', render: (l: ShortLink) => (
      <div className="flex items-center gap-2">
        <code className="text-sm text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/s/{l.shortCode}</code>
        <button onClick={() => { navigator.clipboard.writeText(window.location.origin + '/s/' + l.shortCode); toast.success('Link copied!'); }} className="p-1 hover:bg-emerald-50 rounded">
          <Copy className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
        </button>
      </div>
    )},
    { key: 'clicks', title: 'Clicks', render: (l: ShortLink) => <span className="font-medium">{l.clicks || 0}</span> },
    { key: 'status', title: 'Status', render: (l: ShortLink) => <Badge variant={l.isActive !== false ? 'success' : 'default'}>{l.isActive !== false ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', title: '', render: (l: ShortLink) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditLink(l); setForm({ title: l.title, originalUrl: l.originalUrl, customSlug: l.shortCode || '' }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm('Delete?')) shortLinkApi.delete(l._id).then(() => { fetchLinks(); toast.success('Link deleted'); }).catch(() => toast.error('Delete failed')); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Short Links</h1>
          <p className="text-gray-500 text-sm mt-1">Create trackable short links</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditLink(null); setForm({ title: '', originalUrl: '', customSlug: '' }); setShowModal(true); }}>Create Link</Button>
      </div>

      <Table columns={columns} data={links} loading={loading} emptyText="No short links yet" onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => shortLinkApi.delete(id).catch(() => null))); fetchLinks(); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editLink ? 'Edit Link' : 'Create Short Link'}>
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="My Link" />
          <Input label="Destination URL" value={form.originalUrl} onChange={(e) => setForm({ ...form, originalUrl: e.target.value })} placeholder="https://example.com" required />
          <Input label="Custom Slug (optional)" value={form.customSlug} onChange={(e) => setForm({ ...form, customSlug: e.target.value })} placeholder="my-link" />
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editLink ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
