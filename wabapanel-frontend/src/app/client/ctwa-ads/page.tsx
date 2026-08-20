'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit, Target, TrendingUp, MousePointer, DollarSign, Pause, Play, RefreshCw, AlertCircle, Upload, X, Image as ImageIcon, Video, Eye, ChevronDown } from 'lucide-react';
import api, { workspaceApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface CTWAAd {
  _id: string;
  name: string;
  adId: string;
  adAccountId?: string;
  platform: string;
  status: string;
  budgetType: string;
  budget: number;
  bidStrategy: string;
  bidAmount: number;
  spent: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  costPerClick: number;
  costPerConversion: number;
  startDate: string;
  endDate: string;
  targeting: {
    ageMin: number;
    ageMax: number;
    gender: string;
    locations: string[];
    languages: string[];
    interests: string[];
    customAudience: string;
    lookalike: boolean;
  };
  placements: string[];
  headline: string;
  description: string;
  mediaUrl: string;
  mediaType: string;
  callToAction: string;
  welcomeMessage: string;
  optimizationGoal: string;
  createdAt: string;
}

const defaultForm = {
  name: '', adId: '', platform: 'facebook', status: 'draft',
  budgetType: 'daily', budget: 0, bidStrategy: 'lowest_cost', bidAmount: 0,
  startDate: '', endDate: '',
  targeting: { ageMin: 18, ageMax: 65, gender: 'all', locations: [] as string[], languages: [] as string[], interests: [] as string[], customAudience: '', lookalike: false },
  placements: ['facebook_feed', 'instagram_feed'] as string[],
  headline: '', description: '', mediaUrl: '', mediaType: '',
  callToAction: 'send_whatsapp_message', welcomeMessage: '', optimizationGoal: 'conversations',
};

const ctwaApi = {
  list: () => api.get('/ctwa-ads'),
  create: (data: object) => api.post('/ctwa-ads', data),
  update: (id: string, data: object) => api.put(`/ctwa-ads/${id}`, data),
  delete: (id: string) => api.delete(`/ctwa-ads/${id}`),
  sync: (data?: object) => api.post('/ctwa-ads/sync', data || {}),
  adAccounts: () => api.get('/ctwa-ads/ad-accounts'),
  publish: (id: string, data: object) => api.post(`/ctwa-ads/${id}/publish`, data),
};

interface AdAccount { id: string; name: string; account_status?: number; currency?: string; }

const datePresets = [
  { value: 'maximum', label: 'Lifetime' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
];

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-gray-100 text-gray-700',
  draft: 'bg-blue-100 text-blue-700',
};

const placementOptions = [
  { value: 'facebook_feed', label: 'Facebook Feed' },
  { value: 'instagram_feed', label: 'Instagram Feed' },
  { value: 'instagram_stories', label: 'Instagram Stories' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'facebook_stories', label: 'Facebook Stories' },
  { value: 'facebook_reels', label: 'Facebook Reels' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'audience_network', label: 'Audience Network' },
];

const ctaOptions = [
  { value: 'send_whatsapp_message', label: 'Send WhatsApp Message' },
  { value: 'learn_more', label: 'Learn More' },
  { value: 'shop_now', label: 'Shop Now' },
  { value: 'sign_up', label: 'Sign Up' },
  { value: 'contact_us', label: 'Contact Us' },
  { value: 'get_quote', label: 'Get Quote' },
  { value: 'book_now', label: 'Book Now' },
];

const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionClass = "border border-gray-200 rounded-lg p-4 space-y-3";

export default function CTWAAdsPage() {
  const [ads, setAds] = useState<CTWAAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<CTWAAd | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [uploading, setUploading] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'targeting' | 'creative'>('details');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentWorkspace } = useAuthStore();
  const wa = currentWorkspace?.whatsapp as unknown as { connectionMethod?: string; adsAccessToken?: string } | undefined;
  const needsAdsToken = !!wa && wa.connectionMethod !== 'manual';
  const [adsToken, setAdsToken] = useState('');
  const [adsTokenSaving, setAdsTokenSaving] = useState(false);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [datePreset, setDatePreset] = useState('maximum');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewAd, setPreviewAd] = useState<CTWAAd | null>(null);
  const [publishAd, setPublishAd] = useState<CTWAAd | null>(null);
  const [publishPageId, setPublishPageId] = useState('');
  const [publishAccount, setPublishAccount] = useState('');
  const [publishing, setPublishing] = useState(false);

  const loadAdAccounts = async () => {
    try {
      const r = await ctwaApi.adAccounts();
      const accts: AdAccount[] = r.data.data || [];
      setAdAccounts(accts);
      setSelectedAccounts(prev => prev.length ? prev : accts.map(a => a.id));
    } catch { /* token may lack ads permission */ }
  };
  useEffect(() => { loadAdAccounts(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggleAccount = (id: string) => {
    const next = selectedAccounts.includes(id) ? selectedAccounts.filter(x => x !== id) : [...selectedAccounts, id];
    setSelectedAccounts(next);
  };
  const allSelected = adAccounts.length > 0 && selectedAccounts.length === adAccounts.length;
  const accountLabel = adAccounts.length === 0 ? 'No ad accounts'
    : allSelected ? `All accounts (${adAccounts.length})`
    : selectedAccounts.length === 0 ? 'Select accounts'
    : selectedAccounts.length === 1 ? (adAccounts.find(a => a.id === selectedAccounts[0])?.name || selectedAccounts[0])
    : `${selectedAccounts.length} accounts`;

  const doPublish = async () => {
    if (!publishAd) return;
    const acct = publishAccount || selectedAccounts[0];
    if (!acct) { toast.error('Select an ad account'); return; }
    if (!publishPageId.trim()) { toast.error('Facebook Page ID is required'); return; }
    setPublishing(true);
    try {
      const r = await ctwaApi.publish(publishAd._id, { adAccountId: acct, pageId: publishPageId.trim() });
      toast.success(r.data.message || 'Published to Meta (PAUSED)');
      setPublishAd(null); fetchAds();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; error?: string } } };
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Publish failed');
    }
    setPublishing(false);
  };
  const saveAdsToken = async () => {
    if (!currentWorkspace?._id || !adsToken.trim()) return;
    setAdsTokenSaving(true);
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { adsAccessToken: adsToken.trim() });
      const ws = { ...currentWorkspace, whatsapp: { ...(currentWorkspace.whatsapp as object), adsAccessToken: adsToken.trim() } };
      useAuthStore.setState({ currentWorkspace: ws as unknown as typeof currentWorkspace });
      setAdsToken('');
      toast.success('Ads access token saved — click Sync from Meta');
    } catch { toast.error('Failed to save token'); }
    setAdsTokenSaving(false);
  };

  const fetchAds = () => {
    setLoading(true);
    ctwaApi.list().then(r => setAds(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAds(); }, []);

  const resetForm = () => { setForm(JSON.parse(JSON.stringify(defaultForm))); setEditItem(null); setActiveTab('details'); };

  const handleSync = async (opts?: { datePreset?: string; adAccountIds?: string[] }) => {
    if (syncing) return;
    setSyncing(true); setSyncError('');
    try {
      const ids = opts?.adAccountIds ?? selectedAccounts;
      const res = await ctwaApi.sync({
        adAccountIds: ids.length ? ids : undefined,
        datePreset: opts?.datePreset ?? datePreset,
      });
      toast.success(res.data.message || 'Synced from Meta');
      if (res.data.accountErrors?.length) toast.error(`Some accounts failed: ${res.data.accountErrors[0]}`);
      fetchAds();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; error?: string } } };
      const msg = error.response?.data?.message || 'Sync failed';
      setSyncError(error.response?.data?.error ? `${msg}: ${error.response.data.error}` : msg);
      toast.error(msg);
    }
    setSyncing(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (submitting) return;
    setSubmitting(true);

    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const { url, mimetype } = res.data.data;
      const mediaType = mimetype.startsWith('video/') ? 'video' : 'image';
      setForm(prev => ({ ...prev, mediaUrl: url, mediaType }));
      toast.success('Media uploaded');
    } catch { toast.error('Upload failed'); } finally { setSubmitting(false); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
    setSubmitting(true);
    try {
      if (editItem) {
        await ctwaApi.update(editItem._id, form);
        toast.success('Campaign updated');
      } else {
        await ctwaApi.create(form);
        toast.success('Campaign created');
      }
      setShowModal(false); resetForm(); fetchAds();
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

    if (!confirm('Delete this campaign?')) return;
    try { await ctwaApi.delete(id); toast.success('Deleted'); fetchAds(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const toggleStatus = async (ad: CTWAAd) => {
    const newStatus = ad.status === 'active' ? 'paused' : 'active';
    try { await ctwaApi.update(ad._id, { status: newStatus }); toast.success(`Campaign ${newStatus}`); fetchAds(); } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const toggleRow = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const bulkSetStatus = async (newStatus: string) => {
    if (bulkBusy || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedIds.map(id => ctwaApi.update(id, { status: newStatus })));
      toast.success(`${selectedIds.length} campaign(s) ${newStatus}`);
      setSelectedIds([]); fetchAds();
    } catch { toast.error('Some updates failed'); } finally { setBulkBusy(false); }
  };
  const bulkDelete = async () => {
    if (bulkBusy || !selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected campaign(s)?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedIds.map(id => ctwaApi.delete(id)));
      toast.success(`${selectedIds.length} campaign(s) deleted`);
      setSelectedIds([]); fetchAds();
    } catch { toast.error('Some deletes failed'); } finally { setBulkBusy(false); }
  };

  const openEdit = (ad: CTWAAd) => {
    setEditItem(ad);
    setForm({
      name: ad.name, adId: ad.adId || '', platform: ad.platform, status: ad.status,
      budgetType: ad.budgetType || 'daily', budget: ad.budget, bidStrategy: ad.bidStrategy || 'lowest_cost', bidAmount: ad.bidAmount || 0,
      startDate: ad.startDate ? new Date(ad.startDate).toISOString().split('T')[0] : '',
      endDate: ad.endDate ? new Date(ad.endDate).toISOString().split('T')[0] : '',
      targeting: ad.targeting || defaultForm.targeting,
      placements: ad.placements?.length ? ad.placements : defaultForm.placements,
      headline: ad.headline || '', description: ad.description || '',
      mediaUrl: ad.mediaUrl || '', mediaType: ad.mediaType || '',
      callToAction: ad.callToAction || 'send_whatsapp_message',
      welcomeMessage: ad.welcomeMessage || '', optimizationGoal: ad.optimizationGoal || 'conversations',
    });
    setShowModal(true); setActiveTab('details');
  };

  const addTag = (field: 'locations' | 'interests' | 'languages', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setForm(prev => ({
      ...prev,
      targeting: { ...prev.targeting, [field]: [...prev.targeting[field], value.trim()] }
    }));
    setter('');
  };

  const removeTag = (field: 'locations' | 'interests' | 'languages', index: number) => {
    setForm(prev => ({
      ...prev,
      targeting: { ...prev.targeting, [field]: prev.targeting[field].filter((_, i) => i !== index) }
    }));
  };

  const togglePlacement = (value: string) => {
    setForm(prev => ({
      ...prev,
      placements: prev.placements.includes(value) ? prev.placements.filter(p => p !== value) : [...prev.placements, value]
    }));
  };

  const filteredAds = ads.filter(a =>
    (filterStatus === 'all' || a.status === filterStatus) &&
    (!search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()) || (a.adId || '').includes(search.trim()))
  );
  const allRowsSelected = filteredAds.length > 0 && filteredAds.every(a => selectedIds.includes(a._id));
  const toggleAllRows = () => setSelectedIds(allRowsSelected ? [] : filteredAds.map(a => a._id));
  const totalBudget = filteredAds.reduce((s, a) => s + (a.budget || 0), 0);
  const totalSpent = filteredAds.reduce((s, a) => s + (a.spent || 0), 0);
  const totalClicks = filteredAds.reduce((s, a) => s + (a.clicks || 0), 0);
  const totalConversions = filteredAds.reduce((s, a) => s + (a.conversions || 0), 0);

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Click to WhatsApp Ads</h1>
          <p className="text-sm text-gray-500 mt-1">Manage CTWA ad campaigns connected to Meta</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {adAccounts.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setShowAccountMenu(v => !v)} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm bg-white max-w-[240px] flex items-center gap-2 truncate" title="Ad Accounts">
                <span className="truncate">{accountLabel}</span>
                <ChevronDown className="w-4 h-4 shrink-0" />
              </button>
              {showAccountMenu && (
                <div className="absolute right-0 z-30 mt-1 w-72 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer font-medium border-b border-gray-100">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelectedAccounts(allSelected ? [] : adAccounts.map(a => a.id))} />
                    <span>Select all ({adAccounts.length})</span>
                  </label>
                  {adAccounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedAccounts.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                      <span className="truncate">{a.name ? `${a.name} (${a.id.replace('act_', '')})` : a.id}</span>
                    </label>
                  ))}
                  <button type="button" onClick={() => { setShowAccountMenu(false); handleSync(); }} disabled={syncing || !selectedAccounts.length} className="mt-2 w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    Sync selected ({selectedAccounts.length})
                  </button>
                </div>
              )}
            </div>
          )}
          <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); handleSync({ datePreset: e.target.value }); }} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm bg-white" title="Stats period (auto-syncs)">
            {datePresets.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <button onClick={() => handleSync()} disabled={syncing} className="flex items-center gap-2 px-4 py-2.5 border border-emerald-600 text-emerald-600 rounded-xl hover:bg-emerald-50 text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync from Meta'}
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>
      </div>

      {needsAdsToken && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900">Ads Access Token {wa?.adsAccessToken ? <span className="text-emerald-600 font-normal">(saved ✓)</span> : <span className="text-amber-600 font-normal">(required for Sync from Meta)</span>}</p>
          <p className="text-xs text-gray-500 mt-1">Your WhatsApp is connected via embedded/coexistence signup, so its token has no ads permission. Create a System User token in Meta Business Settings with <strong>ads_read</strong> permission (and your Ad Account assigned) and paste it here. Messaging keeps using your existing token — this one is only for ads sync.</p>
          <div className="flex gap-2 mt-3">
            <input type="password" placeholder={wa?.adsAccessToken ? 'Replace saved token (EAAG...)' : 'Paste ads access token (EAAG...)'} value={adsToken} onChange={(e) => setAdsToken(e.target.value)} className={inputClass + ' flex-1'} />
            <button onClick={saveAdsToken} disabled={adsTokenSaving || !adsToken.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 shrink-0">{adsTokenSaving ? 'Saving...' : 'Save Token'}</button>
          </div>
        </div>
      )}

      {syncError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700 font-medium">Sync Error</p>
            <p className="text-xs text-red-600 mt-1">{syncError}</p>
            <p className="text-xs text-gray-500 mt-2">Ensure your access token has <strong>ads_read</strong> permission in Meta Developer portal.</p>
          </div>
          <button onClick={() => setSyncError('')} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Budget', value: `₹${totalBudget.toLocaleString()}`, icon: <DollarSign className="w-5 h-5 text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Total Spent', value: `₹${totalSpent.toLocaleString()}`, icon: <TrendingUp className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Total Clicks', value: totalClicks.toLocaleString(), icon: <MousePointer className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50' },
          { label: 'Conversions', value: totalConversions.toLocaleString(), icon: <Target className="w-5 h-5 text-orange-600" />, bg: 'bg-orange-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-1">{stat.icon}<span className="text-xs text-gray-500">{stat.label}</span></div>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      {ads.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <input placeholder="Search campaigns..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56" />
          {['all', 'active', 'paused', 'completed', 'draft'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize border ${filterStatus === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {s === 'all' ? `All (${ads.length})` : `${s} (${ads.filter(a => a.status === s).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Ads Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : filteredAds.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{ads.length ? 'No campaigns match the filter' : 'No CTWA campaigns yet'}</p>
          <p className="text-sm text-gray-400 mt-1">{ads.length ? 'Change the filter or search above.' : 'Click "Sync from Meta" to import or create a new campaign.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 text-sm">
              <span className="font-medium text-emerald-700">{selectedIds.length} selected</span>
              <button onClick={() => bulkSetStatus('active')} disabled={bulkBusy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"><Play className="w-3.5 h-3.5" /> Activate</button>
              <button onClick={() => bulkSetStatus('paused')} disabled={bulkBusy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-yellow-500 text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"><Pause className="w-3.5 h-3.5" /> Pause</button>
              <button onClick={bulkDelete} disabled={bulkBusy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              <button onClick={() => setSelectedIds([])} className="ml-auto text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={allRowsSelected} onChange={toggleAllRows} title="Select all" /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Campaign</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Platform</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Budget</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Spent</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Impressions</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Clicks</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">CTR</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Conv.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAds.map((ad) => (
                  <tr key={ad._id} className={`hover:bg-gray-50 ${selectedIds.includes(ad._id) ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(ad._id)} onChange={() => toggleRow(ad._id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {ad.mediaUrl && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                            {ad.mediaType === 'video' ? (
                              <div className="w-full h-full flex items-center justify-center"><Video className="w-5 h-5 text-gray-400" /></div>
                            ) : (
                              <img src={ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{ad.name}</p>
                          {ad.adId && <p className="text-xs text-gray-400">ID: {ad.adId}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="capitalize text-gray-600">{ad.platform}</span></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[ad.status] || 'bg-gray-100 text-gray-600'}`}>{ad.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">₹{(ad.budget || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">₹{(ad.spent || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(ad.impressions || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(ad.clicks || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) + '%' : '0%'}</td>
                    <td className="px-4 py-3 text-right">{(ad.conversions || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setPreviewAd(ad)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Preview"><Eye className="w-4 h-4 text-blue-400" /></button>
                        {!ad.adId && (
                          <button onClick={() => { setPublishAd(ad); setPublishAccount(ad.adAccountId || selectedAccounts[0] || ''); setPublishPageId((wa as unknown as { adsPageId?: string })?.adsPageId || ''); }} className="p-1.5 rounded-lg hover:bg-emerald-50" title="Publish to Meta"><Upload className="w-4 h-4 text-emerald-500" /></button>
                        )}
                        <button onClick={() => toggleStatus(ad)} className="p-1.5 rounded-lg hover:bg-gray-100" title={ad.status === 'active' ? 'Pause' : 'Activate'}>
                          {ad.status === 'active' ? <Pause className="w-4 h-4 text-yellow-500" /> : <Play className="w-4 h-4 text-emerald-500" />}
                        </button>
                        <button onClick={() => openEdit(ad)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Edit"><Edit className="w-4 h-4 text-gray-400" /></button>
                        <button onClick={() => handleDelete(ad._id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 z-0" onClick={() => setPreviewAd(null)} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Ad Preview</h3>
              <button onClick={() => setPreviewAd(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">FB</div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Your Page</p>
                    <p className="text-[10px] text-gray-400">Sponsored</p>
                  </div>
                </div>
                {previewAd.description && <p className="px-3 pb-2 text-xs text-gray-700">{previewAd.description}</p>}
                {previewAd.mediaUrl ? (
                  previewAd.mediaType === 'video' ? (
                    <video src={previewAd.mediaUrl} controls className="w-full max-h-64 bg-black" />
                  ) : (
                    <img src={previewAd.mediaUrl} alt="" className="w-full max-h-64 object-cover" />
                  )
                ) : (
                  <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-xs"><ImageIcon className="w-6 h-6 mr-1" /> No media</div>
                )}
                <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-900 truncate">{previewAd.headline || previewAd.name}</p>
                  <span className="text-[11px] font-medium bg-emerald-600 text-white px-2.5 py-1 rounded shrink-0 ml-2">WhatsApp</span>
                </div>
              </div>
              {previewAd.welcomeMessage && (
                <div className="mt-3 bg-emerald-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 mb-0.5">Pre-filled WhatsApp message:</p>
                  <p className="text-xs text-gray-800">{previewAd.welcomeMessage}</p>
                </div>
              )}
              <div className="mt-3 text-[11px] text-gray-500 space-y-0.5">
                <p>Targeting: {previewAd.targeting?.ageMin || 18}-{previewAd.targeting?.ageMax || 65}, {previewAd.targeting?.gender || 'all'}{previewAd.targeting?.locations?.length ? ', ' + previewAd.targeting.locations.join(', ') : ''}</p>
                {previewAd.targeting?.interests?.length ? <p>Interests: {previewAd.targeting.interests.join(', ')}</p> : null}
                <p>Budget: ₹{(previewAd.budget || 0).toLocaleString()} {previewAd.budgetType === 'lifetime' ? 'lifetime' : '/day'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {publishAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 z-0" onClick={() => setPublishAd(null)} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Publish to Meta</h3>
              <button onClick={() => setPublishAd(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">Campaign <strong>{publishAd.name}</strong> will be created on Meta in <strong>PAUSED</strong> state so you can review it before spending. Your token needs <strong>ads_management</strong> permission.</p>
              <div>
                <label className={labelClass}>Ad Account</label>
                {adAccounts.length > 0 ? (
                  <select value={publishAccount} onChange={(e) => setPublishAccount(e.target.value)} className={inputClass}>
                    {adAccounts.map(a => <option key={a.id} value={a.id}>{a.name ? `${a.name} (${a.id.replace('act_', '')})` : a.id}</option>)}
                  </select>
                ) : (
                  <input placeholder="act_1234567890" value={publishAccount} onChange={(e) => setPublishAccount(e.target.value)} className={inputClass} />
                )}
              </div>
              <div>
                <label className={labelClass}>Facebook Page ID</label>
                <input placeholder="Your Facebook Page ID (linked to WhatsApp)" value={publishPageId} onChange={(e) => setPublishPageId(e.target.value)} className={inputClass} />
                <p className="text-[11px] text-gray-400 mt-1">Meta Business Suite → Page → About → Page ID. The page must be connected to your WhatsApp number.</p>
              </div>
              <button onClick={doPublish} disabled={publishing} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{publishing ? 'Publishing...' : 'Publish (PAUSED)'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 z-0" onClick={() => setShowModal(false)} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{editItem ? 'Edit Campaign' : 'New Campaign'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 border-b border-gray-200 flex gap-4 shrink-0">
              {(['details', 'targeting', 'creative'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`pb-3 text-sm font-medium border-b-2 capitalize ${activeTab === tab ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >{tab === 'details' ? 'Campaign Details' : tab === 'targeting' ? 'Audience & Targeting' : 'Ad Creative'}</button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* TAB 1: Campaign Details */}
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Campaign Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Summer Sale CTWA" />
                  </div>
                  <div>
                    <label className={labelClass}>Meta Ad ID (optional)</label>
                    <input value={form.adId} onChange={e => setForm({ ...form, adId: e.target.value })} className={inputClass} placeholder="Auto-filled when synced from Meta" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Platform</label>
                      <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} className={inputClass}>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Status</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputClass}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Budget & Bidding</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Budget Type</label>
                        <select value={form.budgetType} onChange={e => setForm({ ...form, budgetType: e.target.value })} className={inputClass}>
                          <option value="daily">Daily Budget</option>
                          <option value="lifetime">Lifetime Budget</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Budget Amount (₹)</label>
                        <input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} className={inputClass} min="0" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Bid Strategy</label>
                        <select value={form.bidStrategy} onChange={e => setForm({ ...form, bidStrategy: e.target.value })} className={inputClass}>
                          <option value="lowest_cost">Lowest Cost (Auto)</option>
                          <option value="cost_cap">Cost Cap</option>
                          <option value="bid_cap">Bid Cap</option>
                        </select>
                      </div>
                      {form.bidStrategy !== 'lowest_cost' && (
                        <div>
                          <label className={labelClass}>Bid Amount (₹)</label>
                          <input type="number" value={form.bidAmount} onChange={e => setForm({ ...form, bidAmount: Number(e.target.value) })} className={inputClass} min="0" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Schedule</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Start Date</label>
                        <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>End Date</label>
                        <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className={inputClass} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Optimization Goal</label>
                    <select value={form.optimizationGoal} onChange={e => setForm({ ...form, optimizationGoal: e.target.value })} className={inputClass}>
                      <option value="conversations">Conversations (WhatsApp)</option>
                      <option value="link_clicks">Link Clicks</option>
                      <option value="impressions">Impressions</option>
                      <option value="reach">Reach</option>
                    </select>
                  </div>
                </div>
              )}

              {/* TAB 2: Audience & Targeting */}
              {activeTab === 'targeting' && (
                <div className="space-y-4">
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Demographics</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={labelClass}>Min Age</label>
                        <input type="number" value={form.targeting.ageMin} onChange={e => setForm({ ...form, targeting: { ...form.targeting, ageMin: Number(e.target.value) } })} className={inputClass} min="13" max="65" />
                      </div>
                      <div>
                        <label className={labelClass}>Max Age</label>
                        <input type="number" value={form.targeting.ageMax} onChange={e => setForm({ ...form, targeting: { ...form.targeting, ageMax: Number(e.target.value) } })} className={inputClass} min="13" max="65" />
                      </div>
                      <div>
                        <label className={labelClass}>Gender</label>
                        <select value={form.targeting.gender} onChange={e => setForm({ ...form, targeting: { ...form.targeting, gender: e.target.value } })} className={inputClass}>
                          <option value="all">All</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Locations</h3>
                    <div className="flex gap-2">
                      <input value={locationInput} onChange={e => setLocationInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('locations', locationInput, setLocationInput))} className={inputClass} placeholder="Type city/state/country and press Enter" />
                      <button onClick={() => addTag('locations', locationInput, setLocationInput)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 shrink-0">Add</button>
                    </div>
                    {form.targeting.locations.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {form.targeting.locations.map((loc, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">
                            {loc} <button onClick={() => removeTag('locations', i)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Interests</h3>
                    <div className="flex gap-2">
                      <input value={interestInput} onChange={e => setInterestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('interests', interestInput, setInterestInput))} className={inputClass} placeholder="e.g. Fashion, Technology, Food" />
                      <button onClick={() => addTag('interests', interestInput, setInterestInput)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 shrink-0">Add</button>
                    </div>
                    {form.targeting.interests.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {form.targeting.interests.map((int, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                            {int} <button onClick={() => removeTag('interests', i)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Languages</h3>
                    <div className="flex gap-2">
                      <input value={languageInput} onChange={e => setLanguageInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('languages', languageInput, setLanguageInput))} className={inputClass} placeholder="e.g. Hindi, English, Tamil" />
                      <button onClick={() => addTag('languages', languageInput, setLanguageInput)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 shrink-0">Add</button>
                    </div>
                    {form.targeting.languages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {form.targeting.languages.map((lang, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                            {lang} <button onClick={() => removeTag('languages', i)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Custom Audience</h3>
                    <input value={form.targeting.customAudience} onChange={e => setForm({ ...form, targeting: { ...form.targeting, customAudience: e.target.value } })} className={inputClass} placeholder="Custom Audience ID from Meta" />
                    <label className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                      <input type="checkbox" checked={form.targeting.lookalike} onChange={e => setForm({ ...form, targeting: { ...form.targeting, lookalike: e.target.checked } })} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      Create Lookalike Audience
                    </label>
                  </div>

                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Placements</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {placementOptions.map(p => (
                        <label key={p.value} className="flex items-center gap-2 text-sm text-gray-600 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={form.placements.includes(p.value)} onChange={() => togglePlacement(p.value)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Ad Creative */}
              {activeTab === 'creative' && (
                <div className="space-y-4">
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800">Media</h3>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
                    {form.mediaUrl ? (
                      <div className="relative">
                        {form.mediaType === 'video' ? (
                          <video src={form.mediaUrl} controls className="w-full rounded-lg max-h-48 bg-gray-100" />
                        ) : (
                          <img src={form.mediaUrl} alt="" className="w-full rounded-lg max-h-48 object-cover bg-gray-100" />
                        )}
                        <button onClick={() => setForm({ ...form, mediaUrl: '', mediaType: '' })} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center gap-2 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                        {uploading ? (
                          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                        ) : (
                          <Upload className="w-8 h-8 text-gray-400" />
                        )}
                        <span className="text-sm text-gray-500">{uploading ? 'Uploading...' : 'Click to upload image or video'}</span>
                        <span className="text-xs text-gray-400">JPG, PNG, MP4, MOV (Max 30MB)</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Ad Headline</label>
                    <input value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} className={inputClass} placeholder="Catchy headline for your ad" maxLength={40} />
                    <p className="text-xs text-gray-400 mt-1">{form.headline.length}/40 characters</p>
                  </div>

                  <div>
                    <label className={labelClass}>Ad Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} placeholder="Describe your offer or product" maxLength={125} />
                    <p className="text-xs text-gray-400 mt-1">{form.description.length}/125 characters</p>
                  </div>

                  <div>
                    <label className={labelClass}>Call to Action</label>
                    <select value={form.callToAction} onChange={e => setForm({ ...form, callToAction: e.target.value })} className={inputClass}>
                      {ctaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>WhatsApp Welcome Message</label>
                    <textarea value={form.welcomeMessage} onChange={e => setForm({ ...form, welcomeMessage: e.target.value })} rows={3} className={`${inputClass} resize-none`} placeholder="Message shown when user clicks the ad and opens WhatsApp" />
                  </div>

                  {/* Ad Preview */}
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Eye className="w-4 h-4" /> Ad Preview</h3>
                    <div className="bg-gray-50 rounded-lg p-4 max-w-sm mx-auto">
                      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                        {form.mediaUrl ? (
                          form.mediaType === 'video' ? (
                            <div className="w-full h-40 bg-gray-200 flex items-center justify-center"><Video className="w-10 h-10 text-gray-400" /></div>
                          ) : (
                            <img src={form.mediaUrl} alt="" className="w-full h-40 object-cover" />
                          )
                        ) : (
                          <div className="w-full h-40 bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center"><ImageIcon className="w-10 h-10 text-emerald-300" /></div>
                        )}
                        <div className="p-3">
                          <p className="font-semibold text-sm text-gray-900">{form.headline || 'Your Ad Headline'}</p>
                          <p className="text-xs text-gray-500 mt-1">{form.description || 'Your ad description will appear here'}</p>
                          <button className="w-full mt-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium">
                            {ctaOptions.find(o => o.value === form.callToAction)?.label || 'Send WhatsApp Message'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex gap-2">
                {activeTab !== 'details' && (
                  <button onClick={() => setActiveTab(activeTab === 'creative' ? 'targeting' : 'details')} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">← Back</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                {activeTab !== 'creative' ? (
                  <button onClick={() => setActiveTab(activeTab === 'details' ? 'targeting' : 'creative')} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Next →</button>
                ) : (
                  <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">{editItem ? 'Update Campaign' : 'Create Campaign'}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
