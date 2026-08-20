'use client';
import React, { useState, useEffect, useCallback } from 'react';
import WaTextarea from '@/components/ui/WaTextarea';
import { Plus, Search, Eye, Trash2, Edit, Image as ImageIcon, Video, File, CheckCircle, X, PiggyBank } from 'lucide-react';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import { presetMessageApi, mediaApi, catalogApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface PresetButton { text: string; type?: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; url?: string; phone?: string; value?: string; }
interface PresetListItem { title: string; description?: string; value?: string; }
interface Preset {
  _id: string; name: string; body: string; mediaUrl?: string;
  headerType?: string; headerText?: string; footer?: string;
  buttons?: PresetButton[]; listButtonText?: string; listItems?: PresetListItem[]; createdAt?: string;
  carouselTemplate?: string;
  productIds?: string[];
  cards?: Array<{ mediaUrl?: string; body?: string; buttons?: Array<{ text: string }> }>;
}

const emptyForm = {
  name: '', headerType: 'none' as 'none' | 'text' | 'image' | 'video' | 'document',
  headerText: '', mediaUrl: '', body: '', footer: '', buttons: [] as PresetButton[],
  listButtonText: '', listItems: [] as PresetListItem[], carouselTemplate: '', productIds: [] as string[],
  cards: [] as Array<{ mediaUrl: string; body: string; buttons: Array<{ text: string }> }>,
};

const presetToPreview = (p: { headerType?: string; headerText?: string; mediaUrl?: string; body?: string; footer?: string; buttons?: PresetButton[] }) => ({
  headerType: p.headerType,
  headerText: p.headerText,
  headerMediaUrl: p.mediaUrl,
  body: p.body,
  footer: p.footer,
  buttons: p.buttons || [],
});

export default function PresetTemplatesPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [showPreview, setShowPreview] = useState<Preset | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showBtnMenu, setShowBtnMenu] = useState(false);
  const [cardUploading, setCardUploading] = useState(-1);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; price?: number; currency?: string }>>([]);
  useEffect(() => { catalogApi.getProducts().then(r => setProducts((r.data.data || []) as Array<{ _id: string; name: string; price?: number; currency?: string }>)).catch(() => {}); }, []);

  const uploadCardMedia = async (i: number, file?: File) => {
    if (!file) return;
    setCardUploading(i);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'presets');
      const res = await mediaApi.upload(fd);
      const url = res.data?.data?.url || res.data?.url || '';
      const full = url.startsWith('http') ? url : `${(process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '')}${url}`;
      setForm(f => ({ ...f, cards: f.cards.map((x, idx) => idx === i ? { ...x, mediaUrl: full } : x) }));
      toast.success('Image uploaded');
    } catch { toast.error('Upload failed'); }
    setCardUploading(-1);
  };

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await presetMessageApi.list();
      setPresets(res.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);
  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'presets');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      setForm(f => ({ ...f, mediaUrl: url.startsWith('http') ? url : `${(process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '')}${url}` }));
      toast.success('File uploaded!');
    } catch { toast.error('Upload failed'); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name || (!form.body && form.cards.length === 0 && form.productIds.length === 0)) { toast.error('Name and body are required'); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name, body: form.body, mediaUrl: form.mediaUrl,
        headerType: form.headerType, headerText: form.headerText,
        footer: form.footer, buttons: form.buttons.filter(b => b.text.trim()),
        listButtonText: form.listButtonText, listItems: form.listItems.filter(it => it.title.trim()),
        carouselTemplate: form.carouselTemplate, productIds: form.productIds,
        cards: form.cards.filter(c => c.mediaUrl.trim() || c.body.trim()).map(c => ({ ...c, buttons: c.buttons.filter(b => b.text.trim()) })),
      };
      if (editId) await presetMessageApi.update(editId, payload);
      else await presetMessageApi.create(payload);
      toast.success(editId ? 'Preset template updated' : 'Preset template created — ready to use (no Meta approval needed)');
      setView('list'); setEditId(null); setForm(emptyForm);
      fetchPresets();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSubmitting(false);
  };

  const handleEdit = (p: Preset) => {
    setEditId(p._id);
    setForm({
      name: p.name, body: p.body, mediaUrl: p.mediaUrl || '',
      headerType: (p.headerType as typeof emptyForm.headerType) || 'none',
      headerText: p.headerText || '', footer: p.footer || '',
      buttons: (p.buttons || []).map(b => ({ text: b.text, type: b.type || 'QUICK_REPLY', url: b.url || '', phone: b.phone || '', value: b.value || '' })),
      listButtonText: p.listButtonText || '', listItems: (p.listItems || []).map(it => ({ title: it.title, description: it.description || '', value: it.value || '' })),
      carouselTemplate: p.carouselTemplate || '', productIds: p.productIds || [],
      cards: (p.cards || []).map(c => ({ mediaUrl: c.mediaUrl || '', body: c.body || '', buttons: (c.buttons || []).map(b => ({ text: b.text })) })),
    });
    setView('create');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this preset template?')) return;
    try { await presetMessageApi.delete(id); toast.success('Deleted'); fetchPresets(); } catch { toast.error('Failed'); }
  };

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER') => {
    if (form.buttons.length >= 3) { toast.error('Maximum 3 buttons allowed'); return; }
    setForm({ ...form, buttons: [...form.buttons, { text: '', type, url: '', phone: '', value: '' }] });
    setShowBtnMenu(false);
  };

  const filtered = presets.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.body.toLowerCase().includes(search.toLowerCase()));

  const columns = [
    { key: 'sr', title: 'Sr', render: (p: Preset) => <span className="text-gray-500">{filtered.indexOf(p) + 1}</span> },
    { key: 'createdAt', title: 'Created Date', render: (p: Preset) => (
      <span className="text-gray-500 text-sm">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
    )},
    { key: 'name', title: 'Template Name', render: (p: Preset) => <span className="font-medium text-gray-900">{p.name}</span> },
    { key: 'preview', title: 'Preview', render: (p: Preset) => (
      <button onClick={() => setShowPreview(p)} className="p-1.5 hover:bg-emerald-50 rounded-lg" title="Preview"><Eye className="w-4 h-4 text-emerald-600" /></button>
    )},
    { key: 'header', title: 'Header', render: (p: Preset) => <Badge variant="info">{p.headerType && p.headerType !== 'none' ? p.headerType : '—'}</Badge> },
    { key: 'buttons', title: 'Buttons', render: (p: Preset) => (p.buttons || []).filter(b => b.text).length || '—' },
    { key: 'status', title: 'Status', render: () => <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge> },
    { key: 'actions', title: 'Action', render: (p: Preset) => (
      <div className="flex gap-1">
        <button onClick={() => handleEdit(p)} className="p-1.5 hover:bg-blue-50 rounded-lg"><Edit className="w-4 h-4 text-blue-400" /></button>
        <button onClick={() => handleDelete(p._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{editId ? 'Edit Preset Template' : 'Create Preset Template'}</h1>
            <p className="text-emerald-50 text-sm mt-1">No Meta approval needed — instantly ready to send</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setView('list'); setEditId(null); setForm(emptyForm); }} className="px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold backdrop-blur transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={submitting} className="px-6 py-2.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold shadow disabled:opacity-60 transition-colors">{submitting ? 'Saving…' : editId ? 'Update' : 'Submit'}</button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 space-y-5 w-full">
            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <Input label="Template Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali Offer" required />
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">Free Card Carousel <span className="font-normal text-emerald-600">(FREE — no template charges)</span></label>
                  <p className="text-xs text-gray-400">2-10 cards (image + text + buttons) are sent as separate messages one after another — completely free within the 24hr window. (The swipeable carousel is only available via a Meta-approved template — see the Templates page.)</p>
                </div>
                <button onClick={() => { if (form.cards.length >= 10) { toast.error('Maximum 10 cards'); return; } setForm({ ...form, cards: [...form.cards, { mediaUrl: '', body: '', buttons: [] }] }); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:text-emerald-700 text-gray-700 font-semibold whitespace-nowrap transition-colors">
                  <Plus className="w-4 h-4" /> Add Card
                </button>
              </div>
              {form.cards.map((c, i) => (
                <div key={i} className="mb-3 p-4 bg-gray-50/80 rounded-xl ring-1 ring-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Card {i + 1}</span>
                    <button onClick={() => setForm({ ...form, cards: form.cards.filter((_, idx) => idx !== i) })} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                  </div>
                  <div className="flex gap-2 items-center">
                    {c.mediaUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={c.mediaUrl} alt={'card ' + (i + 1)} className="w-10 h-10 rounded object-cover border border-gray-200" />
                    ) : null}
                    <input value={c.mediaUrl} onChange={(e) => setForm({ ...form, cards: form.cards.map((x, idx) => idx === i ? { ...x, mediaUrl: e.target.value } : x) })}
                      placeholder="Image URL (optional)" className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                    <label className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg cursor-pointer bg-white hover:bg-gray-100 font-medium text-gray-600 whitespace-nowrap">
                      {cardUploading === i ? 'Uploading…' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCardMedia(i, e.target.files?.[0])} disabled={cardUploading !== -1} />
                    </label>
                  </div>
                  <textarea value={c.body} onChange={(e) => setForm({ ...form, cards: form.cards.map((x, idx) => idx === i ? { ...x, body: e.target.value } : x) })}
                    rows={2} placeholder={'Card ' + (i + 1) + ' text ({{name}} supported)'} className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                  {(c.buttons || []).map((b, bi) => (
                    <div key={bi} className="flex gap-2 items-center">
                      <input value={b.text} onChange={(e) => setForm({ ...form, cards: form.cards.map((x, idx) => idx === i ? { ...x, buttons: x.buttons.map((y, yi) => yi === bi ? { text: e.target.value } : y) } : x) })}
                        placeholder={'Button ' + (bi + 1) + ' text (max 20 chars)'} maxLength={20}
                        className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                      <button onClick={() => setForm({ ...form, cards: form.cards.map((x, idx) => idx === i ? { ...x, buttons: x.buttons.filter((_, yi) => yi !== bi) } : x) })} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  {(c.buttons || []).length < 3 && (
                    <button onClick={() => setForm({ ...form, cards: form.cards.map((x, idx) => idx === i ? { ...x, buttons: [...x.buttons, { text: '' }] } : x) })}
                      className="text-xs text-emerald-600 font-medium hover:text-emerald-700">+ Add button</button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <label className="text-sm font-semibold text-gray-800">Catalog / Products <span className="font-normal text-gray-400">(optional, max 10)</span></label>
              <p className="text-xs text-gray-400 mb-3">Selected products are sent as a tappable list — the customer taps one to get its photo, price and details. Products come from your Catalog page.</p>
              {products.length === 0 ? (
                <p className="text-xs text-gray-400">No products yet — add products in Catalog first.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {products.map((p) => (
                    <label key={p._id} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={form.productIds.includes(p._id)}
                        onChange={(e) => {
                          const cur = form.productIds;
                          setForm({ ...form, productIds: e.target.checked ? [...cur, p._id].slice(0, 10) : cur.filter(x => x !== p._id) });
                        }} />
                      <span className="truncate">{p.name}{p.price ? ` — ${p.currency === 'INR' ? '₹' : ''}${p.price}` : ''}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.productIds.length > 0 && <p className="text-xs text-emerald-600 mt-2 font-medium">{form.productIds.length} product(s) selected — this preset will send a product list</p>}
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
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
                  {form.mediaUrl ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm text-emerald-700 flex-1 truncate">{form.mediaUrl.split('/').pop()}</span>
                      <button onClick={() => setForm({ ...form, mediaUrl: '' })} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
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
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept={form.headerType === 'image' ? 'image/*' : form.headerType === 'video' ? 'video/*' : '.pdf,.doc,.docx'} onChange={handleMediaUpload} disabled={uploading} />
                    </label>
                  )}
                  <input className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })} placeholder="Or paste URL directly" />
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-800">Body <span className="text-red-500">*</span></label>
                <span className="text-xs text-gray-400">{form.body.length} / 1024</span>
              </div>
              <WaTextarea value={form.body} onChange={(v) => setForm({ ...form, body: v })} maxLength={1024}
                placeholder="Message body... (use {{name}} to insert the customer's name)" rows={5}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/60" />
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-800">Footer <span className="font-normal text-gray-400">(optional)</span></label>
                  <span className="text-xs text-gray-400">{form.footer.length} / 60</span>
                </div>
                <input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} maxLength={60}
                  placeholder="Add a short line of text to the bottom of your message."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/60" />
              </div>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">Buttons <span className="font-normal text-gray-400">(optional, max 3)</span></label>
                  <p className="text-xs text-gray-400">Add Quick Reply buttons or a website link button.</p>
                </div>
                <div className="relative">
                  <button onClick={() => setShowBtnMenu(v => !v)} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:text-emerald-700 text-gray-700 font-semibold transition-colors">
                    <Plus className="w-4 h-4" /> Add Button
                  </button>
                  {showBtnMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                      <button onClick={() => addButton('QUICK_REPLY')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Quick Reply</button>
                      <button onClick={() => addButton('URL')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Visit Website (URL)</button>
                      <button onClick={() => addButton('PHONE_NUMBER')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Call (Phone Number)</button>
                    </div>
                  )}
                </div>
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="mb-2 p-3 bg-gray-50/80 rounded-xl ring-1 ring-gray-100">
                  <div className="flex gap-2 items-center">
                    <span className="text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 whitespace-nowrap">{btn.type === 'URL' ? 'URL Button' : btn.type === 'PHONE_NUMBER' ? 'Call Button' : 'Quick Reply'}</span>
                    <input value={btn.text} onChange={(e) => setForm({ ...form, buttons: form.buttons.map((b, idx) => idx === i ? { ...b, text: e.target.value } : b) })}
                      placeholder={`Button ${i + 1} text (max 20 chars)`} maxLength={20}
                      className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                    <button onClick={() => setForm({ ...form, buttons: form.buttons.filter((_, idx) => idx !== i) })} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                  </div>
                  {btn.type === 'URL' && (
                    <input value={btn.url || ''} onChange={(e) => setForm({ ...form, buttons: form.buttons.map((b, idx) => idx === i ? { ...b, url: e.target.value } : b) })}
                      placeholder="https://example.com"
                      className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                  )}
                  {(!btn.type || btn.type === 'QUICK_REPLY') && (
                    <input value={btn.value || ''} onChange={(e) => setForm({ ...form, buttons: form.buttons.map((b, idx) => idx === i ? { ...b, value: e.target.value } : b) })}
                      placeholder="Value (optional) — auto-reply sent when the customer taps this button"
                      className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input value={btn.phone || ''} onChange={(e) => setForm({ ...form, buttons: form.buttons.map((b, idx) => idx === i ? { ...b, phone: e.target.value } : b) })}
                      placeholder="+919876543210"
                      className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">List Menu <span className="font-normal text-gray-400">(optional, max 10 options)</span></label>
                  <p className="text-xs text-gray-400">A button that opens a list of options when tapped. Selecting an option auto-replies with its value. Note: if you use a List, Quick Reply/Call buttons cannot go in the same message (WhatsApp limit).</p>
                </div>
                <button onClick={() => { if (form.listItems.length >= 10) { toast.error('Maximum 10 options'); return; } setForm({ ...form, listItems: [...form.listItems, { title: '', description: '', value: '' }] }); }} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:text-emerald-700 text-gray-700 font-semibold transition-colors">
                  <Plus className="w-4 h-4" /> Add Option
                </button>
              </div>
              {form.listItems.length > 0 && (
                <input value={form.listButtonText} onChange={(e) => setForm({ ...form, listButtonText: e.target.value })} maxLength={20}
                  placeholder="List button text (e.g. Menu / Options)"
                  className="mb-3 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
              )}
              {form.listItems.map((it, i) => (
                <div key={i} className="mb-2 p-3 bg-gray-50/80 rounded-xl ring-1 ring-gray-100">
                  <div className="flex gap-2 items-center">
                    <input value={it.title} onChange={(e) => setForm({ ...form, listItems: form.listItems.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) })}
                      placeholder={'Option ' + (i + 1) + ' title (max 24 chars)'} maxLength={24}
                      className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                    <button onClick={() => setForm({ ...form, listItems: form.listItems.filter((_, idx) => idx !== i) })} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                  </div>
                  <input value={it.description || ''} onChange={(e) => setForm({ ...form, listItems: form.listItems.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) })}
                    placeholder="Description (optional, max 72 chars)" maxLength={72}
                    className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                  <input value={it.value || ''} onChange={(e) => setForm({ ...form, listItems: form.listItems.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x) })}
                    placeholder="Value (optional) — auto-reply sent when the customer selects this option"
                    className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
                </div>
              ))}
            </div>
          </div>

          <div className="lg:sticky lg:top-6 mx-auto">
            <WhatsAppPhonePreview data={presetToPreview(form)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PiggyBank className="w-7 h-7" /> Preset Templates</h1>
          <p className="text-emerald-50 text-sm mt-1">No Meta approval needed — send free messages to customers with an open 24-hr window (no template charge)</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs font-semibold bg-white/15 backdrop-blur px-3 py-1 rounded-full">{presets.length} templates</span>
            <span className="text-xs font-semibold bg-white/15 backdrop-blur px-3 py-1 rounded-full">⚡ Instant — no approval</span>
            <span className="text-xs font-semibold bg-white/15 backdrop-blur px-3 py-1 rounded-full">₹0 per message</span>
          </div>
        </div>
        <button onClick={() => { setEditId(null); setForm(emptyForm); setView('create'); }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold shadow whitespace-nowrap transition-colors"><Plus className="w-4 h-4" /> Add Preset Template</button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search preset templates..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60" />
      </div>

      <Table columns={columns} data={filtered} loading={loading} emptyText="No preset templates yet — create your first with Add Preset Template" onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => presetMessageApi.delete(id).catch(() => null))); fetchPresets(); }} />

      <Modal isOpen={!!showPreview} onClose={() => setShowPreview(null)} title={showPreview?.name || 'Preview'} size="md">
        {showPreview && (
          <div className="flex justify-center">
            <WhatsAppPhonePreview data={presetToPreview(showPreview)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
