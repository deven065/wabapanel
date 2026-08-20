'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Send, Clock, CheckCircle, AlertCircle, Edit, CalendarClock, BarChart3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import { campaignApi, templateApi, segmentApi, tagApi, pipelineApi, mediaApi, dataFieldApi } from '@/lib/api';
import type { Campaign, Template, Segment, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function BroadcastsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<{ _id: string; name: string; stages?: { name: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', template: '', audienceType: 'all', channel: '', segments: [] as string[], tags: [] as string[],
    pipeline: '', stage: '',
    scheduledAt: '', timezone: 'Asia/Kolkata',
    senderNumberId: '',
  });
  const { currentWorkspace } = useAuthStore();
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [dataFields, setDataFields] = useState<{ name: string; label: string }[]>([]);
  const [abTest, setAbTest] = useState({ enabled: false, templateB: '', splitPercent: 50 });
  const [abResults, setAbResults] = useState<{ id: string; data: { results: Record<string, { sent: number; delivered: number; read: number; failed: number; replied: number }> } } | null>(null);
  const [numbersText, setNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [headerMediaMode, setHeaderMediaMode] = useState<'approved' | 'custom'>('approved');
  const [customHeaderUrl, setCustomHeaderUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);
  // Per-card carousel media override (card index -> new media URL) for this campaign only
  const [carouselMedia, setCarouselMedia] = useState<Record<number, string>>({});
  const [uploadingCard, setUploadingCard] = useState<number | null>(null);

  const handleCardUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCard(index);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'campaigns');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      if (!url) throw new Error('no url');
      setCarouselMedia(prev => ({ ...prev, [index]: url }));
      toast.success(`Card ${index + 1} media updated`);
    } catch { toast.error('Upload failed'); }
    setUploadingCard(null);
    e.target.value = '';
  };

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

  const [reportCampaign, setReportCampaign] = useState<{ id: string; name: string } | null>(null);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, tmpRes, segRes, tagRes, pipeRes, dfRes] = await Promise.allSettled([
        campaignApi.list({ type: 'broadcast' }),
        templateApi.list({ status: 'approved', limit: 500 }),
        segmentApi.list(),
        tagApi.list(),
        pipelineApi.list(),
        dataFieldApi.list(),
      ]);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.data || []);
      if (tmpRes.status === 'fulfilled') setTemplates(tmpRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
      if (pipeRes.status === 'fulfilled') setPipelines(pipeRes.value.data.data || []);
      if (dfRes.status === 'fulfilled') setDataFields((dfRes.value.data.data || []).map((f: { name: string; label?: string }) => ({ name: f.name, label: f.label || f.name })));
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (headerMediaMode === 'custom' && !customHeaderUrl) { toast.error('Upload the new header media or choose the approved template media'); setSubmitting(false); return; }
    const numbers = form.audienceType === 'numbers' ? parseNumbers(numbersText) : [];
    if (form.audienceType === 'numbers' && !numbers.length) { toast.error('Enter at least one valid number'); setSubmitting(false); return; }
    if (form.audienceType === 'pipeline' && !form.pipeline) { toast.error('Select a pipeline'); setSubmitting(false); return; }
    try {
      const payload = {
        name: form.name, type: 'broadcast', template: form.template, senderNumberId: form.senderNumberId || '',
        abTest: abTest.enabled && abTest.templateB ? { enabled: true, templateB: abTest.templateB, splitPercent: abTest.splitPercent } : { enabled: false },
        variables: (() => {
          const v: Record<string, string> = { ...variables };
          if (headerMediaMode === 'custom' && customHeaderUrl) v._headerMediaUrl = customHeaderUrl;
          for (const [idx, url] of Object.entries(carouselMedia)) { if (url) v[`_carouselMedia${idx}`] = url; }
          return Object.keys(v).length > 0 ? v : undefined;
        })(),
        audience: { type: form.audienceType, channel: form.channel || undefined, segments: form.segments, tags: form.tags, numbers, pipeline: form.pipeline || undefined, stage: form.stage || undefined },
        schedule: form.scheduledAt ? { sendAt: form.scheduledAt, timezone: form.timezone } : undefined,
      };
      if (editId) {
        await campaignApi.update(editId, payload);
        if (createSchedAt) await campaignApi.schedule(editId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      } else {
        const created = await campaignApi.create(payload);
        const newId = created.data.data?._id;
        if (createSchedAt && newId) await campaignApi.schedule(newId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      }
      toast.success(editId ? 'Broadcast updated' : 'Broadcast created');
      setShowModal(false); setEditId(null);
      setCreateSchedAt(''); setCreateSchedRec('none'); fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleEdit = (c: Campaign & { targetType?: string; targetChannel?: string; senderNumberId?: string; targetSegments?: string[]; targetTags?: string[]; targetNumbers?: string[]; targetPipeline?: string; targetStage?: string; template?: { _id?: string } | string }) => {
    setEditId(c._id);
    setForm({
      name: c.name, template: typeof c.template === 'string' ? c.template : (c.template?._id || ''),
      audienceType: c.targetType || 'all', channel: c.targetChannel || '',
      segments: (c.targetSegments || []).map(String), tags: (c.targetTags || []).map(String),
      pipeline: c.targetPipeline ? String(c.targetPipeline) : '', stage: c.targetStage || '',
      scheduledAt: '', timezone: 'Asia/Kolkata',
      senderNumberId: c.senderNumberId || '',
    });
    setNumbersText((c.targetNumbers || []).join(String.fromCharCode(10)));
    const existingVars = (c as { variables?: Record<string, string> }).variables || {};
    const existingOverride = existingVars._headerMediaUrl || '';
    setHeaderMediaMode(existingOverride ? 'custom' : 'approved');
    setCustomHeaderUrl(existingOverride);
    const cards: Record<number, string> = {};
    for (const [k, val] of Object.entries(existingVars)) {
      const m = k.match(/^_carouselMedia(\d+)$/);
      if (m && val) cards[parseInt(m[1])] = val;
    }
    setCarouselMedia(cards);
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
    if (submitting) return;
    setSubmitting(true);

    try {
      if (action === 'delete') { if (!confirm('Delete?')) return; await campaignApi.delete(id); }
      else if (action === 'start') {
        await campaignApi.start(id);
        toast.success('Campaign started — sending...');
        // Poll until campaign completes (running → completed/failed)
        const poll = async (retries: number) => {
          for (let i = 0; i < retries; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const res = await campaignApi.list({ type: 'broadcast' });
              const updated = (res.data.data || []) as Campaign[];
              setCampaigns(updated);
              const c = updated.find((x: Campaign) => x._id === id);
              if (c && c.status !== 'running') return;
            } catch { /* retry */ }
          }
        };
        await poll(15);
        setSubmitting(false);
        return;
      }
      else await campaignApi.pause(id);
      toast.success(action === 'delete' ? 'Deleted' : 'Paused');
      fetchData();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
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
    { key: 'stats', title: 'Sent/Delivered', render: (c: Campaign) => <span>{c.stats?.sent || 0} / {c.stats?.delivered || 0}</span> },
    { key: 'read', title: 'Read', render: (c: Campaign) => c.stats?.read || 0 },
    { key: 'failed', title: 'Failed', render: (c: Campaign) => c.stats?.failed || 0 },
    { key: 'date', title: 'Created', render: (c: Campaign) => new Date(c.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (c: Campaign) => (
      <div className="flex gap-1">
        {c.status === 'draft' && <button onClick={() => handleAction(c._id, 'start')} className="p-1 hover:bg-emerald-50 rounded"><Play className="w-4 h-4 text-emerald-500" /></button>}
        {(c.status === 'draft' || c.status === 'scheduled') && <button title="Schedule" onClick={() => { setSchedId(c._id); setSchedAt(''); setSchedRec('none'); }} className="p-1 hover:bg-amber-50 rounded"><CalendarClock className="w-4 h-4 text-amber-500" /></button>}
        {(c.status === 'draft' || c.status === 'paused' || c.status === 'scheduled') && <button onClick={() => handleEdit(c)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-400" /></button>}
        {c.status === 'running' && <button onClick={() => handleAction(c._id, 'pause')} className="p-1 hover:bg-yellow-50 rounded"><Pause className="w-4 h-4 text-yellow-500" /></button>}
        {['running', 'completed', 'paused'].includes(c.status) && <button title="Report" onClick={() => setReportCampaign({ id: c._id, name: c.name })} className="p-1 hover:bg-indigo-50 rounded"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>}
        {(c as unknown as { abTest?: { enabled?: boolean } }).abTest?.enabled && (c.status === 'completed' || c.status === 'running') && (
          <button title="A/B test results" onClick={async () => {
            try { const r = await campaignApi.abResults(c._id); setAbResults({ id: c._id, data: r.data.data }); } catch { toast.error('Failed to load results'); }
          }} className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 hover:bg-violet-200">A/B</button>
        )}
        <button onClick={() => handleAction(c._id, 'delete')} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Broadcast Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">Send bulk messages to your contacts</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setCarouselMedia({}); setShowModal(true); }}>New Broadcast</Button>
      </div>

      <Table columns={columns} data={campaigns} loading={loading} emptyText="No broadcasts yet" onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => campaignApi.delete(id).catch(() => null))); fetchData(); }} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? 'Edit Broadcast' : 'Create Broadcast'} size="lg">
        <div className="space-y-4">
          <Input label="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Template" value={form.template} onChange={(e) => {
            setForm({ ...form, template: e.target.value });
            setVariables({});
            setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setCarouselMedia({});
          }}
            options={[{ value: '', label: 'Select template' }, ...templates.map(t => ({ value: t._id, label: `${t.name} (${t.status})` }))]} />
          {waNumbers.length > 1 && (
            <Select label="Send From Number" value={form.senderNumberId} onChange={(e) => setForm({ ...form, senderNumberId: e.target.value })}
              options={waNumbers.map(n => ({ value: n.id, label: n.label }))} />
          )}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template) as (Template & { header?: { type?: string; mediaUrl?: string } }) | undefined;
            const hdr = selTpl?.header;
            if (!hdr || !['image', 'video', 'document'].includes(hdr.type || '')) return null;
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">Header {hdr.type} — choose what to send</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'approved'} onChange={() => setHeaderMediaMode('approved')} className="accent-emerald-600" />
                  Send the approved template {hdr.type} (no upload needed)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'custom'} onChange={() => setHeaderMediaMode('custom')} className="accent-emerald-600" />
                  Change the {hdr.type} for this campaign only
                </label>
                {headerMediaMode === 'custom' && (
                  <div className="space-y-1">
                    <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                      <Plus className="w-4 h-4" /> {uploadingHeader ? 'Uploading...' : (customHeaderUrl ? 'Replace file' : 'Upload file')}
                      <input type="file" accept={hdr.type === 'image' ? 'image/*' : hdr.type === 'video' ? 'video/*' : undefined} className="hidden" onChange={handleHeaderUpload} />
                    </label>
                    {customHeaderUrl && hdr.type === 'image' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={customHeaderUrl} alt="header" className="h-20 rounded border" />
                    )}
                    {customHeaderUrl && hdr.type !== 'image' && <p className="text-xs text-gray-500 break-all">{customHeaderUrl}</p>}
                    <p className="text-[11px] text-gray-400">Meta approves the template text, not the media — a different {hdr.type} can be sent without re-approval.</p>
                  </div>
                )}
              </div>
            );
          })()}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template) as (Template & { carousel?: { cards?: { mediaUrl?: string; mediaType?: string }[] } }) | undefined;
            const cards = selTpl?.carousel?.cards || [];
            if (!cards.length) return null;
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-700">Carousel cards ({cards.length}) — change the media for this campaign only</p>
                  <p className="text-[11px] text-gray-400">Meta approves the template text, not the media — a different image/video can be sent without re-approval. Leave a card untouched to send its approved media.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {cards.map((card, i) => {
                    const isVideo = (card.mediaType || 'image') === 'video';
                    const shown = carouselMedia[i] || card.mediaUrl || '';
                    return (
                      <div key={i} className="border rounded-lg p-2 bg-white space-y-1.5">
                        <p className="text-[11px] font-medium text-gray-600">Card {i + 1} {carouselMedia[i] && <span className="text-emerald-600">(changed)</span>}</p>
                        {shown && !isVideo && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={shown} alt={`Card ${i + 1}`} className="h-20 w-full object-cover rounded border" />
                        )}
                        {shown && isVideo && <video src={shown} className="h-20 w-full object-cover rounded border" muted />}
                        <label className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                          <Plus className="w-3.5 h-3.5" /> {uploadingCard === i ? 'Uploading...' : (carouselMedia[i] ? 'Replace again' : `Change ${isVideo ? 'video' : 'image'}`)}
                          <input type="file" accept={isVideo ? 'video/*' : 'image/*'} className="hidden" onChange={(e) => handleCardUpload(i, e)} />
                        </label>
                        {carouselMedia[i] && (
                          <button onClick={() => setCarouselMedia(prev => { const n = { ...prev }; delete n[i]; return n; })}
                            className="block text-[11px] text-gray-400 hover:text-red-500">Reset to approved media</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template);
            const bodyVars = (selTpl?.body || '').match(/\{\{\d+\}\}/g) || [];
            if (!bodyVars.length) return null;
            return (
              <div className="border rounded-lg p-3 bg-blue-50/40 border-blue-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">Template Variables ({bodyVars.length})</p>
                <p className="text-[11px] text-gray-400">Type any custom value on the left (goes to everyone the same), or pick a contact field on the right to auto-fill each contact&apos;s own value. Custom fields you add in Contacts also appear in the dropdown.</p>
                {bodyVars.map((v: string) => {
                  const num = v.replace(/[{}]/g, '');
                  const fieldOptions = [
                    { value: '', label: '— Auto-fill from contact field —' },
                    { value: '{contact_name}', label: 'Contact Name' },
                    { value: '{first_name}', label: 'First Name' },
                    { value: '{last_name}', label: 'Last Name' },
                    { value: '{profile_name}', label: 'WhatsApp Profile Name' },
                    { value: '{phone}', label: 'Phone' },
                    { value: '{country_code}', label: 'Country Code' },
                    { value: '{email}', label: 'Email' },
                    ...dataFields.map(f => ({ value: `{${f.name}}`, label: `Custom field: ${f.label}` })),
                  ];
                  return (
                    <div key={num} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                      <Input label={`Variable ${num} — custom value`} placeholder={`Type anything for {{${num}}}`}
                        value={variables[num] || ''}
                        onChange={(e) => setVariables(prev => ({ ...prev, [num]: e.target.value }))} />
                      <Select label="…or auto-fill from field" value={fieldOptions.some(o => o.value === (variables[num] || '')) ? (variables[num] || '') : ''}
                        onChange={(e) => { if (e.target.value) setVariables(prev => ({ ...prev, [num]: e.target.value })); }}
                        options={fieldOptions} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <Select label="Audience" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            options={[{ value: 'all', label: 'All Contacts' }, { value: 'segment', label: 'By Segment' }, { value: 'tag', label: 'By Tag' }, { value: 'pipeline', label: 'By Pipeline Stage' }, { value: 'numbers', label: 'Numbers List / CSV (without saving contacts)' }]} />
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
              <p className="text-xs text-gray-400">These numbers will not be saved as contacts — the template is sent directly.</p>
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
          <div className="border rounded-lg p-3 bg-violet-50/40 border-violet-100 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={abTest.enabled} onChange={(e) => setAbTest({ ...abTest, enabled: e.target.checked })} className="w-4 h-4 accent-violet-600" />
              A/B Test (optional) — send a second template to part of the audience and compare results
            </label>
            {abTest.enabled && (
              <div className="space-y-2">
                <Select label="Template B (variant)" value={abTest.templateB} onChange={(e) => setAbTest({ ...abTest, templateB: e.target.value })}
                  options={[{ value: '', label: 'Select variant template' }, ...templates.filter(t => t._id !== form.template).map(t => ({ value: t._id, label: t.name }))]} />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Split — {abTest.splitPercent}% get Template A, {100 - abTest.splitPercent}% get Template B</label>
                  <input type="range" min={10} max={90} step={5} value={abTest.splitPercent} onChange={(e) => setAbTest({ ...abTest, splitPercent: parseInt(e.target.value) })} className="w-full accent-violet-600" />
                </div>
                <p className="text-[11px] text-gray-400">After sending, click the A/B button on the campaign row to compare delivery, read and reply rates.</p>
              </div>
            )}
          </div>
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
            <Button onClick={handleCreate} icon={<Send className="w-4 h-4" />}>Create Broadcast</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!abResults} onClose={() => setAbResults(null)} title="A/B Test Results" size="lg">
        {abResults && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Comparison of how each template variant performed. Higher read and reply rates indicate the better-performing message.</p>
            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B'] as const).map(v => {
                const r = abResults.data.results[v] || { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
                const rate = (n: number) => r.sent > 0 ? Math.round((n / r.sent) * 100) : 0;
                return (
                  <div key={v} className="border rounded-xl p-4 space-y-2">
                    <h3 className="font-semibold text-gray-900">Variant {v}</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex justify-between"><span>Sent</span><b>{r.sent}</b></div>
                      <div className="flex justify-between"><span>Delivered</span><b>{r.delivered} ({rate(r.delivered)}%)</b></div>
                      <div className="flex justify-between"><span>Read</span><b>{r.read} ({rate(r.read)}%)</b></div>
                      <div className="flex justify-between"><span>Replied</span><b>{r.replied} ({rate(r.replied)}%)</b></div>
                      <div className="flex justify-between text-red-500"><span>Failed</span><b>{r.failed}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

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

      <CampaignReportModal
        campaignId={reportCampaign?.id ?? null}
        campaignName={reportCampaign?.name}
        onClose={() => setReportCampaign(null)}
      />
    </div>
  );
}
