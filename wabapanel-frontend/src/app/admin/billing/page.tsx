'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Search, Receipt, Download, Trash2, Send, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; amount: number; }
interface SubPayment {
  _id: string; amount: number; gateway: string; status: string; createdAt: string;
  user?: { name?: string; email?: string }; plan?: { name?: string; price?: number };
}

interface Inv {
  _id: string; invoiceNumber: string; vendor: { _id: string; name: string; email: string; companyName?: string };
  items: InvoiceItem[]; subtotal: number; gstRate: number; gstAmount: number; total: number;
  status: string; dueDate: string | null; notes: string; createdAt: string;
  vendorName: string; vendorEmail: string;
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [payments, setPayments] = useState<SubPayment[]>([]);
  const [selectedPays, setSelectedPays] = useState<string[]>([]);
  const [emailing, setEmailing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [vendors, setVendors] = useState<{_id: string; name: string; email: string}[]>([]);
  const [form, setForm] = useState({ vendorId: '', gstRate: '18', dueDate: '', notes: '', items: [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }] });

  const fetchInvoices = async () => {
    try {
      const res = await adminApi.getInvoices({ search, status: filter });
      setInvoices(res.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, [search, filter]);
  useEffect(() => {
    adminApi.getPayments({ limit: 1000 }).then(res => setPayments(res.data.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    adminApi.getVendors({}).then(res => setVendors((res.data.data || []).map((x: {_id: string; name: string; email: string}) => ({ _id: x._id, name: x.name, email: x.email }))));
  }, []);

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as Record<string, unknown>)[field] = val;
    items[idx].amount = (items[idx].quantity || 1) * (items[idx].unitPrice || 0);
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unitPrice: 0, amount: 0 }] });
  const removeItem = (idx: number) => { if (form.items.length > 1) setForm({ ...form, items: form.items.filter((_, i) => i !== idx) }); };

  const subtotal = form.items.reduce((s, i) => s + (i.quantity || 1) * (i.unitPrice || 0), 0);
  const gstAmt = Math.round(subtotal * parseFloat(form.gstRate || '0') / 100 * 100) / 100;

  const handleCreate = async () => {
    if (!form.vendorId) { toast.error('Select vendor'); return; }
    if (!form.items[0]?.description) { toast.error('Add at least one item'); return; }
    try {
      const items = form.items.map(i => ({ ...i, amount: (i.quantity || 1) * i.unitPrice }));
      await adminApi.createInvoice({ vendorId: form.vendorId, items, gstRate: parseFloat(form.gstRate), dueDate: form.dueDate || null, notes: form.notes });
      toast.success('Invoice created');
      setShowModal(false);
      fetchInvoices();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const markStatus = async (id: string, status: string) => {
    try {
      await adminApi.updateInvoice(id, { status, ...(status === 'paid' ? { paidAt: new Date() } : {}) });
      toast.success('Status updated');
      fetchInvoices();
    } catch { toast.error('Failed'); }
  };

  const viewPdf = async (id: string) => {
    try {
      const res = await adminApi.getInvoicePdf(id);
      const w = window.open('', '_blank');
      if (w) { w.document.write(res.data); w.document.close(); }
    } catch { toast.error('Failed to load invoice'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    try { await adminApi.deleteInvoice(id); toast.success('Deleted'); fetchInvoices(); } catch { toast.error('Failed'); }
  };

  const downloadPaymentInvoice = async (id: string) => {
    try {
      const res = await adminApi.getPaymentInvoice(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${id.slice(-8).toUpperCase()}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download invoice'); }
  };

  const emailPaymentInvoicesNow = async (ids: string[]) => {
    if (ids.length === 0) { toast.error('Select at least one payment'); return; }
    setEmailing(true);
    try {
      const res = await adminApi.emailPaymentInvoices(ids);
      const { sent, errors } = res.data;
      if (sent > 0) toast.success(`Emailed ${sent} invoice${sent > 1 ? 's' : ''}`);
      if (errors?.length) toast.error(errors[0]);
      setSelectedPays([]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to send emails');
    }
    setEmailing(false);
  };

  const togglePay = (id: string) => setSelectedPays(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const statusColor = (s: string) => s === 'paid' ? 'success' : s === 'sent' ? 'info' : s === 'cancelled' ? 'danger' : 'default';

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
    + payments.filter(p => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = invoices.filter(i => ['draft', 'sent'].includes(i.status)).reduce((s, i) => s + i.total, 0)
    + payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-600" /> Billing & Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Create invoices, track revenue, download PDF</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ vendorId: '', gstRate: '18', dueDate: '', notes: '', items: [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }] }); setShowModal(true); }}>Create Invoice</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Total Revenue (Paid)</p><p className="text-2xl font-bold text-emerald-600">Rs.{totalRevenue.toLocaleString()}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Pending Amount</p><p className="text-2xl font-bold text-orange-500">Rs.{totalPending.toLocaleString()}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Total Invoices</p><p className="text-2xl font-bold text-gray-700">{invoices.length + payments.length}</p></div>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" autoComplete="off" placeholder="Search invoice or vendor..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Subscription & Plan Payments</h2>
            <p className="text-xs text-gray-400">Plan purchases and top-ups made by vendors</p>
          </div>
          {selectedPays.length > 0 && (
            <Button size="sm" icon={<Send className="w-3.5 h-3.5" />} disabled={emailing} onClick={() => emailPaymentInvoicesNow(selectedPays)}>
              {emailing ? 'Sending...' : `Send Email (${selectedPays.length})`}
            </Button>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No payments yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3"><input type="checkbox" checked={payments.length > 0 && selectedPays.length === payments.length} onChange={e => setSelectedPays(e.target.checked ? payments.map(p => p._id) : [])} /></th>
                <th className="px-4 py-3 text-left">Invoice</th><th className="px-4 py-3 text-left">Vendor</th><th className="px-4 py-3 text-left">Plan</th><th className="px-4 py-3 text-left">Amount</th><th className="px-4 py-3 text-left">Gateway</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedPays.includes(p._id)} onChange={() => togglePay(p._id)} /></td>
                  <td className="px-4 py-3 font-medium">INV-{p._id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-3"><p className="font-medium">{p.user?.name || '-'}</p><p className="text-xs text-gray-400">{p.user?.email || ''}</p></td>
                  <td className="px-4 py-3">{p.plan?.name || '-'}</td>
                  <td className="px-4 py-3 font-bold">Rs.{(p.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize text-gray-500">{p.gateway || '-'}</td>
                  <td className="px-4 py-3"><Badge variant={p.status === 'completed' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'}>{p.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => downloadPaymentInvoice(p._id)} className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium" title="Download PDF invoice"><Download className="w-3.5 h-3.5" /> Download</button>
                      <button onClick={() => emailPaymentInvoicesNow([p._id])} disabled={emailing} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50" title="Email invoice to vendor"><Send className="w-3.5 h-3.5" /> Email</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : invoices.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No manual invoices yet — use &quot;Create Invoice&quot; to bill a vendor</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr><th className="px-4 py-3 text-left">Invoice</th><th className="px-4 py-3 text-left">Vendor</th><th className="px-4 py-3 text-left">Amount</th><th className="px-4 py-3 text-left">GST</th><th className="px-4 py-3 text-left">Total</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3"><p className="font-medium">{inv.vendorName}</p><p className="text-xs text-gray-400">{inv.vendorEmail}</p></td>
                  <td className="px-4 py-3">Rs.{inv.subtotal?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">Rs.{inv.gstAmount?.toLocaleString()} ({inv.gstRate}%)</td>
                  <td className="px-4 py-3 font-bold">Rs.{inv.total?.toLocaleString()}</td>
                  <td className="px-4 py-3"><Badge variant={statusColor(inv.status)}>{inv.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => viewPdf(inv._id)} className="p-1.5 hover:bg-gray-100 rounded" title="View/Print"><Eye className="w-4 h-4 text-blue-500" /></button>
                    {inv.status === 'draft' && <button onClick={() => markStatus(inv._id, 'sent')} className="p-1.5 hover:bg-gray-100 rounded" title="Mark Sent"><Send className="w-4 h-4 text-emerald-500" /></button>}
                    {['draft', 'sent'].includes(inv.status) && <button onClick={() => markStatus(inv._id, 'paid')} className="p-1.5 hover:bg-gray-100 rounded" title="Mark Paid"><Download className="w-4 h-4 text-green-500" /></button>}
                    <button onClick={() => handleDelete(inv._id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Invoice">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v._id} value={v._id}>{v.name} ({v.email})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Items</label>
            {form.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                <input className="col-span-5 px-2 py-1.5 rounded border text-sm" placeholder="Description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                <input className="col-span-2 px-2 py-1.5 rounded border text-sm" type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                <input className="col-span-3 px-2 py-1.5 rounded border text-sm" type="number" placeholder="Price" value={item.unitPrice || ''} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                <div className="col-span-1 flex items-center justify-center text-sm text-gray-500">Rs.{item.amount || 0}</div>
                <button onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 text-xs">X</button>
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-emerald-600 hover:underline">+ Add Item</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
              <input type="number" value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between"><span>Subtotal:</span><span className="font-medium">Rs.{subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-gray-500"><span>GST ({form.gstRate}%):</span><span>Rs.{gstAmt.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold text-lg border-t mt-2 pt-2"><span>Total:</span><span className="text-emerald-600">Rs.{(subtotal + gstAmt).toLocaleString()}</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Invoice</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
