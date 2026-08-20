'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Ban, CheckCircle, LogIn, Store, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Textarea from '@/components/ui/Textarea';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Vendor {
  _id: string; name: string; email: string; phone: string; status: string;
  companyName: string; website: string; address: string; gstNumber: string; vendorNotes: string;
  plan?: { name: string }; createdAt: string; lastLogin?: string; walletBillingExempt?: boolean; showRateCard?: boolean;
  messages30d?: number; walletBalance?: number; totalSpend?: number;
  walletTemplateRates?: { marketing?: number | null; utility?: number | null; authentication?: number | null };
}

const emptyForm = {
  name: '', email: '', password: '', phone: '', companyName: '', website: '',
  address: '', gstNumber: '', vendorNotes: '', status: 'active', walletBillingExempt: true, showRateCard: true,
  rateMarketing: '', rateUtility: '', rateAuthentication: '',
};

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchVendors = async () => {
    try {
      const res = await adminApi.getVendors({ search, page, limit: 20 });
      setVendors(res.data.data || []);
      const pg = res.data.pagination || {};
      setPages(pg.pages || 1);
      setTotal(pg.total || 0);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchVendors(); }, [search, page]);

  const handleSave = async () => {
    try {
      if (editVendor) {
        const { rateMarketing, rateUtility, rateAuthentication, ...rest } = form;
        const updateData: Record<string, unknown> = { ...rest };
        if (!updateData.password) delete updateData.password;
        updateData.walletTemplateRates = {
          marketing: rateMarketing === '' ? null : parseFloat(rateMarketing),
          utility: rateUtility === '' ? null : parseFloat(rateUtility),
          authentication: rateAuthentication === '' ? null : parseFloat(rateAuthentication),
        };
        await adminApi.updateVendor(editVendor._id, updateData);
      } else {
        if (!form.password) { toast.error('Password is required'); return; }
        await adminApi.createVendor(form);
      }
      toast.success(editVendor ? 'Vendor updated' : 'Vendor created');
      setShowModal(false);
      fetchVendors();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleToggleStatus = async (vendorId: string, current: string) => {
    const newStatus = current === 'active' ? 'suspended' : 'active';
    try {
      await adminApi.updateVendor(vendorId, { status: newStatus });
      toast.success('Status updated');
      fetchVendors();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor? This cannot be undone.')) return;
    try {
      await adminApi.deleteVendor(id);
      toast.success('Vendor deleted');
      fetchVendors();
    } catch { toast.error('Failed'); }
  };

  const handleLoginAs = async (vendor: Vendor) => {
    try {
      const res = await adminApi.loginAsVendor(vendor._id);
      const { token, user } = res.data.data;
      // Open vendor's client panel in new tab with token
      const url = `/auth/login?token=${token}&name=${encodeURIComponent(user.name)}`;
      window.open(url, '_blank');
      toast.success(`Logged in as ${vendor.name}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to login as vendor');
    }
  };

  const openEdit = (v: Vendor) => {
    setEditVendor(v);
    setForm({
      name: v.name, email: v.email, password: '', phone: v.phone || '',
      companyName: v.companyName || '', website: v.website || '',
      address: v.address || '', gstNumber: v.gstNumber || '',
      vendorNotes: v.vendorNotes || '', status: v.status, walletBillingExempt: v.walletBillingExempt || false, showRateCard: v.showRateCard !== false,
      rateMarketing: v.walletTemplateRates?.marketing != null ? String(v.walletTemplateRates.marketing) : '',
      rateUtility: v.walletTemplateRates?.utility != null ? String(v.walletTemplateRates.utility) : '',
      rateAuthentication: v.walletTemplateRates?.authentication != null ? String(v.walletTemplateRates.authentication) : '',
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditVendor(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const columns = [
    { key: 'vendor', title: 'Vendor', render: (v: Vendor) => (
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-xs font-semibold text-purple-600">
          <Store className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium text-sm">{v.name}</p>
          <p className="text-xs text-gray-400">{v.email}</p>
        </div>
      </div>
    )},
    { key: 'company', title: 'Company', render: (v: Vendor) => (
      <div>
        <p className="text-sm">{v.companyName || '-'}</p>
        {v.phone && <p className="text-xs text-gray-400">{v.phone}</p>}
      </div>
    )},
    { key: 'plan', title: 'Plan', render: (v: Vendor) => v.plan?.name || 'Free' },
    { key: 'status', title: 'Status', render: (v: Vendor) => (
      <Badge variant={v.status === 'active' ? 'success' : v.status === 'suspended' ? 'danger' : 'default'}>{v.status}</Badge>
    )},
    { key: 'usage', title: 'Messages (30d)', render: (v: Vendor) => (v.messages30d ?? 0).toLocaleString() },
    { key: 'wallet', title: 'Wallet', render: (v: Vendor) => `\u20B9${(v.walletBalance || 0).toLocaleString()}` },
    { key: 'spend', title: 'Total Spend', render: (v: Vendor) => `\u20B9${(v.totalSpend || 0).toLocaleString()}` },
    { key: 'last', title: 'Last Login', render: (v: Vendor) => v.lastLogin ? new Date(v.lastLogin).toLocaleDateString() : '—' },
    { key: 'date', title: 'Joined', render: (v: Vendor) => {
      const days = Math.floor((Date.now() - new Date(v.createdAt).getTime()) / 86400000);
      return <div><p className="text-sm">{new Date(v.createdAt).toLocaleDateString()}</p><p className="text-xs text-gray-400">{days} day{days === 1 ? '' : 's'} ago</p></div>;
    } },
    { key: 'actions', title: '', render: (v: Vendor) => (
      <div className="flex gap-1">
        <button onClick={() => router.push(`/admin/vendors/${v._id}`)} className="p-1.5 hover:bg-blue-50 rounded" title="View Details">
          <Eye className="w-4 h-4 text-blue-500" />
        </button>
        <button onClick={() => handleLoginAs(v)} className="p-1.5 hover:bg-emerald-50 rounded" title="Login as this Vendor">
          <LogIn className="w-4 h-4 text-emerald-500" />
        </button>
        <button onClick={() => openEdit(v)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit">
          <Edit className="w-4 h-4 text-gray-400" />
        </button>
        <button onClick={() => handleToggleStatus(v._id, v.status)} className="p-1.5 hover:bg-gray-100 rounded" title={v.status === 'active' ? 'Suspend' : 'Activate'}>
          {v.status === 'active' ? <Ban className="w-4 h-4 text-yellow-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
        </button>
        <button onClick={() => handleDelete(v._id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete">
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">Manage vendor accounts separately from regular users</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>Add Vendor</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" autoComplete="off" placeholder="Search vendors by name, email or company..." value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <Table columns={columns} data={vendors} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => adminApi.deleteVendor(id).catch(() => null))); fetchVendors(); }} />

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing page {page} of {pages} &middot; {total} vendors total
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span className="text-sm font-medium text-gray-700">{page} / {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</Button>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editVendor ? 'Edit Vendor' : 'Add Vendor'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91..." />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editVendor} />
          <Input label={editVendor ? 'New Password (leave blank to keep)' : 'Password'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editVendor} />
          <hr className="border-gray-200" />
          <Input label="Company Name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
          <Input label="GST Number" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Notes" value={form.vendorNotes} onChange={(e) => setForm({ ...form, vendorNotes: e.target.value })} />
          {editVendor && (
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'inactive', label: 'Inactive' }]} />
          )}
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 p-2 bg-amber-50 rounded border border-amber-200">
            <input type="checkbox" checked={form.walletBillingExempt} onChange={(e) => setForm({ ...form, walletBillingExempt: e.target.checked })} />
            No Wallet / Unlimited (no wallet deduction for this customer&apos;s messages)
          </label>
          {!form.walletBillingExempt && (
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 p-2 bg-emerald-50 rounded border border-emerald-200">
              <input type="checkbox" checked={form.showRateCard} onChange={(e) => setForm({ ...form, showRateCard: e.target.checked })} />
              Show Message Rate Card on this customer&apos;s dashboard
            </label>
          )}
          {editVendor && !form.walletBillingExempt && (
            <div className="p-3 bg-blue-50 rounded border border-blue-200 space-y-2">
              <p className="text-sm font-medium text-gray-700">Custom Template Rates (₹) — separate rates for this vendor. Leave blank to use global rates.</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Marketing" type="number" step="0.01" placeholder="Global" value={form.rateMarketing} onChange={(e) => setForm({ ...form, rateMarketing: e.target.value })} />
                <Input label="Utility" type="number" step="0.01" placeholder="Global" value={form.rateUtility} onChange={(e) => setForm({ ...form, rateUtility: e.target.value })} />
                <Input label="Authentication" type="number" step="0.01" placeholder="Global" value={form.rateAuthentication} onChange={(e) => setForm({ ...form, rateAuthentication: e.target.value })} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editVendor ? 'Update' : 'Create Vendor'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
