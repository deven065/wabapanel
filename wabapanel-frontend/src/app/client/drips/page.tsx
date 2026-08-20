'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Droplets, Edit, Clock, Users, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { dripApi, templateApi, segmentApi, tagApi } from '@/lib/api';
import type { Template } from '@/types';
import toast from 'react-hot-toast';

interface DripStep {
  order: number;
  message: string;
  template?: string;
  delayValue: number;
  delayType: string;
}

interface Drip {
  _id: string;
  name: string;
  status: string;
  targetType: string;
  targetSegments: string[];
  targetTags: string[];
  dripSteps: DripStep[];
  stats: { totalRecipients: number; sent: number; delivered: number; read: number; failed: number };
  createdAt: string;
}

interface SegmentItem { _id: string; name: string }
interface TagItem { _id: string; name: string }

export default function DripsPage() {
  const [drips, setDrips] = useState<Drip[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDrip, setEditDrip] = useState<Drip | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', targetType: 'all' as string,
    targetSegments: [] as string[], targetTags: [] as string[],
    steps: [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }] as DripStep[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchAll = async () => {
    try {
      const [dripRes, tmpRes, segRes, tagRes] = await Promise.allSettled([
        dripApi.list(), templateApi.list(), segmentApi.list(), tagApi.list(),
      ]);
      if (dripRes.status === 'fulfilled') setDrips(dripRes.value.data.data || []);
      if (tmpRes.status === 'fulfilled') setTemplates(tmpRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const addStep = () => {
    setForm({
      ...form,
      steps: [...form.steps, { order: form.steps.length + 1, message: '', template: '', delayValue: 1, delayType: 'hours' }],
    });
  };

  const removeStep = (idx: number) => {
    if (form.steps.length <= 1) return;
    const steps = form.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setForm({ ...form, steps });
  };

  const updateStep = (idx: number, updates: Partial<DripStep>) => {
    const steps = [...form.steps];
    steps[idx] = { ...steps[idx], ...updates };
    setForm({ ...form, steps });
  };

  const openModal = (drip?: Drip) => {
    if (drip) {
      setEditDrip(drip);
      setForm({
        name: drip.name,
        targetType: drip.targetType || 'all',
        targetSegments: drip.targetSegments || [],
        targetTags: drip.targetTags || [],
        steps: drip.dripSteps?.length ? drip.dripSteps.map((s, i) => ({
          order: i + 1,
          message: s.message || '',
          template: (s.template as string) || '',
          delayValue: s.delayValue || 0,
          delayType: s.delayType || 'minutes',
        })) : [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }],
      });
    } else {
      setEditDrip(null);
      setForm({
        name: '', targetType: 'all', targetSegments: [], targetTags: [],
        steps: [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }],
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
    if (form.steps.every(s => !s.message.trim() && !s.template)) { toast.error('At least one step needs a message or template'); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        targetType: form.targetType,
        targetSegments: form.targetSegments,
        targetTags: form.targetTags,
        dripSteps: form.steps.map(s => ({
          order: s.order,
          message: s.message,
          template: s.template || undefined,
          delayValue: s.delayValue,
          delayType: s.delayType,
        })),
      };
      if (editDrip) {
        await dripApi.update(editDrip._id, payload);
        toast.success('Drip campaign updated');
      } else {
        await dripApi.create(payload);
        toast.success('Drip campaign created');
      }
      setShowModal(false);
      fetchAll();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);
    try { await dripApi.start(id); toast.success('Drip started'); fetchAll(); }
    catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to start');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    try { await dripApi.pause(id); toast.success('Drip paused'); fetchAll(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this drip campaign?')) return;
    try { await dripApi.delete(id); toast.success('Deleted'); fetchAll(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const statusColor = (s: string) => {
    if (s === 'running') return 'success';
    if (s === 'paused') return 'warning';
    if (s === 'completed') return 'info';
    if (s === 'failed') return 'danger';
    return 'default';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = drips.length > 0 && selectedIds.length === drips.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : drips.map(d => d._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => dripApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchAll();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drip Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">Automated sequential message flows with delays</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => openModal()}>New Drip Campaign</Button>
      </div>

      {!loading && drips.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} selected</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])}>Clear</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleBulkDelete} disabled={submitting}>Delete selected</Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : drips.length === 0 ? (
        <Card className="text-center py-12">
          <Droplets className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No drip campaigns yet</p>
          <p className="text-sm text-gray-400 mb-4">Create automated message sequences with custom delays between each step</p>
          <Button onClick={() => openModal()}>Create Your First Drip</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {drips.map((drip) => (
            <Card key={drip._id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <input type="checkbox" checked={selectedIds.includes(drip._id)} onChange={() => toggleSelect(drip._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Droplets className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{drip.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {drip.dripSteps?.length || 0} steps</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {drip.stats?.totalRecipients || 0} recipients</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(drip.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusColor(drip.status)}>{drip.status}</Badge>
                  <div className="flex gap-1">
                    {drip.status === 'draft' || drip.status === 'paused' ? (
                      <button onClick={() => handleStart(drip._id)} className="p-1.5 hover:bg-emerald-50 rounded-lg" title="Start"><Play className="w-4 h-4 text-emerald-500" /></button>
                    ) : drip.status === 'running' ? (
                      <button onClick={() => handlePause(drip._id)} className="p-1.5 hover:bg-yellow-50 rounded-lg" title="Pause"><Pause className="w-4 h-4 text-yellow-500" /></button>
                    ) : null}
                    <button onClick={() => openModal(drip)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit"><Edit className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => handleDelete(drip._id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                    <button onClick={() => setExpandedId(expandedId === drip._id ? null : drip._id)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      {expandedId === drip._id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === drip._id && drip.dripSteps?.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-3 mb-3 text-sm text-gray-600">
                    <span>Sent: <strong>{drip.stats?.sent || 0}</strong></span>
                    <span>Delivered: <strong>{drip.stats?.delivered || 0}</strong></span>
                    <span>Read: <strong>{drip.stats?.read || 0}</strong></span>
                    <span>Failed: <strong>{drip.stats?.failed || 0}</strong></span>
                  </div>
                  <div className="space-y-3">
                    {drip.dripSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                          {idx < drip.dripSteps.length - 1 && <div className="w-0.5 h-8 bg-blue-200 mt-1" />}
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {step.delayValue > 0 && (
                              <Badge variant="warning">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Wait {step.delayValue} {step.delayType}</span>
                              </Badge>
                            )}
                            {idx === 0 && step.delayValue === 0 && <Badge variant="info">Immediately</Badge>}
                          </div>
                          <p className="text-sm text-gray-700">{step.message || `Send template`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editDrip ? 'Edit Drip Campaign' : 'Create Drip Campaign'} size="xl">
        <div className="space-y-6">
          <Input label="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 7-Day Onboarding Series" required />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
            <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}
              options={[
                { value: 'all', label: 'All Contacts' },
                { value: 'segment', label: 'Specific Segment' },
                { value: 'tag', label: 'Contacts with Tag' },
              ]} />
            {form.targetType === 'segment' && segments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {segments.map(seg => (
                  <button key={seg._id} onClick={() => {
                    const segs = form.targetSegments.includes(seg._id) ? form.targetSegments.filter(s => s !== seg._id) : [...form.targetSegments, seg._id];
                    setForm({ ...form, targetSegments: segs });
                  }} className={`px-3 py-1 rounded-full text-xs border ${form.targetSegments.includes(seg._id) ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                    {seg.name}
                  </button>
                ))}
              </div>
            )}
            {form.targetType === 'tag' && tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <button key={tag._id} onClick={() => {
                    const tgs = form.targetTags.includes(tag._id) ? form.targetTags.filter(t => t !== tag._id) : [...form.targetTags, tag._id];
                    setForm({ ...form, targetTags: tgs });
                  }} className={`px-3 py-1 rounded-full text-xs border ${form.targetTags.includes(tag._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">Drip Steps</label>
              <Button variant="ghost" size="sm" onClick={addStep} icon={<Plus className="w-3 h-3" />}>Add Step</Button>
            </div>
            <div className="space-y-4">
              {form.steps.map((step, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Step {idx + 1}</span>
                    {form.steps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Input label="Delay" type="number" value={String(step.delayValue)}
                      onChange={(e) => updateStep(idx, { delayValue: parseInt(e.target.value) || 0 })} min="0" />
                    <Select label="Unit" value={step.delayType} onChange={(e) => updateStep(idx, { delayType: e.target.value })}
                      options={[{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }]} />
                  </div>
                  <Textarea label="Message" value={step.message} onChange={(e) => updateStep(idx, { message: e.target.value })}
                    placeholder="Type the message for this step..." rows={2} />
                  {templates.length > 0 && (
                    <Select label="Or use Template" value={step.template || ''} onChange={(e) => updateStep(idx, { template: e.target.value })}
                      options={[{ value: '', label: '-- No template --' }, ...templates.map(t => ({ value: t._id, label: t.name }))]} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editDrip ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
