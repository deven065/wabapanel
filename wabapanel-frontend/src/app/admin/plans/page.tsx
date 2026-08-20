'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import type { Plan } from '@/types';
import toast from 'react-hot-toast';

const DEFAULT_FEATURES = { restApi: false, whatsappWebhook: false, autoReplies: true, analytics: true, prioritySupport: false };

const LIMIT_DEFAULT = (f: string) => (f === 'whatsappNumbers' ? -1 : 10);

const LIMIT_FIELDS = [
  'contacts', 'templateBots', 'messageBots', 'campaigns', 'aiPrompts', 'agents', 'whatsappNumbers',
  'conversations', 'teams', 'botFlows', 'customFields', 'tags', 'whatsappForms',
  'aiCallingAgents', 'appointmentBookings', 'facebookAdsCampaigns', 'kanbanFunnels', 'segments',
];

interface CurrencyRow { code: string; name: string; symbol: string; isActive?: boolean; isDefault?: boolean; }
interface PriceRow { currency: string; monthly: number; quarterly: number; yearly: number; }
type PriceForm = Record<string, { monthly: string; quarterly: string; yearly: string }>;

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [pricingMode, setPricingMode] = useState<'manual' | 'exchange'>('manual');
  const [prices, setPrices] = useState<PriceForm>({});
  const [form, setForm] = useState({
    name: '', description: '', isPopular: false, featureListText: '', price: '0', quarterlyPrice: '0', yearlyPrice: '0', status: 'active', trialDays: '0', trialRequiresMandate: false,
    limits: Object.fromEntries(LIMIT_FIELDS.map(f => [f, LIMIT_DEFAULT(f)])) as Record<string, number>,
    features: { ...DEFAULT_FEATURES } as Record<string, boolean>,
  });

  const baseCurrency = (currencies.find(c => c.isDefault)?.code || 'INR').toUpperCase();
  const foreignCurrencies = currencies.filter(c => c.isActive !== false && c.code.toUpperCase() !== baseCurrency);

  useEffect(() => {
    adminApi.getPlans().then(r => setPlans(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
    adminApi.getCurrencies().then(r => setCurrencies(r.data.data || [])).catch(() => {});
  }, []);

  const loadPrices = (plan?: Plan) => {
    const p = plan as unknown as { pricingMode?: 'manual' | 'exchange'; prices?: PriceRow[] } | undefined;
    setPricingMode(p?.pricingMode === 'exchange' ? 'exchange' : 'manual');
    const map: PriceForm = {};
    (p?.prices || []).forEach(row => {
      map[(row.currency || '').toUpperCase()] = { monthly: String(row.monthly ?? 0), quarterly: String(row.quarterly ?? 0), yearly: String(row.yearly ?? 0) };
    });
    setPrices(map);
  };

  const openModal = (plan?: Plan) => {
    loadPrices(plan);
    if (plan) {
      setEditPlan(plan);
      setForm({
        name: plan.name, description: (plan as unknown as { description?: string }).description || '', isPopular: !!(plan as unknown as { isPopular?: boolean }).isPopular, featureListText: (((plan as unknown as { featureList?: string[] }).featureList) || []).join('\n'), price: String(plan.price), quarterlyPrice: String(plan.quarterlyPrice ?? 0), yearlyPrice: String(plan.yearlyPrice ?? 0), status: plan.status || 'active', trialDays: String((plan as unknown as { trialDays?: number }).trialDays || 0), trialRequiresMandate: !!(plan as unknown as { trialRequiresMandate?: boolean }).trialRequiresMandate,
        limits: { ...Object.fromEntries(LIMIT_FIELDS.map(f => [f, LIMIT_DEFAULT(f)])), ...(plan.limits || {}) },
        features: { ...DEFAULT_FEATURES, ...((plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)) ? plan.features as unknown as Record<string, boolean> : {}) },
      });
    } else {
      setEditPlan(null);
      setForm({
        name: '', description: '', isPopular: false, featureListText: '', price: '0', quarterlyPrice: '0', yearlyPrice: '0', status: 'active', trialDays: '0', trialRequiresMandate: false,
        limits: Object.fromEntries(LIMIT_FIELDS.map(f => [f, LIMIT_DEFAULT(f)])),
        features: { ...DEFAULT_FEATURES },
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const { featureListText, ...rest } = form;
      const pricesArr: PriceRow[] = pricingMode === 'manual'
        ? foreignCurrencies.map(c => {
            const v = prices[c.code.toUpperCase()] || { monthly: '0', quarterly: '0', yearly: '0' };
            return { currency: c.code.toUpperCase(), monthly: parseFloat(v.monthly) || 0, quarterly: parseFloat(v.quarterly) || 0, yearly: parseFloat(v.yearly) || 0 };
          }).filter(r => r.monthly > 0 || r.quarterly > 0 || r.yearly > 0)
        : [];
      const payload = { ...rest, pricingMode, prices: pricesArr, price: parseFloat(form.price) || 0, quarterlyPrice: parseFloat(form.quarterlyPrice) || 0, yearlyPrice: parseFloat(form.yearlyPrice) || 0, trialDays: parseInt(form.trialDays) || 0, featureList: featureListText.split('\n').map(l => l.trim()).filter(Boolean) };
      if (editPlan) { await adminApi.updatePlan(editPlan._id, payload); }
      else { await adminApi.createPlan(payload); }
      toast.success(editPlan ? 'Updated' : 'Created');
      setShowModal(false);
      adminApi.getPlans().then(r => setPlans(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan?')) return;
    try { await adminApi.deletePlan(id); toast.success('Deleted'); adminApi.getPlans().then(r => setPlans(r.data.data || [])); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Plan', render: (p: Plan) => <span className="font-semibold text-gray-900">{p.name}</span> },
    { key: 'price', title: 'Price', render: (p: Plan) => p.price === 0 && !(p.quarterlyPrice || p.yearlyPrice) ? 'Free' : (
      <div className="text-sm leading-tight">
        <div>₹{p.price}<span className="text-gray-400">/mo</span></div>
        {!!(p.quarterlyPrice) && <div className="text-gray-500">₹{p.quarterlyPrice}<span className="text-gray-400">/qtr</span></div>}
        {!!(p.yearlyPrice) && <div className="text-gray-500">₹{p.yearlyPrice}<span className="text-gray-400">/yr</span></div>}
      </div>
    ) },
    { key: 'status', title: 'Status', render: (p: Plan) => <Badge variant={p.status === 'active' ? 'success' : 'default'}>{p.status || 'active'}</Badge> },
    { key: 'users', title: 'Subscribers', render: (p: Plan) => (p as Plan & { subscriberCount?: number }).subscriberCount || 0 },
    { key: 'actions', title: '', render: (p: Plan) => (
      <div className="flex gap-1">
        <button onClick={() => openModal(p)} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => handleDelete(p._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Plans & Subscriptions</h1></div>
        <p className="text-sm mt-1">Create and price subscription plans for your clients</p>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => openModal()}>Create Plan</Button>
      </div>

      <Table columns={columns} data={plans} loading={loading} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editPlan ? 'Edit Plan' : 'Create Plan'} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Plan Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Description (shown on website pricing card)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input label="Monthly Price (₹)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Input label="Quarterly Price (₹, 0 = auto 3× monthly)" type="number" value={form.quarterlyPrice} onChange={(e) => setForm({ ...form, quarterlyPrice: e.target.value })} />
            <Input label="Yearly Price (₹, 0 = auto 10× monthly)" type="number" value={form.yearlyPrice} onChange={(e) => setForm({ ...form, yearlyPrice: e.target.value })} />
            <Input label="Free Trial Days (0 = no trial)" type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-6">
              <input type="checkbox" checked={form.trialRequiresMandate} onChange={(e) => setForm({ ...form, trialRequiresMandate: e.target.checked })} className="rounded text-emerald-600" />
              Trial requires payment method (auto-charges after trial via e-mandate)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-6">
              <input type="checkbox" checked={form.isPopular} onChange={(e) => setForm({ ...form, isPopular: e.target.checked })} className="rounded text-emerald-600" />
              Mark as &quot;Most Popular&quot; (highlighted on website pricing)
            </label>
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">International Pricing ({foreignCurrencies.length} currency option{foreignCurrencies.length === 1 ? '' : 's'})</h4>
            <p className="text-xs text-gray-500 mb-3">Base currency is <b>{baseCurrency}</b> (the prices above). Manage currencies &amp; rates in Admin → Currencies.</p>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="pmode" checked={pricingMode === 'manual'} onChange={() => setPricingMode('manual')} />Manual per-currency price</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="pmode" checked={pricingMode === 'exchange'} onChange={() => setPricingMode('exchange')} />Auto exchange-rate</label>
            </div>
            {pricingMode === 'exchange' ? (
              <p className="text-xs bg-blue-50 border border-blue-200 rounded-lg p-3 text-gray-700">Foreign prices are auto-calculated from the base price × each currency&apos;s rate (set in Admin → Currencies). Customers see the converted amount for their currency automatically.</p>
            ) : foreignCurrencies.length === 0 ? (
              <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-gray-700">No foreign currencies active yet. Add/activate currencies in Admin → Currencies to set per-currency prices.</p>
            ) : (
              <div className="space-y-2">
                {foreignCurrencies.map(c => {
                  const v = prices[c.code.toUpperCase()] || { monthly: '', quarterly: '', yearly: '' };
                  const set = (k: 'monthly' | 'quarterly' | 'yearly', val: string) => setPrices({ ...prices, [c.code.toUpperCase()]: { ...v, [k]: val } });
                  return (
                    <div key={c.code} className="grid grid-cols-4 gap-2 items-center">
                      <span className="text-sm font-medium">{c.symbol} {c.code.toUpperCase()}</span>
                      <Input label="" type="number" placeholder="Monthly" value={v.monthly} onChange={e => set('monthly', e.target.value)} />
                      <Input label="" type="number" placeholder="Quarterly" value={v.quarterly} onChange={e => set('quarterly', e.target.value)} />
                      <Input label="" type="number" placeholder="Yearly" value={v.yearly} onChange={e => set('yearly', e.target.value)} />
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400">Leave a currency blank to fall back to the base {baseCurrency} price for it.</p>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Usage Limits (-1 = unlimited)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {LIMIT_FIELDS.map(field => (
                <Input key={field} label={field.replace(/([A-Z])/g, ' $1').trim()} type="number" value={String(form.limits[field] ?? LIMIT_DEFAULT(field))}
                  onChange={(e) => setForm({ ...form, limits: { ...form.limits, [field]: parseInt(e.target.value) } })} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Features</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(form.features).map(([key, val]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={val} onChange={(e) => setForm({ ...form, features: { ...form.features, [key]: e.target.checked } })} className="rounded text-emerald-600" />
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Website Feature List (one per line, shown under the plan on the pricing page)</h4>
            <textarea className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" rows={5} placeholder={'500 Contacts\nUnlimited Campaigns\nAI Chatbot\nPriority Support'} value={form.featureListText} onChange={(e) => setForm({ ...form, featureListText: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editPlan ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
