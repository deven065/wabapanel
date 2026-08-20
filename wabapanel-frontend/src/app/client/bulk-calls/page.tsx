'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Phone, Play, Pause, Trash2, RefreshCw, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { aiCallingApi, tagApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface CallTarget {
  phone: string;
  name?: string;
  status: string;
  error?: string;
  calledAt?: string;
}

interface CallCampaignItem {
  _id: string;
  name: string;
  status: string;
  agent?: { _id: string; name: string } | null;
  callingHours?: { start: string; end: string };
  dailyLimit: number;
  callsToday: number;
  stats: { total: number; done: number; failed: number; permissionRequested: number };
  createdAt: string;
}

interface AgentItem { _id: string; name: string; status: string }
interface TagItem { _id: string; name: string }

const statusColor = (s: string) =>
  s === 'running' ? 'success' : s === 'completed' ? 'info' : s === 'failed' ? 'danger' : 'default';

export default function BulkCallsPage() {
  const [campaigns, setCampaigns] = useState<CallCampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [detail, setDetail] = useState<(CallCampaignItem & { targets: CallTarget[] }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    agentId: '',
    tagId: '',
    phonesText: '',
    startHour: '10:00',
    endHour: '19:00',
    dailyLimit: 50,
  });

  const load = async () => {
    try {
      const res = await aiCallingApi.getCallCampaigns();
      setCampaigns(res.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    aiCallingApi.getAgents().then(r => setAgents((r.data.data || []).filter((a: AgentItem) => a.status === 'active'))).catch(() => {});
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const phones = form.phonesText.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
    if (!phones.length && !form.tagId) { toast.error('Add phone numbers or select a tag'); return; }
    setSaving(true);
    try {
      await aiCallingApi.createCallCampaign({
        name: form.name,
        agentId: form.agentId || undefined,
        tagId: form.tagId || undefined,
        phones,
        callingHours: { start: form.startHour, end: form.endHour },
        dailyLimit: form.dailyLimit,
      });
      toast.success('Campaign created');
      setShowModal(false);
      setForm({ name: '', agentId: '', tagId: '', phonesText: '', startHour: '10:00', endHour: '19:00', dailyLimit: 50 });
      load();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to create campaign');
    }
    setSaving(false);
  };

  const doAction = async (id: string, action: 'start' | 'pause' | 'delete') => {
    try {
      if (action === 'start') await aiCallingApi.startCallCampaign(id);
      if (action === 'pause') await aiCallingApi.pauseCallCampaign(id);
      if (action === 'delete') {
        if (!confirm('Delete this campaign?')) return;
        await aiCallingApi.deleteCallCampaign(id);
      }
      load();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await aiCallingApi.getCallCampaign(id);
      setDetail(res.data.data);
    } catch { toast.error('Failed to load campaign'); }
  };

  return (
    <div className="p-6">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="w-6 h-6" /> Bulk AI Calls
          </h1>
          <p className="text-sm mt-1">AI agent calls your contact list automatically — 1 call per minute, within calling hours and daily limit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-1" /> New Campaign</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Today</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>}
            {!loading && campaigns.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No call campaigns yet. Create one to start bulk AI calling.</td></tr>
            )}
            {campaigns.map(c => (
              <tr key={c._id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.agent?.name || 'Default agent'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {c.stats.done + c.stats.failed + c.stats.permissionRequested}/{c.stats.total}
                  <span className="text-xs text-gray-400 ml-1">({c.stats.done} ok, {c.stats.failed} failed, {c.stats.permissionRequested} perm.)</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.callingHours?.start}–{c.callingHours?.end}</td>
                <td className="px-4 py-3 text-gray-600">{c.callsToday}/{c.dailyLimit}</td>
                <td className="px-4 py-3"><Badge variant={statusColor(c.status)}>{c.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openDetail(c._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="View"><Eye className="w-4 h-4" /></button>
                    {(c.status === 'draft' || c.status === 'paused') && (
                      <button onClick={() => doAction(c._id, 'start')} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600" title="Start"><Play className="w-4 h-4" /></button>
                    )}
                    {c.status === 'running' && (
                      <button onClick={() => doAction(c._id, 'pause')} className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title="Pause"><Pause className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => doAction(c._id, 'delete')} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Bulk Call Campaign">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. July follow-up calls" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Agent</label>
            <select value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">Default agent</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contacts by Tag (optional)</label>
            <select value={form.tagId} onChange={e => setForm({ ...form, tagId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">— None —</option>
              {tags.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Numbers (one per line, optional)</label>
            <textarea value={form.phonesText} onChange={e => setForm({ ...form, phonesText: e.target.value })}
              rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder={'919876543210\n919812345678'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={form.startHour} onChange={e => setForm({ ...form, startHour: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" value={form.endHour} onChange={e => setForm({ ...form, endHour: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Daily Limit</label>
              <input type="number" min={1} max={1000} value={form.dailyLimit}
                onChange={e => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create Campaign'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Campaign'}>
        {detail && (
          <div className="max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-gray-500 mb-3">
              {detail.stats.done} done · {detail.stats.failed} failed · {detail.stats.permissionRequested} permission requested · {detail.stats.total} total
            </p>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1">Phone</th><th className="py-1">Name</th><th className="py-1">Status</th><th className="py-1">Note</th></tr>
              </thead>
              <tbody>
                {detail.targets.map((t, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5">{t.phone}</td>
                    <td className="py-1.5 text-gray-600">{t.name || '-'}</td>
                    <td className="py-1.5"><Badge variant={t.status === 'done' ? 'success' : t.status === 'failed' ? 'danger' : 'default'}>{t.status}</Badge></td>
                    <td className="py-1.5 text-xs text-gray-500">{t.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
