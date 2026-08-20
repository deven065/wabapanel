'use client';
import React, { useState, useEffect } from 'react';
import { Save, Send, Mail, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface SystemSettings {
  general: { appName: string; appEmail: string; appDescription: string; appUrl: string; theme: string; sessionTimeout: string; contactCaptcha: boolean; };
  branding: { logo: string; logoDark: string; favicon: string; loginBg: string; tagline: string; };
  whatsapp: { enableEmbeddedSignup: boolean; enableManualSignup: boolean; apiVersion: string; webhookVerifyToken: string; appId: string; appSecret: string; configId: string; businessId: string; };
  facebook: { appId: string; appSecret: string; webhookUrl: string; };
  email: { host: string; port: string; user: string; password: string; from: string; fromName: string; encryption: string; templates: Record<string, { enabled: boolean; subject: string; body: string }>; };
  google: { clientId: string; clientSecret: string; analyticsId: string; };
  aws: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string; };
  limits: { maxFileSize: string; maxGroupSize: string; maxBroadcastSize: string; };
  wallet: { enabled: boolean; minTopUp: string; maxTopUp: string; };
  maintenance: { enabled: boolean; message: string; };
  invoice: { companyName: string; address: string; gstin: string; phone: string; email: string; footerNote: string; };
}

const defaultSettings: SystemSettings = {
  general: { appName: 'WabaPanel by KKHS Media', appEmail: '', appDescription: '', appUrl: '', theme: 'emerald', sessionTimeout: '24', contactCaptcha: false },
  branding: { logo: '', logoDark: '', favicon: '', loginBg: '', tagline: 'by KKHS Media' },
  whatsapp: { enableEmbeddedSignup: false, enableManualSignup: true, apiVersion: 'v21.0', webhookVerifyToken: '', appId: '', appSecret: '', configId: '', businessId: '' },
  facebook: { appId: '', appSecret: '', webhookUrl: '' },
  email: { host: '', port: '587', user: '', password: '', from: '', fromName: '', encryption: 'tls', templates: {} },
  google: { clientId: '', clientSecret: '', analyticsId: '' },
  aws: { accessKeyId: '', secretAccessKey: '', region: 'ap-south-1', bucket: '' },
  limits: { maxFileSize: '16', maxGroupSize: '256', maxBroadcastSize: '10000' },
  wallet: { enabled: true, minTopUp: '100', maxTopUp: '100000' },
  maintenance: { enabled: false, message: 'We are currently performing maintenance. Please try again later.' },
  invoice: { companyName: '', address: '', gstin: '', phone: '', email: '', footerNote: '' },
};

const EMAIL_TEMPLATE_DEFS: { key: string; label: string; description: string; variables: string[] }[] = [
  { key: 'welcome', label: 'Welcome Email', description: 'Sent when a new user registers', variables: ['userName', 'appName', 'appUrl'] },
  { key: 'passwordReset', label: 'Password Reset', description: 'Sent when user requests password reset', variables: ['userName', 'appName', 'resetLink'] },
  { key: 'emailVerification', label: 'Email Verification', description: 'Sent to verify email address', variables: ['userName', 'appName', 'verifyLink'] },
  { key: 'invoicePayment', label: 'Invoice / Payment', description: 'Sent after successful payment', variables: ['userName', 'appName', 'amount', 'planName', 'transactionId', 'paymentDate'] },
  { key: 'planUpgrade', label: 'Plan Upgrade', description: 'Sent when plan is upgraded', variables: ['userName', 'appName', 'planName'] },
  { key: 'planExpiry', label: 'Plan Expiry Warning', description: 'Sent before plan expires', variables: ['userName', 'appName', 'planName', 'expiryDate'] },
  { key: 'accountDeactivation', label: 'Account Deactivation', description: 'Sent when account is deactivated', variables: ['userName', 'appName'] },
  { key: 'loginAlert', label: 'Login Alert', description: 'Sent on new login detection', variables: ['userName', 'appName', 'ipAddress', 'loginTime', 'deviceInfo'] },
  { key: 'walletTopup', label: 'Wallet Top-up', description: 'Sent after wallet credit', variables: ['userName', 'appName', 'amount', 'newBalance'] },
  { key: 'contactForm', label: 'Contact Form', description: 'Sent on new contact form submission', variables: ['appName', 'contactName', 'contactEmail', 'contactPhone', 'contactMessage'] },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getSettings().then(r => {
      const data = r.data.data || {};
      // Deep merge each section so no field is lost
      const merged = { ...defaultSettings };
      for (const key of Object.keys(defaultSettings) as (keyof SystemSettings)[]) {
        if (data[key] && typeof data[key] === 'object') {
          merged[key] = { ...defaultSettings[key], ...data[key] } as never;
        }
      }
      setSettings(merged);
    }).catch(() => {});
  }, []);

  const handleSave = async (section: string) => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ section, data: settings[section as keyof SystemSettings] });
      toast.success(`${section} settings saved`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  const updateField = (section: keyof SystemSettings, field: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const updateTemplate = (key: string, field: string, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      email: {
        ...prev.email,
        templates: {
          ...prev.email.templates,
          [key]: { ...(prev.email.templates[key] || { enabled: true, subject: '', body: '' }), [field]: value },
        },
      },
    }));
  };

  const handleTestEmail = async () => {
    if (!testEmail) { toast.error('Enter email address'); return; }
    setSendingTest(true);
    try {
      await adminApi.sendTestEmail({ to: testEmail });
      toast.success('Test email sent!');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to send test email');
    }
    setSendingTest(false);
  };

  const tabs = [
    { key: 'general', label: 'General', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label="App Name" value={settings.general.appName} onChange={e => updateField('general', 'appName', e.target.value)} />
          <Input label="App Email" value={settings.general.appEmail} onChange={e => updateField('general', 'appEmail', e.target.value)} />
          <Textarea label="Description" value={settings.general.appDescription} onChange={e => updateField('general', 'appDescription', e.target.value)} />
          <Input label="App URL" value={settings.general.appUrl} onChange={e => updateField('general', 'appUrl', e.target.value)} />
          <Input label="Session Timeout (hours)" type="number" value={settings.general.sessionTimeout} onChange={e => updateField('general', 'sessionTimeout', e.target.value)} />
          <button type="button" onClick={() => updateField('general', 'contactCaptcha', !settings.general.contactCaptcha)} className="flex items-center justify-between w-full p-3 border border-gray-200 rounded-lg text-left">
            <span>
              <span className="block text-sm font-medium text-gray-900">Contact Form Captcha</span>
              <span className="block text-xs text-gray-500">Show a math captcha on the public contact page to block spam bots</span>
            </span>
            {settings.general.contactCaptcha ? <ToggleRight className="w-8 h-8 text-emerald-500 shrink-0" /> : <ToggleLeft className="w-8 h-8 text-gray-400 shrink-0" />}
          </button>
          <Button onClick={() => handleSave('general')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
    { key: 'invoice', label: 'Invoice', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-gray-500">These company details appear on all PDF invoices (subscription payments, plan invoices). Tax rate comes from Admin &gt; Taxes (default active tax).</p>
          <Input label="Company Name (shown on invoice header)" value={settings.invoice.companyName} onChange={e => updateField('invoice', 'companyName', e.target.value)} placeholder="Leave empty to use App Name" />
          <Textarea label="Company Address" value={settings.invoice.address} onChange={e => updateField('invoice', 'address', e.target.value)} />
          <Input label="GSTIN / Tax ID" value={settings.invoice.gstin} onChange={e => updateField('invoice', 'gstin', e.target.value)} />
          <Input label="Phone" value={settings.invoice.phone} onChange={e => updateField('invoice', 'phone', e.target.value)} />
          <Input label="Billing Email" value={settings.invoice.email} onChange={e => updateField('invoice', 'email', e.target.value)} />
          <Textarea label="Footer Note" value={settings.invoice.footerNote} onChange={e => updateField('invoice', 'footerNote', e.target.value)} placeholder="Thank you for your business." />
          <Button onClick={() => handleSave('invoice')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
    { key: 'branding', label: 'Branding', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-gray-700">Branding (logo, dark logo, favicon, login background &amp; tagline) is now managed in <b>Site Settings</b> so all your website &amp; panel appearance is in one place.</p>
          <a href="/admin/site-settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            Go to Site Settings → Branding
          </a>
        </div>
      </Card>
    )},
    { key: 'email', label: 'Email SMTP', content: (
      <div className="space-y-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">SMTP Configuration</h3>
          <p className="text-xs text-gray-500 mb-4">Configure your email server for sending system emails</p>
          <div className="space-y-4 max-w-lg">
            <Input label="SMTP Host" value={settings.email.host} onChange={e => updateField('email', 'host', e.target.value)} placeholder="smtp.gmail.com" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="SMTP Port" value={settings.email.port} onChange={e => updateField('email', 'port', e.target.value)} placeholder="587" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Encryption</label>
                <select value={settings.email.encryption} onChange={e => updateField('email', 'encryption', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="tls">TLS (Port 587)</option>
                  <option value="ssl">SSL (Port 465)</option>
                  <option value="none">None (Port 25)</option>
                </select>
              </div>
            </div>
            <Input label="Username" value={settings.email.user} onChange={e => updateField('email', 'user', e.target.value)} placeholder="your@email.com" />
            <Input label="Password" type="password" value={settings.email.password} onChange={e => updateField('email', 'password', e.target.value)} placeholder="App password or SMTP password" />
            <Input label="From Email" value={settings.email.from} onChange={e => updateField('email', 'from', e.target.value)} placeholder="noreply@yourdomain.com" />
            <Input label="From Name" value={settings.email.fromName} onChange={e => updateField('email', 'fromName', e.target.value)} placeholder="WabaPanel" />
            <div className="flex gap-2">
              <Button onClick={() => handleSave('email')} loading={saving} icon={<Save className="w-4 h-4" />}>Save SMTP</Button>
            </div>
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Send Test Email</p>
              <div className="flex gap-2">
                <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" />
                <Button onClick={handleTestEmail} loading={sendingTest} variant="secondary" icon={<Send className="w-4 h-4" />}>Send Test</Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Email Templates</h3>
          <p className="text-xs text-gray-500 mb-4">Configure which emails to send and customize their content. Use {'{{variableName}}'} for dynamic values.</p>
          <div className="space-y-3">
            {EMAIL_TEMPLATE_DEFS.map(def => {
              const tpl = settings.email.templates[def.key] || { enabled: true, subject: '', body: '' };
              const isExpanded = expandedTemplate === def.key;
              return (
                <div key={def.key} className={`border rounded-lg ${tpl.enabled ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/30'}`}>
                  <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpandedTemplate(isExpanded ? null : def.key)}>
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${tpl.enabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{def.label}</p>
                        <p className="text-[11px] text-gray-500">{def.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); updateTemplate(def.key, 'enabled', !tpl.enabled); }} className="flex items-center">
                        {tpl.enabled ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                      <Input label="Subject" value={tpl.subject} onChange={e => updateTemplate(def.key, 'subject', e.target.value)} placeholder={`Email subject for ${def.label}`} />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                        <textarea rows={6} value={tpl.body} onChange={e => updateTemplate(def.key, 'body', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="<h2>Email content...</h2>" />
                      </div>
                      <p className="text-[11px] text-gray-400">Available variables: {def.variables.map(v => `{{${v}}}`).join(', ')}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Button onClick={() => handleSave('email')} loading={saving} icon={<Save className="w-4 h-4" />}>Save All Email Settings</Button>
          </div>
        </Card>
      </div>
    )},
    { key: 'aws', label: 'AWS S3', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label="Access Key ID" value={settings.aws.accessKeyId} onChange={e => updateField('aws', 'accessKeyId', e.target.value)} />
          <Input label="Secret Access Key" type="password" value={settings.aws.secretAccessKey} onChange={e => updateField('aws', 'secretAccessKey', e.target.value)} />
          <Input label="Region" value={settings.aws.region} onChange={e => updateField('aws', 'region', e.target.value)} />
          <Input label="Bucket Name" value={settings.aws.bucket} onChange={e => updateField('aws', 'bucket', e.target.value)} />
          <Button onClick={() => handleSave('aws')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
    { key: 'limits', label: 'Limits', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label="Max File Size (MB)" type="number" value={settings.limits.maxFileSize} onChange={e => updateField('limits', 'maxFileSize', e.target.value)} />
          <Input label="Max Group Size" type="number" value={settings.limits.maxGroupSize} onChange={e => updateField('limits', 'maxGroupSize', e.target.value)} />
          <Input label="Max Broadcast Size" type="number" value={settings.limits.maxBroadcastSize} onChange={e => updateField('limits', 'maxBroadcastSize', e.target.value)} />
          <Button onClick={() => handleSave('limits')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
    { key: 'wallet', label: 'Wallet', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.wallet.enabled} onChange={e => updateField('wallet', 'enabled', e.target.checked)} className="rounded text-emerald-600" />
            Enable Wallet System
          </label>
          <Input label="Min Top-up (₹)" type="number" value={settings.wallet.minTopUp} onChange={e => updateField('wallet', 'minTopUp', e.target.value)} />
          <Input label="Max Top-up (₹)" type="number" value={settings.wallet.maxTopUp} onChange={e => updateField('wallet', 'maxTopUp', e.target.value)} />
          <Button onClick={() => handleSave('wallet')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
    { key: 'maintenance', label: 'Maintenance', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.maintenance.enabled} onChange={e => updateField('maintenance', 'enabled', e.target.checked)} className="rounded text-emerald-600" />
            Enable Maintenance Mode
          </label>
          <Textarea label="Maintenance Message" value={settings.maintenance.message} onChange={e => updateField('maintenance', 'message', e.target.value)} />
          <Button onClick={() => handleSave('maintenance')} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </Card>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900">System Preferences</h1>
      </div>
      <p className="text-sm mt-1">System-wide settings — branding, general, and integrations</p>
      <Tabs tabs={tabs} />
    </div>
  );
}
