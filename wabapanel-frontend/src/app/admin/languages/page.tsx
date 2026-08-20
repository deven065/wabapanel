'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Language { _id: string; name: string; code: string; nativeName: string; isDefault: boolean; isActive: boolean; }

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', nativeName: '', isDefault: false });

  const fetch = () => adminApi.getLanguages().then(r => setLanguages(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try { await adminApi.createLanguage(form); toast.success('Added'); setShowModal(false); fetch(); } catch { toast.error('Failed'); }
  };

  const seedAll = async () => {
    if (!confirm('Add all standard languages? Existing ones are kept unchanged.')) return;
    setSeeding(true);
    try { const r = await adminApi.seedLanguages(); toast.success(`Added ${r.data.added ?? 0} languages`); fetch(); }
    catch { toast.error('Failed to add languages'); }
    finally { setSeeding(false); }
  };

  const columns = [
    { key: 'name', title: 'Language', render: (l: Language) => <span className="font-medium">{l.name}</span> },
    { key: 'code', title: 'Code', render: (l: Language) => <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{l.code}</code> },
    { key: 'native', title: 'Native', render: (l: Language) => l.nativeName },
    { key: 'default', title: 'Default', render: (l: Language) => l.isDefault ? <Badge variant="success">Default</Badge> : null },
    { key: 'actions', title: '', render: (l: Language) => (
      <button onClick={() => { if (confirm('Delete?')) adminApi.deleteLanguage(l._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Language Library</h1>
        <p className="text-sm mt-1">Languages available across the platform. Menu/navigation is translated for supported languages; others fall back to English until translated.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={seedAll} loading={seeding}>Add all languages</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Language</Button>
        </div>
      </div>
      <Table columns={columns} data={languages} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Language">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="English" required />
          <Input label="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="en" required />
          <Input label="Native Name" value={form.nativeName} onChange={e => setForm({ ...form, nativeName: e.target.value })} placeholder="English" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} className="rounded text-emerald-600" />Set as default</label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Add</Button></div>
        </div>
      </Modal>
    </div>
  );
}
