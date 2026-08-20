'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Tax { _id: string; name: string; rate: number; type: string; isActive: boolean; }

const currencySymbol = (cur: string) => cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'AED' ? 'AED ' : cur === 'INR' ? '₹' : (cur ? cur + ' ' : '');

export default function TaxesPage() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', rate: '', type: 'percentage', isActive: true });

  const fetch = () => adminApi.getTaxes().then(r => { setTaxes(r.data.data || []); if (r.data.currency) setCurrency(r.data.currency); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const sym = currencySymbol(currency);

  const handleSave = async () => {
    try { await adminApi.createTax({ ...form, rate: Number(form.rate) }); toast.success('Added'); setShowModal(false); fetch(); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Tax Name', render: (t: Tax) => <span className="font-medium">{t.name}</span> },
    { key: 'rate', title: 'Rate', render: (t: Tax) => t.type === 'fixed' ? `${sym}${t.rate}` : `${t.rate}%` },
    { key: 'type', title: 'Type', render: (t: Tax) => <Badge variant={t.type === 'fixed' ? 'default' : 'info'}>{t.type === 'fixed' ? 'Fixed' : 'Percentage'}</Badge> },
    { key: 'status', title: 'Status', render: (t: Tax) => <Badge variant={t.isActive ? 'success' : 'warning'}>{t.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', title: '', render: (t: Tax) => (
      <button onClick={() => { if (confirm('Delete?')) adminApi.deleteTax(t._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Tax Configuration</h1>
        <p className="text-sm mt-1">Tax rates applied to invoices and plan charges · Currency: <b>{currency}</b> ({sym.trim()})</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Tax</Button>
      </div>
      <Table columns={columns} data={taxes} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Tax">
        <div className="space-y-4">
          <Input label="Tax Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="GST" required />
          <Input label={form.type === 'fixed' ? `Amount (${sym.trim() || currency})` : 'Rate (%)'} type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder={form.type === 'fixed' ? '100' : '18'} required />
          <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} options={[{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: `Fixed Amount (${sym.trim() || currency})` }]} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Add</Button></div>
        </div>
      </Modal>
    </div>
  );
}
