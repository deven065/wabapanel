'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Phone, PhoneCall, Trash2, Edit, Save, RefreshCw, ToggleLeft, ToggleRight, Star, Download, History } from 'lucide-react';
import { aiCallingApi, aiSettingsApi, tagApi } from '@/lib/api';
import { useCall } from '@/contexts/CallProvider';
import toast from 'react-hot-toast';

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const REALTIME_MODELS = ['gpt-realtime', 'gpt-4o-realtime-preview', 'gpt-4o-mini-realtime-preview'];
const SARVAM_VOICES = ['priya', 'neha', 'rahul', 'simran', 'kavya', 'aditya', 'ritu', 'ashutosh', 'pooja', 'rohan', 'amit', 'dev'];
// A voice must match its provider — e.g. an OpenAI voice ("marin") is rejected by Sarvam.
// When the provider changes, reset voiceId to a valid default for the new provider.
const defaultVoiceForProvider = (p: string): string =>
  p === 'openai' ? 'alloy'
    : (p === 'sarvam' || p === 'groq_sarvam') ? 'priya'
    : p === 'elevenlabs' ? 'rachel'
    : '';
const ELEVENLABS_VOICES = ['rachel', 'drew', 'clyde', 'paul', 'domi', 'dave', 'fin', 'sarah', 'antoni', 'thomas', 'charlie', 'george', 'emily', 'elli', 'callum', 'patrick', 'harry', 'liam', 'dorothy', 'josh', 'arnold', 'charlotte', 'matilda', 'matthew', 'james', 'joseph', 'jeremy', 'michael', 'ethan', 'gigi', 'freya', 'grace', 'daniel', 'lily', 'serena', 'adam', 'nicole', 'bill', 'jessie', 'sam', 'glinda', 'giovanni', 'mimi'];

interface AIAgent {
  _id: string; name: string; description: string; voiceProvider: string; aiModel: string; groqApiKey?: string;
  voiceId?: string; voiceApiKey?: string; voiceConfig?: { apiKey?: string };
  systemPrompt: string; greeting: string; maxDuration: number; transferNumber: string;
  catalogUrl?: string; followUpMessage?: string;
  status: string; isDefault?: boolean; stats: { totalCalls: number; avgDuration: number };
}

interface CallHistoryItem {
  _id: string; callId: string; to?: string; from?: string; direction: string;
  status: string; duration: number; agentName: string; recordingUrl: string; createdAt: string;
}

const FILE_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api$/, '');

export default function AICallingPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [aiCallingEnabled, setAiCallingEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAgent, setEditAgent] = useState<AIAgent | null>(null);
  const [callPhone, setCallPhone] = useState('');
  const { startCall, active: calling } = useCall();
  const [form, setForm] = useState({
    name: '', description: '', voiceProvider: 'openai', aiModel: 'gpt-realtime', voiceId: 'alloy', voiceApiKey: '', groqApiKey: '',
    systemPrompt: 'You are a helpful assistant for our business. Be friendly and professional on calls.',
    greeting: 'Hello! How can I help you today?', maxDuration: 300, transferNumber: '',
    catalogUrl: '', followUpMessage: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const fetchHistory = () => {
    aiCallingApi.getCallHistory().then(r => setHistory(r.data.data || [])).catch(() => {});
  };
  useEffect(() => { fetchHistory(); }, []);

  const [ct, setCt] = useState<{ mode: string; tags: string[]; excludeTags: string[] }>({ mode: 'manual', tags: [], excludeTags: [] });
  const [allTags, setAllTags] = useState<{ _id: string; name: string; color?: string }[]>([]);
  const [ctSaving, setCtSaving] = useState(false);

  useEffect(() => {
    aiSettingsApi.get().then(r => {
      const t = r.data.data?.callTargeting;
      if (t) setCt({ mode: t.mode || 'manual', tags: t.tags || [], excludeTags: t.excludeTags || [] });
      const rc = r.data.data?.callRecording;
      if (rc) setRec({ enabled: rc.enabled !== false, autoDeleteDays: rc.autoDeleteDays || 0 });
    }).catch(() => {});
    tagApi.list().then(r => setAllTags(r.data.data || [])).catch(() => {});
  }, []);

  const [rec, setRec] = useState<{ enabled: boolean; autoDeleteDays: number }>({ enabled: true, autoDeleteDays: 0 });
  const [recSaving, setRecSaving] = useState(false);
  const saveRec = async () => {
    setRecSaving(true);
    try { await aiSettingsApi.update({ callRecording: rec }); toast.success('Recording settings saved'); }
    catch { toast.error('Failed to save'); }
    setRecSaving(false);
  };

  const saveCt = async () => {
    setCtSaving(true);
    try { await aiSettingsApi.update({ callTargeting: ct }); toast.success('Call targeting saved'); }
    catch { toast.error('Failed to save'); }
    setCtSaving(false);
  };

  const toggleCtTag = (id: string, key: 'tags' | 'excludeTags') => {
    setCt(prev => ({ ...prev, [key]: prev[key].includes(id) ? prev[key].filter(t => t !== id) : [...prev[key], id] }));
  };

  const fetchAiCallingStatus = async () => {
    try {
      const res = await aiSettingsApi.get();
      setAiCallingEnabled(res.data?.data?.callTargeting?.mode === 'all');
    } catch {}
  };
  const toggleAiCalling = async () => {
    try {
      const newMode = aiCallingEnabled ? 'none' : 'all';
      await aiSettingsApi.update({ callTargeting: { mode: newMode } });
      setAiCallingEnabled(!aiCallingEnabled);
      toast.success(aiCallingEnabled ? 'AI Calling OFF' : 'AI Calling ON');
    } catch { toast.error('Failed to toggle'); }
  };
  const fetchAgents = () => {
    aiCallingApi.getAgents().then(r => setAgents(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetchAgents(); fetchAiCallingStatus(); }, []);

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      await aiCallingApi.createAgent({ ...form, voiceConfig: { apiKey: form.voiceApiKey }, voiceApiKey: form.voiceApiKey });
      toast.success('AI Agent created');
      setShowCreate(false);
      setForm({ name: '', description: '', voiceProvider: 'openai', aiModel: 'gpt-realtime', voiceId: 'alloy', voiceApiKey: '', groqApiKey: '', systemPrompt: form.systemPrompt, greeting: form.greeting, maxDuration: 300, transferNumber: '', catalogUrl: '', followUpMessage: '' });
      fetchAgents();
    } catch { toast.error('Failed to create agent'); } finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (!editAgent) return;
    try {
      await aiCallingApi.updateAgent(editAgent._id, editAgent);
      toast.success('Agent updated');
      setEditAgent(null);
      fetchAgents();
    } catch { toast.error('Failed to update'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this AI agent?')) return;
    try {
      await aiCallingApi.deleteAgent(id);
      toast.success('Deleted');
      fetchAgents();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleToggleStatus = async (agent: AIAgent) => {
    try {
      await aiCallingApi.updateAgent(agent._id, { status: agent.status === 'active' ? 'inactive' : 'active' });
      fetchAgents();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleSetDefault = async (agentId: string, enabled: boolean) => {
    try {
      await aiCallingApi.setDefaultAgent({ agentId, enabled });
      toast.success(enabled ? 'Default AI agent set for incoming calls' : 'Default AI agent removed');
      fetchAgents();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleCall = (agentId?: string) => {
    if (!callPhone) { toast.error('Enter phone number'); return; }
    startCall(callPhone, callPhone, agentId);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = agents.length > 0 && selectedIds.length === agents.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : agents.map(a => a._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => aiCallingApi.deleteAgent(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchAgents();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><PhoneCall className="w-6 h-6 text-emerald-600" /> AI Calling Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Create AI agents to handle incoming & outgoing WhatsApp calls</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleAiCalling}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${aiCallingEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-gray-200 text-gray-600'}`}>
            {aiCallingEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            AI Calling {aiCallingEnabled ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New AI Agent
          </button>
        </div>
      </div>

      {/* Call Targeting */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-gray-700">Incoming Call Targeting — kaun si calls AI uthaye?</h3>
          <button onClick={saveCt} disabled={ctSaving} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">{ctSaving ? 'Saving...' : 'Save'}</button>
        </div>
        <p className="text-xs text-gray-400 mb-3">If a customer&apos;s AI Call toggle is ON in chat, AI will always answer their calls (this setting does not override that).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          {[
            { v: 'manual', l: 'Manual only', d: 'Only customers with AI:ON in chat' },
            { v: 'all', l: 'All contacts', d: 'Sab incoming calls AI uthaye' },
            { v: 'saved', l: 'Saved contacts', d: 'Only calls from saved contacts' },
            { v: 'tags', l: 'Selected tags', d: 'Only contacts with selected tags' },
          ].map(o => (
            <label key={o.v} className={`p-3 rounded-lg border cursor-pointer ${ct.mode === o.v ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="ctmode" className="hidden" checked={ct.mode === o.v} onChange={() => setCt(prev => ({ ...prev, mode: o.v }))} />
              <p className="text-sm font-medium text-gray-900">{o.l}</p>
              <p className="text-xs text-gray-500">{o.d}</p>
            </label>
          ))}
        </div>
        {ct.mode === 'tags' && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-600 mb-1">AI will answer calls from contacts with these tags:</p>
            <div className="flex flex-wrap gap-2">
              {allTags.length ? allTags.map(t => (
                <button key={t._id} onClick={() => toggleCtTag(t._id, 'tags')}
                  className={`px-2.5 py-1 rounded-full text-xs border ${ct.tags.includes(t._id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {t.name}
                </button>
              )) : <span className="text-xs text-gray-400">No tags yet — create tags under Contacts &gt; Tags first</span>}
            </div>
          </div>
        )}
        {ct.mode !== 'manual' && allTags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Exclude tags (AI will never answer calls from contacts with these tags):</p>
            <div className="flex flex-wrap gap-2">
              {allTags.map(t => (
                <button key={t._id} onClick={() => toggleCtTag(t._id, 'excludeTags')}
                  className={`px-2.5 py-1 rounded-full text-xs border ${ct.excludeTags.includes(t._id) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Call Recording settings */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-gray-700">Call Recording</h3>
          <button onClick={saveRec} disabled={recSaving} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">{recSaving ? 'Saving...' : 'Save'}</button>
        </div>
        <div className="flex flex-wrap items-center gap-6 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rec.enabled} onChange={e => setRec(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />
            <span className="text-sm text-gray-700">Record calls (AI + manual)</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Auto-delete after</span>
            <input type="number" min={0} value={rec.autoDeleteDays} onChange={e => setRec(prev => ({ ...prev, autoDeleteDays: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-20 px-2 py-1.5 border rounded-lg text-sm" />
            <span className="text-sm text-gray-500">days (0 = keep forever)</span>
          </div>
        </div>
      </div>

      {/* Quick Call */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Outgoing Call</h3>
        <div className="flex gap-2">
          <input type="text" value={callPhone} onChange={e => setCallPhone(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Phone number (e.g. +919876543210)" />
          <button onClick={() => handleCall()} disabled={calling}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50">
            <Phone className="w-4 h-4" /> {calling ? 'Calling...' : 'Call Now'}
          </button>
        </div>
      </div>

      {/* Agent Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Total Agents</p><p className="text-2xl font-bold mt-1">{agents.length}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Active Agents</p><p className="text-2xl font-bold text-emerald-600 mt-1">{agents.filter(a => a.status === 'active').length}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Total Calls</p><p className="text-2xl font-bold mt-1">{agents.reduce((s, a) => s + (a.stats?.totalCalls || 0), 0)}</p></div>
      </div>

      {/* Agent List */}
      {agents.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} selected</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Clear</button>
              <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete selected</button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-3">
        {agents.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <PhoneCall className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No AI agents yet</p>
            <p className="text-xs text-gray-400 mt-1">Create an AI agent to handle WhatsApp calls</p>
          </div>
        ) : agents.map(agent => (
          <div key={agent._id} className="bg-white rounded-xl border p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selectedIds.includes(agent._id)} onChange={() => toggleSelect(agent._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${agent.status === 'active' ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                  <Phone className={`w-5 h-5 ${agent.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {agent.name}
                    {agent.isDefault && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Default</span>}
                  </h3>
                  <p className="text-sm text-gray-500">{agent.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleSetDefault(agent._id, !agent.isDefault)}
                  className={`px-3 py-1.5 rounded-lg text-xs ${agent.isDefault ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  {agent.isDefault ? 'Remove Default' : 'Set as Default'}
                </button>
                <button onClick={() => handleToggleStatus(agent)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${agent.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {agent.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {agent.status === 'active' ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => setEditAgent({ ...agent })} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => handleDelete(agent._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-xs text-gray-500">
              <div>Model: <span className="text-gray-700">{agent.aiModel}</span></div>
              <div>Provider: <span className="text-gray-700">{agent.voiceProvider}</span></div>
              <div>Calls: <span className="text-gray-700">{agent.stats?.totalCalls || 0}</span></div>
              <div>Max Duration: <span className="text-gray-700">{agent.maxDuration}s</span></div>
            </div>
            {agent.greeting && <p className="mt-2 text-xs text-gray-400 italic">&quot;{agent.greeting}&quot;</p>}
          </div>
        ))}
      </div>

      {/* Call History */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Call History</h3>
          <button onClick={fetchHistory} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Refresh"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No calls yet</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Number</th>
                    <th className="py-2 pr-3">Direction</th>
                    <th className="py-2 pr-3">Agent</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllHistory ? history : history.slice(0, 10)).map(h => (
                    <tr key={h._id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{new Date(h.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-2 pr-3 text-gray-900">{h.direction === 'USER_INITIATED' ? (h.from || '-') : (h.to || '-')}</td>
                      <td className="py-2 pr-3 text-gray-600">{h.direction === 'USER_INITIATED' ? 'Incoming' : 'Outgoing'}</td>
                      <td className="py-2 pr-3 text-gray-600">{h.agentName || '-'}</td>
                      <td className="py-2 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full ${['completed', 'terminated', 'accepted'].includes(h.status) ? 'bg-emerald-100 text-emerald-700' : ['failed', 'rejected'].includes(h.status) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{h.status}</span></td>
                      <td className="py-2 pr-3">
                        {h.recordingUrl ? (
                          <div className="flex items-center gap-2">
                            <audio controls preload="none" className="h-8 max-w-[220px]" src={FILE_BASE + h.recordingUrl} />
                            <a href={FILE_BASE + h.recordingUrl} download className="p-1.5 hover:bg-gray-100 rounded-lg" title="Download"><Download className="w-4 h-4 text-gray-400" /></a>
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length > 10 && (
              <button onClick={() => setShowAllHistory(v => !v)} className="mt-2 text-xs text-emerald-600 hover:underline">
                {showAllHistory ? 'Show less' : `Show all (${history.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editAgent) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditAgent(null); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b"><h3 className="font-semibold text-gray-900">{editAgent ? 'Edit AI Agent' : 'Create AI Agent'}</h3></div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                <input type="text" value={editAgent?.name || form.name} onChange={e => editAgent ? setEditAgent({ ...editAgent, name: e.target.value }) : setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Sales Assistant" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={editAgent?.description || form.description} onChange={e => editAgent ? setEditAgent({ ...editAgent, description: e.target.value }) : setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voice Provider</label>
                  <select value={editAgent?.voiceProvider || form.voiceProvider} onChange={e => { const v = e.target.value; if (editAgent) { setEditAgent({ ...editAgent, voiceProvider: v, voiceId: defaultVoiceForProvider(v), ...(v === 'openai' ? { voiceApiKey: '', voiceConfig: { ...editAgent.voiceConfig, apiKey: '' } } : {}) }); } else { setForm({ ...form, voiceProvider: v, voiceId: defaultVoiceForProvider(v), ...(v === 'openai' ? { voiceApiKey: '' } : {}) }); } }}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="openai">OpenAI Realtime</option><option value="groq_sarvam">Groq + Sarvam (Budget ₹1/min)</option><option value="elevenlabs">ElevenLabs</option><option value="sarvam">Sarvam AI</option><option value="cartesia">Cartesia</option><option value="google">Google</option><option value="azure">Azure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label>
                  <select value={editAgent?.aiModel || form.aiModel} onChange={e => editAgent ? setEditAgent({ ...editAgent, aiModel: e.target.value }) : setForm({ ...form, aiModel: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    {REALTIME_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {(editAgent?.voiceProvider || form.voiceProvider) === 'openai' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                  <select value={editAgent ? (editAgent.voiceId || 'alloy') : form.voiceId}
                    onChange={e => editAgent ? setEditAgent({ ...editAgent, voiceId: e.target.value }) : setForm({ ...form, voiceId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    {OPENAI_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                    {(['sarvam', 'groq_sarvam'].includes(editAgent?.voiceProvider || form.voiceProvider)) ? (
                      <select value={editAgent ? (SARVAM_VOICES.includes(editAgent.voiceId || '') ? editAgent.voiceId : 'priya') : form.voiceId}
                        onChange={e => editAgent ? setEditAgent({ ...editAgent, voiceId: e.target.value }) : setForm({ ...form, voiceId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        {SARVAM_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (editAgent?.voiceProvider || form.voiceProvider) === 'elevenlabs' ? (
                      <select value={editAgent ? (editAgent.voiceId || 'rachel') : form.voiceId}
                        onChange={e => editAgent ? setEditAgent({ ...editAgent, voiceId: e.target.value }) : setForm({ ...form, voiceId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        {ELEVENLABS_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={editAgent ? (editAgent.voiceId || '') : form.voiceId}
                        onChange={e => editAgent ? setEditAgent({ ...editAgent, voiceId: e.target.value }) : setForm({ ...form, voiceId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Provider voice ID" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voice Provider API Key <span className="text-xs text-emerald-600">(Sarvam/ElevenLabs/Cartesia key)</span></label>
                    <input type="password" value={editAgent ? (editAgent.voiceApiKey || editAgent.voiceConfig?.apiKey || '') : form.voiceApiKey}
                      onChange={e => editAgent ? setEditAgent({ ...editAgent, voiceApiKey: e.target.value, voiceConfig: { ...editAgent.voiceConfig, apiKey: e.target.value } }) : setForm({ ...form, voiceApiKey: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="API key for selected voice provider" />
                  </div>
                </div>
              )}
              {(['groq_sarvam'].includes(editAgent?.voiceProvider || form.voiceProvider)) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Groq API Key <span className="text-xs text-emerald-600">(Free: console.groq.com)</span></label>
                  <input type="password" value={editAgent ? (editAgent.groqApiKey || '') : form.groqApiKey}
                    onChange={e => editAgent ? setEditAgent({ ...editAgent, groqApiKey: e.target.value }) : setForm({ ...form, groqApiKey: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="gsk_..." />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt (Training)</label>
                <textarea value={editAgent?.systemPrompt || form.systemPrompt} onChange={e => editAgent ? setEditAgent({ ...editAgent, systemPrompt: e.target.value }) : setForm({ ...form, systemPrompt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm h-24 resize-y" placeholder="Tell the AI how to behave on calls..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Greeting Message</label>
                <input type="text" value={editAgent?.greeting || form.greeting} onChange={e => editAgent ? setEditAgent({ ...editAgent, greeting: e.target.value }) : setForm({ ...form, greeting: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Duration (seconds)</label>
                  <input type="number" value={editAgent?.maxDuration || form.maxDuration} onChange={e => editAgent ? setEditAgent({ ...editAgent, maxDuration: parseInt(e.target.value) }) : setForm({ ...form, maxDuration: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Number</label>
                  <input type="text" value={editAgent?.transferNumber || form.transferNumber} onChange={e => editAgent ? setEditAgent({ ...editAgent, transferNumber: e.target.value }) : setForm({ ...form, transferNumber: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Fallback number for transfer" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catalog / Price List URL</label>
                <input type="text" value={editAgent ? (editAgent.catalogUrl || '') : form.catalogUrl} onChange={e => editAgent ? setEditAgent({ ...editAgent, catalogUrl: e.target.value }) : setForm({ ...form, catalogUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://... (PDF/image) — AI sends this on WhatsApp when caller asks for catalog" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Message (after call)</label>
                <textarea value={editAgent ? (editAgent.followUpMessage || '') : form.followUpMessage} onChange={e => editAgent ? setEditAgent({ ...editAgent, followUpMessage: e.target.value }) : setForm({ ...form, followUpMessage: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm h-16 resize-y" placeholder="Optional message sent on WhatsApp automatically after every AI call" />
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={() => { setShowCreate(false); setEditAgent(null); }} className="flex-1 py-2 rounded-lg text-sm border text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={editAgent ? handleUpdate : handleCreate} className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> {editAgent ? 'Update' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
