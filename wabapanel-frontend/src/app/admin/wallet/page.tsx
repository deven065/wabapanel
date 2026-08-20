'use client';
import React, { useState, useEffect } from 'react';
import { Plus, DollarSign } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface WalletEntry { _id: string; user: { name: string; email: string }; type: string; amount: number; balance: number; description: string; createdAt: string; }
interface MetaPricing { _id: string; countryName: string; countryCode: string; category: string; baseRate: number; markup: number; finalRate?: number; }
interface VendorRate { _id: string; name: string; email: string; walletBalance?: number; totalSpend?: number; walletBillingExempt?: boolean; walletTemplateRates?: { marketing?: number | null; utility?: number | null; authentication?: number | null } }
interface VendorRateForm { marketing: string; utility: string; authentication: string; exempt: boolean }

export default function WalletPage() {
  const [ledger, setLedger] = useState<WalletEntry[]>([]);
  const [pricing, setPricing] = useState<MetaPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: '', amount: '', type: 'credit', description: '' });
  const [showPricing, setShowPricing] = useState(false);
  const [pricingForm, setPricingForm] = useState({ countryName: '', countryCode: '', category: 'marketing', baseRate: '', markup: '15' });
  const [billing, setBilling] = useState({ enabled: true, marketing: '0', utility: '0', authentication: '0' });
  const [savingBilling, setSavingBilling] = useState(false);
  const [vendors, setVendors] = useState<VendorRate[]>([]);
  const [vendorForms, setVendorForms] = useState<Record<string, VendorRateForm>>({});
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState('all');

  useEffect(() => {
    Promise.all([adminApi.getWalletLedger(), adminApi.getMetaPricing(), adminApi.getSettings(), adminApi.getVendors({})])
      .then(([wRes, pRes, sRes, vRes]) => {
        setLedger(wRes.data.data || []); setPricing(pRes.data.data || []);
        const w = sRes.data?.data?.wallet;
        if (w) setBilling({ enabled: w.enabled !== false, marketing: String(w.templateRates?.marketing ?? '0'), utility: String(w.templateRates?.utility ?? '0'), authentication: String(w.templateRates?.authentication ?? '0') });
        const vs: VendorRate[] = vRes.data.data || [];
        setVendors(vs);
        const forms: Record<string, VendorRateForm> = {};
        vs.forEach(v => { forms[v._id] = {
          marketing: v.walletTemplateRates?.marketing != null ? String(v.walletTemplateRates.marketing) : '',
          utility: v.walletTemplateRates?.utility != null ? String(v.walletTemplateRates.utility) : '',
          authentication: v.walletTemplateRates?.authentication != null ? String(v.walletTemplateRates.authentication) : '',
          exempt: !!v.walletBillingExempt,
        }; });
        setVendorForms(forms);
      })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAdjust = async () => {
    try {
      await adminApi.adjustWallet({ ...adjustForm, amount: parseFloat(adjustForm.amount) });
      toast.success('Balance adjusted');
      setShowAdjust(false);
      setAdjustForm({ userId: '', amount: '', type: 'credit', description: '' });
      adminApi.getWalletLedger().then(r => setLedger(r.data.data || []));
      adminApi.getVendors({}).then(r => setVendors(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleSavePricing = async () => {
    try {
      await adminApi.updateMetaPricing({ ...pricingForm, baseRate: parseFloat(pricingForm.baseRate), markup: parseFloat(pricingForm.markup) });
      toast.success('Pricing updated');
      setShowPricing(false);
      adminApi.getMetaPricing().then(r => setPricing(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleSaveBilling = async () => {
    setSavingBilling(true);
    try {
      await adminApi.updateSettings({ section: 'wallet', data: { enabled: billing.enabled, templateRates: { marketing: parseFloat(billing.marketing) || 0, utility: parseFloat(billing.utility) || 0, authentication: parseFloat(billing.authentication) || 0 } } });
      toast.success('Message billing saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally { setSavingBilling(false); }
  };

  const handleSaveVendorRate = async (id: string) => {
    const f = vendorForms[id];
    if (!f) return;
    setSavingVendor(id);
    try {
      await adminApi.updateVendor(id, {
        walletBillingExempt: f.exempt,
        walletTemplateRates: {
          marketing: f.marketing === '' ? null : parseFloat(f.marketing),
          utility: f.utility === '' ? null : parseFloat(f.utility),
          authentication: f.authentication === '' ? null : parseFloat(f.authentication),
        },
      });
      toast.success('Vendor rate saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally { setSavingVendor(null); }
  };

  const setVendorField = (id: string, field: keyof VendorRateForm, value: string | boolean) =>
    setVendorForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } as VendorRateForm }));

  const ledgerColumns = [
    { key: 'user', title: 'User', render: (e: WalletEntry) => <div><p className="font-medium text-sm">{e.user?.name}</p><p className="text-xs text-gray-400">{e.user?.email}</p></div> },
    { key: 'type', title: 'Type', render: (e: WalletEntry) => <Badge variant={e.type === 'credit' ? 'success' : 'danger'}>{e.type}</Badge> },
    { key: 'amount', title: 'Amount', render: (e: WalletEntry) => <span className={e.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}>₹{e.amount.toFixed(2)}</span> },
    { key: 'balance', title: 'Balance', render: (e: WalletEntry) => `₹${e.balance.toFixed(2)}` },
    { key: 'desc', title: 'Description', render: (e: WalletEntry) => e.description },
    { key: 'date', title: 'Date', render: (e: WalletEntry) => new Date(e.createdAt).toLocaleDateString() },
  ];

  const openAdjustFor = (userId: string, type: 'credit' | 'debit' = 'credit') => {
    setAdjustForm({ userId, amount: '', type, description: '' });
    setShowAdjust(true);
  };

  const balanceColumns = [
    { key: 'user', title: 'Customer', render: (v: VendorRate) => <div><p className="font-medium text-sm">{v.name}</p><p className="text-xs text-gray-400">{v.email}</p></div> },
    { key: 'balance', title: 'Wallet Balance', render: (v: VendorRate) => v.walletBillingExempt ? <Badge variant="info">No Wallet / Unlimited</Badge> : <span className="font-medium">₹{Number(v.walletBalance || 0).toFixed(2)}</span> },
    { key: 'spend', title: 'Total Spent', render: (v: VendorRate) => `₹${Number(v.totalSpend || 0).toFixed(2)}` },
    { key: 'actions', title: '', render: (v: VendorRate) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => openAdjustFor(v._id, 'credit')}>Credit</Button>
        <Button size="sm" variant="secondary" onClick={() => openAdjustFor(v._id, 'debit')}>Debit</Button>
      </div>
    ) },
  ];

  const pricingColumns = [
    { key: 'country', title: 'Country', render: (p: MetaPricing) => `${p.countryName} (${p.countryCode})` },
    { key: 'category', title: 'Category', render: (p: MetaPricing) => <Badge variant="info">{p.category}</Badge> },
    { key: 'rate', title: 'Base Rate', render: (p: MetaPricing) => `₹${Number(p.baseRate || 0).toFixed(4)}` },
    { key: 'markup', title: 'Markup', render: (p: MetaPricing) => `${p.markup}%` },
    { key: 'final', title: 'Final Rate', render: (p: MetaPricing) => `₹${Number(p.finalRate ?? (p.baseRate || 0) * (1 + (p.markup || 0) / 100)).toFixed(4)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Wallet & Meta Pricing</h1>
        <p className="text-sm mt-1">Manage client wallet balances and top-ups</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<DollarSign className="w-4 h-4" />} onClick={() => setShowPricing(true)}>Add Pricing</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdjust(true)}>Adjust Balance</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Customer:</label>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="all">All customers</option>
          {vendors.map(v => <option key={v._id} value={v.email}>{v.name} ({v.email})</option>)}
        </select>
      </div>

      <Tabs tabs={[
        { key: 'balances', label: 'Balances', content: <Table columns={balanceColumns} data={customerFilter === 'all' ? vendors : vendors.filter(v => v.email === customerFilter)} loading={loading} emptyText="No customers" /> },
        { key: 'ledger', label: 'Wallet Ledger', content: <Table columns={ledgerColumns} data={customerFilter === 'all' ? ledger : ledger.filter(e => e.user?.email === customerFilter)} loading={loading} emptyText="No transactions" /> },
        { key: 'pricing', label: 'Meta Pricing', content: <Table columns={pricingColumns} data={pricing} loading={loading} emptyText="No pricing rules" /> },
        { key: 'billing', label: 'Message Billing', content: (
          <div className="space-y-4 p-1">
            <p className="text-sm text-gray-500 max-w-lg">WhatsApp only charges for <b>template messages</b>, by category. Set each category&apos;s rate below — when a customer sends a template, that amount is deducted from their wallet. <b>Service / normal chat replies are FREE</b> (nothing is deducted). Setting 0 disables the charge for that category.</p>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={billing.enabled} onChange={(e) => setBilling({ ...billing, enabled: e.target.checked })} />
              Enable template wallet billing
            </label>
            <div className="max-w-lg space-y-4">
              <Input label="Marketing template rate (₹) — Global" type="number" step="0.01" value={billing.marketing} onChange={(e) => setBilling({ ...billing, marketing: e.target.value })} placeholder="e.g. 0.88" />
              <Input label="Utility template rate (₹) — Global" type="number" step="0.01" value={billing.utility} onChange={(e) => setBilling({ ...billing, utility: e.target.value })} placeholder="e.g. 0.13" />
              <Input label="Authentication template rate (₹) — Global" type="number" step="0.01" value={billing.authentication} onChange={(e) => setBilling({ ...billing, authentication: e.target.value })} placeholder="e.g. 0.13" />
              <Button onClick={handleSaveBilling} loading={savingBilling}>Save Billing Settings</Button>
            </div>

            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Vendor-wise Rates</h3>
              <p className="text-sm text-gray-500 mb-4">Set separate rates per vendor. <b>Leave blank to use the global rates above.</b> Ticking &quot;No Wallet&quot; means nothing is deducted from that vendor.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4">Vendor</th>
                      <th className="py-2 pr-4">Marketing (₹)</th>
                      <th className="py-2 pr-4">Utility (₹)</th>
                      <th className="py-2 pr-4">Authentication (₹)</th>
                      <th className="py-2 pr-4">No Wallet</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(v => {
                      const f = vendorForms[v._id] || { marketing: '', utility: '', authentication: '', exempt: false };
                      return (
                        <tr key={v._id} className="border-b border-gray-100">
                          <td className="py-2 pr-4"><p className="font-medium">{v.name}</p><p className="text-xs text-gray-400">{v.email}</p></td>
                          <td className="py-2 pr-4"><input type="number" step="0.01" placeholder="Global" disabled={f.exempt} value={f.marketing} onChange={e => setVendorField(v._id, 'marketing', e.target.value)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100" /></td>
                          <td className="py-2 pr-4"><input type="number" step="0.01" placeholder="Global" disabled={f.exempt} value={f.utility} onChange={e => setVendorField(v._id, 'utility', e.target.value)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100" /></td>
                          <td className="py-2 pr-4"><input type="number" step="0.01" placeholder="Global" disabled={f.exempt} value={f.authentication} onChange={e => setVendorField(v._id, 'authentication', e.target.value)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100" /></td>
                          <td className="py-2 pr-4"><input type="checkbox" checked={f.exempt} onChange={e => setVendorField(v._id, 'exempt', e.target.checked)} /></td>
                          <td className="py-2"><Button size="sm" onClick={() => handleSaveVendorRate(v._id)} loading={savingVendor === v._id}>Save</Button></td>
                        </tr>
                      );
                    })}
                    {!vendors.length && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No vendors</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) },
      ]} />

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Wallet Balance">
        <div className="space-y-4">
          <Select label="Customer" value={adjustForm.userId} onChange={(e) => setAdjustForm({ ...adjustForm, userId: e.target.value })}
            options={[{ value: '', label: 'Select customer…' }, ...vendors.map(v => ({ value: v._id, label: `${v.name} (${v.email}) — ₹${Number(v.walletBalance || 0).toFixed(2)}` }))]} />
          <Select label="Type" value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
            options={[{ value: 'credit', label: 'Credit (Add)' }, { value: 'debit', label: 'Debit (Subtract)' }]} />
          <Input label="Amount (₹)" type="number" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} required />
          <Input label="Description" value={adjustForm.description} onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button><Button onClick={handleAdjust}>Apply</Button></div>
        </div>
      </Modal>

      <Modal isOpen={showPricing} onClose={() => setShowPricing(false)} title="Add Meta Pricing">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Country" value={pricingForm.countryName} onChange={(e) => setPricingForm({ ...pricingForm, countryName: e.target.value })} />
            <Input label="Country Code" value={pricingForm.countryCode} onChange={(e) => setPricingForm({ ...pricingForm, countryCode: e.target.value })} placeholder="IN" />
          </div>
          <Select label="Category" value={pricingForm.category} onChange={(e) => setPricingForm({ ...pricingForm, category: e.target.value })}
            options={[{ value: 'marketing', label: 'Marketing' }, { value: 'utility', label: 'Utility' }, { value: 'authentication', label: 'Authentication' }, { value: 'service', label: 'Service' }]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Base Rate (₹)" type="number" step="0.0001" value={pricingForm.baseRate} onChange={(e) => setPricingForm({ ...pricingForm, baseRate: e.target.value })} />
            <Input label="Markup (%)" type="number" value={pricingForm.markup} onChange={(e) => setPricingForm({ ...pricingForm, markup: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowPricing(false)}>Cancel</Button><Button onClick={handleSavePricing}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
