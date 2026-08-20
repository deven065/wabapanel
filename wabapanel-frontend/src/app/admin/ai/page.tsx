'use client';
import React, { useState, useEffect } from 'react';
import { Save, Brain } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AIProvider { name: string; displayName: string; model: string; apiKey: string; baseUrl: string; isActive: boolean; hasKey?: boolean; }

interface VendorAssignment { enabled: boolean; provider: string; model: string; endpoint: string; hasKey: boolean; }
interface VendorAi { _id: string; name: string; email: string; companyName?: string; hasOwnKey: boolean; assignment: VendorAssignment; }
type VendorEdit = VendorAssignment & { apiKey: string };

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI Grok' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
];

const defaultProviders: AIProvider[] = [
  { name: 'openai', displayName: 'OpenAI', model: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com/v1', isActive: false },
  { name: 'deepseek', displayName: 'DeepSeek', model: 'deepseek-chat', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', isActive: false },
  { name: 'xai', displayName: 'xAI Grok', model: 'grok-beta', apiKey: '', baseUrl: 'https://api.x.ai/v1', isActive: false },
  { name: 'gemini', displayName: 'Google Gemini', model: 'gemini-2.5-flash', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', isActive: false },
];

export default function AIPage() {
  const [providers, setProviders] = useState<AIProvider[]>(defaultProviders);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<VendorAi[]>([]);
  const [edits, setEdits] = useState<Record<string, VendorEdit>>({});
  const [savingVendor, setSavingVendor] = useState<string>('');
  const [vendorSearch, setVendorSearch] = useState('');

  const loadProviders = () => {
    adminApi.getAISettings().then(r => {
      const saved: AIProvider[] = r.data.data?.providers || [];
      setProviders(defaultProviders.map(d => {
        const s = saved.find(x => x.name === d.name);
        return s ? { ...d, model: s.model || d.model, baseUrl: s.baseUrl || d.baseUrl, isActive: !!s.isActive, apiKey: '', hasKey: !!s.hasKey } : d;
      }));
    }).catch(() => {});
  };

  const loadVendors = () => {
    adminApi.getVendorAiAssignments().then(r => {
      const list: VendorAi[] = r.data.data || [];
      setVendors(list);
      const map: Record<string, VendorEdit> = {};
      list.forEach(v => { map[v._id] = { ...v.assignment, apiKey: '' }; });
      setEdits(map);
    }).catch(() => {});
  };

  useEffect(() => {
    loadProviders();
    loadVendors();
  }, []);

  const updateEdit = (id: string, field: keyof VendorEdit, value: string | boolean) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveVendor = async (id: string) => {
    const e = edits[id];
    if (!e) return;
    setSavingVendor(id);
    try {
      const payload: Record<string, unknown> = { enabled: e.enabled, provider: e.provider, model: e.model, endpoint: e.endpoint };
      if (e.apiKey && !e.apiKey.startsWith('****')) payload.apiKey = e.apiKey;
      await adminApi.updateVendorAiAssignment(id, payload);
      toast.success('Vendor AI saved');
      loadVendors();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSavingVendor('');
  };

  const filteredVendors = vendors.filter(v => {
    const q = vendorSearch.toLowerCase();
    return !q || v.name?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q) || v.companyName?.toLowerCase().includes(q);
  });

  const updateProvider = (idx: number, field: keyof AIProvider, value: string | boolean) => {
    setProviders(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = providers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        model: p.model,
        baseUrl: p.baseUrl,
        isActive: p.isActive,
        ...(p.apiKey ? { apiKey: p.apiKey } : {}),
      }));
      await adminApi.updateAISettings({ providers: payload });
      toast.success('AI settings saved');
      loadProviders();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  const providerColors: Record<string, string> = {
    openai: 'bg-green-500', deepseek: 'bg-blue-600', xai: 'bg-gray-800', gemini: 'bg-blue-500',
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">AI Intelligence</h1><p className="text-gray-500 text-sm mt-1">Configure AI model providers</p></div>
        <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save All</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map((provider, idx) => (
          <Card key={provider.name}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${providerColors[provider.name] || 'bg-gray-500'} rounded-xl flex items-center justify-center`}>
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{provider.displayName}</h3>
                  <p className="text-xs text-gray-500">{provider.model}</p>
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={provider.isActive} onChange={e => updateProvider(idx, 'isActive', e.target.checked)} className="rounded text-emerald-600" />
                <span className="text-sm">{provider.isActive ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
            <div className="space-y-3">
              <Input label="Model" value={provider.model} onChange={e => updateProvider(idx, 'model', e.target.value)} />
              <Input label="API Key" type="password" value={provider.apiKey} onChange={e => updateProvider(idx, 'apiKey', e.target.value)} placeholder={provider.hasKey ? '•••• saved (leave blank to keep)' : `${provider.displayName} API key`} />
              <Input label="Endpoint" value={provider.baseUrl} onChange={e => updateProvider(idx, 'baseUrl', e.target.value)} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Per-Vendor AI Assignment</h2>
            <p className="text-gray-500 text-sm">Assign a provider &amp; key to specific vendors. Used only when a vendor has not set their own key in Client &rarr; AI Settings. If left off, the global provider above is used.</p>
          </div>
        </div>
        <Input placeholder="Search vendor by name / email / company" value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="my-3 max-w-md" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Use</th>
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">API Key</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map(v => {
                const e = edits[v._id];
                if (!e) return null;
                return (
                  <tr key={v._id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-900">{v.name || v.companyName || v.email}</div>
                      <div className="text-xs text-gray-500">{v.email}{v.hasOwnKey ? ' · has own key' : ''}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" checked={e.enabled} onChange={ev => updateEdit(v._id, 'enabled', ev.target.checked)} className="rounded text-emerald-600" />
                    </td>
                    <td className="py-2 pr-3">
                      <select value={e.provider} onChange={ev => updateEdit(v._id, 'provider', ev.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                        {PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input value={e.model} onChange={ev => updateEdit(v._id, 'model', ev.target.value)} placeholder="auto" className="border rounded-lg px-2 py-1.5 text-sm w-32" />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="password" value={e.apiKey} onChange={ev => updateEdit(v._id, 'apiKey', ev.target.value)} placeholder={v.assignment.hasKey ? '•••• saved' : 'API key'} className="border rounded-lg px-2 py-1.5 text-sm w-44" />
                    </td>
                    <td className="py-2 pr-3">
                      <Button variant="secondary" loading={savingVendor === v._id} onClick={() => saveVendor(v._id)}>Save</Button>
                    </td>
                  </tr>
                );
              })}
              {filteredVendors.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">No vendors</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
