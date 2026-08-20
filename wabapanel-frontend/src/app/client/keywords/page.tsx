'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, MessageSquare, Zap, FileText, Sticker as StickerIcon, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { keywordApi, uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Keyword {
  _id: string;
  keyword: string;
  matchType: string;
  responseType: string;
  responseText: string;
  responseTemplate?: { _id: string; name: string };
  responseMedia?: { type: string; url: string; caption: string };
  status: string;
  priority: number;
  stats: { triggered: number; lastTriggeredAt?: string };
  createdAt: string;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Keyword | null>(null);
  const [form, setForm] = useState({
    keyword: '', matchType: 'contains', responseType: 'text',
    responseText: '', priority: 0,
    responseMedia: { type: 'sticker', url: '', caption: '' },
  });
  const [kwUploading, setKwUploading] = useState(false);
  const kwFileRef = React.useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchKeywords = () => {
    keywordApi.getKeywords()
      .then(r => setKeywords(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeywords(); }, []);

  const handleKwUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKwUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (form.responseMedia.type === 'sticker') fd.append('folder', 'stickers');
      const res = await uploadApi.uploadFile(fd);
      setForm(f => ({ ...f, responseMedia: { ...f.responseMedia, url: res.data.data.url } }));
      toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
    setKwUploading(false);
    if (kwFileRef.current) kwFileRef.current.value = '';
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (!form.keyword.trim()) { toast.error('Keyword is required'); return; }
    if (form.responseType === 'text' && !form.responseText.trim()) { toast.error('Response text is required'); setSubmitting(false); return; }
    if (form.responseType === 'media' && !form.responseMedia.url) { toast.error('Please upload a sticker/media file'); setSubmitting(false); return; }
    try {
      if (editItem) {
        await keywordApi.updateKeyword(editItem._id, form);
        toast.success('Keyword updated');
      } else {
        await keywordApi.createKeyword(form);
        toast.success('Keyword created');
      }
      setShowModal(false);
      setEditItem(null);
      fetchKeywords();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const toggleStatus = async (kw: Keyword) => {
    try {
      await keywordApi.updateKeyword(kw._id, {
        status: kw.status === 'active' ? 'inactive' : 'active',
      });
      toast.success(kw.status === 'active' ? 'Keyword deactivated' : 'Keyword activated');
      fetchKeywords();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this keyword trigger?')) return;
    try {
      await keywordApi.deleteKeyword(id);
      toast.success('Keyword deleted');
      fetchKeywords();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const openEdit = (kw: Keyword) => {
    setEditItem(kw);
    setForm({
      keyword: kw.keyword,
      matchType: kw.matchType,
      responseType: kw.responseType,
      responseText: kw.responseText || '',
      priority: kw.priority || 0,
      responseMedia: {
        type: kw.responseMedia?.type || 'sticker',
        url: kw.responseMedia?.url || '',
        caption: kw.responseMedia?.caption || '',
      },
    });
    setShowModal(true);
  };

  const responseIcon = (type: string) => {
    if (type === 'text') return <MessageSquare className="w-3.5 h-3.5" />;
    if (type === 'template') return <FileText className="w-3.5 h-3.5" />;
    if (type === 'automation') return <Zap className="w-3.5 h-3.5" />;
    if (type === 'media') return <StickerIcon className="w-3.5 h-3.5" />;
    return null;
  };

  const columns = [
    { key: 'keyword', title: 'Keyword', render: (k: Keyword) => (
      <div>
        <span className="font-semibold text-gray-900">{k.keyword}</span>
        <p className="text-xs text-gray-400 mt-0.5">{k.matchType === 'exact' ? 'Exact match' : k.matchType === 'contains' ? 'Contains' : 'Starts with'}</p>
      </div>
    )},
    { key: 'response', title: 'Response', render: (k: Keyword) => (
      <div className="flex items-center gap-2">
        <Badge variant={k.responseType === 'text' ? 'info' : k.responseType === 'template' ? 'warning' : 'default'}>
          <span className="flex items-center gap-1">{responseIcon(k.responseType)} {k.responseType}</span>
        </Badge>
        {k.responseType === 'text' && k.responseText && (
          <span className="text-sm text-gray-500 truncate block max-w-[200px]">{k.responseText}</span>
        )}
      </div>
    )},
    { key: 'stats', title: 'Triggered', render: (k: Keyword) => (
      <div className="text-center">
        <span className="text-lg font-semibold text-gray-900">{k.stats?.triggered || 0}</span>
        {k.stats?.lastTriggeredAt && (
          <p className="text-xs text-gray-400">{new Date(k.stats.lastTriggeredAt).toLocaleDateString()}</p>
        )}
      </div>
    )},
    { key: 'status', title: 'Status', render: (k: Keyword) => (
      <button onClick={() => toggleStatus(k)} className="flex items-center gap-1.5 group">
        {k.status === 'active' ? (
          <ToggleRight className="w-6 h-6 text-emerald-600 group-hover:text-emerald-700" />
        ) : (
          <ToggleLeft className="w-6 h-6 text-gray-400 group-hover:text-gray-500" />
        )}
        <span className={`text-xs font-medium ${k.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}`}>
          {k.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </button>
    )},
    { key: 'actions', title: '', render: (k: Keyword) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(k)} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <Edit className="w-4 h-4 text-gray-400" />
        </button>
        <button onClick={() => handleDelete(k._id)} className="p-1.5 hover:bg-red-50 rounded-lg">
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    )},
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => keywordApi.deleteKeyword(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchKeywords();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Keyword Triggers</h1>
          <p className="text-sm text-gray-500 mt-1">Auto-respond when customers send specific keywords</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => {
          setEditItem(null);
          setForm({ keyword: '', matchType: 'contains', responseType: 'text', responseText: '', priority: 0, responseMedia: { type: 'sticker', url: '', caption: '' } });
          setShowModal(true);
        }}>Add Keyword</Button>
      </div>

      <Table columns={columns} data={keywords} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => keywordApi.deleteKeyword(id).catch(() => null))); fetchKeywords(); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Keyword' : 'Add Keyword'}>
        <div className="space-y-4">
          <Input label="Keyword" value={form.keyword} onChange={e => setForm({ ...form, keyword: e.target.value })} placeholder="e.g. hello, pricing, help" required />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Match Type" value={form.matchType} onChange={e => setForm({ ...form, matchType: e.target.value })}
              options={[{ value: 'exact', label: 'Exact Match' }, { value: 'contains', label: 'Contains' }, { value: 'starts_with', label: 'Starts With' }]} />
            <Select label="Response Type" value={form.responseType} onChange={e => setForm({ ...form, responseType: e.target.value })}
              options={[{ value: 'text', label: 'Text Message' }, { value: 'media', label: 'Sticker / Media' }, { value: 'template', label: 'Template' }, { value: 'automation', label: 'Trigger Automation' }]} />
          </div>
          {form.responseType === 'text' && (
            <Textarea label="Response Text" value={form.responseText} onChange={e => setForm({ ...form, responseText: e.target.value })} rows={4} placeholder="Type the auto-reply message..." required />
          )}
          {form.responseType === 'media' && (
            <div className="space-y-3">
              <Select label="Media Type" value={form.responseMedia.type} onChange={e => setForm({ ...form, responseMedia: { ...form.responseMedia, type: e.target.value, url: '' } })}
                options={[{ value: 'sticker', label: 'Sticker (WebP)' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }]} />
              <input ref={kwFileRef} type="file" className="hidden" accept={form.responseMedia.type === 'sticker' ? 'image/*,.webp,.gif' : form.responseMedia.type === 'image' ? 'image/*' : form.responseMedia.type === 'video' ? 'video/*' : '*/*'} onChange={handleKwUpload} />
              <div className="flex items-center gap-2">
                <Button variant="outline" icon={<Upload className="w-4 h-4" />} loading={kwUploading} onClick={() => kwFileRef.current?.click()}>Upload {form.responseMedia.type}</Button>
                {form.responseMedia.url && form.responseMedia.type === 'sticker' && (
                  <img src={form.responseMedia.url} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded-lg" />
                )}
                {form.responseMedia.url && form.responseMedia.type === 'image' && (
                  <img src={form.responseMedia.url} alt="" className="w-14 h-14 object-cover border border-gray-200 rounded-lg" />
                )}
                {form.responseMedia.url && form.responseMedia.type !== 'sticker' && form.responseMedia.type !== 'image' && (
                  <span className="text-xs text-emerald-600">Uploaded ✓</span>
                )}
              </div>
              {form.responseMedia.type !== 'sticker' && (
                <Input label="Caption (optional)" value={form.responseMedia.caption} onChange={e => setForm({ ...form, responseMedia: { ...form.responseMedia, caption: e.target.value } })} />
              )}
              <p className="text-xs text-gray-400">Sticker files are auto-converted to WhatsApp WebP format.</p>
            </div>
          )}
          <Input label="Priority" type="number" value={String(form.priority)} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
          <p className="text-xs text-gray-400">Higher priority keywords are checked first. Default is 0.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editItem ? 'Update' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
