'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Workflow, BarChart3, Sparkles, LayoutTemplate } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { botFlowApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FlowNode { id: string; name?: string; type?: string; text?: string }
interface BotFlow {
  _id: string; name: string; triggerKeywords: string[]; matchType: string;
  isActive: boolean; nodes: FlowNode[]; updatedAt: string; runs?: number;
  nodeHits?: Record<string, number>; startNode?: string; eventTrigger?: string;
}

export default function BotFlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<BotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', keywords: '', matchType: 'exact', eventTrigger: '' });
  const [statsFlow, setStatsFlow] = useState<BotFlow | null>(null);
  const [showPreset, setShowPreset] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiForm, setAiForm] = useState({ name: '', business: '', goal: '' });
  const [generating, setGenerating] = useState(false);

  const load = () => {
    botFlowApi.list().then(r => setFlows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    const payload = {
      name: form.name,
      triggerKeywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      matchType: form.matchType,
      eventTrigger: form.eventTrigger,
    };
    try {
      if (editId) {
        await botFlowApi.update(editId, payload);
        toast.success('Flow updated');
      } else {
        const res = await botFlowApi.create(payload);
        toast.success('Flow created — opening builder');
        router.push(`/client/bot-flows/${res.data.data._id}`);
        return;
      }
      setShowModal(false); load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const toggleActive = async (f: BotFlow) => {
    try {
      await botFlowApi.update(f._id, { isActive: !f.isActive });
      setFlows(prev => prev.map(x => x._id === f._id ? { ...x, isActive: !f.isActive } : x));
    } catch { toast.error('Failed'); }
  };

  const handleGenerate = async () => {
    if (!aiForm.business.trim() || !aiForm.goal.trim()) { toast.error('Business details and flow goal are required'); return; }
    setGenerating(true);
    try {
      const res = await botFlowApi.generate(aiForm);
      toast.success('Flow generated — opening builder');
      router.push(`/client/bot-flows/${res.data.data._id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'AI generation failed');
    }
    setGenerating(false);
  };

  const importPreset = async (preset: string) => {
    setImporting(true);
    try {
      const res = await botFlowApi.preset(preset);
      toast.success('Preset imported — review it, then turn it Active');
      router.push(`/client/bot-flows/${res.data.data._id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to import preset');
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bot flow?')) return;
    try { await botFlowApi.delete(id); toast.success('Deleted'); load(); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Title', render: (f: BotFlow) => <span className="font-medium text-sm">{f.name}</span> },
    { key: 'trigger', title: 'Start Trigger Keywords', render: (f: BotFlow) => (
      <div className="flex flex-wrap gap-1">
        {(f.triggerKeywords || []).length ? f.triggerKeywords.map((k, i) => <Badge key={i} variant="info">{k}</Badge>) : <span className="text-xs text-gray-400">—</span>}
      </div>
    )},
    { key: 'steps', title: 'Replies', render: (f: BotFlow) => (f.nodes || []).length },
    { key: 'runs', title: 'Runs', render: (f: BotFlow) => <span className="text-sm font-semibold text-indigo-600">{f.runs || 0}</span> },
    { key: 'status', title: 'Status', render: (f: BotFlow) => (
      <button onClick={() => toggleActive(f)}>
        <Badge variant={f.isActive ? 'success' : 'default'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>
      </button>
    )},
    { key: 'actions', title: 'Action', render: (f: BotFlow) => (
      <div className="flex gap-1">
        <Button size="sm" onClick={() => router.push(`/client/bot-flows/${f._id}`)} icon={<Workflow className="w-3.5 h-3.5" />}>Flow Builder</Button>
        <button onClick={() => setStatsFlow(f)} className="p-1.5 hover:bg-indigo-50 rounded" title="Analytics — see where customers drop off"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>
        <button onClick={() => { setEditId(f._id); setForm({ name: f.name, keywords: (f.triggerKeywords || []).join(', '), matchType: f.matchType || 'exact', eventTrigger: f.eventTrigger || '' }); setShowModal(true); }}
          className="p-1.5 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => handleDelete(f._id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bot Flows</h1>
          <p className="text-sm text-gray-500 mt-1">Build multi-step chatbot conversations triggered by keywords — with buttons, lists, media and templates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<LayoutTemplate className="w-4 h-4" />} onClick={() => setShowPreset(true)}>Ready-made Templates</Button>
          <Button icon={<Sparkles className="w-4 h-4" />} onClick={() => setShowAiModal(true)}>Generate with AI</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditId(null); setForm({ name: '', keywords: '', matchType: 'exact', eventTrigger: '' }); setShowModal(true); }}>Add New Bot Flow</Button>
        </div>
      </div>

      <Table columns={columns} data={flows} loading={loading} emptyText="No bot flows yet — create one to get started" onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => botFlowApi.delete(id).catch(() => null))); load(); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Bot Flow' : 'Add New Bot Flow'}>
        <div className="space-y-4">
          <Input label="Title" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Welcome flow" required />
          <Input label="Start Trigger Keywords (comma separated)" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="hello, hi, menu" />
          <Select label="Keyword Match" value={form.matchType} onChange={e => setForm({ ...form, matchType: e.target.value })}
            options={[{ value: 'exact', label: 'Exact match' }, { value: 'contains', label: 'Message contains keyword' }]} />
          <Select label="Auto-start on event (optional)" value={form.eventTrigger} onChange={e => setForm({ ...form, eventTrigger: e.target.value })}
            options={[{ value: '', label: 'None (keyword only)' }, { value: 'new_lead', label: 'New lead created' }, { value: 'dnp', label: 'Call marked Did-Not-Pick / no answer' }]} />
          <p className="text-xs text-gray-500">When a customer sends a matching message, the flow starts automatically (skipped when Chat AI is ON for that conversation). An event trigger also starts it automatically — e.g. after a call is logged as &quot;Did Not Pick&quot;.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editId ? 'Save' : 'Create & Open Builder'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPreset} onClose={() => !importing && setShowPreset(false)} title="Ready-made Flow Templates" size="lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Import a fully-built flow and edit it in the builder. Imported as <b>Inactive</b> — review the messages, then turn it Active.</p>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Lead Nurturing</h3>
                <p className="text-sm text-gray-500 mt-1">Greets a new lead, asks what they need, and sends day-wise bump-up reminders (Day 1 / 2 / 3) if they don&apos;t reply — then tags cold leads. Auto-starts on new lead.</p>
              </div>
              <Button size="sm" disabled={importing} onClick={() => importPreset('lead_nurturing')}>Import</Button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">DNP Recovery</h3>
                <p className="text-sm text-gray-500 mt-1">Auto-starts when a call is logged as &quot;Did Not Pick&quot; / no answer. Sends a missed-call message, asks for a good time, and follows up over the next days before tagging the lead as lost.</p>
              </div>
              <Button size="sm" disabled={importing} onClick={() => importPreset('dnp_recovery')}>Import</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAiModal} onClose={() => !generating && setShowAiModal(false)} title="Generate Bot Flow with AI" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Describe your business and what the flow should do — AI (using your API key from AI Settings) will build the complete flow with menus, buttons and messages. You can edit everything in the builder afterwards.</p>
          <Input label="Flow name (optional)" value={aiForm.name} onChange={e => setAiForm({ ...aiForm, name: e.target.value })} placeholder="e.g. Customer support flow" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your business details <span className="text-red-500">*</span></label>
            <textarea
              value={aiForm.business}
              onChange={e => setAiForm({ ...aiForm, business: e.target.value })}
              rows={5}
              placeholder="e.g. KKHS Media — we sell a WhatsApp SaaS panel for Rs.6999. Demo at wabapanel.com. Support hours 10am-7pm. Features: AI chatbot, broadcasts, CRM..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What should the flow do? <span className="text-red-500">*</span></label>
            <textarea
              value={aiForm.goal}
              onChange={e => setAiForm({ ...aiForm, goal: e.target.value })}
              rows={3}
              placeholder="e.g. Greet the customer, show a menu (pricing / demo / talk to human), answer questions and collect their name & email"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAiModal(false)} disabled={generating}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating} icon={<Sparkles className="w-4 h-4" />}>{generating ? 'Generating…' : 'Generate Flow'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!statsFlow} onClose={() => setStatsFlow(null)} title={`Flow Analytics — ${statsFlow?.name || ''}`} size="lg">
        {statsFlow && (() => {
          const hits = statsFlow.nodeHits || {};
          const runs = statsFlow.runs || 0;
          const nodes = statsFlow.nodes || [];
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">This flow started <b>{runs}</b> {runs === 1 ? 'time' : 'times'}. The bars below show how many customers reached each step — a big drop between steps means customers are abandoning the flow there.</p>
              {nodes.length === 0 ? (
                <p className="text-sm text-gray-400">This flow has no steps yet.</p>
              ) : (
                <div className="space-y-2">
                  {nodes.map((n, i) => {
                    const count = hits[n.id] || 0;
                    const pct = runs > 0 ? Math.round((count / runs) * 100) : 0;
                    const prevCount = i === 0 ? runs : (hits[nodes[i - 1].id] || 0);
                    const dropOff = prevCount > 0 ? Math.max(0, Math.round(((prevCount - count) / prevCount) * 100)) : 0;
                    return (
                      <div key={n.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-800">Step {i + 1}: {n.name || n.text?.slice(0, 40) || n.type || n.id}</span>
                          <span className="text-gray-500">{count} reached ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        {i > 0 && dropOff > 0 && <p className="text-xs text-red-500 mt-1">{dropOff}% dropped off before this step</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
