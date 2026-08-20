'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit, Link as LinkIcon, RefreshCw, MessageSquare, ListChecks } from 'lucide-react';
import { FaInstagram } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import api, { uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Media { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; }
interface Btn { title: string; url: string; }
interface ConnectConfig { connected?: boolean; appId?: string; configId?: string; oneClick?: boolean; manual?: boolean; igAccountId?: string; }
interface LogRow { _id: string; username?: string; igUserId?: string; commentText?: string; stage: string; trigger?: string; error?: string; createdAt?: string; }
interface Check { key: string; label: string; ok: boolean; detail?: string }
interface Tag { _id: string; name: string }
interface Stage { _id: string; name: string }
interface Auto {
  _id?: string; name: string; active: boolean;
  scope: 'any' | 'specific'; mediaId?: string; mediaPermalink?: string; mediaCaption?: string;
  keywordMode: 'any' | 'contains' | 'exact'; keywords: string[];
  publicReplies: string[];
  trigger: 'comment' | 'mention' | 'story_reply' | 'dm_keyword';
  askFollow?: boolean; followText?: string; followButtonText?: string;
  delayMinSec?: number; delayMaxSec?: number; hourlyCap?: number;
  createContact?: boolean; tags?: string[]; stage?: string | null;
  openingText: string; buttonText: string;
  payload: { text: string; mediaType: '' | 'image' | 'video'; mediaUrl: string; buttons: Btn[] };
  stats?: { comments: number; dmsSent: number; clicks: number };
}

const blankAuto = (): Auto => ({
  name: '', active: true, scope: 'any', mediaId: '', trigger: 'comment',
  keywordMode: 'contains', keywords: [], publicReplies: [],
  askFollow: false, followText: '', followButtonText: "I'm following",
  delayMinSec: 5, delayMaxSec: 25, hourlyCap: 60,
  createContact: false, tags: [], stage: null,
  openingText: 'Thanks for your comment! 🙌 Check your DM 📩', buttonText: '',
  payload: { text: '', mediaType: '', mediaUrl: '', buttons: [] },
});


const TRIGGER_LABELS: Record<string, string> = {
  comment: 'Comment on post/reel',
  mention: 'Mention (story/post tag)',
  story_reply: 'Story reply',
  dm_keyword: 'DM keyword',
};

export default function InstagramAutoDmPage() {
  const [tab, setTab] = useState<'automations' | 'connect' | 'logs'>('automations');
  const [config, setConfig] = useState<ConnectConfig | null>(null);
  const [autos, setAutos] = useState<Auto[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Auto>(blankAuto());
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState({ pageId: '', pageAccessToken: '' });
  const [connecting, setConnecting] = useState(false);
  const [logFilter, setLogFilter] = useState({ q: '', stage: '', trigger: '', from: '', to: '' });
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchAutos = useCallback(() => {
    api.get('/instagram-auto-dm').then(r => setAutos(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const fetchConfig = useCallback(() => {
    api.get('/instagram-auto-dm/connect/config').then(r => setConfig(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchConfig(); fetchAutos(); }, [fetchConfig, fetchAutos]);

  const loadMedia = () => {
    api.get('/instagram-auto-dm/media')
      .then(r => setMedia(r.data.data || []))
      .catch(e => toast.error(e.response?.data?.message || 'Could not load posts'));
  };
  const loadLogs = useCallback(() => {
    api.get('/instagram-auto-dm/logs', { params: { ...logFilter, limit: 200 } })
      .then(r => setLogs(r.data.data || [])).catch(() => {});
  }, [logFilter]);

  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  useEffect(() => {
    api.get('/tags').then(r => setTags(r.data.data || [])).catch(() => {});
    api.get('/crm/stages').then(r => setStages(r.data.data || [])).catch(() => {});
  }, []);

  const exportLogs = () => {
    api.get('/instagram-auto-dm/logs/export', { params: logFilter, responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data]));
        const a = document.createElement('a');
        a.href = url; a.download = 'instagram-auto-dm-logs.csv'; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error('Export failed'));
  };

  // ---- Connect (Facebook Login redirect flow) ----
  const IG_SCOPE = 'instagram_basic,instagram_manage_comments,instagram_manage_messages,pages_show_list,pages_manage_metadata,pages_read_engagement';
  const redirectUri = () => `${window.location.origin}/client/instagram-auto-dm`;

  const connectOneClick = () => {
    if (!config?.appId) return toast.error('Instagram app not configured by admin.');
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      state: 'ig',
      ...(config.configId ? { config_id: config.configId } : { scope: IG_SCOPE }),
    });
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  };

  // Handle the code Facebook sends back to this page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    if (!code || q.get('state') !== 'ig') return;
    window.history.replaceState({}, '', window.location.pathname);
    setConnecting(true);
    api.post('/instagram-auto-dm/connect/one-click', { code, redirectUri: redirectUri() })
      .then(() => { toast.success('Instagram connected'); fetchConfig(); })
      .catch(e => toast.error(e.response?.data?.message || 'Connect failed'))
      .finally(() => setConnecting(false));
  }, [fetchConfig]);

  const connectManual = () => {
    if (!manual.pageId || !manual.pageAccessToken) return toast.error('Enter Page ID and Page access token');
    setConnecting(true);
    api.post('/instagram-auto-dm/connect/manual', manual)
      .then(() => { toast.success('Instagram connected'); fetchConfig(); })
      .catch(e => toast.error(e.response?.data?.message || 'Connect failed'))
      .finally(() => setConnecting(false));
  };
  const runDiagnose = useCallback(() => {
    setChecking(true);
    api.get('/instagram-auto-dm/connect/diagnose')
      .then(r => setChecks(r.data.data?.checks || []))
      .catch(e => toast.error(e.response?.data?.message || 'Check failed'))
      .finally(() => setChecking(false));
  }, []);

  const syncChats = () => {
    setSyncing(true);
    api.post('/instagram-auto-dm/connect/sync-chats')
      .then(r => toast.success(r.data.message || 'Chats synced'))
      .catch(e => toast.error(e.response?.data?.message || 'Sync failed'))
      .finally(() => setSyncing(false));
  };

  const resubscribe = () => {
    setChecking(true);
    api.post('/instagram-auto-dm/connect/resubscribe')
      .then(r => { toast.success(r.data.message || 'Webhook subscription refreshed'); runDiagnose(); })
      .catch(e => { toast.error(e.response?.data?.message || 'Could not refresh subscription'); setChecking(false); });
  };

  useEffect(() => { if (tab === 'connect') runDiagnose(); }, [tab, runDiagnose]);

  const disconnect = () => {
    api.post('/instagram-auto-dm/disconnect').then(() => { toast.success('Disconnected'); fetchConfig(); }).catch(() => {});
  };

  // ---- Automation CRUD ----
  const openNew = () => { setForm(blankAuto()); setShowModal(true); };
  const openEdit = (a: Auto) => { setForm({ ...blankAuto(), ...a, payload: { ...blankAuto().payload, ...(a.payload || {}) } }); setShowModal(true); if (a.scope === 'specific' && !media.length) loadMedia(); };
  type PayloadMedia = '' | 'image' | 'video';

  const save = async () => {
    if (!form.openingText.trim()) return toast.error('Opening DM message is required');
    setSaving(true);
    try {
      if (form._id) await api.put(`/instagram-auto-dm/${form._id}`, form);
      else await api.post('/instagram-auto-dm', form);
      toast.success('Saved'); setShowModal(false); fetchAutos();
    } catch (e) { const err = e as { response?: { data?: { message?: string } } }; toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const toggleActive = (a: Auto) => api.put(`/instagram-auto-dm/${a._id}`, { active: !a.active }).then(fetchAutos);
  const del = (a: Auto) => { if (!confirm('Delete this automation?')) return; api.delete(`/instagram-auto-dm/${a._id}`).then(fetchAutos); };

  const uploadMedia = async (file: File, kind: 'image' | 'video') => {
    const fd = new FormData(); fd.append('file', file);
    const res = await uploadApi.uploadFile(fd);
    const url = res.data?.url || res.data?.data?.url || res.data?.data?.fileUrl || '';
    setForm(f => ({ ...f, payload: { ...f.payload, mediaType: kind, mediaUrl: url } }));
  };

  const connected = config?.connected;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <FaInstagram className="w-7 h-7 text-pink-600" />
        <div>
          <h1 className="text-xl font-semibold">Instagram Auto DM</h1>
          <p className="text-sm text-gray-500">Reply to comments on your posts/reels with an automatic DM (link, PDF, media).</p>
        </div>
      </div>

      <div className="flex gap-2 border-b mb-4">
        {[['automations', 'Comment → DM'], ['connect', 'Connect / Settings'], ['logs', 'Logs']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as 'automations' | 'connect' | 'logs')}
            className={`px-3 py-2 text-sm border-b-2 ${tab === k ? 'border-pink-600 text-pink-600 font-medium' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {!connected && tab === 'automations' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 mb-4 text-sm">
          Instagram not connected yet. Go to <button className="underline font-medium" onClick={() => setTab('connect')}>Connect / Settings</button> first.
        </div>
      )}

      {tab === 'automations' && (
        <div>
          <div className="flex justify-end mb-3"><Button onClick={openNew}><Plus className="w-4 h-4 mr-1" />New Automation</Button></div>
          {loading ? <p className="text-gray-400 text-sm">Loading…</p> : autos.length === 0 ? (
            <p className="text-gray-400 text-sm">No automations yet.</p>
          ) : (
            <div className="space-y-2">
              {autos.map(a => (
                <div key={a._id} className="border rounded p-3 flex items-center justify-between bg-white">
                  <div>
                    <div className="font-medium flex items-center gap-2">{a.name || '(untitled)'}
                      <Badge variant={a.active ? 'success' : 'default'}>{a.active ? 'Active' : 'Paused'}</Badge></div>
                    <div className="text-xs text-gray-500 mt-1">
                      {TRIGGER_LABELS[a.trigger || 'comment']} · {a.trigger === 'comment' || a.trigger === 'mention' ? (a.scope === 'specific' ? 'Specific post' : 'Any post') : 'DM'} · {a.keywordMode === 'any' ? 'any text' : `${a.keywordMode}: ${a.keywords.join(', ')}`}
                      {a.stats ? ` · ${a.stats.dmsSent} DMs sent` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(a)}>{a.active ? 'Pause' : 'Resume'}</Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => del(a)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'connect' && (
        <div className="max-w-xl space-y-4">
          <div className="border rounded p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">Status</div>
              <Badge variant={connected ? 'success' : 'default'}>{connected ? 'Connected' : 'Not connected'}</Badge>
            </div>
            {connected && <p className="text-xs text-gray-500 mt-1">IG account: {config?.igAccountId}</p>}
            {connected && <Button variant="outline" size="sm" className="mt-3" onClick={disconnect}>Disconnect</Button>}
          </div>

          {!connected && config?.oneClick && (
            <div className="border rounded p-4 bg-white">
              <div className="font-medium mb-1">1-Click Connect</div>
              <p className="text-xs text-gray-500 mb-3">Login with Facebook and authorize your Instagram Professional account. No API keys needed.</p>
              <Button onClick={connectOneClick} disabled={connecting}><FaInstagram className="w-4 h-4 mr-1" />{connecting ? 'Connecting…' : 'Connect Instagram'}</Button>
            </div>
          )}

          {!connected && config?.manual && (
            <div className="border rounded p-4 bg-white">
              <div className="font-medium mb-1">Manual Connect</div>
              <p className="text-xs text-gray-500 mb-3">Paste your Facebook Page ID and a Page access token (the Page linked to your Instagram).</p>
              <Input placeholder="Page ID" value={manual.pageId} onChange={e => setManual(m => ({ ...m, pageId: e.target.value }))} className="mb-2" />
              <Input placeholder="Page access token" value={manual.pageAccessToken} onChange={e => setManual(m => ({ ...m, pageAccessToken: e.target.value }))} className="mb-3" />
              <Button onClick={connectManual} disabled={connecting}><LinkIcon className="w-4 h-4 mr-1" />Connect</Button>
            </div>
          )}
          <div className="border rounded p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Connection check</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={runDiagnose} disabled={checking}><RefreshCw className="w-4 h-4 mr-1" />Re-check</Button>
                <Button variant="outline" size="sm" onClick={resubscribe} disabled={checking || !connected}>Fix webhook</Button>
                <Button variant="outline" size="sm" onClick={syncChats} disabled={syncing || !connected}>{syncing ? 'Syncing…' : 'Sync chats'}</Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">Comments and DMs only reach this panel when every item below is green.</p>
            {checks === null ? <p className="text-sm text-gray-400">Checking…</p> : (
              <div className="space-y-1">
                {checks.map(c => (
                  <div key={c.key} className="text-sm flex items-start gap-2">
                    <span className={c.ok ? 'text-green-600' : 'text-red-600'}>{c.ok ? '✓' : '✗'}</span>
                    <span className="flex-1">
                      {c.label}
                      {c.detail && <span className="block text-xs text-gray-500 break-all">{c.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!connected && !config?.oneClick && !config?.manual && (
            <p className="text-sm text-gray-500">Connect options are disabled by the administrator.</p>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2">
            <Input placeholder="Search user / comment / error" value={logFilter.q} onChange={e => setLogFilter(f => ({ ...f, q: e.target.value }))} className="md:col-span-2" />
            <Select value={logFilter.stage} onChange={e => setLogFilter(f => ({ ...f, stage: e.target.value }))}
              options={[{ value: '', label: 'All statuses' }, { value: 'queued', label: 'Queued' }, { value: 'retry', label: 'Retrying' },
                { value: 'dm_sent', label: 'DM sent' }, { value: 'payload_sent', label: 'Payload sent' }, { value: 'failed', label: 'Failed' }]} />
            <Select value={logFilter.trigger} onChange={e => setLogFilter(f => ({ ...f, trigger: e.target.value }))}
              options={[{ value: '', label: 'All triggers' }, ...Object.entries(TRIGGER_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
            <Input type="date" value={logFilter.from} onChange={e => setLogFilter(f => ({ ...f, from: e.target.value }))} />
            <Input type="date" value={logFilter.to} onChange={e => setLogFilter(f => ({ ...f, to: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={exportLogs}>Export CSV</Button>
            <Button variant="outline" size="sm" onClick={loadLogs}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
          </div>
          {logs.length === 0 ? <p className="text-gray-400 text-sm">No activity yet.</p> : (
            <div className="space-y-1">
              {logs.map(l => (
                <div key={l._id} className="border rounded p-2 text-sm bg-white flex justify-between gap-2">
                  <span className="truncate">
                    @{l.username || l.igUserId} &middot; &quot;{l.commentText}&quot;
                    {l.error && <span className="text-red-600"> &middot; {l.error}</span>}
                  </span>
                  <Badge variant={l.stage === 'failed' ? 'danger' : l.stage === 'payload_sent' ? 'success' : 'info'}>{l.stage}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={form._id ? 'Edit Automation' : 'New Automation'} size="lg">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Reel price DM" />

          <div>
            <label className="text-sm font-medium">What starts this automation?</label>
            <Select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as Auto['trigger'] }))}
              options={[
                { value: 'comment', label: 'Someone comments on a post/reel' },
                { value: 'mention', label: 'Someone mentions/tags you' },
                { value: 'story_reply', label: 'Someone replies to your story' },
                { value: 'dm_keyword', label: 'Someone sends a keyword in DM' },
              ]} />
          </div>

          {(form.trigger === 'comment' || form.trigger === 'mention') && (
          <div>
            <label className="text-sm font-medium">Which post/reel?</label>
            <Select value={form.scope} onChange={e => { const scope = e.target.value as 'any' | 'specific'; setForm(f => ({ ...f, scope })); if (scope === 'specific' && !media.length) loadMedia(); }}
              options={[{ value: 'any', label: 'Any post / reel' }, { value: 'specific', label: 'A specific post / reel' }]} />
          </div>
          )}
          {(form.trigger === 'comment' || form.trigger === 'mention') && form.scope === 'specific' && (
            <div className="border rounded p-2 max-h-56 overflow-auto grid grid-cols-3 gap-2">
              {media.length === 0 && <p className="col-span-3 text-xs text-gray-400">No posts loaded. <button className="underline" onClick={loadMedia}>Load posts</button></p>}
              {media.map(m => (
                <button key={m.id} type="button" onClick={() => setForm(f => ({ ...f, mediaId: m.id, mediaPermalink: m.permalink, mediaCaption: m.caption }))}
                  className={`border rounded overflow-hidden text-left ${form.mediaId === m.id ? 'ring-2 ring-pink-600' : ''}`}>
                  {(m.thumbnail_url || m.media_url) && <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-20 object-cover" />}
                  <div className="text-[10px] p-1 truncate">{m.caption || m.media_type}</div>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Keyword match</label>
              <Select value={form.keywordMode} onChange={e => setForm(f => ({ ...f, keywordMode: e.target.value as 'any' | 'contains' | 'exact' }))}
                options={[{ value: 'any', label: 'Any message' }, { value: 'contains', label: 'Contains keyword' }, { value: 'exact', label: 'Is exactly' }]} />
            </div>
            {form.keywordMode !== 'any' && (
              <Input label="Keywords (comma separated)" value={form.keywords.join(', ')}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="price, link" />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input label="Delay before DM — min (sec)" type="number" value={String(form.delayMinSec ?? 5)}
              onChange={e => setForm(f => ({ ...f, delayMinSec: Number(e.target.value) }))} />
            <Input label="max (sec)" type="number" value={String(form.delayMaxSec ?? 25)}
              onChange={e => setForm(f => ({ ...f, delayMaxSec: Number(e.target.value) }))} />
            <Input label="Max DMs per hour" type="number" value={String(form.hourlyCap ?? 60)}
              onChange={e => setForm(f => ({ ...f, hourlyCap: Number(e.target.value) }))} />
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">A random delay and an hourly cap keep Instagram from flagging the account when a post goes viral. Failed DMs are retried up to 3 times.</p>

          <div className="border rounded p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.askFollow} onChange={e => setForm(f => ({ ...f, askFollow: e.target.checked }))} />
              Ask the user to follow first
            </label>
            <p className="text-[11px] text-gray-400">Instagram does not tell us who follows you, so the user is asked to follow and confirm with a button. The payload is sent only after that tap.</p>
            {form.askFollow && (<>
              <Textarea label="Follow request message" rows={2} value={form.followText || ''}
                onChange={e => setForm(f => ({ ...f, followText: e.target.value }))}
                placeholder={'Follow us first, then tap the button below 👇'} />
              <Input label="Confirm button text" value={form.followButtonText || ''}
                onChange={e => setForm(f => ({ ...f, followButtonText: e.target.value }))} placeholder="I'm following" />
            </>)}
          </div>

          <div className="border rounded p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.createContact} onChange={e => setForm(f => ({ ...f, createContact: e.target.checked }))} />
              Save these people as contacts
            </label>
            {form.createContact && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
                    {tags.map(t => (
                      <button key={t._id} type="button"
                        onClick={() => setForm(f => ({ ...f, tags: (f.tags || []).includes(t._id) ? (f.tags || []).filter(x => x !== t._id) : [...(f.tags || []), t._id] }))}
                        className={`text-xs border rounded px-2 py-1 ${(form.tags || []).includes(t._id) ? 'bg-pink-600 text-white border-pink-600' : ''}`}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Stage</label>
                  <Select value={form.stage || ''} onChange={e => setForm(f => ({ ...f, stage: e.target.value || null }))}
                    options={[{ value: '', label: 'No stage' }, ...stages.map(s => ({ value: s._id, label: s.name }))]} />
                </div>
              </div>
            )}
          </div>

          {(form.trigger === 'comment' || form.trigger === 'mention') && (
          <Textarea label="Public reply(ies) under the comment — optional, one per line (rotated)"
            value={form.publicReplies.join('\n')}
            onChange={e => setForm(f => ({ ...f, publicReplies: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
            placeholder={'Check your DM 📩\nSent you a message 🙌'} rows={2} />
          )}

          <Textarea label={form.askFollow ? 'Opening DM message (shown above the follow request)' : 'Opening DM message'} value={form.openingText}
            onChange={e => setForm(f => ({ ...f, openingText: e.target.value }))} rows={2} />

          <Input label="Button text (optional) — if set, the payload is sent after the user taps it"
            value={form.buttonText} onChange={e => setForm(f => ({ ...f, buttonText: e.target.value }))} placeholder="Send me the link" />

          <div className="border-t pt-3">
            <div className="font-medium text-sm mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" />Reply payload (what the customer receives)</div>
            <Textarea label="Text" value={form.payload.text} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, text: e.target.value } }))} rows={2} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-sm font-medium">Media type</label>
                <Select value={form.payload.mediaType} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, mediaType: e.target.value as PayloadMedia } }))}
                  options={[{ value: '', label: 'None' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]} />
              </div>
              {form.payload.mediaType && (
                <div>
                  <label className="text-sm font-medium">Media URL / upload</label>
                  <Input value={form.payload.mediaUrl} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, mediaUrl: e.target.value } }))} placeholder="https://…" />
                  <input type="file" className="text-xs mt-1" accept={form.payload.mediaType === 'image' ? 'image/*' : 'video/*'}
                    onChange={e => { const file = e.target.files?.[0]; if (file && form.payload.mediaType) uploadMedia(file, form.payload.mediaType); }} />
                </div>
              )}
            </div>
            <div className="mt-2">
              <label className="text-sm font-medium flex items-center gap-1"><ListChecks className="w-4 h-4" />Link buttons (e.g. PDF / website) — up to 3</label>
              {form.payload.buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 mt-1">
                  <Input placeholder="Button title" value={b.title} onChange={e => setForm(f => { const buttons = [...f.payload.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...f, payload: { ...f.payload, buttons } }; })} />
                  <div className="flex gap-1">
                    <Input placeholder="https://link-to-file-or-page" value={b.url} onChange={e => setForm(f => { const buttons = [...f.payload.buttons]; buttons[i] = { ...buttons[i], url: e.target.value }; return { ...f, payload: { ...f.payload, buttons } }; })} />
                    <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, payload: { ...f.payload, buttons: f.payload.buttons.filter((_, j) => j !== i) } }))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
              {form.payload.buttons.length < 3 && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setForm(f => ({ ...f, payload: { ...f.payload, buttons: [...f.payload.buttons, { title: '', url: '' }] } }))}><Plus className="w-4 h-4 mr-1" />Add button</Button>
              )}
              <p className="text-[11px] text-gray-400 mt-1">PDF can&apos;t be attached in an Instagram DM &mdash; send it as a link button (upload the PDF to Media Library and paste its link here).</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
