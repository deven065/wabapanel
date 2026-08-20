'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Page { _id: string; title: string; slug: string; content: string; isPublished: boolean; createdAt: string; }

export default function PagesPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Page | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', content: '', isPublished: true });

  const fetch = () => adminApi.getPages().then(r => setPages(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try {
      if (editItem) await adminApi.updatePage(editItem._id, form);
      else await adminApi.createPage(form);
      toast.success(editItem ? 'Updated' : 'Created'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'title', title: 'Title', render: (p: Page) => <span className="font-medium">{p.title}</span> },
    { key: 'slug', title: 'Slug', render: (p: Page) => <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">/{p.slug}</code> },
    { key: 'status', title: 'Status', render: (p: Page) => <Badge variant={p.isPublished ? 'success' : 'warning'}>{p.isPublished ? 'Published' : 'Draft'}</Badge> },
    { key: 'date', title: 'Created', render: (p: Page) => new Date(p.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (p: Page) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditItem(p); setForm({ title: p.title, slug: p.slug, content: p.content, isPublished: p.isPublished }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm('Delete?')) adminApi.deletePage(p._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Page Management</h1>
        <p className="text-sm mt-1">Manage public website pages and their content</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ title: '', slug: '', content: '', isPublished: true }); setShowModal(true); }}>Add Page</Button>
      </div>
      <Table columns={columns} data={pages} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Page' : 'Add Page'} size="lg">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: editItem ? form.slug : e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} required />
          <Input label="Slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
          <Textarea label="Content (HTML)" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={10} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublished} onChange={e => setForm({ ...form, isPublished: e.target.checked })} className="rounded text-emerald-600" />Published</label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
