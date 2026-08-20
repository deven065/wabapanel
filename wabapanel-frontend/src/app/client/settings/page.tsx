'use client';
import React, { useState, useEffect } from 'react';
import { Save, User, Key, Globe, Webhook, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import AccountSecurity from '@/components/AccountSecurity';
import { useAuthStore } from '@/stores/authStore';
import { authApi, workspaceApi } from '@/lib/api';
import toast from 'react-hot-toast';

const WEBHOOK_EVENTS: { value: string; label: string }[] = [
  { value: 'message.received', label: 'Incoming messages (real-time)' },
  { value: 'contact.created', label: 'New contact created' },
  { value: 'message.status', label: 'Message delivery status' },
];

interface ApiWebhook { _id: string; url: string; events: string[]; }

function EventWebhooks({ workspaceId }: { workspaceId?: string }) {
  const [hooks, setHooks] = useState<ApiWebhook[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['message.received']);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!workspaceId) return;
    workspaceApi.listApiWebhooks(workspaceId).then((r) => setHooks(r.data.data || [])).catch(() => {});
  };
  useEffect(load, [workspaceId]);

  const toggleEvent = (ev: string) =>
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));

  const add = async () => {
    if (!workspaceId) return;
    if (!/^https?:\/\//.test(url.trim())) { toast.error('Enter a valid http(s) URL'); return; }
    if (!events.length) { toast.error('Select at least one event'); return; }
    setBusy(true);
    try {
      await workspaceApi.addApiWebhook(workspaceId, { url: url.trim(), events });
      toast.success('Webhook added');
      setUrl(''); setEvents(['message.received']); load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
    setBusy(false);
  };

  const remove = async (hookId: string) => {
    if (!workspaceId) return;
    try { await workspaceApi.deleteApiWebhook(workspaceId, hookId); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-gray-100">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Webhook className="w-5 h-5" /> Event Webhooks</h3>
      <p className="text-xs text-gray-500">Send events to your CRM / external system in real-time. We POST JSON <code>{'{ event, timestamp, data }'}</code> to your URL.</p>

      {hooks.length > 0 && (
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h._id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="min-w-0">
                <code className="text-xs font-mono text-gray-800 break-all">{h.url}</code>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(h.events || []).map((e) => (
                    <span key={e} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{e}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => remove(h._id)} className="p-1 hover:bg-red-50 rounded shrink-0" title="Delete">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Input label="Webhook URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-crm.com/webhook" />
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-600">Events to send</p>
        {WEBHOOK_EVENTS.map((ev) => (
          <label key={ev.value} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={events.includes(ev.value)} onChange={() => toggleEvent(ev.value)} className="rounded border-gray-300 text-emerald-600" />
            {ev.label} <code className="text-[10px] text-gray-400">{ev.value}</code>
          </label>
        ))}
      </div>
      <Button onClick={add} loading={busy} icon={<Plus className="w-4 h-4" />}>Add Webhook</Button>

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">Payload example</summary>
        <pre className="mt-1 bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">{`POST <your url>
{
  "event": "message.received",
  "timestamp": "2026-07-19T08:30:00Z",
  "data": {
    "phone": "9199XXXXXXXX",
    "type": "text",
    "text": "customer message",
    "contact_id": "...",
    "conversation_id": "..."
  }
}`}</pre>
      </details>
    </div>
  );
}

export default function SettingsPage() {
  const { user, currentWorkspace, updateUser } = useAuthStore();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [wsSettings, setWsSettings] = useState({
    name: currentWorkspace?.name || '', timezone: currentWorkspace?.timezone || 'Asia/Kolkata',
    apiKey: currentWorkspace?.apiKey || '', webhookUrl: currentWorkspace?.webhookUrl || '',
  });
  const [saving, setSaving] = useState(false);


  const [submitting, setSubmitting] = useState(false);

  const handleProfileSave = async () => {
    if (submitting) return;
    setSaving(true);
    setSubmitting(true);
    try {
      const res = await authApi.updateProfile(profile);
      updateUser(res.data.data);
      toast.success('Profile updated');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  const handleWorkspaceSave = async () => {
    if (submitting) return;
    if (!currentWorkspace) return;
    setSaving(true);
    setSubmitting(true);
    try {
      await workspaceApi.update(currentWorkspace._id, wsSettings);
      toast.success('Business settings updated');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and business</p>
        </div>
        </div>
      </div>

      <Tabs tabs={[
        { key: 'profile', label: 'Profile', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-2xl font-bold text-emerald-600">
                  {user?.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{user?.name}</h3>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
              </div>
              <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} icon={<User className="w-4 h-4" />} />
              <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Button onClick={handleProfileSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save Changes</Button>
            </div>
          </Card>
        )},
        { key: 'security', label: 'Security', content: (
          <AccountSecurity />
        )},
        { key: 'workspace', label: 'Business', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Globe className="w-5 h-5" /> Business Settings</h3>
              <Input label="Business Name" value={wsSettings.name} onChange={(e) => setWsSettings({ ...wsSettings, name: e.target.value })} />
              <Select label="Timezone" value={wsSettings.timezone} onChange={(e) => setWsSettings({ ...wsSettings, timezone: e.target.value })}
                options={[
                  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
                  { value: 'UTC', label: 'UTC' },
                  { value: 'America/New_York', label: 'America/New_York (EST)' },
                  { value: 'Europe/London', label: 'Europe/London (GMT)' },
                ]} />
              <Button onClick={handleWorkspaceSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
            </div>
          </Card>
        )},

        { key: 'api', label: 'API & Webhooks', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Key className="w-5 h-5" /> API Configuration</h3>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">API Key</p>
                <code className="text-sm font-mono text-gray-800 break-all">{wsSettings.apiKey || 'No API key generated'}</code>
              </div>
              <Button variant="outline" onClick={async () => {
                if (!currentWorkspace) return;
                try {
                  const res = await workspaceApi.generateApiKey(currentWorkspace._id);
                  setWsSettings({ ...wsSettings, apiKey: res.data.data.apiKey });
                  toast.success('API key generated');
                } catch { toast.error('Failed'); } finally { setSubmitting(false); }
              }}>Generate New API Key</Button>
              <h3 className="text-lg font-semibold flex items-center gap-2 pt-4"><Webhook className="w-5 h-5" /> Webhook URL</h3>
              <Input label="Webhook Endpoint" value={wsSettings.webhookUrl} onChange={(e) => setWsSettings({ ...wsSettings, webhookUrl: e.target.value })} placeholder="https://your-domain.com/webhook" />
              <Button onClick={handleWorkspaceSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>

              <EventWebhooks workspaceId={currentWorkspace?._id} />
            </div>
          </Card>
        )},
      ]} />
    </div>
  );
}
