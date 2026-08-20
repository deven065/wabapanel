'use client';
import React, { useState, useEffect } from 'react';
import { Save, Copy } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface WhatsAppSettings {
  enableEmbeddedSignup: boolean;
  enableManualSignup: boolean;
  enableCoexistence: boolean;
  apiVersion: string;
  webhookVerifyToken: string;
  appId: string;
  appSecret: string;
  configId: string;
  businessId: string;
}

const defaultWhatsapp: WhatsAppSettings = {
  enableEmbeddedSignup: false,
  enableManualSignup: true,
  enableCoexistence: false,
  apiVersion: 'v21.0',
  webhookVerifyToken: '',
  appId: '',
  appSecret: '',
  configId: '',
  businessId: '',
};

export default function OneClickSignupPage() {
  const [whatsapp, setWhatsapp] = useState<WhatsAppSettings>(defaultWhatsapp);
  const [saving, setSaving] = useState(false);
  const [ig, setIg] = useState({ appId: '', appSecret: '', configId: '', enableOneClick: false, enableManual: true });
  const [addonOn, setAddonOn] = useState(false);
  const [savingIg, setSavingIg] = useState(false);
  const [fb, setFb] = useState({ configId: '', enableOneClick: false });
  const [savingFb, setSavingFb] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then(r => {
      const data = r.data.data || {};
      if (data.whatsapp && typeof data.whatsapp === 'object') {
        setWhatsapp({ ...defaultWhatsapp, ...data.whatsapp });
      }
      setIg({
        appId: data.facebook?.appId || '',
        appSecret: data.facebook?.appSecret || '',
        configId: data.instagram?.configId || '',
        enableOneClick: !!data.instagram?.enableOneClick,
        enableManual: data.instagram?.enableManual !== false,
      });
      setFb({ configId: data.facebook?.configId || '', enableOneClick: !!data.facebook?.enableOneClick });
      setAddonOn(!!data.addons?.igAutoDm);
    }).catch(() => {});
  }, []);

  const updateField = (field: keyof WhatsAppSettings, value: string | boolean) => {
    setWhatsapp(prev => ({ ...prev, [field]: value }));
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : '');
  const callbackUrl = apiBase ? `${apiBase.replace(/\/$/, '')}/webhook/whatsapp` : '';

  const copy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ section: 'whatsapp', data: whatsapp });
      toast.success('One Click Signup settings saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  const handleSaveFb = async () => {
    setSavingFb(true);
    try {
      await adminApi.updateSettings({ section: 'facebook', data: { appId: ig.appId, appSecret: ig.appSecret, configId: fb.configId, enableOneClick: fb.enableOneClick } });
      toast.success('Facebook Messenger settings saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSavingFb(false);
  };

  const handleSaveIg = async () => {
    setSavingIg(true);
    try {
      await adminApi.updateSettings({ section: 'facebook', data: { appId: ig.appId, appSecret: ig.appSecret } });
      await adminApi.updateSettings({ section: 'instagram', data: { configId: ig.configId, enableOneClick: ig.enableOneClick, enableManual: ig.enableManual } });
      await adminApi.updateSettings({ section: 'addons', data: { igAutoDm: addonOn } });
      toast.success('Instagram Auto DM settings saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSavingIg(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FacebookIcon className="w-6 h-6 text-blue-600" /> One Click Signup
        </h1>
      </div>
      <p className="text-sm mt-1">WhatsApp Embedded Signup — let clients connect their WhatsApp Business Account in one click via Facebook.</p>

      <Card>
        <div className="space-y-6 max-w-lg">
          {/* Signup Methods Toggle */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">WhatsApp Signup Methods</h3>
            <p className="text-xs text-gray-500 mb-4">Choose which signup methods your clients can use to connect their WhatsApp Business Account.</p>
          </div>
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={whatsapp.enableEmbeddedSignup} onChange={e => updateField('enableEmbeddedSignup', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">Enable Embedded Signup</span>
                <p className="text-xs text-gray-500">For Tech Provider approved admins. Clients can create/connect WhatsApp Business Account directly through your platform.</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={whatsapp.enableManualSignup} onChange={e => updateField('enableManualSignup', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">Enable Manual Signup</span>
                <p className="text-xs text-gray-500">Clients manually enter their Phone Number ID, WABA ID, and Permanent Access Token.</p>
              </div>
            </label>
          </div>

          {/* Embedded Signup Config - shown only when enabled */}
          {whatsapp.enableEmbeddedSignup && (
            <>
              <hr className="border-gray-200" />
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-1">Embedded Signup Configuration</h3>
                <p className="text-xs text-gray-500 mb-4">Configure your Facebook App for WhatsApp Embedded Signup. Do not use the same app for any other purposes like Manual WhatsApp API Setup etc.</p>
              </div>
              <Input label="Facebook App ID" value={whatsapp.appId} onChange={e => updateField('appId', e.target.value)} placeholder="e.g. 1234567890123456" />
              <Input label="Facebook App Secret" type="password" value={whatsapp.appSecret} onChange={e => updateField('appSecret', e.target.value)} placeholder="Enter your Facebook App Secret" />
              <Input label="Config ID" value={whatsapp.configId} onChange={e => updateField('configId', e.target.value)} placeholder="WhatsApp Embedded Signup Config ID" />
              <Input label="Existing WhatsApp Business ID (Optional)" value={whatsapp.businessId} onChange={e => updateField('businessId', e.target.value)} placeholder="Your existing WABA Business ID" />

              <div className="space-y-3 rounded-lg border border-blue-200 p-4 bg-blue-50">
                <p className="text-xs text-gray-600">Paste these two values in your Meta App → WhatsApp → Configuration (Webhook). Clients don&apos;t need to do this — it&apos;s a one-time setup for your app.</p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Callback URL</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={callbackUrl} className="flex-1 text-sm rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-gray-800" />
                    <button type="button" onClick={() => copy(callbackUrl)} className="shrink-0 rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-100" title="Copy"><Copy className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Verify Token</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={whatsapp.webhookVerifyToken} placeholder="Set a token below in API Settings, then Save" className="flex-1 text-sm rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-gray-800" />
                    <button type="button" onClick={() => copy(whatsapp.webhookVerifyToken)} className="shrink-0 rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-100" title="Copy"><Copy className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={whatsapp.enableCoexistence} onChange={e => updateField('enableCoexistence', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-800">Enable Coexistence (WhatsApp Business App numbers)</span>
                    <p className="text-xs text-gray-500">Let clients connect a number that is already running in the WhatsApp Business App, and use it on both the app and the API at the same time (chats stay in sync). Requires Tech Provider approval and the coexistence webhook fields enabled in your Meta App.</p>
                  </div>
                </label>
              </div>
            </>
          )}

          <hr className="border-gray-200" />
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">API Settings</h3>
            <p className="text-xs text-gray-500 mb-4">General WhatsApp Cloud API configuration.</p>
          </div>
          <Input label="API Version" value={whatsapp.apiVersion} onChange={e => updateField('apiVersion', e.target.value)} />
          <Input label="Webhook Verify Token" value={whatsapp.webhookVerifyToken} onChange={e => updateField('webhookVerifyToken', e.target.value)} placeholder="Custom verify token for webhook validation" />
          <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 max-w-lg">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Facebook Messenger 1-Click Connect</h3>
            <p className="text-xs text-gray-500">Lets customers connect their Facebook Page from Channels in one click, without a Page ID or token. Uses the Facebook App ID/Secret set below.</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-blue-200 p-3 bg-blue-50">
            <input type="checkbox" checked={fb.enableOneClick} onChange={e => setFb(v => ({ ...v, enableOneClick: e.target.checked }))} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-800">Enable 1-Click Connect (Facebook Login)</span>
          </label>
          {fb.enableOneClick && (
            <Input label="Messenger Config ID (optional)" value={fb.configId} onChange={e => setFb(v => ({ ...v, configId: e.target.value }))} placeholder="Facebook Login for Business config id" />
          )}
          <Button onClick={handleSaveFb} loading={savingFb} icon={<Save className="w-4 h-4" />}>Save Messenger Settings</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 max-w-lg">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Instagram Auto DM (Add-on)</h3>
            <p className="text-xs text-gray-500">Optional add-on. Enable the license for this panel, then turn it on per-customer under Admin → Features. Uses the Facebook App below for 1-click connect.</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-pink-200 p-3 bg-pink-50">
            <input type="checkbox" checked={addonOn} onChange={e => setAddonOn(e.target.checked)} className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500" />
            <div>
              <span className="text-sm font-medium text-gray-800">Enable Instagram Auto DM add-on for this panel (store license)</span>
              <p className="text-xs text-gray-500">When off, the add-on is hidden for every customer on this panel.</p>
            </div>
          </label>
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={ig.enableOneClick} onChange={e => setIg(v => ({ ...v, enableOneClick: e.target.checked }))} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-800">Enable 1-Click Connect (Facebook Login)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={ig.enableManual} onChange={e => setIg(v => ({ ...v, enableManual: e.target.checked }))} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-800">Enable Manual Connect (Page ID + token)</span>
            </label>
          </div>
          {ig.enableOneClick && (
            <>
              <Input label="Facebook App ID" value={ig.appId} onChange={e => setIg(v => ({ ...v, appId: e.target.value }))} placeholder="e.g. 1234567890123456" />
              <Input label="Facebook App Secret" type="password" value={ig.appSecret} onChange={e => setIg(v => ({ ...v, appSecret: e.target.value }))} placeholder="Enter your Facebook App Secret" />
              <Input label="Instagram Config ID (optional)" value={ig.configId} onChange={e => setIg(v => ({ ...v, configId: e.target.value }))} placeholder="Facebook Login for Business config id" />
            </>
          )}
          <Button onClick={handleSaveIg} loading={savingIg} icon={<Save className="w-4 h-4" />}>Save Instagram Settings</Button>
        </div>
      </Card>
    </div>
  );
}
