'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Currency { _id: string; name: string; code: string; symbol: string; rate?: number; isActive?: boolean; isDefault: boolean; }

const empty = { name: '', code: '', symbol: '', rate: '0', isActive: true, isDefault: false };

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  const fetch = () => adminApi.getCurrencies().then(r => setCurrencies(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setEditId(null); setForm({ ...empty }); setShowModal(true); };
  const openEdit = (c: Currency) => {
    setEditId(c._id);
    setForm({ name: c.name || '', code: c.code || '', symbol: c.symbol || '', rate: String(c.rate ?? 0), isActive: c.isActive !== false, isDefault: !!c.isDefault });
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = { name: form.name, code: form.code.toUpperCase(), symbol: form.symbol, rate: parseFloat(form.rate) || 0, isActive: form.isActive, isDefault: form.isDefault };
    try {
      if (editId) await adminApi.updateCurrency(editId, payload);
      else await adminApi.createCurrency(payload);
      toast.success('Saved'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); }
  };

  const seedAll = async () => {
    if (!confirm('Add all standard world currencies? Existing ones are kept unchanged.')) return;
    setSeeding(true);
    try { const r = await adminApi.seedCurrencies(); toast.success(`Added ${r.data.added ?? 0} currencies`); fetch(); }
    catch { toast.error('Failed to add currencies'); }
    finally { setSeeding(false); }
  };

  const toggleActive = async (c: Currency) => {
    try { await adminApi.updateCurrency(c._id, { isActive: c.isActive === false }); fetch(); } catch { toast.error('Failed'); }
  };
  const makeDefault = async (c: Currency) => {
    try { await adminApi.updateCurrency(c._id, { isDefault: true }); fetch(); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Currency', render: (c: Currency) => <span className="font-medium">{c.name}</span> },
    { key: 'code', title: 'Code', render: (c: Currency) => <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">{c.code}</code> },
    { key: 'symbol', title: 'Symbol', render: (c: Currency) => c.symbol },
    { key: 'rate', title: 'Rate / 1 base', render: (c: Currency) => <span className="text-sm text-gray-600">{c.rate ? c.rate : '—'}</span> },
    { key: 'active', title: 'Status', render: (c: Currency) => (
      <button onClick={() => toggleActive(c)}>{c.isActive === false ? <Badge variant="default">Inactive</Badge> : <Badge variant="success">Active</Badge>}</button>
    )},
    { key: 'default', title: 'Default', render: (c: Currency) => c.isDefault ? <Badge variant="success">Default</Badge> : <button onClick={() => makeDefault(c)} className="text-xs text-emerald-600 hover:underline">Set default</button> },
    { key: 'actions', title: '', render: (c: Currency) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(c)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm('Delete?')) adminApi.deleteCurrency(c._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Currency Options</h1>
          <p className="text-sm mt-1">Currencies available for plans and billing. &ldquo;Rate / 1 base&rdquo; is used only for exchange-rate priced plans.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={seedAll} loading={seeding}>Add all currencies</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add Currency</Button>
        </div>
      </div>
      <Table columns={columns} data={currencies} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Currency' : 'Add Currency'}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Indian Rupee" required />
          <Input label="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="INR" required />
          <Input label="Symbol" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} placeholder="₹" required />
          <Input label="Exchange rate (units per 1 base currency)" type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder="0.012" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="rounded text-emerald-600" />Active (available at checkout)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} className="rounded text-emerald-600" />Set as default (base) currency</label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>{editId ? 'Save' : 'Add'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
