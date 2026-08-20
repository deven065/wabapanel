'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Zap, Trash2, Edit, Play, Pause, Save, ArrowLeft, Clock, MessageSquare, GitBranch, Tag, Users, Send } from 'lucide-react';
import { automationApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AutoStep {
  id: string;
  type: string;
  data: Record<string, string>;
}

interface Automation {
  _id: string;
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: { keywords?: string[]; matchType?: string; event?: string; schedule?: string };
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, string> }>;
  edges: Array<{ id: string; source: string; target: string }>;
  status: string;
  stats: { triggered: number; completed: number; failed: number };
  createdAt: string;
}

const stepTypes = [
  { type: 'message', label: 'Send Message', icon: MessageSquare, color: 'blue', desc: 'Send a text message' },
  { type: 'delay', label: 'Wait / Delay', icon: Clock, color: 'yellow', desc: 'Wait before next step' },
  { type: 'condition', label: 'Condition', icon: GitBranch, color: 'purple', desc: 'Branch based on condition' },
  { type: 'tag', label: 'Add Tag', icon: Tag, color: 'emerald', desc: 'Add tag to contact' },
  { type: 'assign', label: 'Assign Agent', icon: Users, color: 'orange', desc: 'Assign to team member' },
  { type: 'template', label: 'Send Template', icon: Send, color: 'teal', desc: 'Send WhatsApp template' },
];

const genId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editAuto, setEditAuto] = useState<Automation | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', triggerType: 'keyword',
    keywords: '', matchType: 'contains', event: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<AutoStep[]>([]);

  const fetchAutomations = async () => {
    try { const res = await automationApi.list(); setAutomations(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchAutomations(); }, []);

  const openBuilder = (auto?: Automation) => {
    if (auto) {
      setEditAuto(auto);
      setForm({
        name: auto.name, description: auto.description || '',
        triggerType: auto.triggerType || 'keyword',
        keywords: (auto.triggerConfig?.keywords || []).join(', '),
        matchType: auto.triggerConfig?.matchType || 'contains',
        event: auto.triggerConfig?.event || '',
      });
      const autoSteps = (auto.nodes || [])
        .filter(n => n.type !== 'trigger')
        .map(n => ({ id: n.id, type: n.type, data: n.data || {} }));
      setSteps(autoSteps.length > 0 ? autoSteps : []);
    } else {
      setEditAuto(null);
      setForm({ name: '', description: '', triggerType: 'keyword', keywords: '', matchType: 'contains', event: '' });
      setSteps([]);
    }
    setShowBuilder(true);
  };

  const addStep = (type: string) => {
    const defaultData: Record<string, string> = {};
    if (type === 'message') defaultData.message = '';
    if (type === 'delay') { defaultData.delay = '5'; defaultData.unit = 'minutes'; }
    if (type === 'condition') defaultData.condition = '';
    if (type === 'tag') defaultData.tag = '';
    if (type === 'assign') defaultData.agent = '';
    if (type === 'template') defaultData.template = '';
    setSteps([...steps, { id: genId(), type, data: defaultData }]);
  };

  const updateStep = (idx: number, data: Record<string, string>) => {
    const newSteps = [...steps];
    newSteps[idx] = { ...newSteps[idx], data: { ...newSteps[idx].data, ...data } };
    setSteps(newSteps);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error('Automation name is required'); return; }
    if (form.triggerType === 'keyword' && !form.keywords.trim()) { toast.error('Keywords are required'); return; }

    const triggerNode = {
      id: 'trigger_1', type: 'trigger',
      position: { x: 250, y: 50 },
      data: { label: 'Trigger', keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean) },
    };

    const actionNodes = steps.map((s, i) => ({
      id: s.id, type: s.type,
      position: { x: 250, y: 180 + i * 120 },
      data: s.data,
    }));

    const allNodes = [triggerNode, ...actionNodes];
    const allEdges = allNodes.slice(0, -1).map((n, i) => ({
      id: `edge_${i}`, source: n.id, target: allNodes[i + 1].id,
      type: 'smoothstep',
    }));

    const payload = {
      name: form.name, description: form.description,
      triggerType: form.triggerType,
      triggerConfig: {
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
        matchType: form.matchType,
        event: form.event,
      },
      nodes: allNodes, edges: allEdges,
    };

    setSubmitting(true);
    try {
      if (editAuto) {
        await automationApi.update(editAuto._id, payload);
        toast.success('Automation updated');
      } else {
        await automationApi.create(payload);
        toast.success('Automation created');
      }
      setShowBuilder(false);
      fetchAutomations();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    try { await automationApi.toggle(id); toast.success('Status toggled'); fetchAutomations(); }
    catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this automation?')) return;
    try { await automationApi.delete(id); toast.success('Deleted'); fetchAutomations(); }
    catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const renderStepInput = (step: AutoStep, idx: number) => {
    switch (step.type) {
      case 'message':
        return (
          <textarea value={step.data.message || ''} onChange={(e) => updateStep(idx, { message: e.target.value })}
            placeholder="Type the message to send..." rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
        );
      case 'delay':
        return (
          <div className="flex gap-2">
            <input type="number" value={step.data.delay || '5'} onChange={(e) => updateStep(idx, { delay: e.target.value })}
              className="w-24 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" min="1" />
            <select value={step.data.unit || 'minutes'} onChange={(e) => updateStep(idx, { unit: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        );
      case 'condition':
        return (
          <input type="text" value={step.data.condition || ''} onChange={(e) => updateStep(idx, { condition: e.target.value })}
            placeholder="e.g., contact.tag == 'VIP'" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'tag':
        return (
          <input type="text" value={step.data.tag || ''} onChange={(e) => updateStep(idx, { tag: e.target.value })}
            placeholder="Tag name to add" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'assign':
        return (
          <input type="text" value={step.data.agent || ''} onChange={(e) => updateStep(idx, { agent: e.target.value })}
            placeholder="Agent name or email" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'template':
        return (
          <input type="text" value={step.data.template || ''} onChange={(e) => updateStep(idx, { template: e.target.value })}
            placeholder="Template name" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      default:
        return null;
    }
  };

  // Builder view
  if (showBuilder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowBuilder(false)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold text-gray-900">{editAuto ? 'Edit Automation' : 'Create Automation'}</h1>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
            <Save className="w-4 h-4" /> Save Automation
          </button>
        </div>

        {/* Automation Settings */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Automation Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Welcome Message Flow" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
              <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="keyword">Keyword</option>
                <option value="event">Event</option>
                <option value="contact_created">Contact Created</option>
                <option value="message_received">Message Received</option>
                <option value="schedule">Schedule</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Optional description" />
          </div>
          {form.triggerType === 'keyword' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords * (comma separated)</label>
                <input type="text" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="hello, hi, start, help" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="contains">Contains</option>
                  <option value="exact">Exact Match</option>
                  <option value="starts_with">Starts With</option>
                </select>
              </div>
            </div>
          )}
          {form.triggerType === 'event' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
              <input type="text" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="contact_created, payment_received, etc." />
            </div>
          )}
        </div>

        {/* Trigger display */}
        <div className="flex flex-col items-center">
          <div className="bg-emerald-600 text-white rounded-xl px-6 py-3 shadow-lg w-64 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">Trigger</span>
            </div>
            <p className="text-sm font-medium">{form.triggerType === 'keyword' ? `Keywords: ${form.keywords || '(none)'}` : form.triggerType}</p>
          </div>
          {steps.length > 0 && <div className="w-0.5 h-8 bg-gray-300" />}
        </div>

        {/* Steps */}
        {steps.map((step, idx) => {
          const stepDef = stepTypes.find(s => s.type === step.type);
          const Icon = stepDef?.icon || MessageSquare;
          const colorMap: Record<string, string> = {
            blue: 'border-blue-400 bg-blue-50', yellow: 'border-yellow-400 bg-yellow-50',
            purple: 'border-purple-400 bg-purple-50', emerald: 'border-emerald-400 bg-emerald-50',
            orange: 'border-orange-400 bg-orange-50', teal: 'border-teal-400 bg-teal-50',
          };
          return (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`border-2 rounded-xl p-4 w-full max-w-lg shadow-sm ${colorMap[stepDef?.color || 'blue'] || 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{stepDef?.label || step.type}</span>
                    <span className="text-xs text-gray-500">Step {idx + 1}</span>
                  </div>
                  <button onClick={() => removeStep(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                {renderStepInput(step, idx)}
              </div>
              {idx < steps.length - 1 && <div className="w-0.5 h-8 bg-gray-300" />}
            </div>
          );
        })}

        {/* Add Step */}
        <div className="flex flex-col items-center">
          {steps.length > 0 && <div className="w-0.5 h-8 bg-gray-300 mb-2" />}
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-4 w-full max-w-lg">
            <p className="text-sm font-semibold text-gray-600 mb-3 text-center">Add Step</p>
            <div className="grid grid-cols-3 gap-2">
              {stepTypes.map(({ type, label, icon: SIcon }) => (
                <button key={type} onClick={() => addStep(type)} className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-50 border border-gray-100 text-center">
                  <SIcon className="w-5 h-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = automations.length > 0 && selectedIds.length === automations.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : automations.map(a => a._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => automationApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchAutomations();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <p className="text-gray-500 text-sm mt-1">Build automated workflows triggered by keywords, events, or schedules</p>
        </div>
        <button onClick={() => openBuilder()} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Automation
        </button>
      </div>

      {!loading && automations.length > 0 && (
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

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : automations.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Zap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No automations yet</h3>
          <p className="text-sm text-gray-400 mt-1">Create keyword-triggered flows to auto-respond</p>
          <button onClick={() => openBuilder()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
            <Plus className="w-4 h-4 inline mr-1" /> Create Automation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((auto) => (
            <div key={auto._id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
                <input type="checkbox" checked={selectedIds.includes(auto._id)} onChange={() => toggleSelect(auto._id)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mr-3 mt-1 flex-shrink-0 cursor-pointer" />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{auto.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{auto.description || `Trigger: ${auto.triggerType}`}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${auto.status === 'active' ? 'bg-emerald-100 text-emerald-700' : auto.status === 'draft' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {auto.status}
                </span>
              </div>
              {auto.triggerConfig?.keywords && auto.triggerConfig.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {auto.triggerConfig.keywords.map((kw: string, i: number) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kw}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span>Triggered: {auto.stats?.triggered || 0}</span>
                <span>Completed: {auto.stats?.completed || 0}</span>
                <span>{Math.max(0, (auto.nodes || []).length - 1)} steps</span>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={() => handleToggle(auto._id)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={auto.status === 'active' ? 'Pause' : 'Activate'}>
                  {auto.status === 'active' ? <Pause className="w-4 h-4 text-yellow-500" /> : <Play className="w-4 h-4 text-emerald-500" />}
                </button>
                <button onClick={() => openBuilder(auto)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => handleDelete(auto._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
