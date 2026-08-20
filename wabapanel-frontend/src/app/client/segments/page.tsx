'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Layers, Trash2, Edit, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import { segmentApi, campaignApi } from '@/lib/api';
import type { Segment, SegmentRule } from '@/types';
import toast from 'react-hot-toast';

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  type BehaviorRule = { campaign: string; condition: string };
  const [form, setForm] = useState({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }] as SegmentRule[], behaviorRules: [] as BehaviorRule[] });
  const [campaigns, setCampaigns] = useState<{ _id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchSegments = async () => {
    try {
      const res = await segmentApi.list();
      setSegments(res.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchSegments();
    campaignApi.list({ limit: 100 }).then(r => setCampaigns(r.data.data || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error('Segment name is required'); return; }
    setSubmitting(true);
    const payload = { ...form, behaviorRules: form.behaviorRules.filter(br => br.campaign) };
    try {
      if (editSegment) {
        await segmentApi.update(editSegment._id, payload);
        toast.success('Segment updated');
      } else {
        await segmentApi.create(payload);
        toast.success('Segment created');
      }
      setShowModal(false); setEditSegment(null);
      setForm({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }], behaviorRules: [] });
      fetchSegments();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this segment?')) return;
    try { await segmentApi.delete(id); toast.success('Deleted'); fetchSegments(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const addRule = () => setForm({ ...form, rules: [...form.rules, { field: 'name', operator: 'contains', value: '' }] });
  const removeRule = (i: number) => setForm({ ...form, rules: form.rules.filter((_, idx) => idx !== i) });
  const updateRule = (i: number, updates: Partial<SegmentRule>) => {
    const rules = [...form.rules]; rules[i] = { ...rules[i], ...updates }; setForm({ ...form, rules });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = segments.length > 0 && selectedIds.length === segments.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : segments.map(s => s._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => segmentApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchSegments();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Segments</h1>
          <p className="text-gray-500 text-sm mt-1">Group contacts dynamically</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditSegment(null); setForm({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }], behaviorRules: [] }); setShowModal(true); }}>
          Create Segment
        </Button>
      </div>

      {!loading && segments.length > 0 && (
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
      ) : segments.length === 0 ? (
        <Card className="text-center py-12">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No segments created yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <Card key={seg._id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedIds.includes(seg._id)} onChange={() => toggleSelect(seg._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{seg.name}</h3>
                    <p className="text-xs text-gray-500">{seg.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditSegment(seg); setForm({ name: seg.name, description: seg.description, rules: seg.rules, behaviorRules: ((seg as unknown as { behaviorRules?: BehaviorRule[] }).behaviorRules || []) }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(seg._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users className="w-4 h-4" />
                <span>{seg.contactCount || 0} contacts</span>
                <span className="text-gray-300">|</span>
                <span>{seg.rules?.length || 0} rules</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editSegment ? 'Edit Segment' : 'Create Segment'} size="lg">
        <div className="space-y-4">
          <Input label="Segment Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rules</label>
            {form.rules.map((rule, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <Select value={rule.field} onChange={(e) => updateRule(i, { field: e.target.value })} options={[
                  { value: 'name', label: 'Name' }, { value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' },
                  { value: 'tag', label: 'Tag' }, { value: 'source', label: 'Source' }, { value: 'status', label: 'Status' },
                ]} />
                <Select value={rule.operator} onChange={(e) => updateRule(i, { operator: e.target.value })} options={[
                  { value: 'contains', label: 'Contains' }, { value: 'equals', label: 'Equals' },
                  { value: 'not_equals', label: 'Not Equals' }, { value: 'starts_with', label: 'Starts with' },
                ]} />
                <Input value={rule.value} onChange={(e) => updateRule(i, { value: e.target.value })} placeholder="Value" />
                {form.rules.length > 1 && <button onClick={() => removeRule(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRule} icon={<Plus className="w-3 h-3" />}>Add Rule</Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Broadcast Retargeting (optional)</label>
            <p className="text-xs text-gray-500 mb-2">Target contacts based on how they responded to a past broadcast — e.g. re-send an offer to everyone who read it but never replied.</p>
            {form.behaviorRules.map((br, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <Select value={br.campaign} onChange={(e) => { const rules = [...form.behaviorRules]; rules[i] = { ...rules[i], campaign: e.target.value }; setForm({ ...form, behaviorRules: rules }); }} options={[{ value: '', label: 'Select broadcast...' }, ...campaigns.map(c => ({ value: c._id, label: c.name }))]} />
                <Select value={br.condition} onChange={(e) => { const rules = [...form.behaviorRules]; rules[i] = { ...rules[i], condition: e.target.value }; setForm({ ...form, behaviorRules: rules }); }} options={[
                  { value: 'delivered_not_replied', label: 'Delivered but not replied' },
                  { value: 'read_not_replied', label: 'Read but not replied' },
                  { value: 'not_read', label: 'Not read' },
                  { value: 'replied', label: 'Replied' },
                  { value: 'failed', label: 'Failed to deliver' },
                  { value: 'sent', label: 'Was sent (everyone)' },
                ]} />
                <button onClick={() => setForm({ ...form, behaviorRules: form.behaviorRules.filter((_, idx) => idx !== i) })} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, behaviorRules: [...form.behaviorRules, { campaign: '', condition: 'delivered_not_replied' }] })} icon={<Plus className="w-3 h-3" />}>Add Retargeting Rule</Button>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editSegment ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
