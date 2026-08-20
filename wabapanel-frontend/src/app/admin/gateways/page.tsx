'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, CreditCard, Upload, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi, uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

type GwState = Record<string, string | boolean>;

interface FieldDef { key: string; label: string; secret?: boolean }
interface GatewayDef { id: string; label: string; color: string; fields: FieldDef[] }

// Field keys MUST match SystemSettings.paymentGateways.<id> schema fields.
const GATEWAYS: GatewayDef[] = [
  { id: 'razorpay', label: 'Razorpay', color: 'bg-blue-500', fields: [
    { key: 'keyId', label: 'Key ID' },
    { key: 'keySecret', label: 'Key Secret', secret: true },
    { key: 'webhookSecret', label: 'Webhook Secret', secret: true },
  ] },
  { id: 'stripe', label: 'Stripe', color: 'bg-purple-500', fields: [
    { key: 'publishableKey', label: 'Publishable Key' },
    { key: 'secretKey', label: 'Secret Key', secret: true },
    { key: 'webhookSecret', label: 'Webhook Secret', secret: true },
  ] },
  { id: 'paypal', label: 'PayPal', color: 'bg-sky-600', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret', secret: true }] },
  { id: 'payoneer', label: 'Payoneer', color: 'bg-orange-500', fields: [{ key: 'publicKey', label: 'Program ID / Public Key' }, { key: 'secretKey', label: 'API Secret', secret: true }] },
  { id: 'paytm', label: 'Paytm', color: 'bg-blue-400', fields: [{ key: 'publicKey', label: 'Merchant ID' }, { key: 'secretKey', label: 'Merchant Key', secret: true }] },
  { id: 'phonepe', label: 'PhonePe', color: 'bg-violet-600', fields: [{ key: 'publicKey', label: 'Client ID (PhonePe Business → Developer → API Keys)' }, { key: 'secretKey', label: 'Client Secret', secret: true }] },
  { id: 'cashfree', label: 'Cashfree', color: 'bg-emerald-500', fields: [{ key: 'publicKey', label: 'App ID' }, { key: 'secretKey', label: 'Secret Key', secret: true }] },
  { id: 'payu', label: 'PayU', color: 'bg-lime-600', fields: [{ key: 'publicKey', label: 'Merchant Key' }, { key: 'secretKey', label: 'Merchant Salt', secret: true }] },
  { id: 'instamojo', label: 'Instamojo', color: 'bg-indigo-500', fields: [{ key: 'publicKey', label: 'API Key' }, { key: 'secretKey', label: 'Auth Token', secret: true }] },
  { id: 'paystack', label: 'Paystack', color: 'bg-cyan-600', fields: [{ key: 'publicKey', label: 'Public Key' }, { key: 'secretKey', label: 'Secret Key', secret: true }] },
  { id: 'flutterwave', label: 'Flutterwave', color: 'bg-amber-500', fields: [{ key: 'publicKey', label: 'Public Key' }, { key: 'secretKey', label: 'Secret Key', secret: true }] },
  { id: 'mollie', label: 'Mollie', color: 'bg-slate-700', fields: [{ key: 'secretKey', label: 'API Key', secret: true }] },
  { id: 'square', label: 'Square', color: 'bg-neutral-800', fields: [{ key: 'publicKey', label: 'Application ID' }, { key: 'secretKey', label: 'Access Token', secret: true }] },
  { id: 'braintree', label: 'Braintree', color: 'bg-teal-600', fields: [{ key: 'publicKey', label: 'Merchant ID / Public Key' }, { key: 'secretKey', label: 'Private Key', secret: true }] },
  { id: 'authorizenet', label: 'Authorize.Net', color: 'bg-red-500', fields: [{ key: 'publicKey', label: 'API Login ID' }, { key: 'secretKey', label: 'Transaction Key', secret: true }] },
  { id: 'mercadopago', label: 'Mercado Pago', color: 'bg-sky-400', fields: [{ key: 'publicKey', label: 'Public Key' }, { key: 'secretKey', label: 'Access Token', secret: true }] },
  { id: 'twocheckout', label: '2Checkout (Verifone)', color: 'bg-rose-500', fields: [{ key: 'publicKey', label: 'Merchant Code' }, { key: 'secretKey', label: 'Secret Key', secret: true }] },
  { id: 'manual', label: 'Manual / UPI / Bank', color: 'bg-gray-500', fields: [] },
];

export default function GatewaysPage() {
  const [state, setState] = useState<Record<string, GwState>>({});
  const [intl, setIntl] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi.getGateways().then(r => {
      const data = (r.data.data || {}) as Record<string, GwState>;
      setState(data);
      setIntl((r.data.international || {}) as Record<string, boolean>);
    }).catch(() => {});
  }, []);

  const setField = (id: string, key: string, value: string | boolean) => {
    setState(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  };

  const handleSave = async (id: string) => {
    setSaving(id);
    try {
      await adminApi.updateGateway(id, { ...(state[id] || {}), allowInternational: !!intl[id] });
      toast.success('Saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSaving(null);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await adminApi.testGateway(id, { ...(state[id] || {}) });
      const data = r.data.data as { ok: boolean; message: string };
      setTestResult(prev => ({ ...prev, [id]: data }));
      if (data.ok) toast.success('Test passed'); else toast.error('Test failed');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      const message = error.response?.data?.message || 'Test request failed';
      setTestResult(prev => ({ ...prev, [id]: { ok: false, message } }));
      toast.error(message);
    }
    setTesting(null);
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'payment-qr');
      const res = await uploadApi.uploadFile(fd);
      setField('manual', 'qrImageUrl', res.data.data.url);
      toast.success('QR image uploaded');
    } catch {
      toast.error('QR upload failed');
    }
    setUploadingQr(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero">
      <div>
      <h1 className="text-2xl font-bold text-gray-900">Payment Gateways</h1>
      <p className="text-gray-500 text-sm">Configure payment providers for plan subscriptions and wallet top-ups</p>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {GATEWAYS.map(gw => {
          const gs = state[gw.id] || {};
          const active = !!gs.isActive;
          return (
            <Card key={gw.id}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${gw.color} rounded-xl flex items-center justify-center`}>
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{gw.label}</h3>
                    <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={e => setField(gw.id, 'isActive', e.target.checked)} className="rounded text-emerald-600" />
                  <span className="text-sm">Enabled</span>
                </label>
              </div>
              {gw.id === 'razorpay' && (
                <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gs.autoRenewEnabled !== false}
                    onChange={e => setField('razorpay', 'autoRenewEnabled', e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  Auto-renew / e-mandate (Subscriptions) — allow customers to enable automatic recurring payments
                </label>
              )}
              <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!intl[gw.id]}
                  onChange={e => setIntl(prev => ({ ...prev, [gw.id]: e.target.checked }))}
                  className="rounded text-emerald-600"
                />
                Accept international / foreign-currency payments (show this gateway to foreign-currency customers)
              </label>
              {gw.fields.length > 0 && (
                <div className="space-y-3">
                  {gw.fields.map(f => (
                    <Input
                      key={f.key}
                      label={f.label}
                      type={f.secret ? 'password' : 'text'}
                      value={(gs[f.key] as string) || ''}
                      onChange={e => setField(gw.id, f.key, e.target.value)}
                      placeholder={`${gw.label} ${f.label.toLowerCase()}`}
                    />
                  ))}
                </div>
              )}

              {gw.id === 'manual' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">These details are shown to customers who choose Manual payment. The customer pays and submits their transaction ID + screenshot, then you approve it under Payments → Pending Approvals.</p>
                  <Input
                    label="UPI ID"
                    type="text"
                    value={(gs.upiId as string) || ''}
                    onChange={e => setField('manual', 'upiId', e.target.value)}
                    placeholder="yourname@okhdfcbank"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">QR Code / Scanner Image</label>
                    <div className="flex items-center gap-3">
                      {(gs.qrImageUrl as string) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={gs.qrImageUrl as string} alt="QR" className="w-20 h-20 object-contain border rounded-lg" />
                      ) : (
                        <div className="w-20 h-20 border rounded-lg flex items-center justify-center text-gray-300 text-xs">No QR</div>
                      )}
                      <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                      <Button variant="outline" onClick={() => qrInputRef.current?.click()} loading={uploadingQr} icon={<Upload className="w-4 h-4" />}>
                        {(gs.qrImageUrl as string) ? 'Change QR' : 'Upload QR'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank / Account Details</label>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      rows={3}
                      value={(gs.accountDetails as string) || ''}
                      onChange={e => setField('manual', 'accountDetails', e.target.value)}
                      placeholder="A/C Name: ...\nA/C No: ...\nIFSC: ...\nBank: ..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Instructions (optional)</label>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      rows={2}
                      value={(gs.instructions as string) || ''}
                      onChange={e => setField('manual', 'instructions', e.target.value)}
                      placeholder="After making the payment, upload the transaction ID and screenshot."
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={() => handleSave(gw.id)} loading={saving === gw.id} icon={<Save className="w-4 h-4" />}>Save</Button>
                {gw.id !== 'manual' && (
                  <Button variant="outline" onClick={() => handleTest(gw.id)} loading={testing === gw.id} icon={<CheckCircle className="w-4 h-4" />}>Test</Button>
                )}
              </div>
              {testResult[gw.id] && (
                <p className={`mt-2 text-sm ${testResult[gw.id].ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult[gw.id].ok ? '✓ ' : '✗ '}{testResult[gw.id].message}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
