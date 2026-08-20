'use client';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Camera, Users as FbIcon, CheckCircle, XCircle, ExternalLink, Send, Mail, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { workspaceApi, waqrApi, tgPersonalApi } from '@/lib/api';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function ChannelsPage() {
  const { currentWorkspace } = useAuthStore();
  const [waConnected, setWaConnected] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [metaChat, setMetaChat] = useState({ pageId: '', pageAccessToken: '', igAccountId: '', fbEnabled: false, igEnabled: false });
  const [telegram, setTelegram] = useState({ botToken: '', botUsername: '', enabled: false });
  const [emailCh, setEmailCh] = useState({ enabled: false, imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, user: '', pass: '', fromName: '' });
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<{ status: string; phone: string; qr: string | null; todayCap?: number; sentToday?: number; warmupDay?: number; warmupTotalDays?: number; customLimit?: number }>({ status: 'disconnected', phone: '', qr: null });
  const [tgp, setTgp] = useState<{ status: string; phone: string; username?: string; error?: string; qr?: string }>({ status: 'disconnected', phone: '' });
  const [tgpPhone, setTgpPhone] = useState('');
  const [tgpMode, setTgpMode] = useState<'qr' | 'phone'>('qr');
  const [tgpCode, setTgpCode] = useState('');
  const [tgpPassword, setTgpPassword] = useState('');
  const [tgpBusy, setTgpBusy] = useState(false);
  const [qrLimitInput, setQrLimitInput] = useState('');
  const [qrLimitSaving, setQrLimitSaving] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [fbCfg, setFbCfg] = useState<{ appId?: string; configId?: string; oneClick?: boolean; connected?: boolean; pageName?: string } | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbCode, setFbCode] = useState('');

  useEffect(() => {
    if (!currentWorkspace) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await waqrApi.status();
        if (!stop) setQr(res.data.data);
      } catch { /* */ }
    };
    poll();
    const t = setInterval(() => {
      if (['qr', 'connecting', 'reconnecting'].includes(qr.status)) poll();
    }, 3000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, qr.status]);

  useEffect(() => {
    if (!currentWorkspace) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await tgPersonalApi.status();
        if (!stop) setTgp(res.data.data);
      } catch { /* */ }
    };
    poll();
    const t = setInterval(() => {
      if (['qr', 'connecting', 'verifying', 'awaiting_code', 'awaiting_password'].includes(tgp.status)) poll();
    }, 2500);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, tgp.status]);

  useEffect(() => {
    if (!currentWorkspace) return;
    api.get('/facebook-connect/config')
      .then(r => setFbCfg(r.data.data))
      .catch(() => {});
  }, [currentWorkspace]);

  type FbWindow = Window & {
    FB?: { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void };
    fbAsyncInit?: () => void;
  };

  const loadFbSdk = (appId: string) => new Promise<void>((resolve) => {
    const w = window as FbWindow;
    if (w.FB) return resolve();
    w.fbAsyncInit = () => { w.FB!.init({ appId, cookie: true, xfbml: false, version: 'v21.0' }); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; document.body.appendChild(s);
  });

  const submitFbCode = (code: string, pageId?: string) => {
    setFbBusy(true);
    const redirectUri = window.location.origin + window.location.pathname;
    api.post('/facebook-connect/one-click', pageId ? { code, pageId, redirectUri } : { code, redirectUri })
      .then(r => {
        const d = r.data.data;
        if (d?.needsPageChoice) { setFbPages(d.pages || []); setFbCode(code); toast('Select the Page you want to connect'); return; }
        setFbPages([]); setFbCode('');
        toast.success('Facebook Page connected');
        api.get('/facebook-connect/config').then(res => setFbCfg(res.data.data)).catch(() => {});
        if (d?.pageId) setMetaChat(m => ({ ...m, pageId: String(d.pageId), fbEnabled: true }));
      })
      .catch(err => toast.error(err.response?.data?.message || 'Connect failed'))
      .finally(() => setFbBusy(false));
  };

  const chooseFbPage = (pageId: string) => submitFbCode(fbCode, pageId);

  const connectFbOneClick = async () => {
    if (!fbCfg?.appId) { toast.error('Facebook app is not configured by the admin.'); return; }
    setFbBusy(true);
    try {
      await loadFbSdk(fbCfg.appId);
      const opts: Record<string, unknown> = { response_type: 'code', override_default_response_type: true };
      if (fbCfg.configId) opts.config_id = fbCfg.configId;
      else opts.scope = 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement';
      (window as FbWindow).FB!.login((resp) => {
        const code = resp?.authResponse?.code;
        if (!code) { setFbBusy(false); toast.error('Facebook login cancelled'); return; }
        submitFbCode(code);
      }, opts);
    } catch { setFbBusy(false); toast.error('Facebook SDK failed to load'); }
  };

  const connectTgpQr = async () => {
    setTgpBusy(true);
    try {
      const res = await tgPersonalApi.connectQr();
      setTgp(res.data.data);
      if (res.data.data?.status === 'error') toast.error(res.data.data.error || 'Failed to generate QR');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to generate QR');
    }
    setTgpBusy(false);
  };

  const connectTgp = async () => {
    if (!tgpPhone.trim()) { toast.error('Enter your phone number with country code'); return; }
    setTgpBusy(true);
    try {
      const res = await tgPersonalApi.connect(tgpPhone.trim());
      setTgp(res.data.data);
      if (res.data.data?.status === 'awaiting_code') toast.success('Code sent — check your Telegram app');
      if (res.data.data?.status === 'error') toast.error(res.data.data.error || 'Login failed');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to start login');
    }
    setTgpBusy(false);
  };

  const connectQr = async () => {
    setQrBusy(true);
    try {
      const res = await waqrApi.connect();
      setQr(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to start QR session');
    }
    setQrBusy(false);
  };

  const disconnectQr = async () => {
    if (!confirm('Disconnect this WhatsApp number?')) return;
    setQrBusy(true);
    try { await waqrApi.disconnect(); setQr({ status: 'disconnected', phone: '', qr: null }); toast.success('Disconnected'); } catch { toast.error('Failed'); }
    setQrBusy(false);
  };

  useEffect(() => {
    if (!currentWorkspace) return;
    workspaceApi.get(currentWorkspace._id).then(res => {
      const w = res.data.data;
      setWaConnected(!!w?.whatsapp?.isConnected);
      setWaPhone(w?.whatsapp?.phoneNumber || w?.whatsapp?.displayPhoneNumber || '');
      const mc = w?.metaChat;
      if (mc) setMetaChat({ pageId: mc.pageId || '', pageAccessToken: mc.pageAccessToken || '', igAccountId: mc.igAccountId || '', fbEnabled: !!mc.fbEnabled, igEnabled: !!mc.igEnabled });
      const tg = w?.telegram;
      if (tg) setTelegram({ botToken: tg.botToken || '', botUsername: tg.botUsername || '', enabled: !!tg.enabled });
      const ec = w?.emailChannel;
      if (ec) setEmailCh({ enabled: !!ec.enabled, imapHost: ec.imapHost || '', imapPort: ec.imapPort || 993, smtpHost: ec.smtpHost || '', smtpPort: ec.smtpPort || 587, user: ec.user || '', pass: ec.pass || '', fromName: ec.fromName || '' });
    }).catch(() => {});
  }, [currentWorkspace]);

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      await workspaceApi.update(currentWorkspace._id, { metaChat, telegram, emailChannel: emailCh });
      toast.success('Channel configuration saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Channel Configuration</h1>
        <p className="text-gray-500 text-sm mt-1">WhatsApp, Facebook Messenger and Instagram DM — API configuration for all three channels in one place</p>
        </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp Business</h2>
              <p className="text-xs text-gray-500">{waConnected ? `Connected${waPhone ? ' — ' + waPhone : ''}` : 'Not connected'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {waConnected ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> Connected</span>
              : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> Not connected</span>}
            <Link href="/client/whatsapp" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">Configure <ExternalLink className="w-3 h-3" /></Link>
          </div>
        </div>
      </div>

      {/* WhatsApp by QR */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><QrCode className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp by QR</h2>
              <p className="text-xs text-gray-500">{qr.status === 'connected' ? `Connected — +${qr.phone}` : 'Connect a normal WhatsApp number by scanning a QR code (no API needed)'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qr.status === 'connected' ? (
              <>
                <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> Connected</span>
                <Button size="sm" variant="outline" loading={qrBusy} onClick={async () => { setQrBusy(true); try { await waqrApi.sync(); toast.success('Syncing messages...'); } catch { toast.error('Sync failed'); } setQrBusy(false); }}>Sync Messages</Button>
                <Button size="sm" variant="outline" onClick={disconnectQr} loading={qrBusy}>Disconnect</Button>
              </>
            ) : (
              <Button size="sm" onClick={connectQr} loading={qrBusy}>{qr.status === 'qr' ? 'Refresh' : 'Connect'}</Button>
            )}
          </div>
        </div>

        {qr.status === 'qr' && qr.qr && (
          <div className="flex flex-col items-center gap-2 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="WhatsApp QR code" className="w-56 h-56 rounded-lg border" />
            <p className="text-xs text-gray-500 text-center">Open WhatsApp on your phone → <b>Settings → Linked Devices → Link a Device</b> → scan this code</p>
          </div>
        )}
        {['connecting', 'reconnecting'].includes(qr.status) && (
          <p className="text-xs text-gray-400">Connecting... QR code will appear here in a few seconds.</p>
        )}
        {qr.status === 'connected' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Number Warmer &amp; Anti-Ban Protection — Active</p>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white">Warm-up Day {qr.warmupDay || 1} / {qr.warmupTotalDays || 14}</span>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-emerald-800 mb-1">
                <span>Today&apos;s safe sending limit</span>
                <span className="font-semibold">{qr.sentToday || 0} / {qr.todayCap || 25} messages</span>
              </div>
              <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, ((qr.sentToday || 0) / (qr.todayCap || 25)) * 100)}%` }} />
              </div>
            </div>
            <ul className="text-[11px] text-emerald-800 grid grid-cols-2 gap-x-4 gap-y-1">
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Gradual daily limit warm-up (14 days)</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Human-like random delays (5–15s)</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Typing indicator before every send</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Auto-pause on ban / logout detection</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Sends blocked once daily cap is hit</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Daily counter resets at midnight</li>
            </ul>
            <p className="text-[11px] text-emerald-700">Chats appear in the <b>WhatsApp QR Inbox</b>. The limit grows automatically every day as your number warms up.</p>
            <div className="border-t border-emerald-200 pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-emerald-800">Custom daily limit (at your own risk)</p>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={2000} placeholder={qr.customLimit ? String(qr.customLimit) : 'Auto (warm-up)'}
                  value={qrLimitInput} onChange={(e) => setQrLimitInput(e.target.value)}
                  className="w-36 px-2 py-1 text-xs border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <Button size="sm" variant="outline" loading={qrLimitSaving} onClick={async () => {
                  setQrLimitSaving(true);
                  try {
                    const v = parseInt(qrLimitInput, 10) || 0;
                    await waqrApi.settings(v);
                    setQr({ ...qr, customLimit: v, todayCap: v > 0 ? v : qr.todayCap });
                    toast.success(v > 0 ? `Daily limit set to ${v}` : 'Back to automatic warm-up limit');
                  } catch { toast.error('Failed to save limit'); }
                  setQrLimitSaving(false);
                }}>Save</Button>
                {(qr.customLimit || 0) > 0 && (
                  <button className="text-[11px] text-emerald-700 underline" onClick={async () => {
                    try { await waqrApi.settings(0); setQr({ ...qr, customLimit: 0 }); setQrLimitInput(''); toast.success('Back to automatic warm-up limit'); } catch { toast.error('Failed'); }
                  }}>Reset to auto</button>
                )}
              </div>
              <p className="text-[10px] text-emerald-700">Overrides the automatic warm-up schedule. Setting a high limit on a fresh number greatly increases the ban risk. Set 0 or Reset to return to auto.</p>
            </div>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Stay safe — read before connecting</p>
          <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
            <li>This uses WhatsApp Web (not the official API). It is against WhatsApp&apos;s Terms of Service and carries a <b>risk of your number being banned</b>. Use a secondary number, not your main personal/business number.</li>
            <li>Our safety engine protects you automatically: new numbers start with a small daily limit that grows over 2 weeks (number warm-up), messages are sent with human-like random delays and typing indicators.</li>
            <li>Only message people who know you or have contacted you first. Never send bulk promotions to unknown numbers — that is the fastest way to get banned.</li>
            <li>Avoid sending the same text repeatedly. Personalize messages and keep a healthy reply rate (if nobody replies, slow down).</li>
            <li>Keep your phone connected to the internet. If the number gets banned or logged out, the channel pauses automatically and you will see it here.</li>
            <li>For bulk campaigns, official templates and green-tick verification, use the official <b>WhatsApp Business API</b> channel above.</li>
          </ul>
        </div>
      </div>

      {/* Facebook */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"><FbIcon className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
              <p className="text-xs text-gray-500">Page messages go straight to your Facebook Inbox</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={metaChat.fbEnabled} onChange={(e) => setMetaChat({ ...metaChat, fbEnabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Enable
          </label>
        </div>
        {fbCfg?.oneClick && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            {fbCfg.connected ? (
              <p className="text-sm text-blue-900">Connected{fbCfg.pageName ? `: ${fbCfg.pageName}` : ''} — messages of this Page arrive in your Inbox.</p>
            ) : (
              <p className="text-sm text-blue-900">Connect your Facebook Page in one click — no Page ID or token needed.</p>
            )}
            <Button onClick={connectFbOneClick} loading={fbBusy}>
              {fbCfg.connected ? 'Reconnect with Facebook' : 'Connect with Facebook'}
            </Button>
            {fbPages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-600">Choose the Page to connect:</p>
                {fbPages.map((p) => (
                  <button key={p.id} onClick={() => chooseFbPage(p.id)} className="block w-full text-left text-sm rounded border border-blue-200 bg-white px-3 py-2 hover:bg-blue-100">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Input label="Facebook Page ID" value={metaChat.pageId} onChange={(e) => setMetaChat({ ...metaChat, pageId: e.target.value })} placeholder="e.g. 1234567890" />
        <Input label="Page Access Token" type="password" value={metaChat.pageAccessToken} onChange={(e) => setMetaChat({ ...metaChat, pageAccessToken: e.target.value })} placeholder="EAAB..." />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">How to get these (step by step):</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Go to <b>developers.facebook.com</b> → open your App → <b>Add Product</b> → <b>Messenger</b> → <b>Set Up</b>.</li>
            <li>Open <b>Messenger → Settings</b> → find the <b>Access Tokens</b> section.</li>
            <li>Click <b>Add or Remove Pages</b> → select your Facebook Page → allow all permissions.</li>
            <li>Next to the added Page, click <b>Generate Token</b>, copy the <code className="bg-white px-1 rounded">EAAB...</code> token and paste it in <b>Page Access Token</b> above.</li>
            <li>Get your <b>Page ID</b>: open your Facebook Page → <b>About / Settings → Page transparency</b> → copy the <b>Page ID</b> into the field above.</li>
            <li>Make sure the <code className="bg-white px-1 rounded">pages_messaging</code> permission is enabled (added automatically by Messenger setup).</li>
          </ol>
        </div>
      </div>

      {/* Instagram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center"><Camera className="w-5 h-5 text-pink-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Instagram DM</h2>
              <p className="text-xs text-gray-500">Instagram direct messages in your Inbox (uses the same Page token)</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={metaChat.igEnabled} onChange={(e) => setMetaChat({ ...metaChat, igEnabled: e.target.checked })} className="w-4 h-4 accent-pink-600" />
            Enable
          </label>
        </div>
        <Input label="Instagram Account ID" value={metaChat.igAccountId} onChange={(e) => setMetaChat({ ...metaChat, igAccountId: e.target.value })} placeholder="e.g. 17841400000000000" />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">How to get the Instagram Account ID (step by step):</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>In the Instagram app: <b>Settings → Account → Switch to Professional (Business)</b> account.</li>
            <li>Link that Instagram account to your Facebook Page (Page Settings → Linked accounts → Instagram).</li>
            <li>Open <b>developers.facebook.com/tools/explorer</b> (Graph API Explorer) and run:<br/><code className="bg-white px-1 rounded">GET /&#123;page-id&#125;?fields=instagram_business_account</code></li>
            <li>Copy the returned <code className="bg-white px-1 rounded">id</code> (starts with <b>17841...</b>) into <b>Instagram Account ID</b> above.</li>
            <li>No separate token needed — the Page Access Token above is reused. Just make sure the <code className="bg-white px-1 rounded">instagram_manage_messages</code> permission is enabled.</li>
          </ol>
        </div>
      </div>

      {/* Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center"><Send className="w-5 h-5 text-sky-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Telegram</h2>
              <p className="text-xs text-gray-500">{telegram.botUsername ? `Connected as @${telegram.botUsername}` : 'Receive and reply to Telegram messages in your Inbox'}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={telegram.enabled} onChange={(e) => setTelegram({ ...telegram, enabled: e.target.checked })} className="w-4 h-4 accent-sky-600" />
            Enable
          </label>
        </div>
        <Input label="Bot Token" type="password" value={telegram.botToken} onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })} placeholder="123456789:AAF..." />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">How to get the Bot Token (step by step):</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Open Telegram and search for <b>@BotFather</b> → open the chat.</li>
            <li>Send <code className="bg-white px-1 rounded">/newbot</code>.</li>
            <li>Enter a <b>name</b> for your bot, then a <b>username</b> (must end with <code className="bg-white px-1 rounded">_bot</code>).</li>
            <li>BotFather replies with a token like <code className="bg-white px-1 rounded">123456789:AAF...</code> — copy it into <b>Bot Token</b> above.</li>
            <li>Click <b>Save</b>. The webhook is registered automatically. Anyone who messages your bot will now appear in your Inbox.</li>
          </ol>
        </div>
      </div>

      {/* Personal Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center"><Send className="w-5 h-5 text-sky-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Personal Telegram</h2>
              <p className="text-xs text-gray-500">{tgp.status === 'connected' ? `Connected — +${tgp.phone}${tgp.username ? ' (@' + tgp.username + ')' : ''}` : 'Connect your own Telegram account by QR scan (like Telegram Desktop) — official Telegram API, no ban risk'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tgp.status === 'connected' ? (
              <>
                <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> Connected</span>
                <Button size="sm" variant="outline" loading={tgpBusy} onClick={async () => {
                  if (!confirm('Disconnect this Telegram account?')) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.disconnect(); setTgp({ status: 'disconnected', phone: '' }); toast.success('Disconnected'); } catch { toast.error('Failed'); }
                  setTgpBusy(false);
                }}>Disconnect</Button>
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> Not connected</span>
            )}
          </div>
        </div>

        {tgp.status !== 'connected' && (
          <>
            {!['awaiting_code', 'awaiting_password', 'verifying'].includes(tgp.status) && (
              <div className="space-y-3">
                {tgpMode === 'qr' ? (
                  <>
                    {tgp.status === 'qr' && tgp.qr ? (
                      <div className="flex flex-col items-center gap-3 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tgp.qr} alt="Telegram login QR" className="w-56 h-56 border rounded-lg" />
                        <p className="text-xs text-gray-500 text-center">Open Telegram on your phone → <b>Settings → Devices → Link Desktop Device</b> → scan this QR. The code refreshes automatically.</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Button size="sm" onClick={connectTgpQr} loading={tgpBusy || tgp.status === 'connecting'}>Connect with QR</Button>
                        {tgp.status === 'error' && <span className="text-xs text-red-500">{tgp.error || 'Login failed'}</span>}
                      </div>
                    )}
                    <button type="button" className="text-xs text-sky-600 underline" onClick={() => setTgpMode('phone')}>Login with phone number + code instead</button>
                  </>
                ) : (
                  <>
                    <Input label="Phone Number (with country code)" value={tgpPhone} onChange={(e) => setTgpPhone(e.target.value)} placeholder="+919876543210" />
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={connectTgp} loading={tgpBusy || tgp.status === 'connecting'}>Send Login Code</Button>
                      {tgp.status === 'error' && <span className="text-xs text-red-500">{tgp.error || 'Login failed'}</span>}
                    </div>
                    <button type="button" className="text-xs text-sky-600 underline" onClick={() => setTgpMode('qr')}>Login with QR scan instead</button>
                  </>
                )}
              </div>
            )}
            {tgp.status === 'awaiting_code' && (
              <div className="flex items-end gap-3">
                <Input label="Login Code (sent to your Telegram app)" value={tgpCode} onChange={(e) => setTgpCode(e.target.value)} placeholder="12345" />
                <Button size="sm" loading={tgpBusy} onClick={async () => {
                  if (!tgpCode.trim()) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.code(tgpCode.trim()); setTgp({ ...tgp, status: 'verifying' }); setTgpCode(''); }
                  catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; toast.error(e.response?.data?.message || 'Failed'); }
                  setTgpBusy(false);
                }}>Verify Code</Button>
              </div>
            )}
            {tgp.status === 'awaiting_password' && (
              <div className="flex items-end gap-3">
                <Input label="Two-Step Verification Password" type="password" value={tgpPassword} onChange={(e) => setTgpPassword(e.target.value)} />
                <Button size="sm" loading={tgpBusy} onClick={async () => {
                  if (!tgpPassword) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.password(tgpPassword); setTgp({ ...tgp, status: 'verifying' }); setTgpPassword(''); }
                  catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; toast.error(e.response?.data?.message || 'Failed'); }
                  setTgpBusy(false);
                }}>Verify Password</Button>
              </div>
            )}
            {tgp.status === 'verifying' && <p className="text-xs text-gray-400">Verifying...</p>}
          </>
        )}
        {tgp.status === 'connected' && (
          <p className="text-xs text-gray-500">Chats appear in the <b>Personal Telegram Inbox</b>. You can message anyone in your Telegram contacts/chats, and flows, keywords and AI auto-reply all work on this channel. This uses Telegram&apos;s official API — there is no ban risk.</p>
        )}
      </div>

      {/* Email */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center"><Mail className="w-5 h-5 text-orange-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Email Inbox</h2>
              <p className="text-xs text-gray-500">Emails sent to your support address appear in your Inbox and replies are sent from it</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={emailCh.enabled} onChange={(e) => setEmailCh({ ...emailCh, enabled: e.target.checked })} className="w-4 h-4 accent-orange-600" />
            Enable
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="IMAP Host (incoming)" value={emailCh.imapHost} onChange={(e) => setEmailCh({ ...emailCh, imapHost: e.target.value })} placeholder="imap.gmail.com" />
          <Input label="IMAP Port" type="number" value={String(emailCh.imapPort)} onChange={(e) => setEmailCh({ ...emailCh, imapPort: parseInt(e.target.value) || 993 })} />
          <Input label="SMTP Host (outgoing)" value={emailCh.smtpHost} onChange={(e) => setEmailCh({ ...emailCh, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
          <Input label="SMTP Port" type="number" value={String(emailCh.smtpPort)} onChange={(e) => setEmailCh({ ...emailCh, smtpPort: parseInt(e.target.value) || 587 })} />
          <Input label="Email Address" value={emailCh.user} onChange={(e) => setEmailCh({ ...emailCh, user: e.target.value })} placeholder="support@yourbusiness.com" />
          <Input label="Password / App Password" type="password" value={emailCh.pass} onChange={(e) => setEmailCh({ ...emailCh, pass: e.target.value })} />
        </div>
        <Input label="From Name (optional)" value={emailCh.fromName} onChange={(e) => setEmailCh({ ...emailCh, fromName: e.target.value })} placeholder="Your Business Support" />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">How to connect Gmail (step by step):</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>In your Google Account → <b>Security</b>, turn on <b>2-Step Verification</b>.</li>
            <li>Go to <b>Google Account → Security → App passwords</b> and create a new app password (name it &quot;wabapanel&quot;). You get a 16-character password.</li>
            <li>Fill the fields above — IMAP: <code className="bg-white px-1 rounded">imap.gmail.com</code> port <b>993</b>; SMTP: <code className="bg-white px-1 rounded">smtp.gmail.com</code> port <b>587</b>.</li>
            <li>Enter your Gmail address, and in <b>Password / App Password</b> paste the <b>16-character App Password</b> (not your normal Gmail password).</li>
            <li>Click <b>Save Configuration</b>. New emails are checked every 2 minutes and appear in your Inbox.</li>
          </ol>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <b>Webhook setup (one-time, in Meta App Dashboard):</b> Callback URL: <code className="bg-white px-1 rounded">{(typeof window !== 'undefined' ? window.location.origin : '')}/api/webhook/whatsapp</code> — Verify token is the same as your WhatsApp webhook. Subscribe to the &quot;messages&quot; field in both the Page and Instagram products.
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Save Configuration</Button>
      </div>
    </div>
  );
}
