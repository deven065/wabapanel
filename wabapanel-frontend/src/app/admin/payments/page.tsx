'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Check, X, ExternalLink, Download } from 'lucide-react';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatCard } from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Payment {
  _id: string; user: { name: string; email: string }; plan: { name: string }; amount: number;
  gateway: string; status: string; type: string; transactionId: string; createdAt: string;
  manualReference?: string; manualProofUrl?: string; description?: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pending, setPending] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState('all');

  const load = useCallback(() => {
    adminApi.getPayments().then(r => setPayments(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
    adminApi.getPayments({ gateway: 'manual', status: 'pending' }).then(r => setPending(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setActing(id);
    try {
      await adminApi.approvePayment(id);
      toast.success('Payment approved & credited');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Approve failed');
    }
    setActing(null);
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Reject reason (optional):') || '';
    setActing(id);
    try {
      await adminApi.rejectPayment(id, reason);
      toast.success('Payment rejected');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Reject failed');
    }
    setActing(null);
  };

  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((a, p) => a + p.amount, 0);

  const customers = Array.from(new Map(payments.filter(p => p.user?.email).map(p => [p.user.email, p.user])).values());
  const visiblePayments = customerFilter === 'all' ? payments : payments.filter(p => p.user?.email === customerFilter);

  const downloadInvoice = async (p: Payment) => {
    try {
      const res = await adminApi.getPaymentInvoice(p._id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${p._id.slice(-8).toUpperCase()}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download invoice'); }
  };

  const columns = [
    { key: 'user', title: 'User', render: (p: Payment) => (
      <div><p className="font-medium text-sm">{p.user?.name}</p><p className="text-xs text-gray-400">{p.user?.email}</p></div>
    )},
    { key: 'plan', title: 'Plan', render: (p: Payment) => p.plan?.name || (p.type === 'wallet_topup' ? 'Wallet Top-up' : '-') },
    { key: 'amount', title: 'Amount', render: (p: Payment) => `₹${p.amount.toLocaleString()}` },
    { key: 'gateway', title: 'Gateway', render: (p: Payment) => <Badge variant="info">{p.gateway}</Badge> },
    { key: 'status', title: 'Status', render: (p: Payment) => (
      <Badge variant={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}>{p.status}</Badge>
    )},
    { key: 'txn', title: 'Transaction ID', render: (p: Payment) => <code className="text-xs">{p.manualReference || p.transactionId || '-'}</code> },
    { key: 'date', title: 'Date', render: (p: Payment) => new Date(p.createdAt).toLocaleDateString() },
    { key: 'invoice', title: 'Invoice', render: (p: Payment) => (
      <button onClick={() => downloadInvoice(p)} className="p-1.5 hover:bg-emerald-50 rounded" title="Download invoice">
        <Download className="w-4 h-4 text-emerald-600" />
      </button>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
      </div>
      <p className="text-sm mt-1">All payments received from clients across the platform</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Revenue" value={`₹${totalRevenue.toLocaleString()}`} icon={<CreditCard className="w-5 h-5" />} color="emerald" />
        <StatCard title="Total Transactions" value={payments.length} icon={<CreditCard className="w-5 h-5" />} color="blue" />
        <StatCard title="Pending Approvals" value={pending.length} icon={<CreditCard className="w-5 h-5" />} color="purple" />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pending Manual Approvals</h2>
          <Badge variant="warning">{pending.length} pending</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No manual payment requests waiting for approval.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p._id} className="border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">{p.user?.name} <span className="text-gray-400 font-normal">({p.user?.email})</span></p>
                  <p className="text-sm text-gray-600 mt-1">
                    {p.type === 'wallet_topup' ? 'Wallet Top-up' : `Plan: ${p.plan?.name || '-'}`} · <span className="font-semibold">₹{p.amount.toLocaleString()}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Txn/UTR: <code className="text-gray-700">{p.manualReference || '— not provided —'}</code></p>
                  <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                {p.manualProofUrl ? (
                  <a href={p.manualProofUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.manualProofUrl} alt="proof" className="w-16 h-16 object-cover border rounded-lg" />
                  </a>
                ) : (
                  <span className="text-xs text-gray-300 shrink-0">No proof</span>
                )}
                <div className="flex items-center gap-2 shrink-0">
                  {p.manualProofUrl && (
                    <a href={p.manualProofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1"><ExternalLink className="w-3 h-3" />View</a>
                  )}
                  <Button size="sm" onClick={() => approve(p._id)} loading={acting === p._id} icon={<Check className="w-4 h-4" />}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(p._id)} loading={acting === p._id} icon={<X className="w-4 h-4" />}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">All Payments</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Customer:</label>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="all">All customers</option>
              {customers.map(u => <option key={u.email} value={u.email}>{u.name} ({u.email})</option>)}
            </select>
          </div>
        </div>
        <Table columns={columns} data={visiblePayments} loading={loading} emptyText="No payments recorded" />
      </Card>
    </div>
  );
}
