'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Search, CreditCard, RefreshCw, Trash2, Edit } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Sub {
  _id: string;
  vendor: { _id: string; name: string; email: string; companyName?: string; phone?: string };
  plan: { _id: string; name: string; price: number; interval: string } | null;
  status: string;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  assignedBy: string;
  notes: string;
  createdAt: string;
  noSubscription?: boolean;
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSub, setEditSub] = useState<Sub | null>(null);
  const [vendors, setVendors] = useState<{_id: string; name: string; email: string}[]>([]);
  const [plans, setPlans] = useState<{_id: string; name: string; price: number; interval: string}[]>([]);
  const [form, setForm] = useState({ vendorId: '', planId: '', endDate: '', autoRenew: false, notes: '', status: 'active' });

  const fetchSubs = async () => {
    try {
      const res = await adminApi.getSubscriptions({ search, status: filter });
      setSubs(res.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  const fetchVendorsAndPlans = async () => {
    try {
      const [v, p] = await Promise.all([adminApi.getVendors({}), adminApi.getPlans()]);
      setVendors((v.data.data || []).map((x: {_id: string; name: string; email: string}) => ({ _id: x._id, name: x.name, email: x.email })));
      setPlans((p.data.data || []).map((x: {_id: string; name: string; price: number; interval: string}) => ({ _id: x._id, name: x.name, price: x.price, interval: x.interval })));
    } catch { /* */ }
  };

  useEffect(() => { fetchSubs(); }, [search, filter]);
  useEffect(() => { fetchVendorsAndPlans(); }, []);

  const handleSave = async () => {
    try {
      if (editSub) {
        await adminApi.updateSubscription(editSub._id, { status: form.status, planId: form.planId, endDate: form.endDate || null, autoRenew: form.autoRenew, notes: form.notes });
      } else {
        if (!form.vendorId || !form.planId) { toast.error('Select vendor and plan'); return; }
        await adminApi.createSubscription(form);
      }
      toast.success(editSub ? 'Updated' : 'Subscription assigned');
      setShowModal(false);
      fetchSubs();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this subscription record?')) return;
    try {
      await adminApi.deleteSubscription(id);
      toast.success('Deleted');
      fetchSubs();
    } catch { toast.error('Failed'); }
  };

  const openNew = () => {
    setEditSub(null);
    setForm({ vendorId: '', planId: '', endDate: '', autoRenew: false, notes: '', status: 'active' });
    setShowModal(true);
  };

  const openEdit = (s: Sub) => {
    setEditSub(s);
    setForm({
      vendorId: s.vendor._id, planId: s.plan?._id || '',
      endDate: s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : '',
      autoRenew: s.autoRenew, notes: s.notes, status: s.status,
    });
    setShowModal(true);
  };

  const statusColor = (s: string) => s === 'active' ? 'success' : s === 'expired' ? 'danger' : 'default';

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><CreditCard className="w-6 h-6 text-emerald-600" /> Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-1">Manage vendor plans, expiry dates, and subscription assignments</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>Assign Plan</Button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" autoComplete="off" placeholder="Search vendor..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : subs.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No subscriptions found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr><th className="px-4 py-3 text-left">Vendor</th><th className="px-4 py-3 text-left">Plan</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Start</th><th className="px-4 py-3 text-left">Expiry</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3"><p className="font-medium">{s.vendor?.name || 'N/A'}</p><p className="text-xs text-gray-400">{s.vendor?.email}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{s.plan?.name || 'N/A'}</p><p className="text-xs text-gray-400">{s.plan?.interval} - Rs.{s.plan?.price}</p></td>
                  <td className="px-4 py-3"><Badge variant={statusColor(s.status)}>{s.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {s.endDate ? (
                      <span className={new Date(s.endDate) < new Date() ? 'text-red-500 font-medium' : 'text-gray-500'}>
                        {new Date(s.endDate).toLocaleDateString()}
                        {s.autoRenew && <RefreshCw className="w-3 h-3 inline ml-1 text-emerald-500" />}
                      </span>
                    ) : <span className="text-gray-400">Lifetime</span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="default">{s.assignedBy}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {s.noSubscription ? (
                      <button onClick={() => { setEditSub(null); setForm({ vendorId: s.vendor._id, planId: '', endDate: '', autoRenew: false, notes: '', status: 'active' }); setShowModal(true); }}
                        className="px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded" title="Assign a plan to this vendor">Assign Plan</button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4 text-gray-400" /></button>
                        <button onClick={() => handleDelete(s._id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editSub ? 'Edit Subscription' : 'Assign Plan to Vendor'}>
        <div className="space-y-4">
          {!editSub && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                  <option value="">Select vendor...</option>
                  {vendors.map(v => <option key={v._id} value={v._id}>{v.name} ({v.email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                  <option value="">Select plan...</option>
                  {plans.map(p => <option key={p._id} value={p._id}>{p.name} (Rs.{p.price}/{p.interval})</option>)}
                </select>
              </div>
            </>
          )}
          {editSub && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mb-3">
                {plans.map(p => <option key={p._id} value={p._id}>{p.name} (Rs.{p.price}/{p.interval})</option>)}
              </select>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
            <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Leave empty for lifetime</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoRenew} onChange={e => setForm({ ...form, autoRenew: e.target.checked })} />
            Auto Renew
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" rows={2} placeholder="Optional notes..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editSub ? 'Update' : 'Assign Plan'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
