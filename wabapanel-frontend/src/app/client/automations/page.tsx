'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquareText, Hand, Clock, Bot, Star, Zap, UserCheck, Snowflake, X, Plus, Trash2, RefreshCw, Cake, PhoneMissed, Repeat, ShoppingCart, BellRing, Shuffle, ShieldOff, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import { automationApi, teamApi, templateApi, uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AutoAssignRule { keyword: string; matchType: string; agent?: { _id: string; name: string } | string | null; tag: string; }
function StickerField({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const [up, setUp] = useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'stickers');
      const res = await uploadApi.uploadFile(fd);
      onChange(res.data.data.url);
      toast.success('Sticker uploaded');
    } catch { toast.error('Upload failed'); }
    setUp(false);
    if (ref.current) ref.current.value = '';
  };
  return (
    <div className="border-t border-gray-100 pt-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">Sticker (optional)</label>
      <input ref={ref} type="file" className="hidden" accept="image/*,.webp,.gif" onChange={handle} />
      <div className="flex items-center gap-2">
        <Button variant="outline" icon={<Upload className="w-4 h-4" />} loading={up} onClick={() => ref.current?.click()}>Upload sticker</Button>
        {value && (
          <>
            <img src={value} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded-lg" />
            <button className="text-xs text-red-500" onClick={() => onChange('')}>Remove</button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">Sent along with the message. Any image is auto-converted to WhatsApp WebP.</p>
    </div>
  );
}

interface Settings {
  welcome: { enabled: boolean; message: string; stickerUrl?: string };
  outOfOffice: { enabled: boolean; message: string; stickerUrl?: string; startTime: string; endTime: string; days: number[] };
  feedback: { enabled: boolean; message: string; stickerUrl?: string };
  autoAssignRules: AutoAssignRule[];
  icebreakers: string[];
  wishes: { birthdayEnabled: boolean; birthdayMessage: string; birthdayStickerUrl?: string; anniversaryEnabled: boolean; anniversaryMessage: string; anniversaryStickerUrl?: string };
  missedCall: { enabled: boolean; message: string; stickerUrl?: string };
  winback: { enabled: boolean; days: number; amount: number; unit: 'minutes' | 'hours' | 'days'; templateName: string; templateLanguage: string; presetName: string; customMessage: string; sendHour: number; steps: { delayValue: number; delayUnit: 'minutes' | 'hours' | 'days'; message: string }[]; aiEnabled: boolean; aiPrompt: string; aiMaxFollowups: number; aiGapValue: number; aiGapUnit: 'minutes' | 'hours' | 'days'; sendWindowMode: '24x7' | 'window'; sendStart: string; sendEnd: string };
  cartRecovery: { enabled: boolean; hours: number; message: string; stickerUrl?: string };
  roundRobin: { enabled: boolean; excludeAgents: string[] };
  dailySummary: { enabled: boolean; hour: number; phone: string };
  ownerAlerts: { enabled: boolean; phone: string; bigOrderAmount: number; unansweredMins: number; salesTarget: number } & Record<string, boolean | number | string>;
  optOut: { enabled: boolean; sendConfirmation: boolean; stopKeywords: string[]; startKeywords: string[]; stopReply: string; startReply: string; appendToBroadcasts: boolean; broadcastFooter: string };
}
interface Agent { _id: string; name: string; email?: string; }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const defaultSettings: Settings = {
  welcome: { enabled: false, message: '', stickerUrl: '' },
  outOfOffice: { enabled: false, message: '', stickerUrl: '', startTime: '09:00', endTime: '18:00', days: [1, 2, 3, 4, 5, 6] },
  feedback: { enabled: false, message: '', stickerUrl: '' },
  autoAssignRules: [],
  icebreakers: [],
  wishes: { birthdayEnabled: false, birthdayMessage: '', birthdayStickerUrl: '', anniversaryEnabled: false, anniversaryMessage: '', anniversaryStickerUrl: '' },
  missedCall: { enabled: false, message: '', stickerUrl: '' },
  winback: { enabled: false, days: 15, amount: 15, unit: 'days', templateName: '', templateLanguage: 'en', presetName: '', customMessage: '', sendHour: 11, steps: [], aiEnabled: false, aiPrompt: '', aiMaxFollowups: 3, aiGapValue: 1, aiGapUnit: 'days', sendWindowMode: '24x7', sendStart: '09:00', sendEnd: '18:00' },
  cartRecovery: { enabled: false, hours: 2, message: '', stickerUrl: '' },
  roundRobin: { enabled: false, excludeAgents: [] },
  dailySummary: { enabled: false, hour: 9, phone: '' },
  optOut: { enabled: true, sendConfirmation: true, stopKeywords: [], startKeywords: [], stopReply: '', startReply: '', appendToBroadcasts: true, broadcastFooter: '' },
  ownerAlerts: { enabled: false, phone: '', onHumanRequest: true, onAppointment: true, onReminder: true, onOrder: true, bigOrderAmount: 0, onPayment: true, onHotLead: true, onComplaint: true, onTicket: true, onMissedCall: true, onDisconnect: true, onUnanswered: false, unansweredMins: 15, onNoReply: true, noReplyHours: 24, onApptChange: true, onCallSummary: true, onBadRating: true, onRepeatCustomer: false, onBroadcastDone: true, onMsgFail: true, onLeadSource: false, onLowStock: true, onAgentLogin: false, weeklyReport: false, salesTarget: 0, waCommands: false, onCartAbandon: false, onLeadStage: false, highValueAmount: 0, onTagChange: false, onTemplateReject: false, onDailyUnread: false, alertKeywords: '', onNoAppts: false, onFirstMsg: false, onHourlyPulse: false, onNewDevice: false, onBulkDelete: false, onSentimentScore: false, onAiSuggestion: false, onAiCallFailed: false, onAgentIdle: false, agentIdleMins: 30, onChatReassign: false, onAgentOffline: false, agentOfflineHours: 4, onAfterHours: false, monthlyReport: false, onSlaBreach: false, slaHours: 24, onRevenueMilestone: false, revenueMilestone: 0, onRevenueDrop: false, onOrderCancelled: true },
};

const OWNER_ALERT_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: 'Customer & Chats', items: [
    { key: 'onHumanRequest', label: '\ud83d\ude4b Customer asks for a real human' },
    { key: 'onComplaint', label: '\ud83d\ude21 Angry customer / complaint detected' },
    { key: 'onUnanswered', label: '\u23f3 Chat unanswered for X minutes' },
    { key: 'onNoReply', label: '\ud83d\udd14 Customer silent after our reply (no-reply follow-up)' },
    { key: 'onRepeatCustomer', label: '\ud83d\udd01 Repeat customer returns after 30+ days' },
    { key: 'onLeadSource', label: '\ud83c\udd95 New lead arrives (with source)' },
    { key: 'onHotLead', label: '\ud83d\udd25 Hot lead detected' },
    { key: 'onBadRating', label: '\u2b50 Bad rating received (1-2 stars)' },
    { key: 'onTicket', label: '\ud83c\udfab New support ticket created' },
    { key: 'onAfterHours', label: '\ud83c\udf19 Message received after office hours' },
    { key: 'onFirstMsg', label: '\u2600\ufe0f First customer message of the day' },
    { key: 'onTagChange', label: '\ud83c\udff7 Contact tag changed' },
    { key: 'onLeadStage', label: '\ud83d\udcc8 Lead pipeline stage changed' },
  ]},
  { title: 'Orders & Sales', items: [
    { key: 'onOrder', label: '\ud83d\uded2 New order received' },
    { key: 'onPayment', label: '\ud83d\udcb0 Payment received' },
    { key: 'onOrderCancelled', label: '\u274c Order cancelled' },
    { key: 'onCartAbandon', label: '\ud83d\uded2 Cart abandoned (order incomplete)' },
    { key: 'onLowStock', label: '\ud83d\udce6 Product goes out of stock' },
    { key: 'onRevenueMilestone', label: '\ud83c\udf89 Daily revenue milestone reached' },
    { key: 'onRevenueDrop', label: '\ud83d\udcc9 Revenue drop alert (50%+ lower)' },
  ]},
  { title: 'Calls & Meetings', items: [
    { key: 'onAppointment', label: '\ud83d\udcc5 New appointment/meeting booked' },
    { key: 'onReminder', label: '\u23f0 Meeting reminder (1 hour before)' },
    { key: 'onApptChange', label: '\u274c Appointment cancelled/rescheduled' },
    { key: 'onNoAppts', label: '\ud83d\udcc5 No appointments today' },
    { key: 'onMissedCall', label: '\ud83d\udcf5 Missed call received' },
    { key: 'onCallSummary', label: '\ud83e\udd16 Summary after each AI call' },
    { key: 'onAiCallFailed', label: '\u274c AI call failed' },
  ]},
  { title: 'System & Team', items: [
    { key: 'onDisconnect', label: '\ud83d\udcf5 WhatsApp gets disconnected' },
    { key: 'onMsgFail', label: '\ud83d\udeab Messages start failing' },
    { key: 'onTemplateReject', label: '\u274c WhatsApp template rejected' },
    { key: 'onBroadcastDone', label: '\ud83d\udce3 Report when a broadcast completes' },
    { key: 'onAgentLogin', label: '\ud83d\udc64 Agent logs in' },
    { key: 'onAgentIdle', label: '\ud83d\udca4 Agent idle (X min)' },
    { key: 'onAgentOffline', label: '\ud83d\udcf5 Agent offline (X hours)' },
    { key: 'onChatReassign', label: '\ud83d\udd00 Chat reassigned between agents' },
    { key: 'onNewDevice', label: '\ud83d\udd10 Login from a new device' },
    { key: 'onBulkDelete', label: '\u26a0\ufe0f Bulk delete detected' },
  ]},
  { title: 'Reports & Analytics', items: [
    { key: 'weeklyReport', label: '\ud83d\udcc8 Weekly report (every Sunday 9 AM)' },
    { key: 'monthlyReport', label: '\ud83d\udcc5 Monthly report (1st of month, 9 AM)' },
    { key: 'onHourlyPulse', label: '\u23f0 Hourly activity pulse' },
    { key: 'onDailyUnread', label: '\ud83d\udce8 Evening unread chats count' },
    { key: 'onSlaBreach', label: '\u23f0 SLA breach (chat open for X hours)' },
    { key: 'onSentimentScore', label: '\ud83d\ude00 Daily sentiment score' },
    { key: 'onAiSuggestion', label: '\ud83e\udde0 AI suggested action' },
  ]},
];


function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function AutomationsHub() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [modal, setModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wbTemplates, setWbTemplates] = useState<{ name: string; language: string }[]>([]);
  const [fbReport, setFbReport] = useState<{ total: number; avg: number; dist: Record<number, number>; recent: { name: string; phone?: string; rating: number; date: string }[] } | null>(null);
  const [showAllFb, setShowAllFb] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await automationApi.getSettings();
      const d = res.data.data;
      if (d) {
        const wb = { ...defaultSettings.winback, ...d.winback };
        // Migrate a legacy single custom message into the first step so it stays visible/editable.
        if ((!wb.steps || wb.steps.length === 0) && wb.customMessage) {
          wb.steps = [{ delayValue: wb.amount || 1, delayUnit: wb.unit || 'hours', message: wb.customMessage }];
        }
        setSettings({ ...defaultSettings, ...d, welcome: { ...defaultSettings.welcome, ...d.welcome }, outOfOffice: { ...defaultSettings.outOfOffice, ...d.outOfOffice }, feedback: { ...defaultSettings.feedback, ...d.feedback }, wishes: { ...defaultSettings.wishes, ...d.wishes }, missedCall: { ...defaultSettings.missedCall, ...d.missedCall }, winback: wb, cartRecovery: { ...defaultSettings.cartRecovery, ...d.cartRecovery }, roundRobin: { ...defaultSettings.roundRobin, ...d.roundRobin }, dailySummary: { ...defaultSettings.dailySummary, ...d.dailySummary }, ownerAlerts: { ...defaultSettings.ownerAlerts, ...d.ownerAlerts }, optOut: { ...defaultSettings.optOut, ...d.optOut } });
      }
    } catch { /* empty */ }
    try {
      const res = await teamApi.listAgents();
      setAgents(res.data.data || []);
    } catch { /* empty */ }
  }, []);
  useEffect(() => {
    automationApi.feedbackReport().then(r => setFbReport(r.data.data)).catch(() => {});
    templateApi.list({ limit: 100 }).then(r => setWbTemplates(((r.data.data || []) as { name: string; language: string; status?: string }[]).filter(t => (t.status || '').toLowerCase() === 'approved').map(t => ({ name: t.name, language: t.language })))).catch(() => {});
    load(); }, [load]);

  const save = async (partial: Partial<Settings>, closeModal = true) => {
    setSaving(true);
    try {
      const payload = { ...partial } as Record<string, unknown>;
      if (payload.autoAssignRules) {
        payload.autoAssignRules = (payload.autoAssignRules as AutoAssignRule[]).map(r => ({
          ...r, agent: typeof r.agent === 'object' && r.agent ? r.agent._id : r.agent || null,
        }));
      }
      const res = await automationApi.updateSettings(payload);
      const d = res.data.data;
      setSettings(s => ({ ...s, ...d }));
      toast.success('Saved');
      if (closeModal) setModal(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save');
    }
    setSaving(false);
  };

  const syncIce = async () => {
    setSyncing(true);
    try {
      await automationApi.updateSettings({ icebreakers: settings.icebreakers });
      await automationApi.syncIcebreakers();
      toast.success('Ice breakers synced to WhatsApp');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Sync failed');
    }
    setSyncing(false);
  };

  const cards = [
    { key: 'keyword', icon: <MessageSquareText className="w-8 h-8 text-blue-500" />, title: 'Keyword Auto Reply', href: '/client/keywords',
      desc: 'Automatically respond to customer messages containing specific keywords. Quick and relevant replies to frequently asked questions.' },
    { key: 'welcome', icon: <Hand className="w-8 h-8 text-amber-500" />, title: 'Welcome Message', badge: settings.welcome.enabled,
      desc: 'A personalized message automatically sent when new customers message your business for the first time.' },
    { key: 'ooo', icon: <Clock className="w-8 h-8 text-purple-500" />, title: 'Out of Office Message', badge: settings.outOfOffice.enabled,
      desc: 'Automate a reply for people who contact you outside working hours, telling them when you will get back.' },
    { key: 'bots', icon: <Bot className="w-8 h-8 text-cyan-500" />, title: 'Bots', href: '/client/automations/flows',
      desc: 'Build automated chatbot flows with triggers, conditions, messages, buttons and more using the visual flow builder.' },
    { key: 'botflows', icon: <Zap className="w-8 h-8 text-indigo-500" />, title: 'Bot Flow Builder', href: '/client/bot-flows',
      desc: 'Visual drag-and-drop chatbot builder with keyword triggers, branching buttons, media, templates and actions.' },
    { key: 'feedback', icon: <Star className="w-8 h-8 text-yellow-500" />, title: 'Feedback', badge: settings.feedback.enabled,
      desc: 'Automatically request feedback from customers when a conversation is resolved, to improve your products and services.' },
    { key: 'quickreply', icon: <Zap className="w-8 h-8 text-emerald-500" />, title: 'Quick Reply', href: '/client/quick-replies',
      desc: 'Craft pre-written responses for common inquiries so your team can reply quickly, consistently and professionally.' },
    { key: 'autoassign', icon: <UserCheck className="w-8 h-8 text-rose-500" />, title: 'Auto Assign', badge: settings.autoAssignRules.length > 0,
      desc: 'Set keyword rules to automatically label and route incoming chats to specific agents based on message content.' },
    { key: 'icebreaker', icon: <Snowflake className="w-8 h-8 text-sky-500" />, title: 'Icebreaker', badge: settings.icebreakers.filter(Boolean).length > 0,
      desc: 'Pre-written selectable prompts that appear when a customer starts a conversation, helping them begin easily.' },
    { key: 'wishes', icon: <Cake className="w-8 h-8 text-pink-500" />, title: 'Birthday & Anniversary Wishes', badge: settings.wishes.birthdayEnabled || settings.wishes.anniversaryEnabled,
      desc: 'Automatically send birthday and anniversary wishes to contacts on their special day (set dates in Contacts).' },
    { key: 'missedcall', icon: <PhoneMissed className="w-8 h-8 text-red-500" />, title: 'Missed Call Auto-Reply', badge: settings.missedCall.enabled,
      desc: 'When you miss a customer WhatsApp call, an automatic message is sent so the lead is never lost.' },
    { key: 'winback', icon: <Repeat className="w-8 h-8 text-cyan-600" />, title: 'Win-back Quiet Customers auto Follow-up', badge: settings.winback.enabled,
      desc: 'Automatically re-engage quiet customers with multi-step follow-ups (custom messages or AI), inside the 24-hour window; an approved template is used when the window is closed.' },
    { key: 'roundrobin', icon: <Shuffle className="w-8 h-8 text-violet-500" />, title: 'Round-Robin Chat Routing', badge: settings.roundRobin.enabled,
      desc: 'Automatically distribute incoming chats equally among agents — Agent A → B → C → A → B → ... No one gets overloaded.' },
    { key: 'cartrecovery', icon: <ShoppingCart className="w-8 h-8 text-orange-500" />, title: 'Abandoned Cart Recovery', badge: settings.cartRecovery.enabled,
      desc: 'Automatically remind customers on WhatsApp when their order stays pending/unpaid for X hours, so no sale is lost.' },
    { key: 'owneralerts', icon: <BellRing className="w-8 h-8 text-rose-500" />, title: 'Owner Alerts', badge: settings.ownerAlerts.enabled,
      desc: 'Get an instant WhatsApp message when a customer asks for a real human, an appointment is booked, or a meeting reminder is due.' },
    { key: 'optout', icon: <ShieldOff className="w-8 h-8 text-slate-500" />, title: 'Opt-out / Unsubscribe', badge: settings.optOut.enabled,
      desc: 'When a customer replies STOP / UNSUBSCRIBE they are auto-unsubscribed and excluded from all broadcasts, so your number stays safe from blocks. Reply START to re-subscribe.' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
        <p className="text-gray-500 text-sm mt-1">Automated messaging features for streamlined customer engagement.</p>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const inner = (
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-full hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer relative">
              {'badge' in c && (
                <span className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.badge ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.badge ? 'ON' : 'OFF'}
                </span>
              )}
              <div className="mb-3">{c.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1.5">{c.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            </div>
          );
          return c.href
            ? <Link key={c.key} href={c.href}>{inner}</Link>
            : <div key={c.key} onClick={() => setModal(c.key)}>{inner}</div>;
        })}
      </div>

      {/* Welcome Message */}
      <Modal isOpen={modal === 'welcome'} onClose={() => setModal(null)} title="Welcome Message" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable welcome message</span>
            <Toggle on={settings.welcome.enabled} onChange={v => setSettings(s => ({ ...s, welcome: { ...s.welcome, enabled: v } }))} />
          </div>
          <Textarea label="Message" rows={4} value={settings.welcome.message}
            onChange={e => setSettings(s => ({ ...s, welcome: { ...s.welcome, message: e.target.value } }))}
            placeholder="Hello! Welcome to our business. How can we help you today?" />
          <p className="text-xs text-gray-400">Sent automatically when a new customer messages you for the first time.</p>
          <StickerField value={settings.welcome.stickerUrl} onChange={url => setSettings(s => ({ ...s, welcome: { ...s.welcome, stickerUrl: url } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ welcome: settings.welcome })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Opt-out / Unsubscribe */}
      <Modal isOpen={modal === 'optout'} onClose={() => setModal(null)} title="Opt-out / Unsubscribe" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Enable opt-out handling</span>
              <p className="text-xs text-gray-400 mt-0.5">Auto-unsubscribe customers who reply STOP; skip them in every broadcast.</p>
            </div>
            <Toggle on={settings.optOut.enabled} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, enabled: v } }))} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Send confirmation reply</span>
            <Toggle on={settings.optOut.sendConfirmation} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, sendConfirmation: v } }))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Add opt-out line to broadcasts</span>
              <p className="text-xs text-gray-400 mt-0.5">Appends a short &ldquo;how to unsubscribe&rdquo; line to free-text campaign messages (not approved templates).</p>
            </div>
            <Toggle on={settings.optOut.appendToBroadcasts} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, appendToBroadcasts: v } }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Broadcast opt-out line</label>
            <Input value={settings.optOut.broadcastFooter}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, broadcastFooter: e.target.value } }))}
              placeholder="Reply STOP to unsubscribe (blank = default)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stop keywords</label>
            <Input value={settings.optOut.stopKeywords.join(', ')}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, stopKeywords: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))}
              placeholder="stop, unsubscribe, band karo (blank = built-in defaults)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start keywords (re-subscribe)</label>
            <Input value={settings.optOut.startKeywords.join(', ')}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, startKeywords: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))}
              placeholder="start, subscribe, chalu karo (blank = built-in defaults)" />
          </div>
          <Textarea label="Unsubscribe confirmation reply" rows={2} value={settings.optOut.stopReply}
            onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, stopReply: e.target.value } }))}
            placeholder="You've been unsubscribed. Reply START anytime to resubscribe. (blank = default)" />
          <Textarea label="Re-subscribe confirmation reply" rows={2} value={settings.optOut.startReply}
            onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, startReply: e.target.value } }))}
            placeholder="You've been resubscribed. Reply STOP anytime to unsubscribe. (blank = default)" />
          <p className="text-xs text-gray-400">Comma-separated. Matching is case-insensitive and works on the first word too, so &ldquo;STOP please&rdquo; also unsubscribes. Normal 1:1 chats are never blocked — only broadcasts &amp; campaigns.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ optOut: settings.optOut })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Out of Office */}
      <Modal isOpen={modal === 'ooo'} onClose={() => setModal(null)} title="Out of Office Message" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable out of office reply</span>
            <Toggle on={settings.outOfOffice.enabled} onChange={v => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, enabled: v } }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Working days</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, days: s.outOfOffice.days.includes(i) ? s.outOfOffice.days.filter(x => x !== i) : [...s.outOfOffice.days, i] } }))}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${settings.outOfOffice.days.includes(i) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Working hours start</label>
              <input type="time" value={settings.outOfOffice.startTime} onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, startTime: e.target.value } }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Working hours end</label>
              <input type="time" value={settings.outOfOffice.endTime} onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, endTime: e.target.value } }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>
          <Textarea label="Message" rows={3} value={settings.outOfOffice.message}
            onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, message: e.target.value } }))}
            placeholder="We are currently away. We will reply during working hours (Mon-Sat, 9am-6pm)." />
          <p className="text-xs text-gray-400">Sent when a customer messages you outside working hours (IST). Max once per 6 hours per chat.</p>
          <StickerField value={settings.outOfOffice.stickerUrl} onChange={url => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, stickerUrl: url } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ outOfOffice: settings.outOfOffice })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Feedback */}
      <Modal isOpen={modal === 'feedback'} onClose={() => setModal(null)} title="Feedback / Rating (⭐ stars)" size="md">
        <div className="space-y-4">
          {fbReport && fbReport.total > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-gray-800">⭐ {fbReport.avg} average — {fbReport.total} ratings</p>
              <div className="flex gap-2 text-[11px] text-gray-600">
                {[5, 4, 3, 2, 1].map(r => <span key={r}>{r}★: {fbReport.dist[r] || 0}</span>)}
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-yellow-100 mt-1">
                {fbReport.recent.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-[11px]">
                    <span className="text-gray-700">{'⭐'.repeat(f.rating)} <span className="font-medium">{f.name}</span>{f.phone ? <span className="text-gray-400"> · {f.phone}</span> : null}</span>
                    <span className="text-gray-400">{new Date(f.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAllFb(true)} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline">View All Feedback ({fbReport.total})</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable feedback message</span>
            <Toggle on={settings.feedback.enabled} onChange={v => setSettings(s => ({ ...s, feedback: { ...s.feedback, enabled: v } }))} />
          </div>
          <Textarea label="Message" rows={4} value={settings.feedback.message}
            onChange={e => setSettings(s => ({ ...s, feedback: { ...s.feedback, message: e.target.value } }))}
            placeholder="How was your experience? Please rate us 1-5. Your feedback helps us improve!" />
          <p className="text-xs text-gray-400">As soon as a chat is resolved, this message plus a ⭐1-5 rating list is sent to the customer; when they tap a rating it appears in the report here.</p>
          <StickerField value={settings.feedback.stickerUrl} onChange={url => setSettings(s => ({ ...s, feedback: { ...s.feedback, stickerUrl: url } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ feedback: settings.feedback })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* All feedback list */}
      <Modal isOpen={showAllFb} onClose={() => setShowAllFb(false)} title={`All Feedback (${fbReport?.total || 0})`} size="lg">
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
          {(fbReport?.recent || []).map((f, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">{'⭐'.repeat(f.rating)} <span className="font-medium">{f.name}</span>{f.phone ? <span className="text-gray-400"> · {f.phone}</span> : null}</span>
              <span className="text-xs text-gray-400">{new Date(f.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
          ))}
          {!fbReport?.recent?.length && <p className="text-sm text-gray-400 py-4 text-center">No feedback yet</p>}
        </div>
      </Modal>

      {/* Wishes */}
      <Modal isOpen={modal === 'wishes'} onClose={() => setModal(null)} title="Birthday & Anniversary Wishes" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Birthday wishes</span>
            <Toggle on={settings.wishes.birthdayEnabled} onChange={v => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayEnabled: v } }))} />
          </div>
          <Textarea label="Birthday message" rows={3} value={settings.wishes.birthdayMessage}
            onChange={e => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayMessage: e.target.value } }))}
            placeholder="Happy Birthday {first_name}! 🎂🎉 Have a wonderful day." />
          <StickerField value={settings.wishes.birthdayStickerUrl} onChange={url => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayStickerUrl: url } }))} />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Anniversary wishes</span>
            <Toggle on={settings.wishes.anniversaryEnabled} onChange={v => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryEnabled: v } }))} />
          </div>
          <Textarea label="Anniversary message" rows={3} value={settings.wishes.anniversaryMessage}
            onChange={e => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryMessage: e.target.value } }))}
            placeholder="Happy Anniversary {first_name}! 💐" />
          <StickerField value={settings.wishes.anniversaryStickerUrl} onChange={url => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryStickerUrl: url } }))} />
          <p className="text-xs text-gray-400">Set birthday/anniversary dates in Contacts — an automatic wish is sent after 9 AM on that day. Variables: {'{first_name}'} {'{full_name}'}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ wishes: settings.wishes })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Cart Recovery */}
      <Modal isOpen={modal === 'cartrecovery'} onClose={() => setModal(null)} title="Abandoned Cart Recovery" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable cart recovery reminders</span>
            <Toggle on={settings.cartRecovery.enabled} onChange={v => setSettings(s => ({ ...s, cartRecovery: { ...s.cartRecovery, enabled: v } }))} />
          </div>
          <Input label="Send reminder after (hours pending)" type="number" value={String(settings.cartRecovery.hours)}
            onChange={e => setSettings(s => ({ ...s, cartRecovery: { ...s.cartRecovery, hours: Number(e.target.value) || 2 } }))} />
          <Textarea label="Reminder message" rows={4} value={settings.cartRecovery.message}
            onChange={e => setSettings(s => ({ ...s, cartRecovery: { ...s.cartRecovery, message: e.target.value } }))}
            placeholder="Hi {first_name}, your order {order_number} is still pending! Total: {total}. Reply to complete your order. 🛒" />
          <p className="text-xs text-gray-400">Sent once per order when it stays pending &amp; unpaid. Variables: {'{first_name}'} {'{order_number}'} {'{items}'} {'{total}'}</p>
          <StickerField value={settings.cartRecovery.stickerUrl} onChange={url => setSettings(s => ({ ...s, cartRecovery: { ...s.cartRecovery, stickerUrl: url } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ cartRecovery: settings.cartRecovery })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Owner Alerts */}
      <Modal isOpen={modal === 'owneralerts'} onClose={() => setModal(null)} title="Owner Alerts" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable owner alerts</span>
            <Toggle on={settings.ownerAlerts.enabled as boolean} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, enabled: v } }))} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="text-xs font-medium px-3 py-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100" onClick={() => setSettings(s => { const na = { ...s.ownerAlerts }; OWNER_ALERT_GROUPS.forEach(g => g.items.forEach(t => { na[t.key] = true; })); return { ...s, ownerAlerts: na }; })}>Select all</button>
            <button type="button" className="text-xs font-medium px-3 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200" onClick={() => setSettings(s => { const na = { ...s.ownerAlerts }; OWNER_ALERT_GROUPS.forEach(g => g.items.forEach(t => { na[t.key] = false; })); return { ...s, ownerAlerts: na }; })}>Unselect all</button>
          </div>
          {OWNER_ALERT_GROUPS.map(g => (
            <div key={g.title} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase">{g.title}</p>
              {g.items.map(t => (
                <div key={t.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t.label}</span>
                  <Toggle on={!!settings.ownerAlerts[t.key]} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, [t.key]: v } }))} />
                </div>
              ))}
            </div>
          ))}
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">📊 Daily WhatsApp summary (kal ka report)</span>
              <Toggle on={settings.dailySummary.enabled} onChange={v => setSettings(s => ({ ...s, dailySummary: { ...s.dailySummary, enabled: v } }))} />
            </div>
            <Select label="Send time (daily, IST)" value={String(settings.dailySummary.hour)}
              onChange={e => setSettings(s => ({ ...s, dailySummary: { ...s.dailySummary, hour: Number(e.target.value) } }))}
              options={Array.from({ length: 16 }, (_, i) => i + 6).map(h => ({ value: String(h), label: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}` }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Big order alert (min ₹, 0 = sab)" type="number" value={String(settings.ownerAlerts.bigOrderAmount ?? 0)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, bigOrderAmount: Number(e.target.value) || 0 } }))} />
            <Input label="Unanswered chat (minutes)" type="number" value={String(settings.ownerAlerts.unansweredMins ?? 15)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, unansweredMins: Number(e.target.value) || 15 } }))} />
            <Input label="No-reply follow-up (hours)" type="number" value={String(settings.ownerAlerts.noReplyHours ?? 24)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, noReplyHours: Number(e.target.value) || 24 } }))} />
            <Input label="Monthly sales target (₹, 0 = off)" type="number" value={String(settings.ownerAlerts.salesTarget ?? 0)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, salesTarget: Number(e.target.value) || 0 } }))} />
            <Input label="High-value customer (min ₹)" type="number" value={String(settings.ownerAlerts.highValueAmount ?? 0)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, highValueAmount: Number(e.target.value) || 0 } }))} />
            <Input label="Agent idle alert (minutes)" type="number" value={String(settings.ownerAlerts.agentIdleMins ?? 30)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, agentIdleMins: Number(e.target.value) || 30 } }))} />
            <Input label="Agent offline alert (hours)" type="number" value={String(settings.ownerAlerts.agentOfflineHours ?? 4)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, agentOfflineHours: Number(e.target.value) || 4 } }))} />
            <Input label="SLA breach (hours)" type="number" value={String(settings.ownerAlerts.slaHours ?? 24)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, slaHours: Number(e.target.value) || 24 } }))} />
            <Input label="Revenue milestone (₹/day)" type="number" value={String(settings.ownerAlerts.revenueMilestone ?? 0)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, revenueMilestone: Number(e.target.value) || 0 } }))} />
          </div>
          <Input label="Alert keywords (comma-separated)" value={String(settings.ownerAlerts.alertKeywords ?? '')}
            onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, alertKeywords: e.target.value } }))}
            placeholder="cancel, refund, urgent, fraud" />
          <p className="text-xs text-gray-400">You will get an instant alert whenever a customer mentions any of these keywords.</p>
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">📲 WhatsApp commands (sent from the owner number)</span>
              <Toggle on={!!settings.ownerAlerts.waCommands} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, waCommands: v } }))} />
            </div>
            <p className="text-xs text-gray-400">Commands: &quot;report&quot; = aaj ka summary, &quot;ai on/off&quot; = AI calling on/off, &quot;ok&quot; = last human-request chat khud ko assign, &quot;help&quot; = list</p>
          </div>
          <Input label="Owner WhatsApp number (with country code)" value={settings.ownerAlerts.phone as string}
            onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, phone: e.target.value } }))}
            placeholder="919876543210" />
          <p className="text-xs text-gray-400">Selected alerts will be sent to this WhatsApp number. Leave empty to use the business owner number.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ ownerAlerts: settings.ownerAlerts, dailySummary: { ...settings.dailySummary, phone: settings.dailySummary.phone || settings.ownerAlerts.phone as string } })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Winback */}
      <Modal isOpen={modal === 'winback'} onClose={() => setModal(null)} title="Win-back Quiet Customers auto Follow-up" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable auto follow-up</span>
            <Toggle on={settings.winback.enabled} onChange={v => setSettings(s => ({ ...s, winback: { ...s.winback, enabled: v } }))} />
          </div>

          {/* Timing */}
          <Select label="When to send follow-ups" value={settings.winback.sendWindowMode}
            onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendWindowMode: e.target.value as '24x7' | 'window' } }))}
            options={[{ value: '24x7', label: 'Any time (24×7)' }, { value: 'window', label: 'Only during official hours' }]} />
          {settings.winback.sendWindowMode === 'window' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="time" value={settings.winback.sendStart}
                onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendStart: e.target.value } }))} />
              <Input label="To" type="time" value={settings.winback.sendEnd}
                onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendEnd: e.target.value } }))} />
            </div>
          )}

          {/* Manual multi-step follow-ups */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Follow-up steps (max 5)</p>
            <p className="text-xs text-gray-400 mb-2">Each step sends its message after the delay. Step 1&apos;s delay counts from the customer&apos;s last activity; later steps count from the previous follow-up. If the customer replies, the sequence stops automatically.</p>
            <div className="space-y-3">
              {settings.winback.steps.map((step, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Follow-up {i + 1} — after {i === 0 ? 'inactivity of' : 'previous message'}</span>
                    <button type="button" className="text-xs text-red-500 hover:underline"
                      onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.filter((_, j) => j !== i) } }))}>Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" value={String(step.delayValue)}
                      onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, delayValue: Number(e.target.value) || 1 } : x) } }))} />
                    <Select value={step.delayUnit}
                      onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, delayUnit: e.target.value as 'minutes' | 'hours' | 'days' } : x) } }))}
                      options={[{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }]} />
                  </div>
                  <Textarea rows={2} value={step.message}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, message: e.target.value } : x) } }))}
                    placeholder="Hi {first_name}, just following up..." />
                </div>
              ))}
            </div>
            {settings.winback.steps.length < 5 && (
              <button type="button" className="mt-2 text-sm text-primary-600 hover:underline"
                onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, steps: [...s.winback.steps, { delayValue: s.winback.steps.length ? 1 : (s.winback.amount || 2), delayUnit: (s.winback.steps.length ? 'days' : s.winback.unit) as 'minutes' | 'hours' | 'days', message: '' }] } }))}>+ Add follow-up step</button>
            )}
          </div>

          {/* AI follow-up */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">AI Follow-up</p>
                <p className="text-xs text-gray-400">After the manual steps, the AI reads the chat and follows up on its own, based on your prompt.</p>
              </div>
              <Toggle on={settings.winback.aiEnabled} onChange={v => setSettings(s => ({ ...s, winback: { ...s.winback, aiEnabled: v } }))} />
            </div>
            {settings.winback.aiEnabled && (
              <div className="space-y-2 mt-2">
                <Textarea label="AI instruction (prompt)" rows={3} value={settings.winback.aiPrompt}
                  onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiPrompt: e.target.value } }))}
                  placeholder="e.g. If the customer has not shared their email/address yet, politely ask only for the missing detail so we can complete their order." />
                <div className="grid grid-cols-3 gap-2">
                  <Input label="Max follow-ups" type="number" value={String(settings.winback.aiMaxFollowups)}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiMaxFollowups: Number(e.target.value) || 0 } }))} />
                  <Input label="Gap" type="number" value={String(settings.winback.aiGapValue)}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiGapValue: Number(e.target.value) || 1 } }))} />
                  <Select label="Unit" value={settings.winback.aiGapUnit}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiGapUnit: e.target.value as 'minutes' | 'hours' | 'days' } }))}
                    options={[{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }]} />
                </div>
                <p className="text-xs text-gray-400">Uses whichever AI provider you have enabled in AI Settings. AI messages are free text, so they are only sent inside the 24-hour window.</p>
              </div>
            )}
          </div>

          <Select label="Approved Template (used when the 24-hour window is closed)" value={settings.winback.templateName}
            onChange={e => {
              const t = wbTemplates.find(x => x.name === e.target.value);
              setSettings(s => ({ ...s, winback: { ...s.winback, templateName: e.target.value, templateLanguage: t?.language || 'en' } }));
            }}
            options={[{ value: '', label: 'None — skip when window is closed' }, ...wbTemplates.map(t => ({ value: t.name, label: t.name }))]} />

          <p className="text-xs text-gray-400">Inside the 24-hour window your step / AI messages are sent (free text, saves cost). Outside the window only the approved template can be sent — if none is selected, that step is skipped until the customer replies.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ winback: settings.winback })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Missed Call */}
      <Modal isOpen={modal === 'missedcall'} onClose={() => setModal(null)} title="Missed Call Auto-Reply" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable missed call auto-reply</span>
            <Toggle on={settings.missedCall.enabled} onChange={v => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, enabled: v } }))} />
          </div>
          <Textarea label="Message" rows={3} value={settings.missedCall.message}
            onChange={e => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, message: e.target.value } }))}
            placeholder="Sorry, we missed your call. Please send us a message here and we will reply right away 🙏" />
          <p className="text-xs text-gray-400">When a customer&apos;s WhatsApp call goes unanswered (by you or the AI), this message is sent immediately. Variables: {'{first_name}'} {'{full_name}'}</p>
          <StickerField value={settings.missedCall.stickerUrl} onChange={url => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, stickerUrl: url } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ missedCall: settings.missedCall })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Round-Robin Chat Routing */}
      <Modal isOpen={modal === 'roundrobin'} onClose={() => setModal(null)} title="Round-Robin Chat Routing" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Enable Round-Robin</p>
              <p className="text-xs text-gray-400">New chats are distributed evenly among agents</p>
            </div>
            <Toggle on={settings.roundRobin.enabled} onChange={v => setSettings(s => ({ ...s, roundRobin: { ...s.roundRobin, enabled: v } }))} />
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>When a new customer messages, the system auto-assigns the next agent in rotation</li>
              <li>Agent A → Agent B → Agent C → Agent A → Agent B → ...</li>
              <li>No single agent gets overloaded</li>
              <li>Keyword Auto Assign rules are NOT overridden — keyword rules match first, then round-robin applies</li>
            </ul>
          </div>
          {agents.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Agents in rotation:</p>
              <div className="space-y-2">
                {agents.map(a => {
                  const excluded = settings.roundRobin.excludeAgents.includes(a._id);
                  return (
                    <label key={a._id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm cursor-pointer ${excluded ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-emerald-50 border-emerald-200 text-gray-700'}`}>
                      <input type="checkbox" checked={!excluded}
                        onChange={() => setSettings(s => ({
                          ...s,
                          roundRobin: {
                            ...s.roundRobin,
                            excludeAgents: excluded
                              ? s.roundRobin.excludeAgents.filter(id => id !== a._id)
                              : [...s.roundRobin.excludeAgents, a._id]
                          }
                        }))}
                        className="rounded" />
                      <span>{a.name}</span>
                      {a.email && <span className="text-xs text-gray-400">({a.email})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {agents.length === 0 && <p className="text-sm text-gray-400">No agents found — add agents under Settings → Agents first.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ roundRobin: settings.roundRobin })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Auto Assign */}
      <Modal isOpen={modal === 'autoassign'} onClose={() => setModal(null)} title="Auto Assign Rules" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">When an incoming message matches a keyword, the chat is auto-assigned to the selected agent and the contact is labeled with the tag.</p>
          {settings.autoAssignRules.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_1fr_36px] gap-2 items-end p-3 bg-gray-50 rounded-lg">
              <Input label="Keyword" value={r.keyword} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, keyword: e.target.value } : x) }))} placeholder="e.g. pricing" />
              <Select label="Match" value={r.matchType || 'contains'} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, matchType: e.target.value } : x) }))}
                options={[{ value: 'contains', label: 'Contains' }, { value: 'exact', label: 'Exact' }, { value: 'starts_with', label: 'Starts with' }]} />
              <Select label="Assign to agent" value={typeof r.agent === 'object' && r.agent ? r.agent._id : (r.agent as string) || ''}
                onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, agent: e.target.value } : x) }))}
                options={[{ value: '', label: '— None —' }, ...agents.map(a => ({ value: a._id, label: a.name }))]} />
              <Input label="Label / Tag" value={r.tag} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, tag: e.target.value } : x) }))} placeholder="e.g. sales" />
              <button onClick={() => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.filter((_, j) => j !== i) }))}
                className="p-2 hover:bg-red-50 rounded-lg mb-0.5"><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          ))}
          <button onClick={() => setSettings(s => ({ ...s, autoAssignRules: [...s.autoAssignRules, { keyword: '', matchType: 'contains', agent: '', tag: '' }] }))}
            className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:text-emerald-700"><Plus className="w-4 h-4" /> Add Rule</button>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => save({ autoAssignRules: settings.autoAssignRules.filter(r => r.keyword.trim()) })}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Icebreaker */}
      <Modal isOpen={modal === 'icebreaker'} onClose={() => setModal(null)} title="Icebreakers" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Up to 4 tappable prompts shown to customers when they open a chat with you for the first time (WhatsApp). After saving, click Sync to push them to WhatsApp.</p>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex gap-2 items-center">
              <input value={settings.icebreakers[i] || ''} maxLength={80}
                onChange={e => setSettings(s => { const arr = [...s.icebreakers]; arr[i] = e.target.value; return { ...s, icebreakers: arr }; })}
                placeholder={`Prompt ${i + 1} (max 80 chars) — e.g. "What services do you offer?"`}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              {settings.icebreakers[i] && (
                <button onClick={() => setSettings(s => { const arr = [...s.icebreakers]; arr[i] = ''; return { ...s, icebreakers: arr }; })}
                  className="p-1.5 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="outline" loading={syncing} icon={<RefreshCw className="w-4 h-4" />} onClick={syncIce}>Save + Sync to WhatsApp</Button>
            <Button loading={saving} onClick={() => save({ icebreakers: settings.icebreakers })}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
