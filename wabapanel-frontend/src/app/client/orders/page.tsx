'use client';
import React, { useState, useEffect } from 'react';
import { ShoppingCart, Eye, Package, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';
import { orderApi } from '@/lib/api';

interface OrderItem { name: string; price: number; quantity: number; currency?: string; }
interface ShippingAddress { name?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string; country?: string; }
interface Order {
  _id: string;
  orderNumber: string;
  contact?: { name?: string; phone?: string };
  items: OrderItem[];
  totalAmount: number;
  currency?: string;
  status: string;
  paymentStatus: string;
  source?: string;
  shippingAddress?: ShippingAddress;
  notes?: string;
  createdAt: string;
}

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

const money = (p?: number, cur?: string) => {
  const v = p || 0;
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'INR' ? '₹' : '';
  return sym ? `${sym}${v.toLocaleString()}` : `${cur || ''} ${v.toLocaleString()}`.trim();
};

export default function OrdersPage() {
  const { currentWorkspace } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState('all');
  const [editStatus, setEditStatus] = useState('');
  const [editPayment, setEditPayment] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOrders = () => {
    if (!currentWorkspace) return;
    setLoading(true);
    orderApi.getOrders().then(r => setOrders(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetchOrders(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentWorkspace]);

  const openOrder = (o: Order) => { setSelected(o); setEditStatus(o.status); setEditPayment(o.paymentStatus); };

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await orderApi.updateOrder(selected._id, { status: editStatus, paymentStatus: editPayment });
      setOrders(prev => prev.map(o => o._id === selected._id ? { ...o, status: editStatus, paymentStatus: editPayment } : o));
      setSelected(null);
    } catch { /* keep modal open on failure */ }
    setSaving(false);
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const statusColor = (s: string) => ({ pending: 'warning', confirmed: 'info', processing: 'info', shipped: 'info', delivered: 'success', cancelled: 'danger', refunded: 'danger' }[s] || 'default') as 'warning' | 'info' | 'success' | 'danger' | 'default';

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    revenue: orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.totalAmount || 0), 0),
  };
  const revenueCur = orders.find(o => o.currency)?.currency || 'INR';

  const columns = [
    { key: 'orderNumber', title: 'Order', render: (o: Order) => <span className="font-medium text-sm">#{o.orderNumber}</span> },
    { key: 'contact', title: 'Customer', render: (o: Order) => <div><p className="font-medium text-sm">{o.contact?.name || o.shippingAddress?.name || 'N/A'}</p><p className="text-xs text-gray-400">{o.contact?.phone || o.shippingAddress?.phone}</p></div> },
    { key: 'items', title: 'Items', render: (o: Order) => <span className="text-sm">{o.items?.reduce((n, i) => n + (i.quantity || 1), 0) || 0}</span> },
    { key: 'total', title: 'Total', render: (o: Order) => <span className="font-semibold">{money(o.totalAmount, o.currency)}</span> },
    { key: 'status', title: 'Status', render: (o: Order) => <Badge variant={statusColor(o.status)}>{o.status}</Badge> },
    { key: 'payment', title: 'Payment', render: (o: Order) => <Badge variant={o.paymentStatus === 'paid' ? 'success' : o.paymentStatus === 'refunded' ? 'danger' : 'warning'}>{o.paymentStatus}</Badge> },
    { key: 'date', title: 'Date', render: (o: Order) => <span className="text-sm text-gray-500">{new Date(o.createdAt).toLocaleString()}</span> },
    { key: 'actions', title: '', render: (o: Order) => <button onClick={() => openOrder(o)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-gray-400" /></button> },
  ];

  const addr = selected?.shippingAddress;
  const hasAddr = addr && (addr.address || addr.city || addr.pincode);

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Orders" value={stats.total} icon={<ShoppingCart className="w-5 h-5" />} color="blue" />
        <StatCard title="Pending" value={stats.pending} icon={<Package className="w-5 h-5" />} color="yellow" />
        <StatCard title="Delivered" value={stats.delivered} icon={<Truck className="w-5 h-5" />} color="green" />
        <StatCard title="Paid Revenue" value={money(stats.revenue, revenueCur)} icon={<ShoppingCart className="w-5 h-5" />} color="emerald" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {['all', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${filter === s ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
        ))}
      </div>
      <Table
        columns={columns}
        data={filtered}
        loading={loading}
        onBulkDelete={async (ids) => {
          await Promise.all(ids.map((id) => orderApi.deleteOrder(id).catch(() => null)));
          fetchOrders();
        }}
      />

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`Order #${selected?.orderNumber || ''}`} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{selected.contact?.name || selected.shippingAddress?.name || 'N/A'}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{selected.contact?.phone || selected.shippingAddress?.phone || '-'}</span></div>
              <div><span className="text-gray-500">Placed:</span> <span className="font-medium">{new Date(selected.createdAt).toLocaleString()}</span></div>
              <div><span className="text-gray-500">Source:</span> <span className="font-medium capitalize">{selected.source || 'manual'}</span></div>
            </div>

            {hasAddr && (
              <div className="text-sm">
                <h4 className="font-medium mb-1 text-gray-700">Shipping address</h4>
                <p className="text-gray-600">
                  {[addr?.address, addr?.city, addr?.state, addr?.pincode, addr?.country].filter(Boolean).join(', ')}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2 text-gray-700">Items</h4>
              <div className="bg-gray-50 rounded-lg divide-y">
                {selected.items?.map((item, i) => (
                  <div key={i} className="p-3 flex justify-between text-sm">
                    <span>{item.name} <span className="text-gray-400">× {item.quantity}</span></span>
                    <span className="font-medium">{money((item.price || 0) * (item.quantity || 1), item.currency || selected.currency)}</span>
                  </div>
                ))}
                <div className="p-3 flex justify-between font-semibold"><span>Total</span><span>{money(selected.totalAmount, selected.currency)}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Order status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm capitalize">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment status</label>
                <select value={editPayment} onChange={e => setEditPayment(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm capitalize">
                  {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Status badalne par customer ko WhatsApp update jaata hai (agar order notifications ON hain).</p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button onClick={save} disabled={saving || (editStatus === selected.status && editPayment === selected.paymentStatus)}>
                {saving ? 'Saving...' : 'Update order'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
