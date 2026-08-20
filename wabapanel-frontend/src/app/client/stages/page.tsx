'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Edit, Milestone } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import { crmApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface StageItem { _id: string; name: string; color: string; contactCount?: number }

const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'];

export default function StagesPage() {
  const router = useRouter();
  const [stages, setStages] = useState<StageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editStage, setEditStage] = useState<StageItem | null>(null);
  const [form, setForm] = useState({ name: '', color: '#8B5CF6' });
  const [submitting, setSubmitting] = useState(false);

  const fetchStages = async () => {
    try { const res = await crmApi.stages(); setStages(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchStages(); }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editStage) { await crmApi.updateStage(editStage._id, form); toast.success('Stage updated'); }
      else { await crmApi.createStage(form); toast.success('Stage created'); }
      setShowModal(false); setEditStage(null); setForm({ name: '', color: '#8B5CF6' }); fetchStages();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    if (!confirm('Delete this stage? Leads using it will show no stage.')) return;
    setSubmitting(true);
    try { await crmApi.deleteStage(id); toast.success('Deleted'); fetchStages(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stage/Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">Sales stages for your leads — assign from Chat or Calling Center</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditStage(null); setForm({ name: '', color: '#8B5CF6' }); setShowModal(true); }}>
          Create Stage
        </Button>
      </div>

      {!loading && stages.length > 0 && (
        <Card className="overflow-x-auto">
          <p className="text-xs font-medium text-gray-500 mb-3">Pipeline overview</p>
          <div className="flex items-stretch min-w-max pb-1">
            {stages.map((stage, i) => {
              const color = stage.color || '#8B5CF6';
              return (
                <button
                  key={stage._id}
                  type="button"
                  onClick={() => router.push(`/client/call-center?stage=${stage._id}`)}
                  title={`View leads in ${stage.name}`}
                  className="relative text-white text-center py-3 min-w-[104px] transition-transform hover:-translate-y-0.5"
                  style={{
                    backgroundColor: color,
                    clipPath: i === 0
                      ? 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)'
                      : 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)',
                    marginLeft: i === 0 ? 0 : -14,
                    paddingLeft: i === 0 ? 20 : 30,
                    paddingRight: 24,
                  }}
                >
                  <div className="text-xl font-bold leading-none">{stage.contactCount || 0}</div>
                  <div className="text-[11px] font-medium mt-1 leading-tight whitespace-nowrap opacity-95">{stage.name}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : stages.length === 0 ? (
        <Card className="text-center py-12">
          <Milestone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No stages created yet</p>
          <p className="text-gray-400 text-sm mt-1">e.g. New, Interested, Demo, Negotiation, Won, Lost</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {stages.map((stage) => (
            <Card key={stage._id}>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => router.push(`/client/call-center?stage=${stage._id}`)}
                  className="flex items-center gap-3 text-left flex-1 min-w-0 group"
                  title="View leads in this stage"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (stage.color || '#8B5CF6') + '20' }}>
                    <Milestone className="w-4 h-4" style={{ color: stage.color || '#8B5CF6' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate group-hover:text-emerald-600">{stage.name}</p>
                    <p className="text-xs text-gray-500">{stage.contactCount || 0} leads</p>
                  </div>
                </button>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditStage(stage); setForm({ name: stage.name, color: stage.color }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(stage._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editStage ? 'Edit Stage' : 'Create Stage'} size="sm">
        <div className="space-y-4">
          <Input label="Stage Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                title="Custom colour" className="w-8 h-8 p-0 border border-gray-200 rounded cursor-pointer" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editStage ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
