'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crmApi, noteApi, tagApi, teamApi, contactApi, conversationApi } from '@/lib/api';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import {
  Phone, PhoneIncoming, PhoneOutgoing, Search, Download, RefreshCw,
  Clock, CheckCircle2, XCircle, PlayCircle, CalendarClock,
  Users, MessageCircle, RotateCcw, CheckSquare, Send, ChevronDown, ExternalLink, Sparkles,
  Milestone, SlidersHorizontal, Pencil, FileText, IndianRupee, GripVertical, ChevronUp,
} from 'lucide-react';
import type { Message } from '@/types';
import { useAuthStore } from '@/stores/authStore';

interface CallRow {
  _id: string;
  source: string;
  scheduledType?: string;
  phone: string;
  to: string;
  from: string;
  direction: string;
  status: string;
  duration: number;
  recordingUrl: string;
  disposition: string;
  note: string;
  followUpAt?: string | null;
  startTime?: string;
  createdAt: string;
  errorMessage?: string;
  agent?: { name?: string } | null;
  contact?: { _id: string; name?: string } | null;
}
interface CallStats { total: number; today: number; completed: number; failed: number; avgDuration: number; totalDuration: number }

interface LeadStats {
  total: number; today: number; pendingReminders: number; overdueReminders: number;
  openDeals: number; openValue: number;
  salesValue?: number; salesItems?: number;
  stageBreakdown?: { _id: string; name: string; color?: string; count: number }[];
}

interface StageOpt { _id: string; name: string; color?: string }

interface LeadSales {
  value: number; items: number; autoValue: number; autoItems: number; orders: number;
  valueOverridden: boolean; itemsOverridden: boolean;
}

interface LeadRow {
  conversationId: string;
  contact: { _id: string; name?: string; phone?: string; crmComment?: string; tags?: { _id: string; name: string; color?: string }[] };
  agent: { _id: string; name: string } | null;
  lastMessage: { text: string; at: string | null; direction: string };
  unread: number;
  stage: StageOpt | null;
  sales: LeadSales;
  aiSummary: { score: number | null; at: string } | null;
  deal: { pipeline: string; stage: string; status: string; value: number; title: string } | null;
  followUp: { _id: string; at: string; text: string; contacted: boolean; remark: string } | null;
  receivedAt: string | null;
  callStatus?: string;
  lastCalledAt?: string | null;
  disposition?: string;
  closed: boolean;
  closeReason: string;
}

interface AiPlanRow {
  contactId: string; convId?: string | null; name: string; phone: string; reason: string;
  tags_add: string[]; tags_remove: string[]; comment: string | null;
  stage?: string | null; value?: number | null; items?: number | null; agent?: string | null;
  followup_days: number | null; followup_text: string | null;
  close_reason: string | null; message: string | null;
}

interface AiRun {
  _id: string; instruction: string; source: string; allowSend: boolean;
  leads: number; changed: number; sent: number; sendFailed: number;
  createdAt: string; createdBy?: { name?: string; email?: string } | null;
}

interface AiSchedule {
  _id: string; name?: string; instruction: string; allowSend: boolean;
  mode: 'interval' | 'daily'; intervalMinutes: number; dailyTime: string;
  active: boolean; lastRunAt?: string | null; nextRunAt?: string | null;
  lastSummary?: { leads: number; changed: number; sent: number };
}

interface TagOpt { _id: string; name: string; color?: string }
interface AgentOpt { _id: string; name?: string; email?: string }

const CLOSE_REASONS: { v: string; label: string }[] = [
  { v: 'won', label: 'Won' },
  { v: 'lost', label: 'Lost' },
  { v: 'not_interested', label: 'Not interested' },
  { v: 'spam', label: 'Spam' },
];

const DISPOSITIONS = ['interested', 'not interested', 'callback', 'no answer', 'wrong number', 'converted'];

// Lead-sheet columns that can be shown/hidden (saved per browser).
const LEAD_COLS: { k: string; label: string }[] = [
  { k: 'contact', label: 'Contact' },
  { k: 'received', label: 'Lead Received (Date & Time)' },
  { k: 'phone', label: 'Phone' },
  { k: 'callstatus', label: 'Call Status' },
  { k: 'labels', label: 'Labels/Product/Services' },
  { k: 'stage', label: 'Stage' },
  { k: 'value', label: 'Deal Value' },
  { k: 'items', label: 'Item Count (with value)' },
  { k: 'agent', label: 'Agent' },
  { k: 'message', label: 'Message' },
  { k: 'action', label: 'Action' },
  { k: 'reminder', label: 'Reminder' },
  { k: 'outcome', label: 'Follow-up Outcome' },
  { k: 'comments', label: 'Comments' },
  { k: 'close', label: 'Close / Reopen' },
];
const DEFAULT_COLS = LEAD_COLS.map(c => c.k).filter(k => k !== 'items');
const ALL_COL_KEYS = LEAD_COLS.map(c => c.k);
const COLS_LS_KEY = 'cc-lead-columns';
const ORDER_LS_KEY = 'cc-lead-col-order';
const COL_LABEL: Record<string, string> = Object.fromEntries(LEAD_COLS.map(c => [c.k, c.label]));

const fmtDate = (d: string | number) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDur = (s: number) => !s ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

const statusCls: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
  terminated: 'bg-orange-100 text-orange-700',
  ringing: 'bg-yellow-100 text-yellow-700',
  scheduled: 'bg-cyan-100 text-cyan-700',
};

export default function CallCenterPage() {
  const router = useRouter();
  const [stats, setStats] = useState<CallStats | null>(null);
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [disposition, setDisposition] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editRow, setEditRow] = useState<CallRow | null>(null);
  const [edDisp, setEdDisp] = useState('');
  const [edNote, setEdNote] = useState('');
  const [edFu, setEdFu] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'leads' | 'closed' | 'calls'>('leads');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadPage, setLeadPage] = useState(1);
  const [leadPages, setLeadPages] = useState(1);
  const [leadTotal, setLeadTotal] = useState(0);
  const [leadDir, setLeadDir] = useState<'desc' | 'asc'>('desc');
  const [leadFrom, setLeadFrom] = useState('');
  const [leadTo, setLeadTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [remarkFor, setRemarkFor] = useState<LeadRow | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [commentFor, setCommentFor] = useState<LeadRow | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [leadTag, setLeadTag] = useState('');
  const [leadAgents, setLeadAgents] = useState<string[]>([]);
  const [agentDropOpen, setAgentDropOpen] = useState(false);
  const [leadReminder, setLeadReminder] = useState('');
  const [leadValueMin, setLeadValueMin] = useState('');
  const [leadValueMax, setLeadValueMax] = useState('');
  const [leadSort, setLeadSort] = useState<'recent' | 'attention' | 'queue'>('recent');
  const [leadCallStatus, setLeadCallStatus] = useState('');
  const [leadAging, setLeadAging] = useState('');
  const [myList, setMyList] = useState(false);
  const currentUser = useAuthStore(st => st.user);
  const [callFor, setCallFor] = useState<LeadRow | null>(null);
  const [callStatusSel, setCallStatusSel] = useState('called');
  const [callDisposition, setCallDisposition] = useState('');
  const [callNote, setCallNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [callSaving, setCallSaving] = useState(false);
  const [leadSortBy, setLeadSortBy] = useState('');
  const [leadSortDir, setLeadSortDir] = useState<'asc' | 'desc'>('asc');
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [closeFor, setCloseFor] = useState<LeadRow | null>(null);
  const [closeReason, setCloseReason] = useState('lost');
  const [closeSaving, setCloseSaving] = useState(false);
  const [reminderFor, setReminderFor] = useState<LeadRow | null>(null);
  const [reminderText, setReminderText] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [tagEditFor, setTagEditFor] = useState<LeadRow | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [stages, setStages] = useState<StageOpt[]>([]);
  const [leadStage, setLeadStage] = useState('');
  const [stageEditFor, setStageEditFor] = useState<LeadRow | null>(null);
  const [stageSaving, setStageSaving] = useState(false);
  const [valueEditFor, setValueEditFor] = useState<LeadRow | null>(null);
  const [valueText, setValueText] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [valueSaving, setValueSaving] = useState(false);
  const [msgChoiceFor, setMsgChoiceFor] = useState<LeadRow | null>(null);
  const [summaryFor, setSummaryFor] = useState<LeadRow | null>(null);
  const [summaryData, setSummaryData] = useState<{ summary: string; score: number | null; at: string; cached?: boolean } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLS);
  const [colOrder, setColOrder] = useState<string[]>(ALL_COL_KEYS);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiAllowSend, setAiAllowSend] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiPlanRow[] | null>(null);
  const [aiTab, setAiTab] = useState<'run' | 'history' | 'schedule'>('run');
  const [aiHistory, setAiHistory] = useState<AiRun[]>([]);
  const [aiSchedules, setAiSchedules] = useState<AiSchedule[]>([]);
  const [schName, setSchName] = useState('');
  const [schInstruction, setSchInstruction] = useState('');
  const [schAllowSend, setSchAllowSend] = useState(false);
  const [schMode, setSchMode] = useState<'interval' | 'daily'>('interval');
  const [schInterval, setSchInterval] = useState(1440);
  const [schDailyTime, setSchDailyTime] = useState('09:00');
  const [schSaving, setSchSaving] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const loadStats = useCallback(async () => {
    try { const r = await crmApi.callStats(); setStats(r.data.data); } catch { /* noop */ }
    try { const r = await crmApi.leadStats(); setLeadStats(r.data.data); } catch { /* noop */ }
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await crmApi.calls({
        page: p,
        search: search || undefined,
        status: status || undefined,
        disposition: disposition || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(r.data.data || []);
      setPage(p);
      setPages(r.data.pagination?.pages || 1);
      setTotal(r.data.pagination?.total || 0);
    } catch { toast.error('Failed to load calls'); }
    setLoading(false);
  }, [search, status, disposition, from, to]);

  const loadLeads = useCallback(async (p: number) => {
    setLeadsLoading(true);
    try {
      const r = await crmApi.leads({
        page: p, search: search || undefined, dir: leadDir,
        from: leadFrom || undefined, to: leadTo || undefined,
        tag: leadTag || undefined, stage: leadStage || undefined,
        agent: (myList && currentUser?._id) ? currentUser._id : (leadAgents.length ? leadAgents.join(',') : undefined),
        reminder: leadReminder || undefined,
        valueMin: leadValueMin || undefined, valueMax: leadValueMax || undefined,
        callStatus: leadCallStatus || undefined,
        aging: leadAging || undefined,
        closed: tab === 'closed' ? 'true' : undefined,
        sort: leadSort === 'attention' ? 'attention' : leadSort === 'queue' ? 'queue' : undefined,
        sortBy: leadSortBy || undefined,
        sortDir: leadSortBy ? leadSortDir : undefined,
      });
      setLeads(r.data.data || []);
      setLeadPage(p);
      setLeadPages(r.data.pagination?.pages || 1);
      setLeadTotal(r.data.pagination?.total || 0);
    } catch { toast.error('Failed to load leads'); }
    setLeadsLoading(false);
  }, [search, leadDir, leadFrom, leadTo, leadTag, leadStage, leadAgents, leadReminder, leadValueMin, leadValueMax, leadCallStatus, leadAging, myList, currentUser, leadSort, leadSortBy, leadSortDir, tab]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    tagApi.list().then(r => setTags(r.data.data || r.data || [])).catch(() => {});
    teamApi.listAgents().then(r => setAgents(r.data.data || r.data || [])).catch(() => {});
    crmApi.stages().then(r => setStages(r.data.data || [])).catch(() => {});
  }, []);
  // Column preferences (per browser) + ?stage= deep-link from the Stages page.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_LS_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) {
        const v = saved.filter((k: string) => LEAD_COLS.some(c => c.k === k));
        if (!v.includes('callstatus')) v.splice(Math.min(2, v.length), 0, 'callstatus');
        setVisibleCols(v);
      }
    } catch { /* noop */ }
    try {
      const savedOrder = JSON.parse(localStorage.getItem(ORDER_LS_KEY) || 'null');
      if (Array.isArray(savedOrder) && savedOrder.length) {
        const valid = savedOrder.filter((k: string) => ALL_COL_KEYS.includes(k));
        const merged = [...valid, ...ALL_COL_KEYS.filter(k => !valid.includes(k))];
        setColOrder(merged);
      }
    } catch { /* noop */ }
    const sp = new URLSearchParams(window.location.search);
    const st = sp.get('stage'); if (st) setLeadStage(st);
    const tg = sp.get('tag'); if (tg) setLeadTag(tg);
    const fr = sp.get('from'); if (fr) setLeadFrom(fr);
    const to = sp.get('to'); if (to) setLeadTo(to);
    const ag = sp.get('agent'); if (ag) setLeadAgents([ag]);
  }, []);
  const show = useCallback((k: string) => visibleCols.includes(k), [visibleCols]);
  const reorderCol = (from: string, to: string) => {
    if (from === to) return;
    setColOrder(prev => {
      const arr = [...prev];
      const fi = arr.indexOf(from), ti = arr.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      arr.splice(fi, 1);
      arr.splice(arr.indexOf(to) + (ti > fi ? 1 : 0), 0, from);
      try { localStorage.setItem(ORDER_LS_KEY, JSON.stringify(arr)); } catch { /* noop */ }
      return arr;
    });
  };
  const moveCol = (k: string, dir: -1 | 1) => {
    setColOrder(prev => {
      const arr = [...prev];
      const i = arr.indexOf(k), j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      try { localStorage.setItem(ORDER_LS_KEY, JSON.stringify(arr)); } catch { /* noop */ }
      return arr;
    });
  };
  const toggleCol = (k: string) => {
    setVisibleCols(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      try { localStorage.setItem(COLS_LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  useEffect(() => { const t = setTimeout(() => load(1), 350); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setTimeout(() => loadLeads(1), 350); return () => clearTimeout(t); }, [loadLeads]);
  useEffect(() => { setSelectedLeads(new Set()); }, [tab, leadPage]);

  // Load full chat thread when a lead row is expanded
  useEffect(() => {
    if (!expanded) { setChatMsgs([]); setReplyText(''); return; }
    let active = true;
    setChatLoading(true);
    setChatMsgs([]);
    conversationApi.getMessages(expanded, { page: 1, limit: 500 })
      .then(r => { if (active) setChatMsgs(r.data.data || []); })
      .catch(() => { if (active) setChatMsgs([]); })
      .finally(() => { if (active) setChatLoading(false); });
    return () => { active = false; };
  }, [expanded]);

  const sendReply = async (l: LeadRow) => {
    const text = replyText.trim();
    if (!text || replySending) return;
    setReplySending(true);
    try {
      const r = await conversationApi.sendMessage(l.conversationId, { type: 'text', text });
      const msg = r.data.data;
      if (msg?.status === 'failed') { toast.error(msg.errorMessage || 'Failed to send'); }
      else {
        setChatMsgs(prev => prev.some(m => m._id === msg._id) ? prev : [...prev, msg]);
        setReplyText('');
        setLeads(prev => prev.map(x => x.conversationId === l.conversationId
          ? { ...x, lastMessage: { text, at: new Date().toISOString(), direction: 'outbound' } } : x));
      }
    } catch { toast.error('Failed to send message'); }
    setReplySending(false);
  };

  const openCall = (l: LeadRow) => {
    setCallFor(l);
    setCallStatusSel(l.callStatus === 'callback' ? 'callback' : 'called');
    setCallDisposition(l.disposition || '');
    setCallNote('');
    setCallbackAt('');
  };
  const logCall = async () => {
    if (!callFor) return;
    setCallSaving(true);
    try {
      const r = await crmApi.logCall(callFor.contact._id, {
        status: callStatusSel,
        disposition: callDisposition || undefined,
        note: callNote || undefined,
        callbackAt: callStatusSel === 'callback' && callbackAt ? callbackAt : undefined,
      });
      const d = r.data.data;
      setLeads(prev => prev.map(l => l.contact._id === callFor.contact._id
        ? { ...l, callStatus: d.callStatus, lastCalledAt: d.lastCalledAt, disposition: d.disposition } : l));
      toast.success('Call logged');
      setCallFor(null);
      loadLeads(leadPage);
    } catch { toast.error('Failed to log call'); }
    setCallSaving(false);
  };

  const saveComment = async () => {
    if (!commentFor) return;
    setCommentSaving(true);
    try {
      await crmApi.updateLeadComment(commentFor.contact._id, commentText);
      setLeads(prev => prev.map(l => l.contact._id === commentFor.contact._id
        ? { ...l, contact: { ...l.contact, crmComment: commentText } } : l));
      toast.success('Saved');
      setCommentFor(null);
    } catch { toast.error('Failed to save'); }
    setCommentSaving(false);
  };

  const saveRemark = async () => {
    if (!remarkFor) return;
    setRemarkSaving(true);
    try {
      if (remarkFor.followUp) {
        await crmApi.updateFollowup(remarkFor.followUp._id, { contactedRemark: remarkText });
        setLeads(prev => prev.map(l => l.conversationId === remarkFor.conversationId && l.followUp
          ? { ...l, followUp: { ...l.followUp, contacted: true, remark: remarkText } } : l));
      } else {
        const r = await noteApi.create({ contact: remarkFor.contact._id, text: remarkText });
        await noteApi.update(r.data.data._id, { contacted: true, contactedRemark: remarkText });
        const fu = { _id: r.data.data._id, at: '', text: remarkText, contacted: true, remark: remarkText };
        setLeads(prev => prev.map(l => l.conversationId === remarkFor.conversationId ? { ...l, followUp: fu } : l));
      }
      toast.success('Saved');
      setRemarkFor(null);
    } catch { toast.error('Failed to save'); }
    setRemarkSaving(false);
  };

  const saveReminder = async () => {
    if (!reminderFor) return;
    setReminderSaving(true);
    try {
      const remindAt = reminderAt ? new Date(reminderAt).toISOString() : undefined;
      const text = reminderText || 'Follow-up';
      let noteId = reminderFor.followUp?._id;
      if (noteId) {
        await noteApi.update(noteId, { text, remindAt: remindAt || null });
      } else {
        const r = await noteApi.create({ contact: reminderFor.contact._id, text, remindAt });
        noteId = r.data.data._id;
      }
      const fu = { _id: noteId!, at: remindAt || '', text, contacted: reminderFor.followUp?.contacted || false, remark: reminderFor.followUp?.remark || '' };
      setLeads(prev => prev.map(l => l.conversationId === reminderFor.conversationId ? { ...l, followUp: fu } : l));
      toast.success('Reminder saved');
      setReminderFor(null);
    } catch { toast.error('Failed to save'); }
    setReminderSaving(false);
  };

  const doCloseLead = async () => {
    if (!closeFor) return;
    setCloseSaving(true);
    try {
      await crmApi.closeLead(closeFor.contact._id, closeReason);
      setLeads(prev => prev.filter(l => l.conversationId !== closeFor.conversationId));
      toast.success('Lead closed');
      setCloseFor(null);
      loadStats();
    } catch { toast.error('Failed to close'); }
    setCloseSaving(false);
  };

  const doReopenLead = async (l: LeadRow) => {
    try {
      await crmApi.reopenLead(l.contact._id);
      setLeads(prev => prev.filter(x => x.conversationId !== l.conversationId));
      toast.success('Lead reopened');
      loadStats();
    } catch { toast.error('Failed to reopen'); }
  };

  const setLeadStageFor = async (l: LeadRow, stageId: string | null) => {
    setStageSaving(true);
    try {
      await crmApi.setLeadStage(l.contact._id, stageId);
      const st = stageId ? stages.find(s => s._id === stageId) || null : null;
      setLeads(prev => prev.map(x => x.contact._id === l.contact._id ? { ...x, stage: st } : x));
      setStageEditFor(null);
      loadStats();
    } catch { toast.error('Failed to update stage'); }
    setStageSaving(false);
  };

  const openValueEdit = (l: LeadRow) => {
    setValueEditFor(l);
    setValueText(String(l.sales?.value ?? 0));
    setItemsText(String(l.sales?.items ?? 0));
  };

  const saveValueEdit = async () => {
    if (!valueEditFor) return;
    setValueSaving(true);
    try {
      const auto = valueEditFor.sales || { autoValue: 0, autoItems: 0 };
      const v = valueText.trim() === '' ? null : Number(valueText);
      const it = itemsText.trim() === '' ? null : Number(itemsText);
      // Sending null (or a value equal to auto) clears the override — back to orders-auto.
      const value = v === null || v === auto.autoValue ? null : v;
      const items = it === null || it === auto.autoItems ? null : it;
      await crmApi.setLeadValue(valueEditFor.contact._id, { value, items });
      setLeads(prev => prev.map(x => x.contact._id === valueEditFor.contact._id ? {
        ...x,
        sales: {
          ...x.sales,
          value: value != null ? value : x.sales.autoValue,
          items: items != null ? items : x.sales.autoItems,
          valueOverridden: value != null, itemsOverridden: items != null,
        },
      } : x));
      toast.success('Saved');
      setValueEditFor(null);
      loadStats();
    } catch { toast.error('Failed to save'); }
    setValueSaving(false);
  };

  const openSummary = async (l: LeadRow, force = false) => {
    setMsgChoiceFor(null);
    setSummaryFor(l);
    setSummaryLoading(true);
    setSummaryData(null);
    try {
      const r = await crmApi.leadSummary(l.contact._id, force);
      setSummaryData(r.data.data);
      const sc = r.data.data?.score;
      setLeads(prev => prev.map(x => x.contact._id === l.contact._id
        ? { ...x, aiSummary: { score: sc ?? null, at: r.data.data?.at || new Date().toISOString() } } : x));
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to generate summary';
      toast.error(msg);
      setSummaryFor(null);
    }
    setSummaryLoading(false);
  };

  const toggleTag = async (l: LeadRow, tag: TagOpt) => {
    const cur = (l.contact.tags || []);
    const has = cur.some(t => t._id === tag._id);
    const next = has ? cur.filter(t => t._id !== tag._id) : [...cur, tag];
    setTagSaving(true);
    try {
      await contactApi.update(l.contact._id, { tags: next.map(t => t._id) });
      setLeads(prev => prev.map(x => x.contact._id === l.contact._id ? { ...x, contact: { ...x.contact, tags: next } } : x));
      setTagEditFor(prev => prev ? { ...prev, contact: { ...prev.contact, tags: next } } : prev);
      toast.success('Labels updated');
    } catch { toast.error('Failed to update tags'); }
    setTagSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedLeads(prev => prev.size === leads.length && leads.length > 0
      ? new Set()
      : new Set(leads.map(l => l.conversationId)));
  };

  const bulkAddTag = async (tagId: string) => {
    if (!tagId) return;
    const tag = tags.find(t => t._id === tagId);
    if (!tag) return;
    const targets = leads.filter(l => selectedLeads.has(l.conversationId));
    if (!targets.length) return;
    setBulkSaving(true);
    try {
      for (const l of targets) {
        const cur = l.contact.tags || [];
        if (cur.some(t => t._id === tagId)) continue;
        await contactApi.update(l.contact._id, { tags: [...cur, tag].map(t => t._id) });
      }
      toast.success(`Tag added to ${targets.length} lead(s)`);
      setSelectedLeads(new Set());
      loadLeads(leadPage);
    } catch { toast.error('Failed to add tag'); }
    setBulkSaving(false);
  };

  const bulkAssignAgent = async (agentId: string) => {
    if (!agentId) return;
    const targets = leads.filter(l => selectedLeads.has(l.conversationId));
    if (!targets.length) return;
    setBulkSaving(true);
    try {
      for (const l of targets) {
        await conversationApi.assign(l.conversationId, agentId);
      }
      toast.success(`Assigned ${targets.length} lead(s)`);
      setSelectedLeads(new Set());
      loadLeads(leadPage);
    } catch { toast.error('Failed to assign agent'); }
    setBulkSaving(false);
  };

  // Contact ids for the AI to act on: selected leads, else all recent open leads.
  const aiContactIds = (): string[] | undefined => {
    if (!selectedLeads.size) return undefined;
    return leads.filter(l => selectedLeads.has(l.conversationId)).map(l => l.contact._id).filter(Boolean);
  };

  const aiPreview = async () => {
    if (!aiInstruction.trim()) { toast.error('Please enter an instruction'); return; }
    setAiLoading(true); setAiPlan(null);
    try {
      const res = await crmApi.aiAssist({ instruction: aiInstruction.trim(), contactIds: aiContactIds(), dryRun: true, allowSend: aiAllowSend });
      setAiPlan(res.data.data.plan || []);
      if (!(res.data.data.plan || []).length) toast('AI did not find any lead / proposed no action');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'AI request failed';
      toast.error(msg);
    }
    setAiLoading(false);
  };

  const loadAiHistory = () => crmApi.aiHistory().then(r => setAiHistory(r.data.data || [])).catch(() => {});
  const loadAiSchedules = () => crmApi.aiSchedules().then(r => setAiSchedules(r.data.data || [])).catch(() => {});

  const saveSchedule = async () => {
    if (!schInstruction.trim()) { toast.error('Please enter an instruction'); return; }
    setSchSaving(true);
    try {
      await crmApi.createAiSchedule({
        name: schName.trim(), instruction: schInstruction.trim(), allowSend: schAllowSend,
        mode: schMode, intervalMinutes: schInterval, dailyTime: schDailyTime, active: true,
      });
      toast.success('Schedule saved');
      setSchName(''); setSchInstruction(''); setSchAllowSend(false);
      loadAiSchedules();
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save schedule');
    }
    setSchSaving(false);
  };

  const toggleSchedule = async (s: AiSchedule) => {
    try { await crmApi.updateAiSchedule(s._id, { active: !s.active }); loadAiSchedules(); }
    catch { toast.error('Failed to update'); }
  };
  const deleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try { await crmApi.deleteAiSchedule(id); toast.success('Schedule deleted'); loadAiSchedules(); }
    catch { toast.error('Delete failed'); }
  };
  const runScheduleNow = async (id: string) => {
    try {
      const res = await crmApi.runAiSchedule(id);
      const s = res.data.data.summary || {};
      toast.success(`Ran now — ${s.changed || 0} lead(s) updated`);
      loadAiSchedules(); loadLeads(leadPage); loadStats();
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Run failed');
    }
  };

  const aiApply = async () => {
    if (!aiPlan || !aiPlan.length) return;
    setAiApplying(true);
    try {
      const res = await crmApi.aiAssist({ instruction: aiInstruction.trim(), contactIds: aiContactIds(), dryRun: false, allowSend: aiAllowSend, plan: aiPlan });
      const s = res.data.data.summary || {};
      toast.success(`Done — ${s.changed || 0} lead(s) updated${aiAllowSend ? `, ${s.sent || 0} message(s) sent` : ''}`);
      setAiOpen(false); setAiPlan(null); setAiInstruction(''); setAiAllowSend(false);
      setSelectedLeads(new Set());
      loadLeads(leadPage); loadStats();
      tagApi.list().then(r => setTags(r.data.data || r.data || [])).catch(() => {});
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Apply failed';
      toast.error(msg);
    }
    setAiApplying(false);
  };

  const leadStatClick = (label: string) => {
    setSearch('');
    setLeadFrom(''); setLeadTo(''); setLeadReminder('');
    if (label === "Today's Messages") {
      const d = new Date().toISOString().slice(0, 10);
      setLeadFrom(d); setLeadTo(d);
    } else if (label === 'Pending Reminders') {
      setLeadReminder('pending');
    } else if (label === 'Overdue Reminders') {
      setLeadReminder('overdue');
    }
  };

  const statClick = (label: string) => {
    setSearch(''); setDisposition('');
    if (label === "Today's Calls") {
      const d = new Date().toISOString().slice(0, 10);
      setFrom(d); setTo(d); setStatus('');
    } else if (label === 'Completed' || label === 'Avg Duration' || label === 'Total Talk Time') {
      setStatus('completed'); setFrom(''); setTo('');
    } else if (label === 'Failed / Rejected') {
      setStatus('failed'); setFrom(''); setTo('');
    } else {
      setStatus(''); setFrom(''); setTo('');
    }
  };

  const openEdit = (r: CallRow) => {
    setEditRow(r);
    setEdDisp(r.disposition || '');
    setEdNote(r.note || '');
    setEdFu(r.followUpAt ? new Date(r.followUpAt).toISOString().slice(0, 16) : '');
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const r = await crmApi.updateCall(editRow._id, { disposition: edDisp, note: edNote, followUpAt: edFu || null }, editRow.source);
      const u = r.data.data;
      setRows(prev => prev.map(x => x._id === editRow._id ? { ...x, disposition: u.disposition || '', note: u.note || '', followUpAt: u.followUpAt } : x));
      toast.success('Saved');
      setEditRow(null);
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const downloadCsv = (head: string[], lines: string[], name: string) => {
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      if (tab === 'calls') {
        const all: CallRow[] = [];
        for (let p = 1; p <= 200; p++) {
          const r = await crmApi.calls({ page: p, search: search || undefined, status: status || undefined, disposition: disposition || undefined, from: from || undefined, to: to || undefined });
          all.push(...(r.data.data || []));
          if (p >= (r.data.pagination?.pages || 1)) break;
        }
        const head = ['Date', 'Name', 'Phone', 'Direction', 'Status', 'Duration (s)', 'Agent', 'Disposition', 'Note', 'Follow-up', 'Recording'];
        const lines = all.map(r => [
          fmtDate(r.startTime || r.createdAt), r.contact?.name || '', r.phone,
          r.source === 'scheduled' ? 'Scheduled' : r.direction === 'USER_INITIATED' ? 'Incoming' : 'Outgoing',
          r.status, String(r.duration || 0), r.agent?.name || '',
          r.disposition || '', (r.note || '').replace(/[\n,]/g, ' '),
          r.followUpAt ? fmtDate(r.followUpAt) : '', r.recordingUrl || '',
        ].map(v => `"${v.replace(/"/g, '""')}"`).join(','));
        downloadCsv(head, lines, 'call-log');
      } else {
        const all: LeadRow[] = [];
        for (let p = 1; p <= 200; p++) {
          const r = await crmApi.leads({
            page: p, search: search || undefined, dir: leadDir, from: leadFrom || undefined, to: leadTo || undefined,
            tag: leadTag || undefined, stage: leadStage || undefined, agent: leadAgents.length ? leadAgents.join(',') : undefined, reminder: leadReminder || undefined,
            valueMin: leadValueMin || undefined, valueMax: leadValueMax || undefined,
            closed: tab === 'closed' ? 'true' : undefined, sort: leadSort === 'attention' ? 'attention' : undefined,
          });
          all.push(...(r.data.data || []));
          if (p >= (r.data.pagination?.pages || 1)) break;
        }
        const head = ['Name', 'Lead Received', 'Phone', 'Labels', 'Stage', 'Deal Value', 'Items', 'Agent', 'Message', 'Message At', 'Reminder', 'Reminder Note', 'Follow-up Outcome', 'Comments', 'Closed', 'Close Reason'];
        const lines = all.map(l => [
          l.contact.name || '', l.receivedAt ? fmtDate(l.receivedAt) : '', l.contact.phone || '',
          (l.contact.tags || []).map(t => t.name).join('; '),
          l.stage?.name || '',
          l.sales ? String(l.sales.value) : '', l.sales ? String(l.sales.items) : '', l.agent?.name || '',
          (l.lastMessage.text || '').replace(/[\n,]/g, ' '), l.lastMessage.at ? fmtDate(l.lastMessage.at) : '',
          l.followUp?.at ? fmtDate(l.followUp.at) : '', (l.followUp?.text || '').replace(/[\n,]/g, ' '),
          (l.followUp?.remark || '').replace(/[\n,]/g, ' '), (l.contact.crmComment || '').replace(/[\n,]/g, ' '),
          l.closed ? 'Yes' : 'No', l.closeReason || '',
        ].map(v => `"${v.replace(/"/g, '""')}"`).join(','));
        downloadCsv(head, lines, tab === 'closed' ? 'closed-leads' : 'leads');
      }
    } catch { toast.error('Export failed'); }
    setExporting(false);
  };

  const leadStatCards = leadStats ? [
    { label: 'Total Leads', value: leadStats.total, icon: <Users className="w-5 h-5" />, cls: 'text-blue-600 bg-blue-50' },
    { label: "Today's Messages", value: leadStats.today, icon: <MessageCircle className="w-5 h-5" />, cls: 'text-indigo-600 bg-indigo-50' },
    { label: 'Pending Reminders', value: leadStats.pendingReminders, icon: <CalendarClock className="w-5 h-5" />, cls: 'text-amber-600 bg-amber-50' },
    { label: 'Overdue Reminders', value: leadStats.overdueReminders, icon: <XCircle className="w-5 h-5" />, cls: 'text-red-600 bg-red-50' },
    { label: 'Order Value', value: `₹${(leadStats.salesValue || 0).toLocaleString('en-IN')}`, icon: <IndianRupee className="w-5 h-5" />, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Items Ordered', value: (leadStats.salesItems || 0).toLocaleString('en-IN'), icon: <CheckCircle2 className="w-5 h-5" />, cls: 'text-purple-600 bg-purple-50' },
  ] : [];

  const statCards = stats ? [
    { label: 'Total Calls', value: stats.total, icon: <Phone className="w-5 h-5" />, cls: 'text-blue-600 bg-blue-50' },
    { label: "Today's Calls", value: stats.today, icon: <Clock className="w-5 h-5" />, cls: 'text-indigo-600 bg-indigo-50' },
    { label: 'Completed', value: stats.completed, icon: <CheckCircle2 className="w-5 h-5" />, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Failed / Rejected', value: stats.failed, icon: <XCircle className="w-5 h-5" />, cls: 'text-red-600 bg-red-50' },
    { label: 'Avg Duration', value: fmtDur(stats.avgDuration), icon: <Clock className="w-5 h-5" />, cls: 'text-amber-600 bg-amber-50' },
    { label: 'Total Talk Time', value: fmtDur(stats.totalDuration), icon: <Phone className="w-5 h-5" />, cls: 'text-purple-600 bg-purple-50' },
  ] : [];

  // Columns are rendered in the user-defined order (drag/reorder in the Columns menu).
  // 'items' is not a standalone column — it modifies the 'value' cell — so it is excluded here.
  const orderedCols = colOrder.filter(k => k !== 'items' && show(k));

  const cycleSort = (key: string) => {
    if (leadSortBy !== key) { setLeadSortBy(key); setLeadSortDir('asc'); }
    else if (leadSortDir === 'asc') { setLeadSortDir('desc'); }
    else { setLeadSortBy(''); setLeadSortDir('asc'); }
  };
  const sortArrow = (key: string) => (
    <span className={leadSortBy === key ? 'text-emerald-600' : 'text-gray-300'}>{leadSortBy === key ? (leadSortDir === 'asc' ? '↑' : '↓') : '⇅'}</span>
  );
  const sortTh = (k: string, key: string, label: string) => (
    <th key={k} className="p-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-800" onClick={() => cycleSort(key)} title="Sort">
      {label} {sortArrow(key)}
    </th>
  );
  const renderTh = (k: string) => {
    switch (k) {
      case 'contact': return sortTh(k, 'name', 'Contact');
      case 'received': return sortTh(k, 'received', 'Lead Received');
      case 'phone': return sortTh(k, 'phone', 'Phone');
      case 'callstatus': return <th key={k} className="p-3">Call Status</th>;
      case 'labels': return <th key={k} className="p-3">Labels/Product/Services</th>;
      case 'stage': return <th key={k} className="p-3">Stage</th>;
      case 'value': return <th key={k} className="p-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-800" onClick={() => cycleSort('value')} title="Sort">Deal Value{show('items') ? ' · Items' : ''} {sortArrow('value')}</th>;
      case 'agent': return sortTh(k, 'agent', 'Agent');
      case 'message': return <th key={k} className="p-3 cursor-pointer select-none hover:text-gray-800" onClick={() => setLeadDir(d => d === 'desc' ? 'asc' : 'desc')}>Message {leadDir === 'desc' ? '↓' : '↑'}</th>;
      case 'action': return <th key={k} className="p-3">Action</th>;
      case 'reminder': return <th key={k} className="p-3">Reminder</th>;
      case 'outcome': return <th key={k} className="p-3">Follow-up Outcome</th>;
      case 'comments': return <th key={k} className="p-3">Comments</th>;
      case 'close': return <th key={k} className="p-3">{tab === 'closed' ? 'Reopen' : 'Close'}</th>;
      default: return null;
    }
  };

  const renderTd = (k: string, l: LeadRow, isOpen: boolean, cellClamp: string) => {
    switch (k) {
      case 'contact': return <td key={k} className="p-3 font-medium text-gray-900 min-w-[140px]">
        <div className="inline-flex items-center gap-1.5">
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          <span className="break-words">{l.contact.name || l.contact.phone}</span>
        </div>
      </td>;
      case 'received': return <td key={k} className="p-3 whitespace-nowrap text-xs text-gray-600">{l.receivedAt ? fmtDate(l.receivedAt) : '—'}</td>;
      case 'phone': return <td key={k} className="p-3 whitespace-nowrap text-gray-600" onClick={e => e.stopPropagation()}>
        <a href={`tel:${l.contact.phone}`} onClick={() => openCall(l)} className="inline-flex items-center gap-1 text-emerald-700 hover:underline" title="Click to call & log"><Phone className="w-3 h-3" /> {l.contact.phone}</a>
      </td>;
      case 'callstatus': {
        const cs = l.callStatus || '';
        const label = cs === 'called' ? 'Called' : cs === 'callback' ? 'Callback' : 'Not called';
        const cls = cs === 'called' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : cs === 'callback' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200';
        return <td key={k} className="p-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <button onClick={() => openCall(l)} className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${cls}`} title={l.disposition ? `Last: ${l.disposition}` : 'Log a call'}>{label}{l.disposition ? ` \u00b7 ${l.disposition}` : ''}</button>
        </td>;
      }
      case 'labels': return <td key={k} className="p-3 min-w-[120px]">
        <button onClick={e => { e.stopPropagation(); setTagEditFor(l); }} className="text-left flex flex-wrap gap-1 items-center">
          {(l.contact.tags || []).length ? (l.contact.tags || []).map(t => (
            <span key={t._id} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (t.color || '#6b7280') + '22', color: t.color || '#6b7280' }}>{t.name}</span>
          )) : <span className="px-2 py-0.5 rounded-md text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">+ label</span>}
        </button>
      </td>;
      case 'stage': return <td key={k} className="p-3 min-w-[100px]" onClick={e => e.stopPropagation()}>
        <button onClick={() => setStageEditFor(l)} className="text-left">
          {l.stage ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border" style={{ backgroundColor: (l.stage.color || '#8B5CF6') + '18', color: l.stage.color || '#8B5CF6', borderColor: (l.stage.color || '#8B5CF6') + '55' }}>{l.stage.name}</span>
          ) : <span className="px-2 py-0.5 rounded-md text-xs text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100">+ stage</span>}
        </button>
      </td>;
      case 'value': return <td key={k} className="p-3 whitespace-nowrap text-xs" onClick={e => e.stopPropagation()}>
        <button onClick={() => openValueEdit(l)} className="text-left group inline-flex items-center gap-1" title={l.sales?.orders ? `${l.sales.orders} order(s)` : 'No orders — click to set manually'}>
          <span className={l.sales?.valueOverridden ? 'text-blue-700 font-medium' : 'text-gray-700'}>
            {l.sales && (l.sales.value || l.sales.valueOverridden) ? `₹${l.sales.value.toLocaleString('en-IN')}` : '—'}
          </span>
          {show('items') && l.sales && (l.sales.items || l.sales.itemsOverridden) ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${l.sales.itemsOverridden ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{l.sales.items} item{l.sales.items === 1 ? '' : 's'}</span>
          ) : null}
          <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100" />
        </button>
      </td>;
      case 'agent': return <td key={k} className="p-3 whitespace-nowrap text-xs text-gray-600">{l.agent?.name || '—'}</td>;
      case 'message': return <td key={k} className="p-3 text-xs text-gray-600 max-w-[240px]" onClick={e => { e.stopPropagation(); setMsgChoiceFor(l); }}>
        <div className={`${cellClamp} cursor-pointer hover:text-emerald-700`} title="Click for Summary / Full chat">{l.lastMessage.text || '—'}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {l.lastMessage.at && <span className="text-gray-400">{fmtDate(l.lastMessage.at)}</span>}
          {l.aiSummary && l.aiSummary.score != null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${l.aiSummary.score >= 70 ? 'bg-emerald-100 text-emerald-700' : l.aiSummary.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`} title="AI lead score — convert hone ka chance">{l.aiSummary.score}%</span>
          )}
        </div>
      </td>;
      case 'action': return <td key={k} className="p-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
        <button onClick={() => setExpanded(x => x === l.conversationId ? null : l.conversationId)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"><MessageCircle className="w-3.5 h-3.5" /> {isOpen ? 'Hide' : 'Reply'}</button>
      </td>;
      case 'reminder': return <td key={k} className="p-3 text-xs max-w-[180px]">
        {l.followUp && l.followUp.at ? (
          <button onClick={e => { e.stopPropagation(); setReminderFor(l); setReminderText(l.followUp?.text || ''); setReminderAt(l.followUp?.at ? new Date(l.followUp.at).toISOString().slice(0, 16) : ''); }} className="text-left">
            <div className="text-amber-700 inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {fmtDate(l.followUp.at)}</div>
            <div className={`text-gray-600 ${cellClamp}`}>{l.followUp.text}</div>
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); setReminderFor(l); setReminderText(''); setReminderAt(''); }} className="px-2 py-0.5 rounded-md text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">set…</button>
        )}
      </td>;
      case 'outcome': return <td key={k} className="p-3 text-xs max-w-[180px]">
        {l.followUp && l.followUp.contacted && l.followUp.remark ? (
          <button onClick={e => { e.stopPropagation(); setRemarkFor(l); setRemarkText(l.followUp?.remark || ''); }} className="text-left text-gray-700">
            <span className={cellClamp}>{l.followUp.remark}</span>
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); setRemarkFor(l); setRemarkText(l.followUp?.remark || ''); }} className="px-2 py-0.5 rounded-md text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">add…</button>
        )}
      </td>;
      case 'comments': return <td key={k} className="p-3 text-xs max-w-[180px]">
        {l.contact.crmComment ? (
          <button onClick={e => { e.stopPropagation(); setCommentFor(l); setCommentText(l.contact.crmComment || ''); }} className="text-left text-gray-700">
            <span className={cellClamp}>{l.contact.crmComment}</span>
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); setCommentFor(l); setCommentText(''); }} className="px-2 py-0.5 rounded-md text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">add…</button>
        )}
      </td>;
      case 'close': return <td key={k} className="p-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
        {tab === 'closed' ? (
          <button onClick={() => doReopenLead(l)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"><RotateCcw className="w-3.5 h-3.5" /> Reopen</button>
        ) : (
          <button onClick={() => { setCloseFor(l); setCloseReason('lost'); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"><CheckSquare className="w-3.5 h-3.5" /> Close</button>
        )}
      </td>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Report</h1>
          <p className="text-gray-500 text-sm mt-1">All calls in one sheet — track, listen, disposition &amp; follow up</p>
        </div>
        <div className="flex gap-2">
          {tab !== 'calls' && (
            <Button size="sm" icon={<Sparkles className="w-4 h-4" />} onClick={() => { setAiPlan(null); setAiOpen(true); }}>AI Assist</Button>
          )}
          <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={exportCsv} loading={exporting}>Export CSV</Button>
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => { loadStats(); load(page); loadLeads(leadPage); }}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(tab !== 'calls' ? leadStatCards : statCards).map(c => (
          <button key={c.label} onClick={() => tab !== 'calls' ? leadStatClick(c.label) : statClick(c.label)} className="bg-white rounded-xl border p-3 flex items-center gap-3 text-left hover:shadow-md hover:border-emerald-300 transition-all">
            <div className={`p-2 rounded-lg ${c.cls}`}>{c.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">{c.value}</div>
              <div className="text-xs text-gray-500 truncate">{c.label}</div>
            </div>
          </button>
        ))}
      </div>

      {tab !== 'calls' && (leadStats?.stageBreakdown?.length || 0) > 0 && (
        <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 inline-flex items-center gap-1"><Milestone className="w-3.5 h-3.5" /> Stages:</span>
          {(leadStats?.stageBreakdown || []).map(s => (
            <button key={s._id} onClick={() => setLeadStage(x => x === s._id ? '' : s._id)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${leadStage === s._id ? 'ring-2 ring-offset-1' : 'hover:shadow-sm'}`}
              style={{ backgroundColor: (s.color || '#8B5CF6') + '18', color: s.color || '#8B5CF6', borderColor: (s.color || '#8B5CF6') + '55' }}>
              {s.name} · {s.count}
            </button>
          ))}
          <button onClick={() => router.push('/client/stages')} className="text-xs text-gray-400 hover:text-emerald-600 underline ml-auto">Manage stages</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('leads')} className={`px-4 py-2 text-sm rounded-lg font-medium ${tab === 'leads' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" /> Leads Sheet{tab === 'leads' ? ` (${leadTotal})` : ''}</span>
        </button>
        <button onClick={() => setTab('closed')} className={`px-4 py-2 text-sm rounded-lg font-medium ${tab === 'closed' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          <span className="inline-flex items-center gap-1.5"><CheckSquare className="w-4 h-4" /> Closed Leads{tab === 'closed' ? ` (${leadTotal})` : ''}</span>
        </button>
        <button onClick={() => setTab('calls')} className={`px-4 py-2 text-sm rounded-lg font-medium ${tab === 'calls' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          <span className="inline-flex items-center gap-1.5"><Phone className="w-4 h-4" /> Call Log ({total})</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / phone"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {tab !== 'calls' && (<>
        <select value={leadTag} onChange={e => setLeadTag(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">All labels</option>
          {tags.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={leadStage} onChange={e => setLeadStage(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">All stages</option>
          <option value="__none__">No stage</option>
          {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <div className="relative">
          <button type="button" onClick={() => setAgentDropOpen(o => !o)} className="border rounded-lg text-sm py-2 px-2 bg-white min-w-[130px] text-left flex items-center justify-between gap-2">
            <span className="truncate">{leadAgents.length === 0 ? 'All agents' : leadAgents.length === 1 ? (leadAgents[0] === '__none__' ? 'Unassigned' : (agents.find(a => a._id === leadAgents[0])?.name || agents.find(a => a._id === leadAgents[0])?.email || '1 agent')) : `${leadAgents.length} selected`}</span>
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {agentDropOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAgentDropOpen(false)} />
              <div className="absolute z-20 mt-1 w-56 max-h-64 overflow-auto bg-white border rounded-lg shadow-lg py-1">
                <button type="button" onClick={() => setLeadAgents([])} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${leadAgents.length === 0 ? 'text-emerald-600 font-medium' : 'text-gray-700'}`}>All agents</button>
                <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer border-t">
                  <input type="checkbox" checked={leadAgents.includes('__none__')} onChange={() => setLeadAgents(leadAgents.includes('__none__') ? leadAgents.filter(x => x !== '__none__') : [...leadAgents, '__none__'])} className="accent-emerald-600" />
                  <span className="truncate text-gray-500 italic">Unassigned (No agent)</span>
                </label>
                {agents.map(a => {
                  const checked = leadAgents.includes(a._id);
                  return (
                    <label key={a._id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => setLeadAgents(checked ? leadAgents.filter(x => x !== a._id) : [...leadAgents, a._id])} className="accent-emerald-600" />
                      <span className="truncate">{a.name || a.email}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <select value={leadReminder} onChange={e => setLeadReminder(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">Any reminder</option>
          <option value="pending">Has reminder</option>
          <option value="overdue">Overdue reminder</option>
        </select>
        <input type="number" value={leadValueMin} onChange={e => setLeadValueMin(e.target.value)} placeholder="Min ₹" className="border rounded-lg text-sm py-1.5 px-2 w-20" />
        <input type="number" value={leadValueMax} onChange={e => setLeadValueMax(e.target.value)} placeholder="Max ₹" className="border rounded-lg text-sm py-1.5 px-2 w-20" />
        <select value={leadCallStatus} onChange={e => setLeadCallStatus(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">Any call status</option>
          <option value="not_called">Not called yet</option>
          <option value="called">Called</option>
          <option value="callback">Callback</option>
        </select>
        <select value={leadAging} onChange={e => setLeadAging(e.target.value)} className="border rounded-lg text-sm py-2 px-2" title="Uncalled leads older than N days">
          <option value="">Any age</option>
          <option value="1">Aging &gt; 1 day</option>
          <option value="2">Aging &gt; 2 days</option>
          <option value="3">Aging &gt; 3 days</option>
          <option value="7">Aging &gt; 7 days</option>
        </select>
        <button type="button" onClick={() => setMyList(v => !v)} className={`border rounded-lg text-sm py-2 px-3 ${myList ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`} title="Show only leads assigned to me">My Call List</button>
        <select value={leadSort} onChange={e => setLeadSort(e.target.value as 'recent' | 'attention' | 'queue')} className="border rounded-lg text-sm py-2 px-2">
          <option value="recent">Sort: Recent</option>
          <option value="attention">Sort: Needs attention</option>
          <option value="queue">Sort: Next-Call Queue</option>
        </select>
        <input type="date" value={leadFrom} onChange={e => setLeadFrom(e.target.value)} className="border rounded-lg text-sm py-1.5 px-2" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={leadTo} onChange={e => setLeadTo(e.target.value)} className="border rounded-lg text-sm py-1.5 px-2" />
        <div className="relative ml-auto">
          <button type="button" onClick={() => setColMenuOpen(o => !o)} className="border rounded-lg text-sm py-2 px-3 bg-white inline-flex items-center gap-1.5 text-gray-600 hover:bg-gray-50">
            <SlidersHorizontal className="w-4 h-4" /> Columns
          </button>
          {colMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-72 max-h-80 overflow-auto bg-white border rounded-lg shadow-lg py-1">
                <p className="px-3 py-1.5 text-[11px] text-gray-400">Show / hide &amp; reorder columns — drag <GripVertical className="inline w-3 h-3 -mt-0.5" /> or use arrows (saved on this browser)</p>
                {colOrder.filter(k => k !== 'items').map((k, idx, arr) => (
                  <div
                    key={k}
                    draggable
                    onDragStart={() => setDragCol(k)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); if (dragCol) reorderCol(dragCol, k); setDragCol(null); }}
                    onDragEnd={() => setDragCol(null)}
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 ${dragCol === k ? 'opacity-50' : ''}`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 cursor-grab shrink-0" />
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input type="checkbox" checked={visibleCols.includes(k)} onChange={() => toggleCol(k)} className="accent-emerald-600" />
                      <span className="truncate">{COL_LABEL[k] || k}</span>
                    </label>
                    <div className="flex flex-col shrink-0">
                      <button type="button" disabled={idx === 0} onClick={() => moveCol(k, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button type="button" disabled={idx === arr.length - 1} onClick={() => moveCol(k, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                {show('value') && (
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer border-t mt-1 pt-2">
                    <input type="checkbox" checked={visibleCols.includes('items')} onChange={() => toggleCol('items')} className="accent-emerald-600" />
                    <span className="truncate text-gray-500">{COL_LABEL['items']} (shown inside Deal Value)</span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
        </>)}
        {tab === 'calls' && (<>
        <select value={status} onChange={e => setStatus(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">All statuses</option>
          {['completed', 'accepted', 'failed', 'rejected', 'terminated', 'ringing', 'scheduled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={disposition} onChange={e => setDisposition(e.target.value)} className="border rounded-lg text-sm py-2 px-2">
          <option value="">All dispositions</option>
          {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg text-sm py-1.5 px-2" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg text-sm py-1.5 px-2" />
        </>)}
      </div>

      {tab !== 'calls' && selectedLeads.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-emerald-800">{selectedLeads.size} selected</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Add label:</span>
            <select disabled={bulkSaving} value="" onChange={e => { bulkAddTag(e.target.value); e.target.value = ''; }} className="border rounded-lg text-sm py-1.5 px-2 bg-white">
              <option value="">Select label…</option>
              {tags.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Assign agent:</span>
            <select disabled={bulkSaving} value="" onChange={e => { bulkAssignAgent(e.target.value); e.target.value = ''; }} className="border rounded-lg text-sm py-1.5 px-2 bg-white">
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.name || a.email}</option>)}
            </select>
          </div>
          {bulkSaving && <span className="text-xs text-gray-500">Saving…</span>}
          <button onClick={() => setSelectedLeads(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-800 underline">Clear selection</button>
        </div>
      )}

      {tab !== 'calls' && (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3 w-8">
                <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500"
                  checked={leads.length > 0 && selectedLeads.size === leads.length}
                  onChange={toggleSelectAll} onClick={e => e.stopPropagation()} />
              </th>
              {orderedCols.map(renderTh)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {leadsLoading ? (
              <tr><td colSpan={visibleCols.length + 1} className="p-8 text-center text-gray-400">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={visibleCols.length + 1} className="p-8 text-center text-gray-400">No leads found</td></tr>
            ) : leads.map(l => {
              const isOpen = expanded === l.conversationId;
              const cellClamp = isOpen ? 'whitespace-pre-wrap break-words' : 'line-clamp-2';
              const _uncalled = !l.callStatus || l.callStatus === 'not_called';
              const _aged = _uncalled && l.receivedAt ? (Date.now() - new Date(l.receivedAt).getTime()) > 2 * 86400000 : false;
              return (
              <React.Fragment key={l.conversationId}>
              <tr className={`align-top cursor-pointer transition-colors ${isOpen ? 'bg-emerald-50/50' : 'hover:bg-gray-50'} ${selectedLeads.has(l.conversationId) ? 'bg-emerald-50/60' : ''} ${_aged ? 'border-l-4 border-l-red-400' : ''}`} onClick={() => setExpanded(x => x === l.conversationId ? null : l.conversationId)}>
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500"
                    checked={selectedLeads.has(l.conversationId)}
                    onChange={() => toggleSelect(l.conversationId)} />
                </td>
                {orderedCols.map(k => renderTd(k, l, isOpen, cellClamp))}
              </tr>
              {isOpen && (
                <tr className="bg-gray-50">
                  <td colSpan={visibleCols.length + 1} className="p-0">
                    <div className="border-t border-emerald-100">
                      <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
                        <span className="text-xs font-medium text-gray-600 inline-flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-emerald-600" /> Chat with {l.contact.name || l.contact.phone}</span>
                        <button onClick={e => { e.stopPropagation(); router.push(`/client/chat?conv=${l.conversationId}`); }} className="text-xs text-gray-500 hover:text-emerald-700 inline-flex items-center gap-1">Open in Inbox <ExternalLink className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-2 bg-[#efe7dd]" onClick={e => e.stopPropagation()}>
                        {chatLoading ? (
                          <p className="text-xs text-gray-500 text-center py-6">Loading chat…</p>
                        ) : chatMsgs.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-6">No messages yet.</p>
                        ) : chatMsgs.map(m => {
                          const out = m.direction === 'outbound';
                          const body = m.text || m.media?.caption || (m.type !== 'text' ? `[${m.type}]` : '');
                          return (
                            <div key={m._id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${out ? 'bg-emerald-100 text-gray-800' : 'bg-white text-gray-800'}`}>
                                <div className="whitespace-pre-wrap break-words">{body}</div>
                                <div className="text-[10px] text-gray-400 text-right mt-0.5">{m.createdAt ? new Date(m.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}{out && m.status ? ` · ${m.status}` : ''}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 px-4 py-3 bg-white border-t" onClick={e => e.stopPropagation()}>
                        <input value={replyText} onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(l); } }}
                          placeholder="Type a reply…" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                        <button onClick={() => sendReply(l)} disabled={replySending || !replyText.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"><Send className="w-4 h-4" /> {replySending ? 'Sending…' : 'Send'}</button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t text-xs text-gray-500">
          <span>{leadTotal} leads · page {leadPage} / {leadPages}</span>
          <div className="flex gap-2">
            <button disabled={leadPage <= 1} onClick={() => loadLeads(leadPage - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <button disabled={leadPage >= leadPages} onClick={() => loadLeads(leadPage + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      </div>
      )}

      {tab === 'calls' && (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3">Date & Time</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Agent</th>
              <th className="p-3">Recording</th>
              <th className="p-3">Disposition</th>
              <th className="p-3">Note</th>
              <th className="p-3">Follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={11} className="p-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="p-8 text-center text-gray-400">No calls found</td></tr>
            ) : rows.map(r => (
              <tr key={r._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(r)}>
                <td className="p-3 whitespace-nowrap text-xs">{fmtDate(r.startTime || r.createdAt)}</td>
                <td className="p-3">
                  {r.contact ? (
                    <button onClick={e => { e.stopPropagation(); router.push('/client/crm'); }} className="text-emerald-600 hover:underline font-medium">{r.contact.name || r.phone}</button>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="p-3 whitespace-nowrap">{r.phone}</td>
                <td className="p-3">
                  {r.source === 'scheduled'
                    ? <span className="inline-flex items-center gap-1 text-cyan-700 text-xs"><CalendarClock className="w-3 h-3" /> {r.scheduledType === 'human_callback' ? 'Callback' : 'AI Call'}</span>
                    : r.direction === 'USER_INITIATED'
                    ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs"><PhoneIncoming className="w-3 h-3" /> In</span>
                    : <span className="inline-flex items-center gap-1 text-blue-700 text-xs"><PhoneOutgoing className="w-3 h-3" /> Out</span>}
                </td>
                <td className="p-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${statusCls[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span></td>
                <td className="p-3 whitespace-nowrap">{fmtDur(r.duration)}</td>
                <td className="p-3 text-xs">{r.agent?.name || '—'}</td>
                <td className="p-3">
                  {r.recordingUrl
                    ? <a href={r.recordingUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-xs"><PlayCircle className="w-4 h-4" /> Play</a>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="p-3">
                  {r.disposition ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{r.disposition}</span> : <span className="text-gray-300 text-xs">set…</span>}
                </td>
                <td className="p-3 text-xs text-gray-600 max-w-[160px] truncate">{r.note || '—'}</td>
                <td className="p-3 whitespace-nowrap text-xs">
                  {r.followUpAt ? <span className="inline-flex items-center gap-1 text-amber-700"><CalendarClock className="w-3 h-3" /> {fmtDate(r.followUpAt)}</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t text-xs text-gray-500">
          <span>{total} calls · page {page} / {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      </div>
      )}

      <Modal isOpen={!!remarkFor} onClose={() => setRemarkFor(null)} size="sm"
        title={remarkFor ? `Follow-up Outcome — ${remarkFor.contact.name || remarkFor.contact.phone}` : ''}>
        {remarkFor && (
          <div className="space-y-3">
            {remarkFor.followUp && (
              <div className="text-xs text-gray-500">Reminder: {fmtDate(remarkFor.followUp.at)} · {remarkFor.followUp.text}</div>
            )}
            <textarea value={remarkText} onChange={e => setRemarkText(e.target.value)} rows={3} autoFocus
              className="w-full border rounded-lg text-sm p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="What was discussed…" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRemarkFor(null)}>Cancel</Button>
              <Button size="sm" onClick={saveRemark} loading={remarkSaving} disabled={!remarkText.trim()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!reminderFor} onClose={() => setReminderFor(null)} size="sm"
        title={reminderFor ? `Reminder — ${reminderFor.contact.name || reminderFor.contact.phone}` : ''}>
        {reminderFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Syncs with this contact&apos;s Notes &amp; Reminders in chat.</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Remind at</label>
              <input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)}
                className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">What to do</label>
              <textarea value={reminderText} onChange={e => setReminderText(e.target.value)} rows={2} autoFocus
                className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Call back about pricing…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReminderFor(null)}>Cancel</Button>
              <Button size="sm" onClick={saveReminder} loading={reminderSaving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!callFor} onClose={() => setCallFor(null)} size="sm"
        title={callFor ? `Log Call \u2014 ${callFor.contact.name || callFor.contact.phone}` : ''}>
        {callFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Marks this lead as called and saves the outcome in Notes.</p>
            <div className="grid grid-cols-3 gap-2">
              {[['called', 'Called'], ['callback', 'Callback'], ['not_called', 'Not called']].map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setCallStatusSel(v)} className={`text-xs py-1.5 rounded-lg border ${callStatusSel === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{lbl}</button>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Disposition</label>
              <select value={callDisposition} onChange={e => setCallDisposition(e.target.value)} className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">—</option>
                {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {callStatusSel === 'callback' && (
              <div>
                <label className="text-xs font-medium text-gray-600">Callback at</label>
                <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)} className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">Note (optional)</label>
              <textarea value={callNote} onChange={e => setCallNote(e.target.value)} rows={2} className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="What happened on the call…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCallFor(null)}>Cancel</Button>
              <Button size="sm" onClick={logCall} loading={callSaving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!closeFor} onClose={() => setCloseFor(null)} size="sm"
        title={closeFor ? `Close Lead — ${closeFor.contact.name || closeFor.contact.phone}` : ''}>
        {closeFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">The lead moves to Closed Leads. It re-opens automatically if the customer messages again.</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Reason</label>
              <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {CLOSE_REASONS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCloseFor(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={doCloseLead} loading={closeSaving}>Close Lead</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!tagEditFor} onClose={() => setTagEditFor(null)} guard={false} size="sm"
        title={tagEditFor ? `Labels/Product/Services — ${tagEditFor.contact.name || tagEditFor.contact.phone}` : ''}>
        {tagEditFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Same labels as chat — changes sync both ways.</p>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {tags.length === 0 && <span className="text-xs text-gray-400">No labels created yet.</span>}
              {tags.map(t => {
                const on = (tagEditFor.contact.tags || []).some(x => x._id === t._id);
                return (
                  <button key={t._id} disabled={tagSaving} onClick={() => toggleTag(tagEditFor, t)}
                    className={`text-xs px-2 py-1 rounded-full border ${on ? 'ring-2 ring-offset-1' : 'opacity-60'}`}
                    style={{ backgroundColor: (t.color || '#6b7280') + '22', color: t.color || '#6b7280', borderColor: t.color || '#6b7280' }}>
                    {on ? '✓ ' : ''}{t.name}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setTagEditFor(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!commentFor} onClose={() => setCommentFor(null)} size="sm"
        title={commentFor ? `Comments — ${commentFor.contact.name || commentFor.contact.phone}` : ''}>
        {commentFor && (
          <div className="space-y-3">
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} autoFocus
              className="w-full border rounded-lg text-sm p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Agent comments about this lead…" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCommentFor(null)}>Cancel</Button>
              <Button size="sm" onClick={saveComment} loading={commentSaving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editRow} onClose={() => setEditRow(null)} size="sm"
        title={editRow ? `Manage Call — ${editRow.contact?.name || editRow.phone}` : ''}>
        {editRow && (
          <div className="space-y-3">
            <div className="text-xs text-gray-500">{fmtDate(editRow.startTime || editRow.createdAt)} · {editRow.status} · {fmtDur(editRow.duration)}</div>
            {editRow.recordingUrl && <audio controls src={editRow.recordingUrl} className="w-full" />}
            <div>
              <label className="text-xs font-medium text-gray-600">Disposition</label>
              <select value={edDisp} onChange={e => setEdDisp(e.target.value)} className="w-full border rounded-lg text-sm py-2 px-2 mt-1">
                <option value="">— none —</option>
                {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Note (what was discussed / next action)</label>
              <textarea value={edNote} onChange={e => setEdNote(e.target.value)} rows={3}
                className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="What happened on this call…" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Follow-up reminder (optional)</label>
              <input type="datetime-local" value={edFu} onChange={e => setEdFu(e.target.value)} className="w-full border rounded-lg text-sm py-2 px-2 mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="sm" onClick={saveEdit} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!stageEditFor} onClose={() => setStageEditFor(null)} guard={false} size="sm"
        title={stageEditFor ? `Stage — ${stageEditFor.contact.name || stageEditFor.contact.phone}` : ''}>
        {stageEditFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Ek lead par ek hi stage rehti hai — same stage in chat too.</p>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {stages.length === 0 && (
                <span className="text-xs text-gray-400">No stages yet — <button onClick={() => router.push('/client/stages')} className="underline text-emerald-600">create stages</button> first.</span>
              )}
              {stages.map(s => {
                const on = stageEditFor.stage?._id === s._id;
                return (
                  <button key={s._id} disabled={stageSaving} onClick={() => setLeadStageFor(stageEditFor, on ? null : s._id)}
                    className={`text-xs px-2 py-1 rounded-full border ${on ? 'ring-2 ring-offset-1' : 'opacity-60'}`}
                    style={{ backgroundColor: (s.color || '#8B5CF6') + '22', color: s.color || '#8B5CF6', borderColor: s.color || '#8B5CF6' }}>
                    {on ? '✓ ' : ''}{s.name}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between">
              {stageEditFor.stage ? (
                <button disabled={stageSaving} onClick={() => setLeadStageFor(stageEditFor, null)} className="text-xs text-gray-400 hover:text-red-500 underline">Clear stage</button>
              ) : <span />}
              <Button variant="outline" size="sm" onClick={() => setStageEditFor(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!valueEditFor} onClose={() => setValueEditFor(null)} size="sm"
        title={valueEditFor ? `Deal Value & Items — ${valueEditFor.contact.name || valueEditFor.contact.phone}` : ''}>
        {valueEditFor && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Orders se auto: ₹{(valueEditFor.sales?.autoValue || 0).toLocaleString('en-IN')} · {valueEditFor.sales?.autoItems || 0} item(s) ({valueEditFor.sales?.orders || 0} order). Galat ho to yahan sahi karo — auto value hi rakhni ho to wahi chhod do.
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600">Deal Value (₹)</label>
              <input type="number" min={0} value={valueText} onChange={e => setValueText(e.target.value)}
                className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Item Count</label>
              <input type="number" min={0} value={itemsText} onChange={e => setItemsText(e.target.value)}
                className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div className="flex justify-between items-center pt-1">
              <button onClick={() => { setValueText(String(valueEditFor.sales?.autoValue || 0)); setItemsText(String(valueEditFor.sales?.autoItems || 0)); }}
                className="text-xs text-gray-400 hover:text-emerald-600 underline">Reset to auto (orders)</button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setValueEditFor(null)}>Cancel</Button>
                <Button size="sm" onClick={saveValueEdit} loading={valueSaving}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!msgChoiceFor} onClose={() => setMsgChoiceFor(null)} guard={false} size="sm"
        title={msgChoiceFor ? `Message — ${msgChoiceFor.contact.name || msgChoiceFor.contact.phone}` : ''}>
        {msgChoiceFor && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => openSummary(msgChoiceFor)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-violet-100 bg-violet-50/50 hover:border-violet-300 hover:shadow-md transition-all">
              <Sparkles className="w-6 h-6 text-violet-600" />
              <span className="text-sm font-semibold text-gray-800">Summary</span>
              <span className="text-[11px] text-gray-500 text-center">AI chat summary + lead score % (convert chance)</span>
            </button>
            <button onClick={() => { setExpanded(msgChoiceFor.conversationId); setMsgChoiceFor(null); }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/50 hover:border-emerald-300 hover:shadow-md transition-all">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
              <span className="text-sm font-semibold text-gray-800">Full chat</span>
              <span className="text-[11px] text-gray-500 text-center">Poori chat kholo aur reply karo</span>
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!summaryFor} onClose={() => { setSummaryFor(null); setSummaryData(null); }} guard={false} size="md"
        title={summaryFor ? `AI Summary — ${summaryFor.contact.name || summaryFor.contact.phone}` : ''}>
        {summaryFor && (
          <div className="space-y-3">
            {summaryLoading ? (
              <div className="py-10 text-center text-sm text-gray-500">
                <Sparkles className="w-6 h-6 text-violet-500 mx-auto mb-2 animate-pulse" />
                AI chat padh raha hai…
              </div>
            ) : summaryData ? (
              <>
                <div className="rounded-xl border p-3 bg-gradient-to-r from-violet-50 to-emerald-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">Lead Score — convert hone ka chance</span>
                    <span className={`text-lg font-bold ${((summaryData.score ?? 0) >= 70) ? 'text-emerald-600' : ((summaryData.score ?? 0) >= 40) ? 'text-amber-600' : 'text-gray-500'}`}>{summaryData.score ?? 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white overflow-hidden border">
                    <div className={`h-full rounded-full ${((summaryData.score ?? 0) >= 70) ? 'bg-emerald-500' : ((summaryData.score ?? 0) >= 40) ? 'bg-amber-500' : 'bg-gray-400'}`} style={{ width: `${summaryData.score ?? 0}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">AI estimate hai — guarantee nahi.</p>
                </div>
                <div className="rounded-xl border p-3 bg-white max-h-64 overflow-y-auto">
                  <div className="text-xs font-semibold text-gray-600 mb-1 inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Chat Summary</div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{summaryData.summary}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">{summaryData.cached ? 'Cached' : 'Fresh'} · {summaryData.at ? fmtDate(summaryData.at) : ''}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openSummary(summaryFor, true)} loading={summaryLoading}>Refresh</Button>
                    <Button variant="outline" size="sm" onClick={() => { setExpanded(summaryFor.conversationId); setSummaryFor(null); setSummaryData(null); }}>Full chat</Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal isOpen={aiOpen} onClose={() => { setAiOpen(false); setAiPlan(null); }} guard={false} size="lg"
        title="AI Assist — run an instruction on your leads">
        <div className="space-y-3">
          <div className="flex gap-1 border-b">
            {([['run', 'Run'], ['history', 'History'], ['schedule', 'Schedule']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => { setAiTab(k); if (k === 'history') loadAiHistory(); if (k === 'schedule') loadAiSchedules(); }}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${aiTab === k ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{lbl}</button>
            ))}
          </div>

          {aiTab === 'run' && (<>
          <p className="text-xs text-gray-500">
            {selectedLeads.size > 0
              ? `Will run on ${selectedLeads.size} selected lead(s).`
              : 'No lead selected — will run on recent open leads (max 60). Select specific leads first to target them.'}
          </p>
          <div>
            <label className="text-xs font-medium text-gray-600">Instruction (AI reads each chat and does this)</label>
            <textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} rows={3}
              className="w-full border rounded-lg text-sm p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder='e.g. "Set stage to Interested for anyone who asked for a demo and label them WABA Panel NodeJS (Premium)" / "Send the demo link to these leads"' />
            <p className="text-[11px] text-gray-400 mt-1">AI can update: Labels/Product/Services, Stage, Deal Value · Items, Agent.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={aiAllowSend} onChange={e => setAiAllowSend(e.target.checked)} />
            Let AI send WhatsApp messages to leads (sends only after you Apply the preview)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={aiPreview} loading={aiLoading}>Preview</Button>
          </div>

          {aiPlan && (
            <div className="border rounded-lg max-h-80 overflow-auto">
              {aiPlan.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No action proposed.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-500">
                    <th className="p-2">Lead</th><th className="p-2">Proposed changes</th>
                  </tr></thead>
                  <tbody>
                    {aiPlan.map(r => {
                      const empty = !r.tags_add.length && !r.tags_remove.length && !r.comment && r.followup_days == null && !r.close_reason && !r.message && !r.stage && r.value == null && r.items == null && !r.agent;
                      return (
                      <tr key={r.contactId} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap font-medium text-gray-800">{r.name || r.phone}</td>
                        <td className="p-2 space-y-0.5">
                          {r.stage && <div><b>stage:</b> {r.stage}</div>}
                          {r.tags_add.length > 0 && <div><b>+labels:</b> {r.tags_add.join(', ')}</div>}
                          {r.tags_remove.length > 0 && <div><b>-labels:</b> {r.tags_remove.join(', ')}</div>}
                          {r.value != null && <div><b>deal value:</b> ₹{r.value}</div>}
                          {r.items != null && <div><b>items:</b> {r.items}</div>}
                          {r.agent && <div><b>agent:</b> {r.agent}</div>}
                          {r.comment && <div><b>comment:</b> {r.comment}</div>}
                          {r.followup_days != null && <div><b>follow-up:</b> +{r.followup_days}d {r.followup_text ? `(${r.followup_text})` : ''}</div>}
                          {r.close_reason && <div><b>close:</b> {r.close_reason}</div>}
                          {r.message && <div className={aiAllowSend ? 'text-emerald-700' : 'text-gray-400'}><b>message{aiAllowSend ? '' : ' (send OFF)'}:</b> {r.message}</div>}
                          {r.reason && <div className="text-gray-400">— {r.reason}</div>}
                          {empty && <span className="text-gray-400">no change</span>}
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => { setAiOpen(false); setAiPlan(null); }}>Cancel</Button>
            <Button size="sm" onClick={aiApply} loading={aiApplying} disabled={!aiPlan || aiPlan.length === 0}>
              Apply{aiAllowSend ? ' & Send' : ''}
            </Button>
          </div>
          </>)}

          {aiTab === 'history' && (
            <div className="border rounded-lg max-h-96 overflow-auto">
              {aiHistory.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No prompts run yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-500">
                    <th className="p-2">When</th><th className="p-2">Prompt</th><th className="p-2">Result</th>
                  </tr></thead>
                  <tbody>
                    {aiHistory.map(h => (
                      <tr key={h._id} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap text-gray-600">{new Date(h.createdAt).toLocaleString()}<div className="text-[10px] text-gray-400">{h.source === 'schedule' ? 'scheduled' : 'manual'}</div></td>
                        <td className="p-2 text-gray-800 max-w-xs">{h.instruction}</td>
                        <td className="p-2 whitespace-nowrap text-gray-600">{h.changed}/{h.leads} updated{h.sent ? `, ${h.sent} sent` : ''}{h.sendFailed ? `, ${h.sendFailed} failed` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {aiTab === 'schedule' && (<div className="space-y-3">
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="text-sm font-semibold text-gray-700">New scheduled prompt</div>
              <input value={schName} onChange={e => setSchName(e.target.value)} placeholder="Name (optional)"
                className="w-full border rounded-lg text-sm p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <textarea value={schInstruction} onChange={e => setSchInstruction(e.target.value)} rows={2}
                placeholder='Instruction to auto-run, e.g. "Re-check every lead and update its Stage from the latest chat"'
                className="w-full border rounded-lg text-sm p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex flex-wrap items-center gap-2">
                <select value={schMode} onChange={e => setSchMode(e.target.value as 'interval' | 'daily')} className="border rounded-lg text-sm p-2">
                  <option value="interval">Every…</option>
                  <option value="daily">Daily at time</option>
                </select>
                {schMode === 'interval' ? (
                  <select value={schInterval} onChange={e => setSchInterval(Number(e.target.value))} className="border rounded-lg text-sm p-2">
                    <option value={1}>1 minute</option>
                    <option value={60}>1 hour</option>
                    <option value={1440}>24 hours</option>
                    <option value={10080}>7 days</option>
                  </select>
                ) : (
                  <input type="time" value={schDailyTime} onChange={e => setSchDailyTime(e.target.value)} className="border rounded-lg text-sm p-2" />
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={schAllowSend} onChange={e => setSchAllowSend(e.target.checked)} /> allow messages
                </label>
                <Button size="sm" onClick={saveSchedule} loading={schSaving}>Save schedule</Button>
              </div>
              {schMode === 'interval' && schInterval === 1 && <p className="text-[11px] text-amber-600">Every-minute runs use a lot of AI tokens — use only for testing.</p>}
            </div>
            <div className="border rounded-lg max-h-72 overflow-auto">
              {aiSchedules.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No schedules yet.</div>
              ) : aiSchedules.map(s => (
                <div key={s._id} className="border-t first:border-t-0 p-2 flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{s.name || s.instruction}</div>
                    {s.name && <div className="text-gray-500 truncate">{s.instruction}</div>}
                    <div className="text-gray-400 mt-0.5">
                      {s.mode === 'daily' ? `Daily at ${s.dailyTime}` : `Every ${s.intervalMinutes === 60 ? '1 hour' : s.intervalMinutes === 1440 ? '24 hours' : s.intervalMinutes === 10080 ? '7 days' : s.intervalMinutes + ' min'}`}
                      {s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString()}` : ''}
                      {s.lastSummary ? ` · last ${s.lastSummary.changed}/${s.lastSummary.leads}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => runScheduleNow(s._id)} className="text-emerald-600 hover:underline">Run now</button>
                    <button onClick={() => toggleSchedule(s)} className={s.active ? 'text-amber-600 hover:underline' : 'text-gray-500 hover:underline'}>{s.active ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => deleteSchedule(s._id)} className="text-red-600 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>)}
        </div>
      </Modal>
    </div>
  );
}
