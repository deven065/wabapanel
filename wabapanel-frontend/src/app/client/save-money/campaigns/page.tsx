'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, Trash2, Send, Clock, CheckCircle, AlertCircle, PiggyBank, Users, Edit, CalendarClock, BarChart3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import { campaignApi, presetMessageApi, segmentApi, tagApi, pipelineApi, mediaApi } from '@/lib/api';
import type { Campaign, Segment, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface Preset { _id: string; name: string; body: string; headerType?: string; mediaUrl?: string; }

export default function PresetCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<{ _id: string; name: string; stages?: { name: string }[] }[]>([]);
  const [eligible, setEligible] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', preset: '', audienceType: 'all', channel: '', segments: [] as string[], tags: [] as string[], pipeline: '', stage: '', senderNumberId: '' });
  const { currentWorkspace } = useAuthStore();
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  const [numbersText, setNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [headerMediaMode, setHeaderMediaMode] = useState<'approved' | 'custom'>('approved');
  const [customHeaderUrl, setCustomHeaderUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHeader(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'campaigns');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      setCustomHeaderUrl(url);
      toast.success('File uploaded');
    } catch { toast.error('Upload failed'); }
    setUploadingHeader(false);
    e.target.value = '';
  };

  const parseNumbers = (text: string) =>
    Array.from(new Set(text.split(/[\s,;|]+/).map(n => n.replace(/\D/g, '')).filter(n => n.length >= 10)));

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const nums = parseNumbers(String(reader.result || ''));
      if (!nums.length) { toast.error('No valid numbers found in the CSV'); return; }
      setNumbersText(prev => Array.from(new Set(parseNumbers(prev).concat(nums))).join('\n'));
      toast.success(`${nums.length} numbers imported from CSV`);
    };
    reader.readAsText(file);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, presetRes, segRes, tagRes, eligRes, pipeRes] = await Promise.allSettled([
        campaignApi.list({ type: 'preset', sendChannel: 'cloud' }),
        presetMessageApi.list(),
        segmentApi.list(),
        tagApi.list(),
        presetMessageApi.eligibleCount(),
        pipelineApi.list(),
      ]);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.data || []);
      if (presetRes.status === 'fulfilled') setPresets(presetRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
      if (pipeRes.status === 'fulfilled') setPipelines(pipeRes.value.data.data || []);
      if (eligRes.status === 'fulfilled') setEligible(eligRes.value.data.data?.count ?? null);
    } catch { /* empty */ }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (submitting) return;
    if (!form.name || !form.preset) { toast.error('Name and preset template required'); return; }
    if (headerMediaMode === 'custom' && !customHeaderUrl) { toast.error('Upload the new media or choose the saved preset media'); return; }
    setSubmitting(true);
    const numbers = form.audienceType === 'numbers' ? parseNumbers(numbersText) : [];
    if (form.audienceType === 'numbers' && !numbers.length) { toast.error('Enter at least one valid number'); setSubmitting(false); return; }
    if (form.audienceType === 'pipeline' && !form.pipeline) { toast.error('Select a pipeline'); setSubmitting(false); return; }
    try {
      const payload = {
        name: form.name, type: 'preset', presetMessage: form.preset, senderNumberId: form.senderNumberId || '',
        variables: headerMediaMode === 'custom' && customHeaderUrl ? { _headerMediaUrl: customHeaderUrl } : undefined,
        audience: { type: form.audienceType, channel: form.channel || undefined, segments: form.segments, tags: form.tags, numbers, pipeline: form.pipeline || undefined, stage: form.stage || undefined },
      };
      if (editId) {
        await campaignApi.update(editId, payload);
        if (createSchedAt) await campaignApi.schedule(editId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      } else {
        const created = await campaignApi.create(payload);
        const newId = created.data.data?._id;
        if (createSchedAt && newId) await campaignApi.schedule(newId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      }
      toast.success(editId ? 'Preset campaign updated' : 'Preset campaign created');
      setShowModal(false); setEditId(null);
      setCreateSchedAt(''); setCreateSchedRec('none');
      setForm({ name: '', preset: '', audienceType: 'all', channel: '', segments: [], tags: [], pipeline: '', stage: '', senderNumberId: '' });
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSubmitting(false);
  };

  const handleEdit = (c: Campaign & { targetType?: string; targetChannel?: string; targetSegments?: string[]; targetTags?: string[]; targetNumbers?: string[]; targetPipeline?: string; targetStage?: string; presetMessage?: { _id?: string } | string }) => {
    setEditId(c._id);
    setForm({
      name: c.name, preset: typeof c.presetMessage === 'string' ? c.presetMessage : (c.presetMessage?._id || ''),
      audienceType: c.targetType || 'all', channel: c.targetChannel || '',
      segments: (c.targetSegments || []).map(String), tags: (c.targetTags || []).map(String),
      pipeline: c.targetPipeline ? String(c.targetPipeline) : '', stage: c.targetStage || '',
      senderNumberId: (c as { senderNumberId?: string }).senderNumberId || '',
    });
    setNumbersText((c.targetNumbers || []).join(String.fromCharCode(10)));
    const existingOverride = (c as { variables?: Record<string, string> }).variables?._headerMediaUrl || '';
    setHeaderMediaMode(existingOverride ? 'custom' : 'approved');
    setCustomHeaderUrl(existingOverride);
    setShowModal(true);
  };


  const [createSchedAt, setCreateSchedAt] = useState('');
  const [createSchedRec, setCreateSchedRec] = useState('none');
  const [schedId, setSchedId] = useState<string | null>(null);
  const [schedAt, setSchedAt] = useState('');
  const [schedRec, setSchedRec] = useState('none');

  const handleSchedule = async () => {
    if (!schedId || !schedAt) { toast.error('Pick a date & time'); return; }
    try {
      await campaignApi.schedule(schedId, { scheduledAt: new Date(schedAt).toISOString(), recurrence: schedRec });
      toast.success('Campaign scheduled');
      setSchedId(null); setSchedAt(''); setSchedRec('none');
      fetchData();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Schedule failed');
    }
  };
  const handleAction = async (id: string, action: 'start' | 'pause' | 'delete') => {
    try {
      if (action === 'delete') { if (!confirm('Delete?')) return; await campaignApi.delete(id); }
      else if (action === 'start') await campaignApi.start(id);
      else await campaignApi.pause(id);
      toast.success(action === 'delete' ? 'Deleted' : action === 'start' ? 'Started' : 'Paused');
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; icon: React.ReactNode }> = {
      draft: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      scheduled: { variant: 'info', icon: <Clock className="w-3 h-3" /> },
      running: { variant: 'success', icon: <Play className="w-3 h-3" /> },
      completed: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
      paused: { variant: 'warning', icon: <Pause className="w-3 h-3" /> },
      failed: { variant: 'danger', icon: <AlertCircle className="w-3 h-3" /> },
    };
    const s = map[status] || map.draft;
    return <Badge variant={s.variant}>{s.icon} {status}</Badge>;
  };

  const columns = [
    { key: 'name', title: 'Campaign', render: (c: Campaign) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: 'status', title: 'Status', render: (c: Campaign) => getStatusBadge(c.status) },
    { key: 'sent', title: 'Sent', render: (c: Campaign) => c.stats?.sent || 0 },
    { key: 'skipped', title: 'Skipped (window closed)', render: (c: Campaign) => (c.stats as { skipped?: number })?.skipped || 0 },
    { key: 'failed', title: 'Failed', render: (c: Campaign) => c.stats?.failed || 0 },
    { key: 'date', title: 'Created', render: (c: Campaign) => new Date(c.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (c: Campaign) => (
      <div className="flex gap-1">
        {c.status === 'draft' && <button onClick={() => handleAction(c._id, 'start')} className="p-1 hover:bg-emerald-50 rounded"><Play className="w-4 h-4 text-emerald-500" /></button>}
        {(c.status === 'draft' || c.status === 'scheduled') && <button title="Schedule" onClick={() => { setSchedId(c._id); setSchedAt(''); setSchedRec('none'); }} className="p-1 hover:bg-amber-50 rounded"><CalendarClock className="w-4 h-4 text-amber-500" /></button>}
        {(c.status === 'draft' || c.status === 'paused') && <button onClick={() => handleEdit(c)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-400" /></button>}
        {c.status === 'running' && <button onClick={() => handleAction(c._id, 'pause')} className="p-1 hover:bg-yellow-50 rounded"><Pause className="w-4 h-4 text-yellow-500" /></button>}
        {['running', 'completed', 'paused'].includes(c.status) && <button title="Report" onClick={() => setReportTarget({ id: c._id, name: c.name })} className="p-1 hover:bg-indigo-50 rounded"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>}
        <button onClick={() => handleAction(c._id, 'delete')} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><PiggyBank className="w-6 h-6 text-emerald-600" /> Preset Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">Free campaign using preset templates — only goes to customers with an open 24-hr window, no Meta charge</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setShowModal(true); }}>New Preset Campaign</Button>
      </div>

      <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
        <Users className="w-4 h-4" />
        <b>{eligible ?? '...'}</b> customers currently have an open 24-hr window — preset messages can be sent to them for FREE. Customers with a closed window are skipped automatically.
      </div>

      <Table columns={columns} data={campaigns} loading={loading} emptyText="No preset campaigns yet" onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => campaignApi.delete(id).catch(() => null))); fetchData(); }} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? 'Edit Preset Campaign' : 'Create Preset Campaign'} size="lg">
        <div className="space-y-4">
          <Input label="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Preset Template" value={form.preset} onChange={(e) => { setForm({ ...form, preset: e.target.value }); setHeaderMediaMode('approved'); setCustomHeaderUrl(''); }}
            options={[{ value: '', label: 'Select preset template' }, ...presets.map(p => ({ value: p._id, label: p.name }))]} />
          {(() => {
            const selPreset = presets.find(p => p._id === form.preset);
            if (!selPreset?.mediaUrl) return null;
            const mType = ['image', 'video', 'document'].includes(selPreset.headerType || '') ? (selPreset.headerType as string) : 'image';
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">Preset {mType} — choose what to send</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'approved'} onChange={() => setHeaderMediaMode('approved')} className="accent-emerald-600" />
                  Send the preset&apos;s saved {mType} (no upload needed)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'custom'} onChange={() => setHeaderMediaMode('custom')} className="accent-emerald-600" />
                  Change the {mType} for this campaign only
                </label>
                {headerMediaMode === 'custom' && (
                  <div className="space-y-1">
                    <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                      <Plus className="w-4 h-4" /> {uploadingHeader ? 'Uploading...' : (customHeaderUrl ? 'Replace file' : 'Upload file')}
                      <input type="file" accept={mType === 'image' ? 'image/*' : mType === 'video' ? 'video/*' : undefined} className="hidden" onChange={handleHeaderUpload} />
                    </label>
                    {customHeaderUrl && mType === 'image' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={customHeaderUrl} alt="media" className="h-20 rounded border" />
                    )}
                    {customHeaderUrl && mType !== 'image' && <p className="text-xs text-gray-500 break-all">{customHeaderUrl}</p>}
                  </div>
                )}
              </div>
            );
          })()}
          {presets.length === 0 && <p className="text-xs text-amber-600">Create a template on the Preset Templates page first.</p>}
          {waNumbers.length > 1 && (
            <Select label="Send from number" value={form.senderNumberId} onChange={(e) => setForm({ ...form, senderNumberId: e.target.value })}
              options={[{ value: '', label: 'Default number' }, ...waNumbers.map(n => ({ value: n.id, label: n.label }))]} />
          )}
          <Select label="Audience" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            options={[{ value: 'all', label: 'All Contacts' }, { value: 'segment', label: 'By Segment' }, { value: 'tag', label: 'By Tag' }, { value: 'pipeline', label: 'By Pipeline Stage' }, { value: 'numbers', label: 'Numbers List / CSV (bina contact save kiye)' }]} />
          {form.audienceType === 'pipeline' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Pipeline" value={form.pipeline} onChange={(e) => setForm({ ...form, pipeline: e.target.value, stage: '' })}
                options={[{ value: '', label: 'Select pipeline' }, ...pipelines.map(p => ({ value: p._id, label: p.name }))]} />
              <Select label="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
                options={[{ value: '', label: 'All stages' }, ...((pipelines.find(p => p._id === form.pipeline)?.stages || []).map(s => ({ value: s.name, label: s.name })))]} />
            </div>
          )}
          {form.audienceType !== 'numbers' && (
            <Select label="Platform (optional)" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
              options={[{ value: '', label: 'All Platforms' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'whatsapp_qr', label: 'WhatsApp QR' }, { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' }, { value: 'telegram', label: 'Telegram' }, { value: 'telegram_personal', label: 'Telegram Personal' }, { value: 'email', label: 'Gmail / Email' }]} />
          )}
          {form.audienceType === 'numbers' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Phone Numbers</label>
              <textarea rows={5} value={numbersText} onChange={(e) => setNumbersText(e.target.value)}
                placeholder={'9198765XXXXX\n9198123XXXXX\n(one number per line, or separate with commas)'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                  <Plus className="w-4 h-4" /> Upload CSV
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ''; }} />
                </label>
                <span className="text-xs text-gray-400">{parseNumbers(numbersText).length} valid numbers</span>
              </div>
              <p className="text-xs text-gray-400">The preset only goes to numbers with an open 24-hr window; the rest are skipped.</p>
            </div>
          )}
          {form.audienceType === 'segment' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Segments</label>
              <div className="flex flex-wrap gap-2">
                {segments.map(s => (
                  <button key={s._id} onClick={() => setForm({ ...form, segments: form.segments.includes(s._id) ? form.segments.filter(x => x !== s._id) : [...form.segments, s._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${form.segments.includes(s._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {form.audienceType === 'tag' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <button key={t._id} onClick={() => setForm({ ...form, tags: form.tags.includes(t._id) ? form.tags.filter(x => x !== t._id) : [...form.tags, t._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${form.tags.includes(t._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border rounded-lg p-3 bg-amber-50/40 border-amber-100 space-y-2">
            <p className="text-xs font-medium text-gray-700">Schedule (optional) — leave empty to keep as draft and start manually</p>
            <div className="flex gap-2">
              <input type="datetime-local" value={createSchedAt} onChange={(e) => setCreateSchedAt(e.target.value)}
                className="flex-1 px-2 py-1.5 border rounded-lg text-sm" />
              <select value={createSchedRec} onChange={(e) => setCreateSchedRec(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
                <option value="none">Once (no repeat)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {createSchedAt && <p className="text-[11px] text-amber-700">Campaign will run automatically at the selected time{createSchedRec !== 'none' ? ` and repeat ${createSchedRec}` : ''}.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} icon={<Send className="w-4 h-4" />} loading={submitting}>Create Campaign</Button>
          </div>
        </div>
      </Modal>

      <CampaignReportModal campaignId={reportTarget?.id || null} campaignName={reportTarget?.name} onClose={() => setReportTarget(null)} />

      <Modal isOpen={!!schedId} onClose={() => setSchedId(null)} title="Schedule Campaign" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
            <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repeat</label>
            <select value={schedRec} onChange={e => setSchedRec(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="none">Once (no repeat)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button onClick={handleSchedule} className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Schedule</button>
        </div>
      </Modal>
    </div>
  );
}
