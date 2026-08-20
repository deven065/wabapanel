'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, GripHorizontal, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { pipelineApi } from '@/lib/api';
import type { Pipeline, Deal } from '@/types';
import toast from 'react-hot-toast';

const dealContactName = (d: Deal) =>
  d.contactName || (typeof d.contact === 'object' && d.contact ? d.contact.name : '') || '';
const dealContactPhone = (d: Deal) =>
  d.contactPhone || (typeof d.contact === 'object' && d.contact ? (d.contact.phone || '') : '') || '';

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [deals, setDeals] = useState<Record<string, Deal[]>>({});
  const [loading, setLoading] = useState(true);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({ name: '', stages: ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'] });
  const [dealForm, setDealForm] = useState({ title: '', value: '', stage: '', contactName: '', contactPhone: '' });
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [newStage, setNewStage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());

  const groupDeals = useCallback((pipeline: Pipeline, allDeals: Deal[]) => {
    const grouped: Record<string, Deal[]> = {};
    (pipeline.stages || []).forEach(s => { grouped[s.name] = []; });
    allDeals.forEach((d: Deal) => { if (grouped[d.stage]) grouped[d.stage].push(d); else grouped[d.stage] = [d]; });
    return grouped;
  }, []);

  const loadDeals = useCallback((pipeline: Pipeline) => {
    return pipelineApi.get(pipeline._id).then(r => {
      const pd = r.data.data;
      const allDeals: Deal[] = Array.isArray(pd) ? pd : (pd?.deals || []);
      setDeals(groupDeals(pipeline, allDeals));
    }).catch(() => {});
  }, [groupDeals]);

  useEffect(() => {
    pipelineApi.list().then(r => {
      const pipes = r.data.data || [];
      setPipelines(pipes);
      if (pipes.length > 0) setSelectedPipeline(pipes[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPipeline) loadDeals(selectedPipeline);
    setSelectedDeals(new Set());
  }, [selectedPipeline, loadDeals]);

  const toggleSelectDeal = (dealId: string) => {
    setSelectedDeals(cur => {
      const next = new Set(cur);
      if (next.has(dealId)) next.delete(dealId); else next.add(dealId);
      return next;
    });
  };

  const allDealIds = Object.values(deals).flat().map(d => d._id);
  const allSelected = allDealIds.length > 0 && selectedDeals.size === allDealIds.length;
  const toggleSelectAll = () => {
    setSelectedDeals(allSelected ? new Set() : new Set(allDealIds));
  };

  const handleBulkDelete = async () => {
    if (submitting || !selectedPipeline || selectedDeals.size === 0) return;
    if (!confirm(`Delete ${selectedDeals.size} selected deal(s)? This cannot be undone.`)) return;
    setSubmitting(true);
    const ids = Array.from(selectedDeals);
    let failed = 0;
    for (const id of ids) {
      try { await pipelineApi.deleteDeal(selectedPipeline._id, id); }
      catch { failed++; }
    }
    if (failed) toast.error(`${failed} deal(s) could not be deleted`);
    else toast.success(`${ids.length} deal(s) deleted`);
    setSelectedDeals(new Set());
    await loadDeals(selectedPipeline);
    setSubmitting(false);
  };

  const handleCreatePipeline = async () => {
    if (submitting) return;
    if (!pipelineForm.name.trim()) { toast.error('Pipeline name required'); return; }
    setSubmitting(true);
    try {
      const stages = pipelineForm.stages.map((s, i) => ({
        id: s.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: s,
        color: ['#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#EF4444'][i % 6],
        order: i,
      }));
      await pipelineApi.create({ name: pipelineForm.name, stages });
      toast.success('Pipeline created');
      setShowPipelineModal(false);
      setPipelineForm({ name: '', stages: ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'] });
      pipelineApi.list().then(r => { const pipes = r.data.data || []; setPipelines(pipes); if (pipes.length) setSelectedPipeline(pipes[pipes.length - 1]); });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openNewDeal = () => {
    if (!selectedPipeline) return;
    setEditingDeal(null);
    setDealForm({ title: '', value: '', stage: selectedPipeline.stages?.[0]?.name || 'Lead', contactName: '', contactPhone: '' });
    setShowDealModal(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setDealForm({
      title: deal.title || '',
      value: String(deal.value ?? ''),
      stage: deal.stage,
      contactName: dealContactName(deal),
      contactPhone: dealContactPhone(deal),
    });
    setShowDealModal(true);
  };

  const handleSaveDeal = async () => {
    if (submitting || !selectedPipeline) return;
    if (!dealForm.title.trim()) { toast.error('Deal title required'); return; }
    setSubmitting(true);
    try {
      const payload = { ...dealForm, value: parseFloat(dealForm.value) || 0 };
      if (editingDeal) {
        await pipelineApi.updateDeal(selectedPipeline._id, editingDeal._id, payload);
        toast.success('Deal updated');
      } else {
        await pipelineApi.addDeal(selectedPipeline._id, payload);
        toast.success('Deal created');
      }
      setShowDealModal(false);
      setEditingDeal(null);
      await loadDeals(selectedPipeline);
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleDeleteDeal = async () => {
    if (submitting || !selectedPipeline || !editingDeal) return;
    if (!confirm(`Delete deal "${editingDeal.title}"?`)) return;
    setSubmitting(true);
    try {
      await pipelineApi.deleteDeal(selectedPipeline._id, editingDeal._id);
      toast.success('Deal deleted');
      setShowDealModal(false);
      setEditingDeal(null);
      await loadDeals(selectedPipeline);
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const moveDeal = async (dealId: string, fromStage: string, toStage: string) => {
    if (!selectedPipeline || fromStage === toStage) return;
    const prev = deals;
    // optimistic move
    setDeals(cur => {
      const moving = (cur[fromStage] || []).find(d => d._id === dealId);
      if (!moving) return cur;
      return {
        ...cur,
        [fromStage]: (cur[fromStage] || []).filter(d => d._id !== dealId),
        [toStage]: [...(cur[toStage] || []), { ...moving, stage: toStage }],
      };
    });
    try {
      await pipelineApi.updateDeal(selectedPipeline._id, dealId, { stage: toStage });
    } catch {
      setDeals(prev);
      toast.error('Could not move deal');
    }
  };

  const handleDeletePipeline = async (p: Pipeline) => {
    if (!p?._id) return;
    if (!confirm(`Delete pipeline "${p.name}"? This removes its stages and deals.`)) return;
    try {
      await pipelineApi.delete(p._id);
      toast.success('Pipeline deleted');
      const r = await pipelineApi.list();
      const pipes = r.data.data || [];
      setPipelines(pipes);
      setSelectedPipeline(prev => (prev?._id === p._id ? (pipes[0] || null) : prev));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to delete pipeline');
    }
  };

  const addStage = () => { if (newStage && !pipelineForm.stages.includes(newStage)) { setPipelineForm({ ...pipelineForm, stages: [...pipelineForm.stages, newStage] }); setNewStage(''); } };
  const removeStage = (idx: number) => setPipelineForm({ ...pipelineForm, stages: pipelineForm.stages.filter((_, i) => i !== idx) });

  const stageColors = ['bg-blue-50 border-blue-200', 'bg-yellow-50 border-yellow-200', 'bg-purple-50 border-purple-200', 'bg-emerald-50 border-emerald-200', 'bg-red-50 border-red-200', 'bg-orange-50 border-orange-200'];
  const stageTotal = (name: string) => (deals[name] || []).reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipelines</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your sales funnel — drag a deal to move it between stages</p>
        </div>
        <div className="flex gap-2">
          {selectedPipeline && <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={openNewDeal}>Add Deal</Button>}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowPipelineModal(true)}>New Pipeline</Button>
        </div>
      </div>

      {pipelines.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {pipelines.map(p => {
            const active = selectedPipeline?._id === p._id;
            return (
              <div key={p._id}
                className={`flex items-center rounded-lg text-sm font-medium overflow-hidden ${active ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                <button onClick={() => setSelectedPipeline(p)} className="pl-4 pr-2 py-2">{p.name}</button>
                <button
                  onClick={() => handleDeletePipeline(p)}
                  title="Delete pipeline"
                  className={`px-2 py-2 ${active ? 'hover:bg-emerald-700 text-white/80 hover:text-white' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedPipeline && allDealIds.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedDeals.size > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all
            {selectedDeals.size > 0 && <span className="text-red-700">· {selectedDeals.size} selected</span>}
          </label>
          {selectedDeals.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedDeals(new Set())}>Clear</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleBulkDelete} disabled={submitting}>Delete selected</Button>
            </div>
          )}
        </div>
      )}

      {selectedPipeline ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(selectedPipeline.stages || []).map((stage, idx) => {
            const isOver = dragOverStage === stage.name;
            return (
              <div
                key={stage._id || stage.name}
                onDragOver={(e) => { e.preventDefault(); if (dragOverStage !== stage.name) setDragOverStage(stage.name); }}
                onDragLeave={() => setDragOverStage(cur => (cur === stage.name ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = e.dataTransfer.getData('text/plain') || dragDealId;
                  const from = e.dataTransfer.getData('from-stage');
                  setDragOverStage(null);
                  setDragDealId(null);
                  if (dealId && from) moveDeal(dealId, from, stage.name);
                }}
                className={`min-w-[280px] rounded-xl border-2 ${stageColors[idx % stageColors.length]} p-4 transition-shadow ${isOver ? 'ring-2 ring-emerald-400 shadow-md' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-800">{stage.name}</h3>
                  <Badge variant="default">{(deals[stage.name] || []).length}</Badge>
                </div>
                {stageTotal(stage.name) > 0 && (
                  <p className="text-xs text-gray-500 mb-3">Total: ₹{stageTotal(stage.name).toLocaleString()}</p>
                )}
                <div className="space-y-2 min-h-[40px]">
                  {(deals[stage.name] || []).map(deal => (
                    <div
                      key={deal._id}
                      draggable
                      onDragStart={(e) => {
                        setDragDealId(deal._id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', deal._id);
                        e.dataTransfer.setData('from-stage', deal.stage);
                      }}
                      onDragEnd={() => { setDragDealId(null); setDragOverStage(null); }}
                      onClick={() => openEditDeal(deal)}
                      className={`bg-white rounded-lg p-3 shadow-sm border cursor-move hover:shadow ${selectedDeals.has(deal._id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-100 hover:border-emerald-300'} ${dragDealId === deal._id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedDeals.has(deal._id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelectDeal(deal._id)}
                            className="mt-0.5 w-4 h-4 shrink-0 accent-red-500 cursor-pointer"
                          />
                          <h4 className="font-medium text-sm text-gray-900 truncate">{deal.title}</h4>
                        </div>
                        <Pencil className="w-3 h-3 text-gray-300 shrink-0 mt-0.5" />
                      </div>
                      {deal.value > 0 && <p className="text-emerald-600 font-semibold text-sm mt-1">₹{deal.value.toLocaleString()}</p>}
                      {dealContactName(deal) && <p className="text-xs text-gray-600 mt-1">{dealContactName(deal)}</p>}
                      {dealContactPhone(deal) && <p className="text-xs text-gray-400">{dealContactPhone(deal)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : !loading && (
        <Card className="text-center py-12">
          <p className="text-gray-500">No pipelines yet. Create one to get started.</p>
        </Card>
      )}

      <Modal isOpen={showPipelineModal} onClose={() => setShowPipelineModal(false)} title="Create Pipeline">
        <div className="space-y-4">
          <Input label="Pipeline Name" value={pipelineForm.name} onChange={(e) => setPipelineForm({ ...pipelineForm, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Stages</label>
            {pipelineForm.stages.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <GripHorizontal className="w-4 h-4 text-gray-300" />
                <span className="flex-1 text-sm bg-gray-50 rounded px-3 py-1.5">{s}</span>
                <button onClick={() => removeStage(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="New stage name" className="!flex-1" />
              <Button size="sm" onClick={addStage}>Add</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowPipelineModal(false)}>Cancel</Button>
            <Button onClick={handleCreatePipeline} disabled={submitting}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDealModal} onClose={() => { setShowDealModal(false); setEditingDeal(null); }} title={editingDeal ? 'Edit Deal' : 'Add Deal'}>
        <div className="space-y-4">
          <Input label="Title" value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} required />
          <Input label="Value (₹)" type="number" value={dealForm.value} onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <select
              value={dealForm.stage}
              onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {(selectedPipeline?.stages || []).map(s => (
                <option key={s._id || s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <Input label="Contact Name" value={dealForm.contactName} onChange={(e) => setDealForm({ ...dealForm, contactName: e.target.value })} />
          <Input label="Contact Phone" value={dealForm.contactPhone} onChange={(e) => setDealForm({ ...dealForm, contactPhone: e.target.value })} />
          <div className="flex justify-between gap-2 pt-4">
            <div>
              {editingDeal && (
                <Button variant="outline" onClick={handleDeleteDeal} disabled={submitting} icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setShowDealModal(false); setEditingDeal(null); }}>Cancel</Button>
              <Button onClick={handleSaveDeal} disabled={submitting}>{editingDeal ? 'Save' : 'Add Deal'}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
