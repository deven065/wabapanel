'use client';
import React, { useState, useEffect } from 'react';
import WaTextarea from '@/components/ui/WaTextarea';
import { Plus, RefreshCw, Search, Eye, Trash2, Clock, CheckCircle, XCircle, Image as ImageIcon, Video, File, Phone, ExternalLink, X, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import { templateApi, mediaApi } from "@/lib/api";
import type { Template } from '@/types';
import toast from 'react-hot-toast';

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG';
  text: string;
  url?: string;
  urlType?: 'static' | 'dynamic';
  urlExample?: string;
  phoneNumber?: string;
}

interface CarouselCard {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  body: string;
  buttons: TemplateButton[];
}

const emptyCard = (): CarouselCard => ({ mediaUrl: '', mediaType: 'image', body: '', buttons: [{ type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }] });


function CarouselStrip({ cards }: { cards: Array<{ mediaUrl?: string; mediaType?: string; body?: string; buttons?: Array<{ text: string }> }> }) {
  return (
    <div className="w-full max-w-md">
      <p className="text-xs font-semibold text-gray-500 mb-2">Carousel cards (swipe) preview</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((c, i) => (
          <div key={i} className="flex-shrink-0 w-44 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {c.mediaUrl ? (
              c.mediaType === 'video'
                ? <video src={c.mediaUrl} className="w-full h-28 object-cover bg-gray-100" muted />
                : /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.mediaUrl} alt={'card ' + (i + 1)} className="w-full h-28 object-cover bg-gray-100" />
            ) : (
              <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-xs text-gray-400">No media</div>
            )}
            <div className="p-2">
              <p className="text-xs text-gray-800 whitespace-pre-wrap break-words">{c.body || <span className="text-gray-300">Card text...</span>}</p>
              {(c.buttons || []).filter(b => b.text).map((b, bi) => (
                <div key={bi} className="mt-1.5 text-center text-[11px] font-medium text-sky-600 border-t border-gray-100 pt-1.5">{b.text}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const templateToPreview = (t: Template) => {
  const raw = t as unknown as Record<string, unknown>;
  const header = raw.header as Record<string, string> | undefined;
  const buttons = raw.buttons as Array<{ text: string; type?: string }> | undefined;
  return {
    headerType: header?.type,
    headerText: header?.content,
    headerMediaUrl: header?.mediaUrl,
    body: t.body,
    footer: t.footer,
    buttons: buttons || [],
  };
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [showPreview, setShowPreview] = useState<Template | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showBtnMenu, setShowBtnMenu] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'MARKETING', language: 'en',
    headerType: 'none' as 'none' | 'text' | 'image' | 'video' | 'document',
    headerText: '', headerMediaUrl: '',
    bodyText: '', footerText: '',
    buttons: [] as TemplateButton[],
    isCarousel: false,
    cards: [] as CarouselCard[],
    authButtonText: 'Copy Code',
    authCodeExpiry: 10,
    authSecurityRec: true,
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "templates");
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || "";
      setForm(f => ({ ...f, headerMediaUrl: url }));
      toast.success("File uploaded!");
    } catch { toast.error("Upload failed"); }
    setUploading(false);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await templateApi.list({ status: filter === 'all' ? undefined : filter, search });
      setTemplates(res.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [filter, search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await templateApi.syncFromWhatsApp();
      toast.success('Templates synced from WhatsApp');
      fetchTemplates();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Sync failed - check WhatsApp connection');
    }
    setSyncing(false);
  };

  const handleCreate = async () => {
    if (submitting) return;
    if (!form.name || (form.category !== 'AUTHENTICATION' && !form.bodyText)) {
      toast.error('Template name and body are required');
      return;
    }
    setSubmitting(true);
    try {
      if (form.category === 'AUTHENTICATION') {
        await templateApi.create({
          name: form.name, category: form.category, language: form.language,
          components: [{ type: 'BODY', text: '{{1}} is your verification code.' }],
          authentication: {
            otpType: 'COPY_CODE',
            buttonText: form.authButtonText || 'Copy Code',
            codeExpirationMinutes: form.authCodeExpiry || 0,
            addSecurityRecommendation: form.authSecurityRec,
          },
        });
        toast.success('Template submitted for approval');
        setView('list'); resetForm(); fetchTemplates(); setSubmitting(false);
        return;
      }
      const components: Array<Record<string, unknown>> = [];
      if (form.isCarousel) {
        // Carousel: no top-level header — cards have their own
      } else if (form.headerType === 'text' && form.headerText) {
        components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText });
      } else if (form.headerType === 'image') {
        components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [form.headerMediaUrl] } });
      } else if (form.headerType === 'video') {
        components.push({ type: 'HEADER', format: 'VIDEO', example: { header_handle: [form.headerMediaUrl] } });
      } else if (form.headerType === 'document') {
        components.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [form.headerMediaUrl] } });
      }
      components.push({ type: 'BODY', text: form.bodyText });
      if (!form.isCarousel && form.footerText) {
        components.push({ type: 'FOOTER', text: form.footerText });
      }
      if (!form.isCarousel && form.buttons.length > 0) {
        const buttonComponents = form.buttons.map(btn => {
          if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
          if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url, ...(btn.urlType === 'dynamic' && btn.urlExample ? { example: [btn.urlExample] } : {}) };
          if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phoneNumber };
          if (btn.type === 'CATALOG') return { type: 'CATALOG', text: btn.text || 'View catalog' };
          return { type: btn.type, text: btn.text };
        });
        components.push({ type: 'BUTTONS', buttons: buttonComponents });
      }
      if (form.isCarousel) {
        if (form.cards.length < 2) { toast.error('Carousel needs at least 2 cards'); setSubmitting(false); return; }
        if (form.cards.some(c => !c.mediaUrl)) { toast.error('Every card needs an image/video URL'); setSubmitting(false); return; }
        if (form.cards.some(c => c.buttons.length === 0 || c.buttons.some(b => !b.text))) { toast.error('Every card needs at least 1 button with text'); setSubmitting(false); return; }
      }
      await templateApi.create({
        name: form.name, category: form.category, language: form.language, components,
        carousel: form.isCarousel ? { cards: form.cards.map(c => ({
          mediaUrl: c.mediaUrl, mediaType: c.mediaType, body: c.body,
          buttons: c.buttons.map(b => ({ type: b.type === 'QUICK_REPLY' ? 'quick_reply' : b.type === 'PHONE_NUMBER' ? 'phone' : 'url', text: b.text, value: b.url || b.phoneNumber || '' })),
        })) } : undefined,
      });
      toast.success('Template submitted for approval');
      setView('list');
      resetForm();
      fetchTemplates();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to create template');
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setForm({ name: '', category: 'MARKETING', language: 'en', headerType: 'none', headerText: '', headerMediaUrl: '', bodyText: '', footerText: '', buttons: [], isCarousel: false, cards: [], authButtonText: 'Copy Code', authCodeExpiry: 10, authSecurityRec: true });
  };

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG') => {
    if (form.buttons.length >= 3) { toast.error('Maximum 3 buttons allowed'); return; }
    if (type === 'CATALOG' && form.buttons.some(b => b.type === 'CATALOG')) { toast.error('Only 1 Catalog button is allowed'); return; }
    setForm({ ...form, buttons: [...form.buttons, { type, text: '', url: '', phoneNumber: '' }] });
    setShowBtnMenu(false);
  };

  const updateButton = (index: number, field: string, value: string) => {
    const updated = [...form.buttons];
    (updated[index] as unknown as Record<string, string>)[field] = value;
    setForm({ ...form, buttons: updated });
  };

  const removeButton = (index: number) => {
    setForm({ ...form, buttons: form.buttons.filter((_, i) => i !== index) });
  };

  const addOptOut = () => {
    setForm(f => {
      const footer = (f.footerText && f.footerText.trim()) ? f.footerText : 'Reply STOP to unsubscribe';
      const hasStop = f.buttons.some(b => b.type === 'QUICK_REPLY' && /stop|unsub/i.test(b.text || ''));
      const buttons = (!hasStop && f.buttons.length < 3)
        ? [...f.buttons, { type: 'QUICK_REPLY' as const, text: 'Stop promotions', url: '', phoneNumber: '' }]
        : f.buttons;
      return { ...f, footerText: footer.slice(0, 60), buttons };
    });
    toast.success('Opt-out added (footer + Stop button)');
  };

  const updateCard = (i: number, cardPatch: Partial<CarouselCard>) => {
    setForm(f => ({ ...f, cards: f.cards.map((c, j) => j === i ? { ...c, ...cardPatch } : c) }));
  };

  const updateCardButton = (ci: number, bi: number, btnPatch: Partial<TemplateButton>) => {
    setForm(f => ({ ...f, cards: f.cards.map((c, j) => j === ci ? { ...c, buttons: c.buttons.map((b, k) => k === bi ? { ...b, ...btnPatch } : b) } : c) }));
  };

  const handleCardMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, ci: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'templates');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      updateCard(ci, { mediaUrl: url });
      toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try { await templateApi.delete(id); toast.success('Deleted'); fetchTemplates(); } catch { toast.error('Failed'); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default: return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />In Review</Badge>;
    }
  };

  const columns = [
    { key: 'sr', title: 'Sr', render: (t: Template) => <span className="text-gray-500">{templates.indexOf(t) + 1}</span> },
    { key: 'channel', title: 'Channel', render: () => (
      <span className="inline-flex items-center gap-1.5 text-gray-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />WhatsApp</span>
    )},
    { key: 'createdAt', title: 'Created Date', render: (t: Template) => (
      <span className="text-gray-500 text-sm">{(t as unknown as { createdAt?: string }).createdAt ? new Date((t as unknown as { createdAt: string }).createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
    )},
    { key: 'category', title: 'Category', render: (t: Template) => <Badge variant="info">{t.category || ((t as unknown as Record<string, string>).waCategory) || ''}</Badge> },
    { key: 'name', title: 'Template Name', render: (t: Template) => <span className="font-medium text-gray-900">{t.name}</span> },
    { key: 'preview', title: 'Preview', render: (t: Template) => (
      <button onClick={() => setShowPreview(t)} className="p-1.5 hover:bg-emerald-50 rounded-lg" title="Preview"><Eye className="w-4 h-4 text-emerald-600" /></button>
    )},
    { key: 'language', title: 'Language' },
    { key: 'status', title: 'Status', render: (t: Template) => (
      <div>
        {getStatusBadge(t.status)}
        {t.status === 'rejected' && (t as unknown as { rejectionReason?: string }).rejectionReason && (
          <p className="text-xs text-red-500 mt-1 max-w-[220px]" title={(t as unknown as { rejectionReason?: string }).rejectionReason}>{(t as unknown as { rejectionReason?: string }).rejectionReason}</p>
        )}
      </div>
    ) },
    { key: 'actions', title: 'Action', render: (t: Template) => (
      <button onClick={() => handleDelete(t._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
    )},
  ];

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="page-hero flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Template</h1>
            <p className="text-gray-500 text-sm mt-1">Design your WhatsApp template with live preview</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setView('list'); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting}>Submit</Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 space-y-5 w-full">
            <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Template Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="template_name" required />
              <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                options={[{ value: 'MARKETING', label: 'Marketing' }, { value: 'UTILITY', label: 'Utility' }, { value: 'AUTHENTICATION', label: 'Authentication' }]} />
              <Select label="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
                options={[{ value: 'en', label: 'English' }, { value: 'en_US', label: 'English (US)' }, { value: 'hi', label: 'Hindi' }, { value: 'mr', label: 'Marathi' }, { value: 'ta', label: 'Tamil' }, { value: 'te', label: 'Telugu' }, { value: 'gu', label: 'Gujarati' }, { value: 'bn', label: 'Bengali' }]} />
            </div>

            {form.category === 'AUTHENTICATION' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-800">Authentication (OTP) template</label>
                <p className="text-xs text-gray-400 mt-1">Meta auto-generates the code message body. You only configure the copy-code button and expiry below.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Copy-code button text</label>
                <input value={form.authButtonText} onChange={(e) => setForm({ ...form, authButtonText: e.target.value })} maxLength={25} placeholder="Copy Code"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code expiry (minutes, 0 = none)</label>
                <input type="number" min={0} max={90} value={form.authCodeExpiry} onChange={(e) => setForm({ ...form, authCodeExpiry: parseInt(e.target.value || '0', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.authSecurityRec} onChange={(e) => setForm({ ...form, authSecurityRec: e.target.checked })} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-gray-700">Add security recommendation (“For your security, do not share this code.”)</span>
              </label>
            </div>
            ) : (<>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-800">Header <span className="font-normal text-gray-400">(optional)</span></label>
              <p className="text-xs text-gray-400 mb-3">Add a title or choose which type of media you&apos;ll use for this header.</p>
              <div className="flex gap-2 mb-3 flex-wrap">
                {[
                  { value: 'none', label: 'None', icon: null },
                  { value: 'text', label: 'Text', icon: null },
                  { value: 'image', label: 'Image', icon: <ImageIcon className="w-4 h-4" /> },
                  { value: 'video', label: 'Video', icon: <Video className="w-4 h-4" /> },
                  { value: 'document', label: 'Document', icon: <File className="w-4 h-4" /> },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setForm({ ...form, headerType: opt.value as typeof form.headerType })}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border font-medium ${form.headerType === opt.value ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'}`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
              {form.headerType === 'text' && (
                <Input label="" value={form.headerText} onChange={(e) => setForm({ ...form, headerText: e.target.value })} placeholder="Header text (max 60 chars)" />
              )}
              {['image', 'video', 'document'].includes(form.headerType) && (
                <div className="mt-2">
                  {form.headerMediaUrl ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm text-emerald-700 flex-1 truncate">{form.headerMediaUrl.split('/').pop()}</span>
                      <button onClick={() => setForm({...form, headerMediaUrl: ''})} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                      <div className="flex flex-col items-center">
                        {uploading ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        ) : (
                          <>
                            <Plus className="w-6 h-6 text-gray-400 mb-1" />
                            <span className="text-sm text-gray-500">Click to upload {form.headerType}</span>
                            <span className="text-xs text-gray-400 mt-0.5">{form.headerType === 'image' ? 'JPG, PNG (max 5MB)' : form.headerType === 'video' ? 'MP4 (max 16MB)' : 'PDF (max 100MB)'}</span>
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept={form.headerType === 'image' ? 'image/*' : form.headerType === 'video' ? 'video/*' : '.pdf,.doc,.docx'} onChange={handleMediaUpload} disabled={uploading} />
                    </label>
                  )}
                  <input className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.headerMediaUrl} onChange={(e) => setForm({...form, headerMediaUrl: e.target.value})} placeholder="Or paste URL directly" />
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-800">Body <span className="text-red-500">*</span></label>
                <span className="text-xs text-gray-400">{form.bodyText.length} / 1024</span>
              </div>
              <WaTextarea value={form.bodyText} onChange={(v) => setForm({ ...form, bodyText: v })} maxLength={1024}
                placeholder="Message body. Use {{1}}, {{2}} for variables" rows={5}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">Variables: {'{{1}}'} = Customer Name, {'{{2}}'} = Order ID, etc.</p>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-800">Footer <span className="font-normal text-gray-400">(optional)</span></label>
                  <span className="text-xs text-gray-400">{form.footerText.length} / 60</span>
                </div>
                <input value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} maxLength={60}
                  placeholder="Add a short line of text to the bottom of your message template."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {form.category === 'MARKETING' && (
                  <button type="button" onClick={addOptOut}
                    className="mt-2 text-xs font-medium text-emerald-600 hover:underline">
                    + Add opt-out (footer &ldquo;Reply STOP to unsubscribe&rdquo; + a &ldquo;Stop promotions&rdquo; button)
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCarousel}
                  onChange={e => setForm({ ...form, isCarousel: e.target.checked, cards: e.target.checked && form.cards.length === 0 ? [emptyCard(), emptyCard()] : form.cards })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-gray-800">Carousel Template <span className="font-normal text-gray-400">(2-10 swipe cards, har card me image + buttons)</span></span>
              </label>
              {form.isCarousel && (
                <div className="mt-3 space-y-4">
                  <p className="text-xs text-amber-600">For carousels, the Header above and Buttons below are ignored — each card has its own image/video + 1-2 buttons. Meta rule: all cards must have the same number and type of buttons.</p>
                  {form.cards.map((card, ci) => (
                    <div key={ci} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">Card {ci + 1}</span>
                        {form.cards.length > 2 && <button onClick={() => setForm({ ...form, cards: form.cards.filter((_, j) => j !== ci) })}><X className="w-4 h-4 text-red-400" /></button>}
                      </div>
                      <div className="flex gap-2">
                        <select value={card.mediaType} onChange={e => updateCard(ci, { mediaType: e.target.value as 'image' | 'video' })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                        </select>
                        <input value={card.mediaUrl} onChange={e => updateCard(ci, { mediaUrl: e.target.value })} placeholder="Media URL (or click Upload)" className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                        <label className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg cursor-pointer flex items-center">
                          {uploading ? '...' : 'Upload'}
                          <input type="file" className="hidden" accept={card.mediaType === 'image' ? 'image/*' : 'video/*'} onChange={e => handleCardMediaUpload(e, ci)} disabled={uploading} />
                        </label>
                      </div>
                      <textarea value={card.body} onChange={e => updateCard(ci, { body: e.target.value })} placeholder="Card text (optional, max 160 chars)" maxLength={160} rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      {card.buttons.map((b, bi) => (
                        <div key={bi} className="flex gap-2 items-center">
                          <select value={b.type} onChange={e => updateCardButton(ci, bi, { type: e.target.value as TemplateButton['type'] })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                            <option value="QUICK_REPLY">Quick Reply</option>
                            <option value="URL">URL</option>
                          </select>
                          <input value={b.text} onChange={e => updateCardButton(ci, bi, { text: e.target.value })} placeholder="Button text" maxLength={25} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                          {b.type === 'URL' && <input value={b.url || ''} onChange={e => updateCardButton(ci, bi, { url: e.target.value })} placeholder="https://..." className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />}
                          {card.buttons.length > 1 && <button onClick={() => updateCard(ci, { buttons: card.buttons.filter((_, j) => j !== bi) })}><X className="w-3.5 h-3.5 text-red-400" /></button>}
                        </div>
                      ))}
                      {card.buttons.length < 2 && <button onClick={() => updateCard(ci, { buttons: [...card.buttons, { type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }] })} className="text-xs text-emerald-600 hover:underline">+ Button</button>}
                    </div>
                  ))}
                  {form.cards.length < 10 && (
                    <button onClick={() => setForm({ ...form, cards: [...form.cards, emptyCard()] })} className="text-sm text-emerald-600 font-medium hover:underline">+ Add Card</button>
                  )}
                </div>
              )}
            </div>

            {!form.isCarousel && <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">Buttons <span className="font-normal text-gray-400">(optional)</span></label>
                  <p className="text-xs text-gray-400">Create buttons that let customers respond to your message or take action.</p>
                </div>
                <div className="relative">
                  <button onClick={() => setShowBtnMenu(!showBtnMenu)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium">
                    Add Buttons <ChevronDown className="w-4 h-4" />
                  </button>
                  {showBtnMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                      <button onClick={() => addButton('QUICK_REPLY')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Quick Reply</button>
                      <button onClick={() => addButton('URL')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><ExternalLink className="w-3.5 h-3.5" /> Visit Website</button>
                      <button onClick={() => addButton('PHONE_NUMBER')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Call Phone</button>
                      <button onClick={() => addButton('CATALOG')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">🛒 View Catalog</button>
                    </div>
                  )}
                </div>
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-start mb-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 w-24">
                        {btn.type === 'QUICK_REPLY' ? 'Quick Reply' : btn.type === 'URL' ? 'URL Button' : btn.type === 'CATALOG' ? 'Catalog' : 'Call Button'}
                      </span>
                      <input value={btn.text} onChange={(e) => updateButton(i, 'text', e.target.value)} placeholder="Button text" maxLength={25}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    {btn.type === 'URL' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-16">URL type</span>
                          <select value={btn.urlType || 'static'} onChange={(e) => updateButton(i, 'urlType', e.target.value)}
                            className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                            <option value="static">Static</option>
                            <option value="dynamic">Dynamic</option>
                          </select>
                        </div>
                        <input value={btn.url || ''} onChange={(e) => updateButton(i, 'url', e.target.value)}
                          placeholder={btn.urlType === 'dynamic' ? 'https://example.com/{{1}}' : 'https://example.com'}
                          className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                        {btn.urlType === 'dynamic' && (
                          <>
                            <input value={btn.urlExample || ''} onChange={(e) => updateButton(i, 'urlExample', e.target.value)}
                              placeholder="Sample full URL (for review), e.g. https://example.com/1234"
                              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                            <p className="text-[11px] text-gray-400">Dynamic: URL must end with a variable like <code>{'{{1}}'}</code>. Give one sample URL so Meta can review it.</p>
                          </>
                        )}
                      </div>
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <input value={btn.phoneNumber || ''} onChange={(e) => updateButton(i, 'phoneNumber', e.target.value)} placeholder="+919876543210"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    )}
                    {btn.type === 'CATALOG' && (
                      <p className="text-[11px] text-gray-400">Opens your WhatsApp catalog — a catalog must be connected to your WABA in Meta Commerce Manager.</p>
                    )}
                  </div>
                  <button onClick={() => removeButton(i)} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                </div>
              ))}
            </div>}
            </>)}
          </div>

          <div className="lg:sticky lg:top-6 mx-auto flex flex-col items-center gap-4">
            <WhatsAppPhonePreview data={{ headerType: form.headerType, headerText: form.headerText, headerMediaUrl: form.headerMediaUrl, body: form.bodyText, footer: form.footerText, buttons: form.buttons }} />
            {form.isCarousel && form.cards.length > 0 && <CarouselStrip cards={form.cards} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500 text-sm mt-1">Manage WhatsApp message templates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} loading={syncing}>Synchronize with WhatsApp</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setView('create'); }}>Add Template Message</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search Template Name..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex gap-2">
          {['all', 'approved', 'pending', 'rejected'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'pending' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Table columns={columns} data={templates} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => templateApi.delete(id).catch(() => null))); fetchTemplates(); }} />

      {/* Preview Modal */}
      <Modal isOpen={!!showPreview} onClose={() => setShowPreview(null)} title={showPreview?.name || 'Template Preview'} size="md">
        {showPreview && (
          <div className="flex flex-col items-center gap-4">
            <WhatsAppPhonePreview data={templateToPreview(showPreview)} />
            {(() => { const cc = (showPreview as unknown as { carousel?: { cards?: Array<{ mediaUrl?: string; mediaType?: string; body?: string; buttons?: Array<{ text: string }> }> } }).carousel?.cards; return cc && cc.length > 0 ? <CarouselStrip cards={cc} /> : null; })()}
            <div className="text-sm text-gray-500 flex gap-4">
              <span><strong>Status:</strong> {showPreview.status}</span>
              <span><strong>Category:</strong> {showPreview.category}</span>
              <span><strong>Language:</strong> {showPreview.language}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
