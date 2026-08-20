'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Template { _id: string; name: string; body: string; sector: string; category: string; waCategory: string; status: string; }

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', body: '', sector: '', category: '', waCategory: 'MARKETING', status: 'active' });

  const fetch = () => adminApi.getTemplates().then(r => setTemplates(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try {
      if (editItem) await adminApi.updateTemplate(editItem._id, form);
      else await adminApi.createTemplate(form);
      toast.success(editItem ? 'Updated' : 'Created'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Name', render: (t: Template) => <span className="font-medium">{t.name}</span> },
    { key: 'sector', title: 'Sector', render: (t: Template) => t.sector },
    { key: 'category', title: 'Category', render: (t: Template) => t.category },
    { key: 'waCategory', title: 'WA Category', render: (t: Template) => <Badge variant="info">{t.waCategory}</Badge> },
    { key: 'status', title: 'Status', render: (t: Template) => <Badge variant={t.status === 'active' ? 'success' : 'warning'}>{t.status}</Badge> },
    { key: 'actions', title: '', render: (t: Template) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditItem(t); setForm({ name: t.name, body: t.body, sector: t.sector, category: t.category, waCategory: t.waCategory, status: t.status }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm('Delete?')) adminApi.deleteTemplate(t._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Template Management</h1>
        <p className="text-sm mt-1">Review and manage WhatsApp templates across all clients</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ name: '', body: '', sector: '', category: '', waCategory: 'MARKETING', status: 'active' }); setShowModal(true); }}>Add Template</Button>
      </div>
      <Table columns={columns} data={templates} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Template' : 'Add Template'} size="lg">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sector" value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} />
            <Input label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
          </div>
          <Select label="WA Category" value={form.waCategory} onChange={e => setForm({ ...form, waCategory: e.target.value })} options={[{ value: 'MARKETING', label: 'Marketing' }, { value: 'UTILITY', label: 'Utility' }, { value: 'AUTHENTICATION', label: 'Authentication' }]} />
          <Textarea label="Body" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={6} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
