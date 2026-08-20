'use client';
import React, { useState, useEffect } from 'react';
import { Bot, Save, Shield, Target, MessageSquare, ToggleLeft, ToggleRight, RefreshCw, Brain, Key, TestTube, Sparkles, Upload, FileText, Trash2 } from 'lucide-react';
import { aiSettingsApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AISettings {
  enabled: boolean;
  provider: string;
  apiKey: string;
  model: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  azureRealtimeEndpoint?: string;
  azureRealtimeKey?: string;
  azureRealtimeDeployment?: string;
  azureRealtimeApiVersion?: string;
  systemPrompt: string;
  knowledgeBase: string;
  temperature: number;
  maxTokens: number;
  language: string;
  tone: string;
  targetingRules: {
    mode: string;
    channels: string[];
    targets: { type: string; value: string }[];
    excludeTags: string[];
    excludeAssigned: boolean;
    excludeActiveConversation: boolean;
  };
  handoffRules: {
    keywords: string[];
    maxUnknownReplies: number;
    detectFrustration: boolean;
    autoHandoffMessage: string;
  };
  features: { voiceToText: boolean; leadScoring: boolean; autoSummary: boolean; sentiment: boolean; autoTranslate: boolean; autoTicket: boolean; ticketKeywords: string[]; voiceReplyVoice?: string };
  stats?: { totalReplies: number; totalHandoffs: number; totalTokensUsed: number };
}

const defaultSettings: AISettings = {
  enabled: false, provider: 'openai', apiKey: '', model: 'gpt-4o',
  azureEndpoint: '', azureDeployment: '', azureApiVersion: '2024-02-15-preview',
  azureRealtimeEndpoint: '', azureRealtimeKey: '', azureRealtimeDeployment: '', azureRealtimeApiVersion: '2024-10-01-preview',
  systemPrompt: 'You are a helpful WhatsApp business assistant. Be concise, friendly, and helpful.',
  knowledgeBase: '', temperature: 0.7, maxTokens: 500, language: 'auto', tone: 'friendly',
  targetingRules: { mode: 'all', channels: [], targets: [], excludeTags: [], excludeAssigned: true, excludeActiveConversation: true },
  handoffRules: { keywords: ['agent', 'human', 'person', 'help'], maxUnknownReplies: 3, detectFrustration: true, autoHandoffMessage: "I'm connecting you with a human agent. Please hold on." },
  features: { voiceToText: false, leadScoring: false, autoSummary: false, sentiment: false, autoTranslate: false, autoTicket: false, ticketKeywords: ['complaint', 'refund', 'problem', 'issue', 'not working'], voiceReplyVoice: 'openai' },
};

const targetOptions = [
  { value: 'all', label: 'All contacts', desc: 'AI replies to messages from all customers' },
  { value: 'new_leads', label: 'New leads only (24h)', desc: 'Only new leads (first 24 hours)' },
  { value: 'unassigned', label: 'Unassigned chats', desc: 'Chats not assigned to any agent' },
  { value: 'no_response', label: 'No response contacts', desc: 'Contacts with no reply sent yet' },
  { value: 'off_hours', label: 'Off-hours only', desc: 'AI replies only outside business hours' },
];

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini', 'gpt-3.5-turbo'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  xai: ['grok-3', 'grok-3-mini', 'grok-2-1212'],
  azure: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4', 'gpt-35-turbo'],
};

interface KbDoc { _id: string; filename: string; size: number; chars: number; status: string; note?: string; }

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [uploadingKb, setUploadingKb] = useState(false);

  const loadKbDocs = () => {
    aiSettingsApi.listKnowledgeDocs().then(r => setKbDocs(r.data.data || [])).catch(() => {});
  };
  useEffect(() => { loadKbDocs(); }, []);

  const handleKbUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadingKb(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await aiSettingsApi.uploadKnowledgeDoc(fd);
        const d = r.data.data;
        if (d.status === 'no_text') toast('Uploaded ' + d.filename + ' \u2014 image/video saved, but no text could be read', { icon: '\u26A0\uFE0F' });
        else if (d.status === 'error') toast.error('Could not read ' + d.filename);
        else toast.success(d.filename + ' added (' + d.chars + ' chars)');
      }
      loadKbDocs();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Upload failed');
    } finally {
      setUploadingKb(false);
    }
  };

  const handleKbDelete = async (id: string) => {
    try { await aiSettingsApi.deleteKnowledgeDoc(id); setKbDocs(docs => docs.filter(d => d._id !== id)); toast.success('Removed'); }
    catch { toast.error('Delete failed'); }
  };

  useEffect(() => {
    aiSettingsApi.get()
      .then(r => { if (r.data.data) setSettings({ ...defaultSettings, ...r.data.data, features: { ...defaultSettings.features, ...(r.data.data.features || {}) } }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    setSaving(true);
    try {
      await aiSettingsApi.update(settings);
      toast.success('AI Settings saved!');
    } catch { toast.error('Failed to save'); } finally { setSubmitting(false); }
    setSaving(false);
  };

  const handleTest = async () => {
    if (submitting) return;
    setTesting(true);
    setSubmitting(true);
    try {
      const r = await aiSettingsApi.test();
      toast.success('Connection successful! Response: ' + (r.data.data?.response || 'OK'));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Connection failed');
    } finally {
      setSubmitting(false);
    }
    setTesting(false);
  };

  const toggleTarget = (type: string) => {
    const targets = settings.targetingRules.targets || [];
    const exists = targets.find(t => t.type === type);
    const newTargets = exists ? targets.filter(t => t.type !== type) : [...targets, { type, value: '' }];
    setSettings({ ...settings, targetingRules: { ...settings.targetingRules, targets: newTargets } });
  };

  const channelOptions = [
    { value: 'whatsapp', label: 'WhatsApp (Official API)' },
    { value: 'whatsapp_qr', label: 'WhatsApp by QR' },
    { value: 'telegram', label: 'Telegram Bot' },
    { value: 'telegram_personal', label: 'Personal Telegram' },
    { value: 'facebook', label: 'Facebook Messenger' },
    { value: 'instagram', label: 'Instagram DM' },
  ];

  const toggleChannel = (value: string) => {
    const channels = settings.targetingRules.channels || [];
    const newChannels = channels.includes(value) ? channels.filter(c => c !== value) : [...channels, value];
    setSettings({ ...settings, targetingRules: { ...settings.targetingRules, channels: newChannels } });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const tabs = [
    { id: 'general', label: 'General', icon: <Brain className="w-4 h-4" /> },
    { id: 'prompt', label: 'Prompt & Knowledge', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'targeting', label: 'Targeting Rules', icon: <Target className="w-4 h-4" /> },
    { id: 'handoff', label: 'Handoff Rules', icon: <Shield className="w-4 h-4" /> },
    { id: 'features', label: 'AI Features', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bot className="w-6 h-6 text-emerald-600" /> AI Chatbot Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure AI auto-reply for incoming WhatsApp messages</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {settings.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {settings.enabled ? 'AI Active' : 'AI Inactive'}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {settings.stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">AI Replies</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalReplies}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Handoffs to Human</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalHandoffs}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Tokens Used</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalTokensUsed?.toLocaleString()}</p></div>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        {activeTab === 'general' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
                <select value={settings.provider} onChange={e => setSettings({ ...settings, provider: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="xai">xAI (Grok)</option>
                  <option value="azure">Azure OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select value={MODEL_OPTIONS[settings.provider]?.includes(settings.model) ? settings.model : 'custom'}
                  onChange={e => { if (e.target.value !== 'custom') setSettings({ ...settings, model: e.target.value }); else setSettings({ ...settings, model: '' }); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  {(MODEL_OPTIONS[settings.provider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="custom">Custom model...</option>
                </select>
                {!MODEL_OPTIONS[settings.provider]?.includes(settings.model) && (
                  <input type="text" value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm mt-2" placeholder="Enter model name (e.g. gpt-4o)" />
                )}
              </div>
            </div>
            {settings.provider === 'azure' && (
              <div className="grid grid-cols-1 gap-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm font-semibold text-blue-800">💬 Chat AI — WhatsApp text auto-reply</p>
                <p className="text-xs text-blue-700">These settings are for <b>chat / text replies</b> (answering WhatsApp messages). Azure OpenAI uses your resource Endpoint plus the Deployment name you created in Azure (not the plain model name). Find these in Azure Portal → your resource → Keys and Endpoint / Deployments. Enter its key in the <b>Chat API Key</b> field below.</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Azure Endpoint</label>
                  <input type="text" value={settings.azureEndpoint || ''} onChange={e => setSettings({ ...settings, azureEndpoint: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://your-resource.openai.azure.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deployment Name</label>
                    <input type="text" value={settings.azureDeployment || ''} onChange={e => setSettings({ ...settings, azureDeployment: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. gpt-4o" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Version</label>
                    <input type="text" value={settings.azureApiVersion || ''} onChange={e => setSettings({ ...settings, azureApiVersion: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="2024-02-15-preview" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> Chat API Key</label>
                  <div className="flex gap-2">
                    <input type="password" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Azure resource key (for chat)" />
                    <button onClick={handleTest} disabled={testing} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50">
                      <TestTube className="w-4 h-4" /> {testing ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {settings.provider === 'azure' && (
              <div className="grid grid-cols-1 gap-4 p-3 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-sm font-semibold text-purple-800">📞 AI Calling — voice (phone calls)</p>
                <p className="text-xs text-purple-700">These settings are only for <b>voice / calling</b> (separate from chat). A realtime voice model usually lives in its own Azure resource, so its Endpoint &amp; Key can differ from the chat ones above. Leave Endpoint/Key blank to reuse the chat ones. <b>Fill in the Deployment Name to enable Azure calling.</b> (The voice is chosen on the AI Calling Settings page — use <b>marin/cedar</b> for the most human-sounding voice.)</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Realtime Endpoint (optional)</label>
                  <input type="text" value={settings.azureRealtimeEndpoint || ''} onChange={e => setSettings({ ...settings, azureRealtimeEndpoint: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://your-realtime-resource.cognitiveservices.azure.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Realtime Deployment Name</label>
                    <input type="text" value={settings.azureRealtimeDeployment || ''} onChange={e => setSettings({ ...settings, azureRealtimeDeployment: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. gpt-realtime-2.1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Realtime API Version</label>
                    <input type="text" value={settings.azureRealtimeApiVersion || ''} onChange={e => setSettings({ ...settings, azureRealtimeApiVersion: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="2024-10-01-preview" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> Realtime API Key (optional)</label>
                  <input type="password" value={settings.azureRealtimeKey || ''} onChange={e => setSettings({ ...settings, azureRealtimeKey: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="leave blank to reuse chat key" />
                </div>
              </div>
            )}
            {settings.provider !== 'azure' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> API Key</label>
                <div className="flex gap-2">
                  <input type="password" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="sk-..." />
                  <button onClick={handleTest} disabled={testing} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 flex items-center gap-1 disabled:opacity-50">
                    <TestTube className="w-4 h-4" /> {testing ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature ({settings.temperature})</label>
                <input type="range" min="0" max="2" step="0.1" value={settings.temperature}
                  onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                  className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                <input type="number" value={settings.maxTokens} onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
                <select value={settings.tone} onChange={e => setSettings({ ...settings, tone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
              <p className="text-xs text-gray-400 mb-2">Tell the AI who it is, how to behave, and what your business does</p>
              <textarea value={settings.systemPrompt} onChange={e => setSettings({ ...settings, systemPrompt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-32 resize-y" placeholder="You are a helpful assistant for [Your Business]..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Knowledge Base</label>
              <p className="text-xs text-gray-400 mb-2">Add your FAQ, product info, pricing, policies — AI will use this to answer questions</p>
              <textarea value={settings.knowledgeBase} onChange={e => setSettings({ ...settings, knowledgeBase: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-48 resize-y" placeholder="Products: &#10;- Product A: ₹999, features...&#10;- Product B: ₹1999, features...&#10;&#10;FAQ:&#10;Q: What are your working hours?&#10;A: Mon-Sat, 10AM-7PM IST" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Knowledge Files</label>
              <p className="text-xs text-gray-400 mb-2">Upload PDF, Word, Excel, CSV or text files (product lists, catalogs, price sheets). The AI reads their text and uses it to answer. Images and videos are stored for reference, but their text cannot be read.</p>
              <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg py-6 cursor-pointer transition-colors ${uploadingKb ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-emerald-300 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50'}`}>
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium">{uploadingKb ? 'Uploading…' : 'Click to upload files'}</span>
                <span className="text-[11px] text-gray-400">PDF, DOCX, XLSX, CSV, TXT, images (max 50MB each)</span>
                <input type="file" multiple className="hidden" disabled={uploadingKb}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,video/mp4"
                  onChange={e => { handleKbUpload(e.target.files); e.currentTarget.value=''; }} />
              </label>
              {kbDocs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {kbDocs.map(d => (
                    <div key={d._id} className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-white">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">{d.filename}</div>
                        <div className="text-[11px] text-gray-400">
                          {(d.size/1024).toFixed(0)} KB
                          {d.status === 'ready' && d.chars ? ` · ${d.chars} chars read` : ''}
                          {d.status === 'no_text' ? ' · no text (stored for reference)' : ''}
                          {d.status === 'error' ? ' · could not read' : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleKbDelete(d._id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Remove"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'targeting' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Which channels should AI reply on?</label>
              <p className="text-xs text-gray-400 mb-3">Pick the channels where the AI auto-reply is active. Leave all unchecked to enable AI on every channel.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {channelOptions.map(opt => {
                  const on = settings.targetingRules.channels?.includes(opt.value) || false;
                  return (
                    <label key={opt.value} className={`p-3 rounded-lg border cursor-pointer transition ${on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={on} onChange={() => toggleChannel(opt.value)} />
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Who should AI reply to?</label>
              <p className="text-xs text-gray-400 mb-3">Pick one or more categories — AI will auto-reply to messages from the selected ones</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {targetOptions.map(opt => {
                  const on = settings.targetingRules.targets?.some(t => t.type === opt.value) || false;
                  return (
                    <label key={opt.value} className={`p-3 rounded-lg border cursor-pointer transition ${on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={on} onChange={() => toggleTarget(opt.value)} />
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Exclude from AI replies:</h4>
              <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={settings.targetingRules.excludeAssigned}
                  onChange={e => setSettings({ ...settings, targetingRules: { ...settings.targetingRules, excludeAssigned: e.target.checked } })}
                  className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-gray-700">Exclude chats assigned to an agent (agent handles, not AI)</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={settings.targetingRules.excludeActiveConversation}
                  onChange={e => setSettings({ ...settings, targetingRules: { ...settings.targetingRules, excludeActiveConversation: e.target.checked } })}
                  className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-gray-700">Exclude active human conversations (if agent replied in last 30 min)</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Each feature has its own on/off toggle. The AI API key is set in the General tab — if the key is missing or a feature is off, that feature is silently skipped and the panel works normally.</p>
            {([
              ['voiceToText', 'Voice Message → Text', 'Automatically converts customer voice notes to text (requires OpenAI provider) — AI replies also work on voice messages'],
              ['leadScoring', 'AI Lead Scoring', 'Automatic 🔥 Hot / Warm / Cold badge on every lead (shown in the chat list)'],
              ['autoSummary', 'Conversation Auto Summary', '✨ Summary button in the chat header — AI summary of the whole conversation'],
              ['sentiment', 'Sentiment Analysis', '😟 flag in the chat list for unhappy customers'],
              ['autoTranslate', 'Auto Translation', 'Shows an English translation below messages written in other languages'],
              ['autoTicket', 'Auto Ticket Creation', 'Automatically creates a ticket when a message contains complaint keywords'],
            ] as [string, string, string][]).map(([key, label, desc]) => {
              const feats = settings.features as unknown as Record<string, boolean>;
              return (
                <div key={key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="pr-3">
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button onClick={() => setSettings({ ...settings, features: { ...settings.features, [key]: !feats[key] } })}>
                    {feats[key] ? <ToggleRight className="w-9 h-9 text-emerald-600" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}
                  </button>
                </div>
              );
            })}
            {settings.features.voiceToText && (
              <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <label className="block text-sm font-medium text-gray-700 mb-1">🎙 Which voice should voice replies use?</label>
                <select value={settings.features.voiceReplyVoice || 'openai'}
                  onChange={e => setSettings({ ...settings, features: { ...settings.features, voiceReplyVoice: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="openai">Standard AI (OpenAI TTS) — uses the OpenAI key from the General tab</option>
                  <option value="calling_agent">Calling Agent voice — the ElevenLabs / Sarvam / Cartesia voice from your AI Calling agent</option>
                </select>
                <p className="text-xs text-gray-400 mt-1.5">When Calling Agent is selected: your agent under AI Calling must have a voice provider, its API key, and a voice ID configured — the same voice (best for Hindi) will also speak in chat voice replies. If the agent voice fails, it falls back to OpenAI.</p>
              </div>
            )}
            {settings.features.autoTicket && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Keywords (comma separated)</label>
                <input value={settings.features.ticketKeywords.join(', ')}
                  onChange={e => setSettings({ ...settings, features: { ...settings.features, ticketKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="complaint, refund, problem" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'handoff' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Handoff Keywords</label>
              <p className="text-xs text-gray-400 mb-2">When customer types these words, AI transfers to human agent</p>
              <input type="text" value={settings.handoffRules.keywords?.join(', ')}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) } })}
                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="agent, human, person, help, complaint" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Unknown Replies Before Handoff</label>
              <input type="number" value={settings.handoffRules.maxUnknownReplies}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, maxUnknownReplies: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border rounded-lg text-sm" min="1" max="10" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Handoff Message</label>
              <textarea value={settings.handoffRules.autoHandoffMessage}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, autoHandoffMessage: e.target.value } })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-y" />
            </div>
            <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={settings.handoffRules.detectFrustration}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, detectFrustration: e.target.checked } })}
                className="w-4 h-4 text-emerald-600 rounded" />
              <div>
                <span className="text-sm text-gray-700 font-medium">Detect frustration</span>
                <p className="text-xs text-gray-400">Auto-handoff when customer seems frustrated or angry</p>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
