'use client';
import { useSearchParams } from 'next/navigation';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, Paperclip, Smile, Reply,
  Sticker as StickerIcon,
  CheckCheck, Check, Clock, AlertCircle, Image as ImageIcon, FileText,
  MessageSquare, X, UserPlus, Video, Mic, Phone, PhoneCall,
  Zap, LayoutTemplate, ClipboardList, Bot, Check as CheckIcon, PiggyBank, Plus,
  Download , StickyNote, Trash2, Bell, Pencil, IndianRupee, Tag as TagIcon, Share2, Calendar, ShoppingBag, CheckSquare, Mail, GitBranch, MapPin, Pin,
} from 'lucide-react';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import useBranding from '@/lib/useBranding';
import { conversationApi, teamApi, noteApi, paymentLinkApi, formApi, tagApi, contactApi, catalogApi, integrationApi, workspaceApi, waqrApi, pipelineApi, aiSettingsApi, crmApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import api from '@/lib/api';
import { useCall } from '@/contexts/CallProvider';
import { getSocket, joinConversation, leaveConversation, emitTyping } from '@/lib/socket';
import type { Conversation, Message } from '@/types';
import Badge from '@/components/ui/Badge';
import ImageUploadInput from '@/components/ui/ImageUploadInput';
import toast from 'react-hot-toast';

interface ChatTemplate {
  _id: string; name: string; category?: string; body: string; status?: string; language?: string;
  footer?: string;
  header?: { type?: string; content?: string; mediaUrl?: string };
  buttons?: Array<{ type?: string; text: string }>;
}

function WindowTimer({ messages, channel }: { messages: Message[]; channel: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  if (channel !== 'whatsapp') return null;
  let lastInbound = 0;
  for (const m of messages) { if (m.direction === 'inbound') { const t = new Date(m.createdAt).getTime(); if (t > lastInbound) lastInbound = t; } }
  if (!lastInbound) return null;
  const left = lastInbound + 24 * 60 * 60 * 1000 - now;
  if (left <= 0) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 whitespace-nowrap" title="24-hour window closed — only approved templates can be sent now">⏱ Window closed — template only</span>;
  const h = Math.floor(left / 3600000), mn = Math.floor((left % 3600000) / 60000);
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 whitespace-nowrap" title="Time left in the WhatsApp 24-hour customer service window — free-form messages allowed until it closes">⏱ Closes in {h}h {mn}m</span>;
}

const getContactName = (conv: Conversation): string => {
  if (!conv?.contact) return 'Unknown';
  if (typeof conv.contact === 'string') return 'Unknown';
  return conv.contact.name || conv.contact.profileName || conv.contact.phone || conv.contact.email || 'Unknown';
};

const getContactPhone = (conv: Conversation): string => {
  if (!conv?.contact) return '';
  if (typeof conv.contact === 'string') return '';
  return conv.contact.phone || '';
};

// Facebook/Instagram give a page-scoped user ID (PSID/IGSID), not a phone
// number. Show a friendly label there instead of the raw numeric ID.
const getContactSubtitle = (conv: Conversation): string => {
  const channel = (conv as unknown as { channel?: string })?.channel || 'whatsapp';
  if (channel === 'facebook') return 'Facebook user';
  if (channel === 'instagram') return 'Instagram user';
  return getContactPhone(conv);
};

const getContactId = (conv: Conversation): string => {
  if (!conv?.contact) return '';
  if (typeof conv.contact === 'string') return conv.contact;
  return (conv.contact as { _id?: string })._id || '';
};

const getContactAvatar = (conv: Conversation): string => {
  if (!conv?.contact || typeof conv.contact === 'string') return '';
  return (conv.contact as { avatar?: string }).avatar || '';
};

// Shows the customer's WhatsApp profile photo (DP) when available (Web/QR),
// otherwise the name initial. Broken/expired photo URLs fall back gracefully.
const ContactAvatar = ({ conv, gradient = false, size = 40 }: { conv: Conversation; gradient?: boolean; size?: number }) => {
  const [err, setErr] = useState(false);
  const url = getContactAvatar(conv);
  const dim = { width: size, height: size };
  if (url && !err) {
    return <img src={url} alt="" onError={() => setErr(true)} style={dim} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div style={dim} className={`rounded-full flex items-center justify-center shrink-0 ${gradient ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-semibold text-sm shadow-sm' : 'bg-emerald-100 text-emerald-700 font-medium'}`}>
      {getContactInitial(conv)}
    </div>
  );
};

const getContactInitial = (conv: Conversation): string => {
  const name = getContactName(conv);
  return name.charAt(0).toUpperCase();
};

function ChatPageInner() {
  const brand = useBranding();
  const { startCall, active: callActive } = useCall();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  // On touch devices the on-screen keyboard's Enter must insert a newline (like
  // WhatsApp) and send only via the Send button; on desktop Enter still sends.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== 'undefined'
      && (('ontouchstart' in window) || window.matchMedia('(pointer: coarse)').matches));
  }, []);
  const searchParams = useSearchParams();
  const channelFilter = searchParams.get('channel') || 'all';
  const { currentWorkspace, user } = useAuthStore();
  const [channelConn, setChannelConn] = useState<Record<string, boolean> | null>(null);
  // Global auto-AI (AI Chatbot Settings). Used so the per-chat "Chat AI" pill
  // reflects the effective state: ON when global AI applies, unless manually disabled.
  const [globalAiOn, setGlobalAiOn] = useState(false);
  useEffect(() => {
    aiSettingsApi.get().then(res => {
      const s = res.data.data || {};
      setGlobalAiOn(!!s.enabled && !!s.apiKey);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!currentWorkspace) return;
    workspaceApi.get(currentWorkspace._id).then(res => {
      const w = res.data.data || {};
      setChannelConn({
        whatsapp: !!w?.whatsapp?.isConnected,
        whatsapp_qr: !!w?.waQr?.enabled,
        facebook: !!w?.metaChat?.fbEnabled && !!w?.metaChat?.pageAccessToken,
        instagram: !!w?.metaChat?.igEnabled && !!w?.metaChat?.igAccountId,
        telegram: !!w?.telegram?.enabled && !!w?.telegram?.botToken,
        telegram_personal: !!w?.tgPersonal?.enabled,
        email: !!w?.emailChannel?.enabled && !!w?.emailChannel?.user,
      });
    }).catch(() => {});
  }, [currentWorkspace]);
  const CHANNEL_META: Record<string, { label: string; href: string }> = {
    whatsapp: { label: 'WhatsApp Business API', href: '/client/whatsapp' },
    whatsapp_qr: { label: 'WhatsApp by QR', href: '/client/channels' },
    facebook: { label: 'Facebook Messenger', href: '/client/channels' },
    instagram: { label: 'Instagram DM', href: '/client/channels' },
    telegram: { label: 'Telegram Bot', href: '/client/channels' },
    telegram_personal: { label: 'Personal Telegram', href: '/client/channels' },
    email: { label: 'Email Inbox', href: '/client/channels' },
  };
  const notConnected = channelFilter !== 'all' && channelConn !== null && channelConn[channelFilter] === false;
  const [qrNewMsg, setQrNewMsg] = useState(false);
  const [qrNewPhone, setQrNewPhone] = useState('');
  const [qrNewText, setQrNewText] = useState('');
  const [qrNewSending, setQrNewSending] = useState(false);
  const [tgNewMsg, setTgNewMsg] = useState(false);
  const [tgNewPhone, setTgNewPhone] = useState('');
  const [tgNewText, setTgNewText] = useState('');
  const [tgNewSending, setTgNewSending] = useState(false);


  const deepLinkConv = searchParams.get('conv');
  const deepLinkDraft = searchParams.get('draft');
  const deepLinkHandled = useRef(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presets, setPresets] = useState<Array<{_id: string; name: string; body: string}>>([]);
  const [respResources, setRespResources] = useState<Array<{_id: string; title: string; content: string; category: string; shortcut: string}>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgResults, setMsgResults] = useState<{ _id: string; text: string; direction: string; createdAt: string; conversation: string; contact?: { name?: string; phone?: string } }[]>([]);

  useEffect(() => {
    if (searchQuery.trim().length < 3) { setMsgResults([]); return; }
    const t = setTimeout(() => {
      conversationApi.searchMessages(searchQuery.trim())
        .then(r => setMsgResults(r.data.data || []))
        .catch(() => setMsgResults([]));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Server-side conversation search: the sidebar only has a page of chats
  // loaded, so ask the server so any chat can be found without scrolling.
  const [searchConvs, setSearchConvs] = useState<Conversation[] | null>(null);
  const [searchingConvs, setSearchingConvs] = useState(false);
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchConvs(null); return; }
    const t = setTimeout(async () => {
      setSearchingConvs(true);
      try {
        const r = await conversationApi.list({ search: q, channel: channelFilter !== 'all' ? channelFilter : undefined, limit: 50 });
        setSearchConvs(r.data.data || []);
      } catch { setSearchConvs(null); }
      setSearchingConvs(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, channelFilter]);

  const [filter, setFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'unread'>('newest');
  const [leadFilter, setLeadFilter] = useState('all');
  const [allTags, setAllTags] = useState<{ _id: string; name: string; color?: string }[]>([]);
  const [labelFilter, setLabelFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [labelMenu, setLabelMenu] = useState(false);
  const [labelMenuPos, setLabelMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const labelMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!labelMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (labelMenuRef.current && !labelMenuRef.current.contains(e.target as Node)) setLabelMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [labelMenu]);
  useEffect(() => { tagApi.list().then(r => setAllTags(r.data.data || [])).catch(() => {}); }, []);

  const [allStages, setAllStages] = useState<{ _id: string; name: string; color?: string }[]>([]);
  const [stageMenu, setStageMenu] = useState(false);
  const [stageMenuPos, setStageMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const stageMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stageMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (stageMenuRef.current && !stageMenuRef.current.contains(e.target as Node)) setStageMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [stageMenu]);
  useEffect(() => { crmApi.stages().then(r => setAllStages(r.data.data || [])).catch(() => {}); }, []);

  const getContactStageId = (conv: Conversation): string => {
    if (!conv?.contact || typeof conv.contact === 'string') return '';
    const s = (conv.contact as unknown as { stage?: string | { _id: string } }).stage;
    if (!s) return '';
    return typeof s === 'string' ? s : String(s._id || '');
  };

  // A contact can be in multiple stages. Prefer the `stages` array; fall back to
  // the single `stage` for older data that predates multi-stage.
  const getContactStageIds = (conv: Conversation): string[] => {
    if (!conv?.contact || typeof conv.contact === 'string') return [];
    const arr = (conv.contact as unknown as { stages?: (string | { _id?: string })[] }).stages;
    const ids = Array.isArray(arr)
      ? arr.map(s => (typeof s === 'string' ? s : String(s?._id || ''))).filter(Boolean)
      : [];
    if (ids.length) return Array.from(new Set(ids));
    const single = getContactStageId(conv);
    return single ? [single] : [];
  };

  const getContactStages = (conv: Conversation): { _id: string; name: string; color?: string }[] => {
    return getContactStageIds(conv)
      .map(id => allStages.find(x => x._id === id))
      .filter((s): s is { _id: string; name: string; color?: string } => !!s);
  };

  const applyContactStages = async (ids: string[]) => {
    if (!selectedConv || typeof selectedConv.contact === 'string') return;
    const contact = selectedConv.contact;
    const prevConv = selectedConv;
    const stageObjs = allStages.filter(s => ids.includes(s._id));
    const updConv = { ...selectedConv, contact: { ...contact, stages: stageObjs, stage: stageObjs[0] || null } } as unknown as Conversation;
    setSelectedConv(updConv);
    setConversations(prev => prev.map(c => c._id === prevConv._id ? updConv : c));
    try {
      await crmApi.setLeadStages(contact._id, ids);
      toast.success(ids.length ? `Stages: ${stageObjs.map(s => s.name).join(', ')}` : 'Stage cleared');
    } catch {
      setSelectedConv(prevConv);
      setConversations(prev => prev.map(c => c._id === prevConv._id ? prevConv : c));
      toast.error('Failed to update stage');
    }
  };

  const toggleContactStage = (stageId: string) => {
    if (!selectedConv) return;
    const current = getContactStageIds(selectedConv);
    const next = current.includes(stageId) ? current.filter(id => id !== stageId) : [...current, stageId];
    applyContactStages(next);
  };

  const getContactTags = (conv: Conversation): { _id: string; name: string; color?: string }[] => {
    if (!conv?.contact || typeof conv.contact === 'string') return [];
    return ((conv.contact.tags || []) as unknown as { _id: string; name: string; color?: string }[]).filter(t => t && typeof t === 'object');
  };

  const getContactBadges = (conv: Conversation): { _id: string; name: string; color?: string }[] => {
    if (!conv?.contact || typeof conv.contact === 'string') return [];
    return (((conv.contact as unknown as { badges?: unknown }).badges || []) as { _id: string; name: string; color?: string }[]).filter(b => b && typeof b === 'object');
  };

  const toggleContactLabel = async (tagId: string) => {
    if (!selectedConv || typeof selectedConv.contact === 'string') return;
    const contact = selectedConv.contact;
    const current = getContactTags(selectedConv).map(t => t._id);
    const next = current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId];
    const newTags = allTags.filter(t => next.includes(t._id));
    const prevConv = selectedConv;
    const updConv = { ...selectedConv, contact: { ...contact, tags: newTags } } as unknown as Conversation;
    setSelectedConv(updConv);
    setConversations(prev => prev.map(c => c._id === prevConv._id ? updConv : c));
    try {
      await contactApi.update(contact._id, { tags: next });
    } catch {
      setSelectedConv(prevConv);
      setConversations(prev => prev.map(c => c._id === prevConv._id ? prevConv : c));
      toast.error('Failed to update label');
    }
  };
  const [loadingConvs, setLoadingConvs] = useState(true);
  const convPageRef = useRef(1);
  const convTotalPagesRef = useRef(1);
  const [convTotal, setConvTotal] = useState(0);
  const [hasMoreConvs, setHasMoreConvs] = useState(false);
  const [convsLoadingMore, setConvsLoadingMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const [reminderContacts, setReminderContacts] = useState<Record<string, string>>({});
  const loadDueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadDueRef.current = () => api.get('/contact-notes', { params: { due: 1 } }).then(r => {
      const map: Record<string, string> = {};
      (r.data.data || []).forEach((n: { contact?: { _id?: string } | string; remindAt?: string }) => {
        const cid = typeof n.contact === 'string' ? n.contact : n.contact?._id;
        if (cid && n.remindAt) map[cid] = n.remindAt;
      });
      setReminderContacts(map);
    }).catch(() => {});
    const loadDue = () => loadDueRef.current?.();
    loadDue();
    const t = setInterval(loadDue, 60000);
    window.addEventListener('focus', loadDue);
    return () => { clearInterval(t); window.removeEventListener('focus', loadDue); };
  }, []);
  const hasReminder = (conv: Conversation) => !!reminderContacts[getContactId(conv)];
  const [reminderConvs, setReminderConvs] = useState<Conversation[] | null>(null);
  useEffect(() => {
    if (labelFilter !== '__reminder') { setReminderConvs(null); return; }
    let cancelled = false;
    conversationApi.list({ filter: 'reminder', channel: channelFilter !== 'all' ? channelFilter : undefined, limit: 500 } as Record<string, string | number | undefined>)
      .then(r => { if (!cancelled) setReminderConvs(r.data.data || []); })
      .catch(() => { if (!cancelled) setReminderConvs(null); });
    return () => { cancelled = true; };
  }, [labelFilter, channelFilter, reminderContacts]);
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const fmtListTime = (val?: string) => {
    if (!val) return '';
    const d = new Date(val); if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    if ((now.getTime() - d.getTime()) / 86400000 < 7) return d.toLocaleDateString([], { weekday: 'short' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };
  const leadBadge = (conv: Conversation) => {
    const ls = (conv.contact as { leadScore?: string })?.leadScore;
    const se = (conv as { sentiment?: string }).sentiment;
    return (<>
      {ls === 'hot' && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-700 align-middle font-medium">🔥 Hot</span>}
      {ls === 'warm' && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 align-middle font-medium">Warm</span>}
      {ls === 'cold' && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 align-middle font-medium">Cold</span>}
      {se === 'negative' && <span className="ml-1 text-[11px] align-middle" title="Customer seems unhappy">😟</span>}
    </>);
  };
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const msgPageRef = useRef(1);
  const msgTotalPagesRef = useRef(1);
  const skipAutoScrollRef = useRef(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [inChatSearch, setInChatSearch] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [chatSearching, setChatSearching] = useState(false);
  const chatSearchedRef = useRef('');
  const matchIds = inChatQuery.trim().length >= 2
    ? messages.filter(m => (m.text || '').toLowerCase().includes(inChatQuery.trim().toLowerCase())).map(m => m._id)
    : [];

  // Server-side search: the chat may only have recent pages loaded, so when a
  // query matches older (unloaded) history, load the full conversation once.
  useEffect(() => {
    const q = inChatQuery.trim();
    if (!inChatSearch || q.length < 2 || !selectedConv) return;
    const convId = selectedConv._id;
    const key = `${convId}:${q.toLowerCase()}`;
    if (chatSearchedRef.current === key) return;
    const t = setTimeout(async () => {
      setChatSearching(true);
      try {
        const r = await conversationApi.searchMessages(q, convId);
        const results: Array<{ _id: string }> = r.data.data || [];
        chatSearchedRef.current = key;
        setMessages(prev => {
          if (results.some(m => !prev.some(p => p._id === m._id))) {
            conversationApi.getMessages(convId, { page: 1, limit: 2000 }).then(full => {
              setMessages(full.data.data || []);
              setHasOlder(false);
            }).catch(() => {});
          }
          return prev;
        });
      } catch { /* ignore */ }
      setChatSearching(false);
    }, 450);
    return () => clearTimeout(t);
  }, [inChatSearch, inChatQuery, selectedConv]);

  const jumpToMatch = (idx: number) => {
    const id = matchIds[idx];
    if (!id) return;
    setMatchIdx(idx);
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerModeRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [forms, setForms] = useState<Array<{_id: string; name: string; description?: string; waFlow?: { flowId: string; status: string } }>>([]);
  const [quickReplies, setQuickReplies] = useState<Array<{_id: string; title: string; shortcut: string; message: string; stickerUrl?: string}>>([]);
  const [templates, setTemplates] = useState<ChatTemplate[]>([]);
  const [tplToSend, setTplToSend] = useState<ChatTemplate | null>(null);
  const [tplFromNumber, setTplFromNumber] = useState('');
  const [newMsgFrom, setNewMsgFrom] = useState('');
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  const [tplVars, setTplVars] = useState<string[]>([]);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsgPhone, setNewMsgPhone] = useState('');
  const [newEmail, setNewEmail] = useState({ to: '', cc: '', subject: '', body: '' });
  const [emailMode, setEmailMode] = useState<'new' | 'reply' | 'replyAll' | 'forward'>('new');
  const [emailDraftHtml, setEmailDraftHtml] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ url: string; filename: string }[]>([]);
  const [emailUploading, setEmailUploading] = useState(false);
  const emailBodyRef = useRef<HTMLDivElement>(null);
  const emailFileRef = useRef<HTMLInputElement>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactPickerId, setReactPickerId] = useState<string | null>(null);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen: number | null } | null>(null);

  const handleReact = async (msg: Message, emoji: string) => {
    if (!selectedConv) return;
    setReactPickerId(null);
    const mine = (msg.reactions || []).find((r) => r.from === 'outbound');
    const next = mine?.emoji === emoji ? '' : emoji;
    setMessages((prev) => prev.map((m) => m._id === msg._id
      ? { ...m, reactions: [...(m.reactions || []).filter((r) => r.from !== 'outbound'), ...(next ? [{ emoji: next, from: 'outbound' }] : [])] }
      : m));
    try { await conversationApi.react(selectedConv._id, msg._id, next); } catch { toast.error('Reaction failed'); }
  };

  useEffect(() => {
    setPresence(null);
    if (selectedConv && (selectedConv as unknown as { channel?: string }).channel === 'whatsapp_qr') {
      conversationApi.subscribePresence(selectedConv._id).catch(() => {});
    }
  }, [selectedConv?._id]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<Array<{_id: string; name: string; price: number; image?: string; description?: string}>>([]);
  const [newMsgTpl, setNewMsgTpl] = useState<ChatTemplate | null>(null);
  const [newMsgVars, setNewMsgVars] = useState<string[]>([]);
  const [fileAccept, setFileAccept] = useState('*/*');
  const [submitting, setSubmitting] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showPipelineMenu, setShowPipelineMenu] = useState(false);
  const [pipelineMenuPos, setPipelineMenuPos] = useState<{top: number; left: number} | null>(null);
  const [pipelines, setPipelines] = useState<{ _id: string; name: string; stages?: { name: string }[]; deals?: { _id: string; contact?: string | { _id: string }; stage: string }[] }[]>([]);
  const [agents, setAgents] = useState<Array<{_id: string; name: string; email?: string}>>([]);
  const [togglingAI, setTogglingAI] = useState(false);
  const [aiCalling, setAiCalling] = useState(false);
  const assignMenuRef = useRef<HTMLDivElement>(null);
  const [assignMenuPos, setAssignMenuPos] = useState<{top: number; left: number} | null>(null);

  useEffect(() => {
    teamApi.listAgents().then(res => {
      setAgents(res.data?.data || []);
    }).catch(() => {});
    pipelineApi.list().then(r => setPipelines(r.data?.data || [])).catch(() => {});
  }, []);

  const handleAddToPipeline = async (pipelineId: string, stage: string) => {
    if (!selectedConv) return;
    const contact = selectedConv.contact;
    const contactId = typeof contact === 'string' ? contact : contact?._id;
    if (!contactId) { toast.error('No contact on this chat'); return; }
    try {
      const pipeline = pipelines.find(p => p._id === pipelineId);
      const existing = pipeline?.deals?.find(d => (typeof d.contact === 'string' ? d.contact : d.contact?._id) === contactId);
      if (existing) {
        await pipelineApi.updateDeal(pipelineId, existing._id, { stage });
        toast.success(`Moved to "${stage}"`);
      } else {
        const name = typeof contact === 'string' ? 'Contact' : (contact?.name || contact?.phone || 'Contact');
        await pipelineApi.addDeal(pipelineId, { title: `${name} - Chat`, value: 0, contact: contactId, stage, status: 'open' });
        toast.success(`Added to "${stage}"`);
      }
      setShowPipelineMenu(false);
      pipelineApi.list().then(r => setPipelines(r.data?.data || [])).catch(() => {});
    } catch {
      toast.error('Failed to update pipeline');
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!selectedConv) return;
    try {
      await conversationApi.assign(selectedConv._id, agentId);
      setSelectedConv({ ...selectedConv, assignedAgent: agents.find(a => a._id === agentId) });
      setShowAssignMenu(false);
      toast.success('Assigned successfully');
    } catch {
      toast.error('Failed to assign');
    }
  };

  const chatAiOn = selectedConv ? (!selectedConv.aiDisabled && (selectedConv.aiEnabled || globalAiOn)) : false;

  const handleToggleAI = async (mode: 'chat' | 'call') => {
    if (!selectedConv || togglingAI) return;
    setTogglingAI(true);
    const newVal = mode === 'call' ? !selectedConv.aiCallEnabled : !chatAiOn;
    try {
      await conversationApi.toggleAI(selectedConv._id, newVal, mode);
      if (mode === 'call') setSelectedConv({ ...selectedConv, aiCallEnabled: newVal });
      else setSelectedConv({ ...selectedConv, aiEnabled: newVal, aiDisabled: !newVal });
    } catch { /* empty */ } finally { setTogglingAI(false); }
  };

  const handleAiCall = async () => {
    if (!selectedConv || aiCalling) return;
    const phone = getContactPhone(selectedConv);
    if (!phone) return;
    setAiCalling(true);
    try {
      const res = await api.post('/ai-calling/ai-call', { contactPhone: phone });
      alert(res.data?.data?.message || 'AI is calling the customer...');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'AI call failed';
      alert(msg);
    } finally { setAiCalling(false); }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await conversationApi.list({ status: filter === 'resolved' ? 'closed' : filter === 'active' ? 'active' : undefined, filter: ['unread', 'assigned', 'unassigned'].includes(filter) ? filter : undefined, lead: leadFilter !== 'all' ? leadFilter : undefined, channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>);
        setConversations(res.data.data || []);
        convPageRef.current = 1;
        convTotalPagesRef.current = res.data.pagination?.pages || 1;
        setConvTotal(res.data.pagination?.total || (res.data.data || []).length);
        setHasMoreConvs((res.data.pagination?.pages || 1) > 1);
      } catch { /* empty */ }
      setLoadingConvs(false);
    };
    fetchConversations();
  }, [filter, leadFilter, channelFilter]);

  const loadMoreConversations = async () => {
    if (convsLoadingMore) return;
    const next = convPageRef.current + 1;
    if (next > convTotalPagesRef.current) return;
    setConvsLoadingMore(true);
    try {
      const res = await conversationApi.list({ page: next, status: filter === 'resolved' ? 'closed' : filter === 'active' ? 'active' : undefined, filter: ['unread', 'assigned', 'unassigned'].includes(filter) ? filter : undefined, lead: leadFilter !== 'all' ? leadFilter : undefined, channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | number | undefined>);
      const more: Conversation[] = res.data.data || [];
      setConversations(prev => {
        const seen = new Set(prev.map(c => c._id));
        return [...prev, ...more.filter(c => !seen.has(c._id))];
      });
      convPageRef.current = next;
      convTotalPagesRef.current = res.data.pagination?.pages || convTotalPagesRef.current;
      setConvTotal(res.data.pagination?.total || convTotal);
      setHasMoreConvs(next < (res.data.pagination?.pages || 1));
    } catch { /* empty */ }
    setConvsLoadingMore(false);
  };

  // Fetch quick replies
  useEffect(() => {
    api.get('/quick-replies-client').then(r => setQuickReplies(r.data.data || [])).catch(() => {});
    api.get('/preset-messages').then(r => setPresets(r.data.data || [])).catch(() => {});
    api.get('/response-resources').then(r => setRespResources((r.data.data || []).filter((x: {isActive: boolean}) => x.isActive !== false))).catch(() => {});
    api.get('/templates').then(r => setTemplates((r.data.data || []).filter((t: {status: string}) => t.status === 'approved' || t.status === 'APPROVED'))).catch(() => {});
    api.get('/forms').then(r => setForms(r.data.data || [])).catch(() => {});
    catalogApi.getProducts().then((r: { data: { data?: Array<{_id: string; name: string; price: number; image?: string; description?: string}> } }) => setCatalogProducts(r.data.data || [])).catch(() => {});
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const [exportMenu, setExportMenu] = useState<'chat' | 'all' | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payLinks, setPayLinks] = useState<{ _id: string; amount: number; description?: string; method: string; status: string; createdAt: string }[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payDesc, setPayDesc] = useState('');
  const [payMethod, setPayMethod] = useState('razorpay');
  const [payCurrency, setPayCurrency] = useState('INR');
  const [payGateways, setPayGateways] = useState<string[]>([]);
  const [payUpi, setPayUpi] = useState(typeof window !== 'undefined' ? localStorage.getItem('wp_upi_id') || '' : '');
  const [paySending, setPaySending] = useState(false);
  const [payAutoOpen, setPayAutoOpen] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState('');
  const [paySuccessFile, setPaySuccessFile] = useState('');
  const [payFailMsg, setPayFailMsg] = useState('');

  const loadPayLinks = async (convId: string) => {
    try { const r = await paymentLinkApi.list(convId); setPayLinks(r.data.data || []); } catch { setPayLinks([]); }
  };

  const handleOpenPay = () => {
    if (!selectedConv) return;
    setPayOpen(true);
    loadPayLinks(selectedConv._id);
    integrationApi.list().then(r => {
      const gatewayTypes = ['razorpay', 'stripe', 'paypal', 'cashfree', 'payu', 'paytm', 'phonepe', 'paystack', 'mercadopago'];
      const connected = (r.data.data || []).filter((i: { type: string; connected: boolean }) => i.connected && gatewayTypes.includes(i.type)).map((i: { type: string }) => i.type);
      setPayGateways(connected);
      setPayMethod(prev => (prev === 'upi' || connected.includes(prev)) ? prev : (connected[0] || 'upi'));
    }).catch(() => setPayGateways([]));
  };

  const handleSendPayLink = async () => {
    if (!selectedConv || paySending) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (payMethod === 'upi' && !payUpi.trim()) { toast.error('Enter your UPI ID'); return; }
    setPaySending(true);
    try {
      await paymentLinkApi.create({ conversationId: selectedConv._id, amount: amt, description: payDesc, method: payMethod, upiId: payUpi.trim(), currency: payCurrency, onSuccessText: paySuccessMsg.trim(), onSuccessFileUrl: paySuccessFile.trim(), onFailureText: payFailMsg.trim() });
      if (payMethod === 'upi') localStorage.setItem('wp_upi_id', payUpi.trim());
      toast.success('Payment link sent in chat');
      setPayAmount(''); setPayDesc(''); setPaySuccessMsg(''); setPaySuccessFile(''); setPayFailMsg('');
      loadPayLinks(selectedConv._id);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to send payment link');
    }
    setPaySending(false);
  };

  const handleMarkPaid = async (id: string) => {
    try { await paymentLinkApi.markPaid(id); if (selectedConv) loadPayLinks(selectedConv._id); toast.success('Marked as paid'); } catch { toast.error('Failed'); }
  };

  const [notes, setNotes] = useState<{ _id: string; text: string; remindAt?: string; reminderSent?: boolean; contacted?: boolean; contactedRemark?: string; createdAt: string }[]>([]);
  const [contactedFor, setContactedFor] = useState<string | null>(null);
  const [contactedRemark, setContactedRemark] = useState('');
  const handleContacted = async (noteId: string) => {
    try {
      await noteApi.update(noteId, { contacted: true, contactedRemark: contactedRemark.trim() } as { contacted: boolean; contactedRemark: string });
      setContactedFor(null); setContactedRemark('');
      if (selectedConv) loadNotes(getContactId(selectedConv));
      loadDueRef.current?.();
      toast.success('Marked contacted');
    } catch { toast.error('Failed'); }
  };
  const [noteText, setNoteText] = useState('');
  const [noteRemind, setNoteRemind] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editRemind, setEditRemind] = useState('');
  const toLocalInput = (iso: string) => {
    const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const handleEditRemind = async (id: string) => {
    try {
      await noteApi.update(id, { remindAt: editRemind ? new Date(editRemind).toISOString() : null });
      setEditingNote(null); setEditRemind('');
      if (selectedConv) loadNotes(getContactId(selectedConv));
      loadDueRef.current?.();
      toast.success('Reminder updated');
    } catch { toast.error('Failed'); }
  };

  const loadNotes = async (contactId: string) => {
    try {
      const r = await noteApi.list(contactId);
      setNotes(r.data.data || []);
    } catch { setNotes([]); }
  };

  const handleOpenNotes = () => {
    if (!selectedConv) return;
    setNotesOpen(true);
    loadNotes(getContactId(selectedConv));
  };

  const handleAddNote = async () => {
    if (!selectedConv || !noteText.trim()) return;
    try {
      await noteApi.create({ contact: getContactId(selectedConv), text: noteText.trim(), remindAt: noteRemind ? new Date(noteRemind).toISOString() : undefined });
      loadDueRef.current?.();
      setNoteText(''); setNoteRemind('');
      loadNotes(getContactId(selectedConv));
      toast.success('Note added');
    } catch { toast.error('Failed to add note'); }
  };

  const handleDeleteNote = async (id: string) => {
    if (!selectedConv) return;
    try {
      await noteApi.delete(id);
      loadNotes(getContactId(selectedConv));
    } catch { toast.error('Delete failed'); }
  };


  const handleExportChat = async (format: string) => {
    if (!selectedConv) return;
    setExportMenu(null);
    try {
      const r = await conversationApi.exportChat(selectedConv._id, format);
      downloadBlob(r.data, `chat-${getContactName(selectedConv).replace(/[^a-zA-Z0-9]/g, '_')}.${format}`);
    } catch { toast.error('Export failed'); }
  };

  const handleExportAll = async (format: string) => {
    setExportMenu(null);
    try {
      const r = await conversationApi.exportAllChats(format);
      downloadBlob(r.data, `all-chats-export.${format}`);
    } catch { toast.error('Export failed'); }
  };

  const loadMessages = useCallback(async (conv: Conversation) => {
    if (selectedConv?._id) leaveConversation(selectedConv._id);
    setSelectedConv(conv);
    setInChatSearch(false); setInChatQuery(''); setMatchIdx(0);
    setLoadingMsgs(true);
    joinConversation(conv._id);
    if (conv.unreadCount > 0) {
      setConversations(prev => prev.map(c => c._id === conv._id ? { ...c, unreadCount: 0 } : c));
      api.put(`/conversations/${conv._id}/read`).catch(() => {});
    }
    loadDueRef.current?.();
    try {
      const res = await conversationApi.getMessages(conv._id);
      setMessages(res.data.data || []);
      msgPageRef.current = 1;
      msgTotalPagesRef.current = res.data.pagination?.pages || 1;
      setHasOlder((res.data.pagination?.pages || 1) > 1);
    } catch { /* empty */ }
    setLoadingMsgs(false);
  }, [selectedConv]);

  const loadOlderMessages = async () => {
    if (!selectedConv || olderLoading) return;
    const next = msgPageRef.current + 1;
    if (next > msgTotalPagesRef.current) return;
    setOlderLoading(true);
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight || 0;
    try {
      const res = await conversationApi.getMessages(selectedConv._id, { page: next });
      const older: Message[] = res.data.data || [];
      skipAutoScrollRef.current = true;
      setMessages(prev => {
        const seen = new Set(prev.map(m => m._id));
        return [...older.filter(m => !seen.has(m._id)), ...prev];
      });
      msgPageRef.current = next;
      setHasOlder(next < msgTotalPagesRef.current);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevHeight;
      });
    } catch { /* empty */ }
    setOlderLoading(false);
  };

  useEffect(() => {
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkConv || !conversations.length) return;
    deepLinkHandled.current = true;
    const conv = conversations.find(c => c._id === deepLinkConv);
    if (conv) {
      loadMessages(conv);
      if (deepLinkDraft) setMessageText(deepLinkDraft);
    } else {
      // Not in the loaded page (older chat / different filter) — fetch it directly
      conversationApi.get(deepLinkConv).then(r => {
        const fetched = r.data.data;
        if (!fetched) return;
        setConversations(prev => prev.some(c => c._id === fetched._id) ? prev : [fetched, ...prev]);
        loadMessages(fetched);
        if (deepLinkDraft) setMessageText(deepLinkDraft);
      }).catch(() => toast.error('Conversation not found'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, deepLinkConv]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = (data: { message: Message; conversationId: string } | Message) => {
      const msg = 'message' in data && data.conversationId ? data.message : data as Message;
      const convId = 'conversationId' in data ? data.conversationId : msg.conversation;

      if (convId === selectedConv?._id) {
        setMessages((prev) => {
          if (prev.some(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
      let known = true;
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === convId);
        if (exists) {
          return prev.map((c) =>
            c._id === convId ? { ...c, lastMessage: msg, unreadCount: c._id === selectedConv?._id ? 0 : msg.direction === 'inbound' ? (c.unreadCount || 0) + 1 : (c.unreadCount || 0), updatedAt: new Date().toISOString() } : c
          );
        }
        known = false;
        return prev;
      });
      if (!known) {
        conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>)
          .then(r => setConversations(prev => {
            const seen = new Set(prev.map(c => c._id));
            const fresh = (r.data.data || []).filter((c: Conversation) => !seen.has(c._id));
            return [...fresh, ...prev];
          })).catch(() => {});
      }
      if (convId === selectedConv?._id) api.put(`/conversations/${convId}/read`).catch(() => {});
    };

    const onConversationUpdated = (conv: Conversation) => {
      let exists = false;
      setConversations((prev) => {
        exists = prev.some((c) => c._id === conv._id);
        if (!exists) return prev;
        return prev.map((c) => {
          if (c._id !== conv._id) return c;
          const mergedContact = (typeof conv.contact === 'string' && typeof c.contact === 'object')
            ? c.contact
            : conv.contact;
          return { ...c, ...conv, contact: mergedContact };
        });
      });
      if (!exists) {
        // Unknown conversation: let the server (which enforces this user's inbox scope)
        // decide if it belongs here, so unassigned chats never leak into a scoped agent's inbox.
        conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>)
          .then(r => setConversations(prev => {
            if (prev.some(c => c._id === conv._id)) return prev;
            const found = (r.data.data || []).find((c: Conversation) => c._id === conv._id);
            return found ? [found, ...prev] : prev;
          })).catch(() => {});
      }
    };

    const onAgentTyping = ({ conversationId, agent }: { conversationId: string; agent: { name: string } }) => {
      if (conversationId === selectedConv?._id) setTypingAgent(agent.name);
    };

    const onAgentStoppedTyping = ({ conversationId }: { conversationId: string }) => {
      if (conversationId === selectedConv?._id) setTypingAgent(null);
    };

    const onMessageReaction = ({ messageId, reactions }: { messageId: string; reactions: { emoji: string; from: string }[] }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));
    };

    const onPresence = ({ phone, online, lastSeen }: { phone: string; online: boolean; lastSeen: number | null }) => {
      const cp = (typeof selectedConv?.contact === 'object' && selectedConv?.contact) ? selectedConv.contact.phone : '';
      const norm = (s: string) => String(s || '').replace(/\D/g, '');
      if (selectedConv && norm(cp) && (norm(cp) === norm(phone) || norm(cp).endsWith(norm(phone)) || norm(phone).endsWith(norm(cp)))) {
        setPresence({ online, lastSeen: lastSeen || null });
      }
    };

    socket.on('waqr:presence', onPresence);
    socket.on('message_reaction', onMessageReaction);
    socket.on('new_message', onNewMessage);
    socket.on('conversation_updated', onConversationUpdated);
    socket.on('agent_typing', onAgentTyping);
    socket.on('agent_stopped_typing', onAgentStoppedTyping);

    return () => {
      socket.off('waqr:presence', onPresence);
      socket.off('message_reaction', onMessageReaction);
      socket.off('new_message', onNewMessage);
      socket.off('conversation_updated', onConversationUpdated);
      socket.off('agent_typing', onAgentTyping);
      socket.off('agent_stopped_typing', onAgentStoppedTyping);
    };
  }, [selectedConv]);

  const handleSend = async () => {
    if (sendLockRef.current || !messageText.trim() || !selectedConv) return;
    if (scheduleMode || scheduleTime) {
      await handleScheduleSend();
      return;
    }
    sendLockRef.current = true;
    setSending(true);
    emitTyping(selectedConv._id, false);
    try {
      const res = await conversationApi.sendMessage(selectedConv._id, { type: 'text', text: messageText, replyToId: replyTo?._id });
      setReplyTo(null);
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      setConversations(prev => prev.map(c => c._id === selectedConv._id ? { ...c, lastMessage: { ...(c.lastMessage || {}), text: res.data.data.text || '', type: res.data.data.type || 'text', direction: 'outbound', timestamp: new Date().toISOString() } as unknown as Message, updatedAt: new Date().toISOString() } : c));
      setMessageText('');
    } catch { /* empty */ }
    setSending(false);
    sendLockRef.current = false;
  };

  const loadStickerLib = async () => {
    try {
      const res = await conversationApi.stickerLibrary();
      setStickerLib(res.data.data || []);
    } catch { /* empty */ }
    setStickerLibLoaded(true);
  };

  const sendStickerUrl = async (url: string) => {
    if (!selectedConv || sendLockRef.current) return;
    sendLockRef.current = true;
    setShowStickers(false);
    try {
      const res = await conversationApi.sendMessage(selectedConv._id, { type: 'sticker', media: { url } });
      setMessages((prev) => prev.some(m => m._id === res.data.data._id) ? prev : [...prev, res.data.data]);
      if (res.data.data?.status === 'failed') {
        toast.error(res.data.data.errorMessage || 'WhatsApp could not send this sticker');
      } else {
        setStickerLib((prev) => [{ url }, ...prev.filter(x => x.url !== url)]);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to send sticker');
    }
    sendLockRef.current = false;
  };

  const handleAttachFile = (accept: string) => {
    setFileAccept(accept);
    setShowAttachMenu(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || sendLockRef.current) return;
    sendLockRef.current = true;
    setUploading(true);
    try {
      const asSticker = stickerModeRef.current;
      stickerModeRef.current = false;
      const formData = new FormData();
      formData.append('file', file);
      if (asSticker) formData.append('folder', 'stickers');
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { url, filename, mimetype } = uploadRes.data.data;
      const type = asSticker ? 'sticker' :
                   mimetype.startsWith('image/') ? 'image' :
                   mimetype.startsWith('video/') ? 'video' :
                   mimetype.startsWith('audio/') ? 'audio' : 'document';
      const res = await conversationApi.sendMessage(selectedConv._id, {
        type,
        media: { url, caption: asSticker ? '' : filename, mimetype },
      });
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      if (res.data.data?.status === 'failed') {
        toast.error(res.data.data.errorMessage || 'WhatsApp could not send this file');
      }
    } catch (err: unknown) {
      console.error('Upload failed:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to send file — try a smaller file (video max 16 MB)');
    }
    setUploading(false);
    sendLockRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerLib, setStickerLib] = useState<{ url: string; mimetype?: string }[]>([]);
  const [stickerLibLoaded, setStickerLibLoaded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);

  const stopRecordTimer = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const startRecording = async () => {
    if (recording || !selectedConv) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
        .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recordCancelledRef.current = false;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopRecordTimer();
        setRecording(false);
        if (recordCancelledRef.current || recordChunksRef.current.length === 0) return;
        const baseType = (rec.mimeType || 'audio/webm').split(';')[0];
        const ext = baseType.includes('ogg') ? 'ogg' : baseType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(recordChunksRef.current, { type: baseType });
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append('file', new File([blob], `voice-note.${ext}`, { type: baseType }));
          const uploadRes = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const { url, mimetype } = uploadRes.data.data;
          const res = await conversationApi.sendMessage(selectedConv._id, {
            type: 'audio',
            media: { url, caption: 'Voice message', mimetype },
          });
          setMessages((prev) => prev.some(m => m._id === res.data.data._id) ? prev : [...prev, res.data.data]);
        } catch { toast.error('Voice message failed'); }
        setUploading(false);
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const finishRecording = (cancel: boolean) => {
    recordCancelledRef.current = cancel;
    mediaRecorderRef.current?.stop();
  };

  const handleQuickReply = (reply: {message: string; stickerUrl?: string}) => {
    setShowQuickReplies(false);
    setShowAttachMenu(false);
    if (reply.stickerUrl) {
      sendStickerUrl(reply.stickerUrl);
      if (reply.message) setMessageText(reply.message);
      return;
    }
    setMessageText(reply.message);
  };

  const fillVars = (body: string, vars: string[]) =>
    (body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => vars[parseInt(n, 10) - 1]?.trim() || m);

  const tplPreviewData = (t: ChatTemplate, vars: string[]) => ({
    headerType: t.header?.type,
    headerText: t.header?.content || '',
    headerMediaUrl: t.header?.mediaUrl || '',
    body: fillVars(t.body, vars),
    footer: t.footer || '',
    buttons: (t.buttons || []).map(b => ({ type: (b.type || '').toUpperCase() === 'URL' ? 'URL' : (b.type || '').toUpperCase() === 'PHONE' ? 'PHONE_NUMBER' : 'QUICK_REPLY', text: b.text })),
  });

  const countTemplateVars = (body: string) => {
    const matches = (body || '').match(/\{\{\s*\d+\s*\}\}/g) || [];
    const nums = matches.map(m => parseInt(m.replace(/\D/g, ''), 10));
    return nums.length ? Math.max(...nums) : 0;
  };

  const handlePickTemplate = (template: ChatTemplate) => {
    const n = countTemplateVars(template.body);
    setTplToSend(template);
    setTplVars(Array(n).fill(''));
  };

  const buildTplPayload = (template: ChatTemplate, vars: string[]) => {
    const components: Array<{type: string; parameters: Array<Record<string, unknown>>}> = [];
    const hType = template.header?.type;
    if (hType && ['image', 'video', 'document'].includes(hType) && template.header?.mediaUrl) {
      components.push({ type: 'header', parameters: [{ type: hType, [hType]: { link: template.header.mediaUrl } }] });
    }
    if (vars.length) {
      components.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) });
    }
    return { id: template._id, name: template.name, language: template.language || 'en', components };
  };

  const sendTemplateToConv = async (convId: string, template: ChatTemplate, vars: string[], fromNumberId?: string) => {
    const res = await conversationApi.sendMessage(convId, {
      type: 'template',
      template: buildTplPayload(template, vars),
      ...(fromNumberId ? { fromNumberId } : {}),
    });
    return res;
  };

  const handleSendTemplate = async (template: ChatTemplate, vars: string[]) => {
    if (submitting || !selectedConv) return;
    setSubmitting(true);
    setSending(true);
    try {
      const res = await sendTemplateToConv(selectedConv._id, template, vars, tplFromNumber || undefined);
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      if (res.data.data?.status === 'failed') {
        toast.error(res.data.data.errorMessage || 'Template send failed');
      } else {
        toast.success('Template sent');
      }
    } catch { toast.error('Template send failed'); }
    setSending(false);
    setSubmitting(false);
    setShowTemplateModal(false);
    setTplToSend(null);
  };

  const handleSendNewMsg = async () => {
    if (submitting || !newMsgTpl) return;
    const phone = newMsgPhone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error('Enter a valid phone number'); return; }
    setSubmitting(true);
    try {
      const convRes = await api.post('/conversations/by-phone', { phone });
      const conv = convRes.data.data;
      const res = await sendTemplateToConv(conv._id, newMsgTpl, newMsgVars, newMsgFrom || undefined);
      if (res.data.data?.status === 'failed') {
        toast.error(res.data.data.errorMessage || 'Template send failed');
      } else {
        toast.success('Message sent to ' + phone);
        setShowNewMsg(false); setNewMsgPhone(''); setNewMsgTpl(null); setNewMsgVars([]);
        setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
        loadMessages(conv);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Send failed';
      toast.error(msg);
    }
    setSubmitting(false);
  };

  const getConvEmail = (conv: Conversation | null): string => {
    if (!conv || typeof conv.contact === 'string' || !conv.contact) return '';
    return (conv.contact as { email?: string }).email || (conv.contact as { phone?: string }).phone || '';
  };

  const stripSubjectPrefix = (raw: string): { subject: string; body: string } => {
    const m = (raw || '').match(/^Subject:\s*([\s\S]*?)\n\n([\s\S]*)$/);
    return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: '', body: (raw || '').trim() };
  };

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const openEmailCompose = (mode: 'new' | 'reply' | 'replyAll' | 'forward', srcMsg?: Message) => {
    const base = (selectedConv as unknown as { lastSubject?: string } | null)?.lastSubject || '';
    const src = srcMsg || [...messages].reverse().find(m => (m as { metadata?: { source?: string } }).metadata?.source === 'email') || messages[messages.length - 1];
    const parsed = src ? stripSubjectPrefix(src.text || '') : { subject: '', body: '' };
    const origSubject = parsed.subject || base;
    let to = '', subject = '', quoted = '';
    const when = src ? new Date(src.createdAt).toLocaleString() : '';
    const fromEmail = getConvEmail(selectedConv);
    if (mode === 'new') {
      to = ''; subject = ''; quoted = '';
    } else if (mode === 'forward') {
      subject = /^fwd:/i.test(origSubject) ? origSubject : 'Fwd: ' + origSubject;
      quoted = `<br/><br/><div style="border-left:3px solid #ddd;padding-left:10px;color:#555">---------- Forwarded message ----------<br/>From: ${escapeHtml(fromEmail)}<br/>Subject: ${escapeHtml(origSubject)}<br/><br/>${escapeHtml(parsed.body).replace(/\n/g, '<br/>')}</div>`;
    } else {
      to = fromEmail;
      subject = /^re:/i.test(origSubject) ? origSubject : 'Re: ' + origSubject;
      quoted = `<br/><br/><div style="border-left:3px solid #ddd;padding-left:10px;color:#555">On ${escapeHtml(when)}, ${escapeHtml(fromEmail)} wrote:<br/>${escapeHtml(parsed.body).replace(/\n/g, '<br/>')}</div>`;
    }
    setEmailMode(mode);
    setNewEmail({ to, cc: '', subject, body: '' });
    setEmailDraftHtml(quoted);
    setShowCc(mode === 'replyAll');
    setEmailAttachments([]);
    setShowNewMsg(true);
  };

  useEffect(() => {
    if (showNewMsg && channelFilter === 'email' && emailBodyRef.current) {
      emailBodyRef.current.innerHTML = emailDraftHtml || '';
      setNewEmail(p => ({ ...p, body: emailBodyRef.current?.innerText || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewMsg]);

  const handleEmailAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setEmailUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const { url, filename } = r.data.data;
        setEmailAttachments(prev => [...prev, { url, filename: filename || file.name }]);
      }
    } catch { toast.error('Attachment upload failed'); }
    setEmailUploading(false);
    if (emailFileRef.current) emailFileRef.current.value = '';
  };

  const execFmt = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    emailBodyRef.current?.focus();
  };

  const handleSendNewEmail = async () => {
    if (submitting) return;
    const html = emailBodyRef.current?.innerHTML || '';
    const text = (emailBodyRef.current?.innerText || newEmail.body).trim();
    if (!newEmail.to.trim() || !text) { toast.error('Recipient email and message are required'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/conversations/by-email', {
        to: newEmail.to, cc: newEmail.cc, subject: newEmail.subject, body: text, html, attachments: emailAttachments,
      });
      const conv = res.data.data?.conversation;
      if (res.data.data?.message?.status === 'failed') {
        toast.error(res.data.data.message.errorMessage || 'Email send failed');
      } else {
        toast.success('Email sent to ' + newEmail.to);
        setShowNewMsg(false); setNewEmail({ to: '', cc: '', subject: '', body: '' });
        setEmailDraftHtml(''); setEmailMode('new');
        setEmailAttachments([]);
        if (emailBodyRef.current) emailBodyRef.current.innerHTML = '';
        if (conv) {
          setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
          loadMessages(conv);
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Email send failed';
      toast.error(msg);
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered': return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case 'failed': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return <Clock className="w-3 h-3 text-gray-300" />;
    }
  };

  const renderMessageContent = (msg: Message) => {
    // Email messages: show a compact card (subject + collapsible body) so a
    // long email never takes over the whole view.
    const isEmail = (msg as { metadata?: { source?: string } }).metadata?.source === 'email'
      || (selectedConv as unknown as { channel?: string } | null)?.channel === 'email';
    if (isEmail && (msg.text || '').length > 0) {
      const raw = msg.text || '';
      const m = raw.match(/^Subject:\s*([\s\S]*?)\n\n([\s\S]*)$/);
      const subject = m ? m[1].trim() : ((selectedConv as unknown as { lastSubject?: string } | null)?.lastSubject || '(no subject)');
      const body = (m ? m[2] : raw).trim();
      const emailHtml = (msg as { metadata?: { html?: string } }).metadata?.html || '';
      return (
        <div className="min-w-0 max-w-full">
          <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-orange-600">
            <Mail className="w-3.5 h-3.5" /> Email
          </div>
          <div className="text-sm font-semibold text-gray-900 break-words mb-1">{subject}</div>
          <details className="group/email" open>
            <summary className="cursor-pointer text-xs text-emerald-600 hover:underline list-none select-none">
              Show / hide full email
            </summary>
            {emailHtml ? (
              <iframe
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={`<base target="_blank"><style>body{margin:8px;font-family:system-ui,sans-serif;font-size:14px;color:#111;word-break:break-word}img{max-width:100%;height:auto}</style>${emailHtml}`}
                className="w-full mt-2 border-t border-black/5 bg-white rounded"
                style={{ height: '60vh', minWidth: '280px' }}
                title="Email content"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-2 max-h-[60vh] overflow-y-auto border-t border-black/5 pt-2">
                {body.replace(/<(https?:\/\/[^>\s]+)>/g, '$1').split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                  /^https?:\/\//.test(part)
                    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline break-all">{part.length > 60 ? part.slice(0, 57) + '…' : part}</a>
                    : part
                )}
              </p>
            )}
          </details>
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-black/5 text-xs">
            <button onClick={() => openEmailCompose('reply', msg)} className="text-emerald-600 hover:underline font-medium">Reply</button>
            <button onClick={() => openEmailCompose('replyAll', msg)} className="text-emerald-600 hover:underline font-medium">Reply All</button>
            <button onClick={() => openEmailCompose('forward', msg)} className="text-emerald-600 hover:underline font-medium">Forward</button>
          </div>
        </div>
      );
    }
    // Stored interactive messages (bot flow / automation buttons & lists)
    const storedInter = msg.type === 'interactive'
      ? (msg.interactive as { type?: string; body?: string; ctaText?: string; ctaUrl?: string; buttons?: { id?: string; title?: string }[]; sections?: { title?: string; rows?: { id?: string; title?: string; description?: string }[] }[] } | undefined)
      : undefined;
    if (storedInter && ((storedInter.buttons?.length || 0) > 0 || (storedInter.sections?.length || 0) > 0 || storedInter.ctaUrl)) {
      return (
        <div>
          <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.text || storedInter.body || ''}</p>
          {(storedInter.buttons?.length || 0) > 0 && (
            <div className="mt-2 space-y-1">
              {storedInter.buttons!.map((b, i) => (
                <div key={b.id || i} className="text-center text-sm font-medium text-emerald-700 bg-white/70 border border-emerald-200 rounded-lg px-3 py-1.5">{b.title}</div>
              ))}
            </div>
          )}
          {storedInter.ctaUrl && (
            <a href={storedInter.ctaUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 text-center text-sm font-medium text-emerald-700 bg-white/70 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50">{storedInter.ctaText || 'Open Link'}</a>
          )}
          {(storedInter.sections?.length || 0) > 0 && (
            <div className="mt-2 border border-emerald-200 rounded-lg overflow-hidden bg-white/70">
              {storedInter.sections!.map((s, si) => (
                <div key={si}>
                  {s.title && <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-emerald-50">{s.title}</div>}
                  {(s.rows || []).map((r, ri) => (
                    <div key={r.id || ri} className="px-3 py-1.5 text-sm border-t border-emerald-100 first:border-t-0">
                      <span className="font-medium text-gray-800">{r.title}</span>
                      {r.description && <span className="block text-xs text-gray-400">{r.description}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    // Interactive CTA (Form) messages
    const interRaw = msg.type === 'interactive' ? (msg.interactive as Record<string, unknown> | undefined) : undefined;
    const interHeader = interRaw?.header as Record<string, string> | undefined;
    const interBody = interRaw?.body as Record<string, string> | undefined;
    if (msg.type === 'interactive' && interRaw && (interHeader?.text || interBody?.text)) {
      const inter = interRaw;
      const header = interHeader;
      const body = interBody;
      const footer = inter.footer as Record<string, string> | undefined;
      const action = inter.action as Record<string, unknown> | undefined;
      const params = action?.parameters as Record<string, string> | undefined;
      return (
        <div className="border border-emerald-200 rounded-lg overflow-hidden max-w-[260px]">
          {header?.text && <div className="bg-emerald-50 px-3 py-2 font-semibold text-sm text-emerald-800">{header.text}</div>}
          {body?.text && <div className="px-3 py-2 text-sm text-gray-700">{body.text}</div>}
          {footer?.text && <div className="px-3 py-1 text-xs text-gray-400">{footer.text}</div>}
          {params?.url && (
            <a href={params.url} target="_blank" rel="noopener noreferrer" className="block border-t border-emerald-200 px-3 py-2 text-center text-sm font-medium text-emerald-600 hover:bg-emerald-50">
              {params.display_text || 'Open'}
            </a>
          )}
        </div>
      );
    }

    const isTemplate = msg.type === 'template';
    const isCampaign = (msg.text || '').startsWith('Campaign:') || isTemplate;

    if (isTemplate || isCampaign) {
      return (
        <div>
          {isTemplate && (
            <div className="flex items-center gap-1 mb-1 text-xs opacity-70">
              <LayoutTemplate className="w-3 h-3" /> Template{(msg.template as { name?: string })?.name ? `: ${(msg.template as { name?: string }).name}` : ''}
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">{msg.text || msg.media?.caption || (msg.template as { name?: string })?.name || ''}</p>
        </div>
      );
    }

    return (
      <>
        {msg.media?.url && (msg.type === 'image' || msg.type === 'sticker') && (
          <img src={msg.media.url} alt="" className={`rounded-lg mb-1 ${msg.type === 'sticker' ? 'max-w-[140px]' : 'max-w-full'}`} />
        )}
        {(() => {
          const loc = (msg as { location?: { latitude?: number; longitude?: number; name?: string; address?: string } }).location;
          if (loc?.latitude == null) return null;
          return (
            <a href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-1 hover:bg-gray-200">
              <MapPin className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm underline">{loc.name || loc.address || 'View location'}</span>
            </a>
          );
        })()}
        {msg.media?.url && msg.type === 'video' && (
          <video src={msg.media.url} controls className="rounded-lg mb-1 max-w-full" />
        )}
        {msg.media?.url && msg.type === 'audio' && (
          <audio src={msg.media.url} controls className="w-full mb-1" />
        )}
        {msg.media?.url && msg.type === 'document' && (
          <a href={msg.media.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-1 hover:bg-gray-200">
            <FileText className="w-5 h-5 text-blue-500" />
            <span className="text-sm underline">{msg.media.caption || 'Document'}</span>
          </a>
        )}
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.text || msg.media?.caption || ''}</p>
        {(msg as { metadata?: { translation?: string } }).metadata?.translation && (
          <p className="text-xs italic opacity-70 mt-1 pt-1 border-t border-black/10">🌐 {(msg as { metadata?: { translation?: string } }).metadata!.translation}</p>
        )}
      </>
    );
  };

  const handleSendPreset = async (presetId: string) => {
    if (!selectedConv || sending || sendLockRef.current) return;
    sendLockRef.current = true;
    setSending(true);
    try {
      const res = await api.post(`/preset-messages/${presetId}/send`, { conversationId: selectedConv._id });
      if (res.data.success) toast.success('Preset sent (free — no template charge)');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Preset send failed');
    }
    setSending(false);
    sendLockRef.current = false;
    setShowPresetModal(false);
  };

  const handleForwardMessage = async (targetConvId: string) => {
    if (!forwardMsg) return;
    try {
      if (forwardMsg.type === 'text') {
        await conversationApi.sendMessage(targetConvId, { type: 'text', text: forwardMsg.text || '' });
      } else if (forwardMsg.media?.url) {
        await conversationApi.sendMessage(targetConvId, { type: forwardMsg.type, media: forwardMsg.media });
      }
      toast.success('Message forwarded');
      setForwardMsg(null);
      setForwardSearch('');
    } catch { toast.error('Forward failed'); }
  };

  const handleBulkAction = async (action: 'close' | 'delete') => {
    if (bulkSelected.size === 0) return;
    const ids = Array.from(bulkSelected);
    try {
      if (action === 'close') {
        await Promise.all(ids.map(id => conversationApi.resolve(id)));
        toast.success(`${ids.length} chats closed`);
      } else {
        if (!confirm(`Delete ${ids.length} conversations?`)) return;
        await Promise.all(ids.map(id => api.delete('/conversations/' + id)));
        toast.success(`${ids.length} chats deleted`);
      }
      setConversations(prev => action === 'delete' ? prev.filter(c => !bulkSelected.has(c._id)) : prev.map(c => bulkSelected.has(c._id) ? { ...c, status: 'closed' } as Conversation : c));
      setBulkSelected(new Set());
      setBulkMode(false);
    } catch { toast.error('Bulk action failed'); }
  };

  const handleScheduleSend = async () => {
    if (sendLockRef.current || !messageText.trim() || !selectedConv) return;
    if (!scheduleTime) {
      toast.error('Choose a schedule date and time');
      return;
    }

    const scheduledAt = new Date(scheduleTime);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error('Choose a valid schedule date and time');
      return;
    }

    sendLockRef.current = true;
    setSending(true);
    try {
      await api.post('/conversations/' + selectedConv._id + '/schedule', { text: messageText, scheduledAt: scheduledAt.toISOString() });
      toast.success('Message scheduled');
      setMessageText('');
      setScheduleMode(false);
      setScheduleTime('');
    } catch { toast.error('Schedule failed'); }
    setSending(false);
    sendLockRef.current = false;
  };

  const handleSendProduct = async (product: {_id: string; name: string; price: number; description?: string}) => {
    if (!selectedConv) return;
    try {
      const text = '*' + product.name + '*\nPrice: Rs.' + product.price + (product.description ? '\n' + product.description : '');
      await conversationApi.sendMessage(selectedConv._id, { type: 'text', text });
      toast.success('Product sent');
      setShowCatalog(false);
    } catch { toast.error('Send failed'); }
  };

  const togglePin = async (conv: Conversation) => {
    const willPin = !(conv as { pinnedAt?: string }).pinnedAt;
    const newVal = willPin ? new Date().toISOString() : undefined;
    setConversations(prev => prev.map(c => c._id === conv._id ? ({ ...c, pinnedAt: newVal } as Conversation) : c));
    setSearchConvs(prev => prev ? prev.map(c => c._id === conv._id ? ({ ...c, pinnedAt: newVal } as Conversation) : c) : prev);
    try { await conversationApi.pin(conv._id, willPin); } catch { toast.error('Pin failed'); }
  };

  const convSortTime = (c: Conversation) => new Date((c.lastMessage as unknown as { timestamp?: string })?.timestamp || (c as unknown as { lastMessageAt?: string }).lastMessageAt || c.updatedAt || 0).getTime();
  const filteredConversations = (() => {
    const base = (searchConvs !== null ? searchConvs : reminderConvs !== null ? reminderConvs : conversations).filter((c) => {
      const convChannel = (c as unknown as { channel?: string }).channel || 'whatsapp';
      if (channelFilter !== 'all' && convChannel !== channelFilter) return false;
      if (labelFilter === '__reminder') { if (!hasReminder(c)) return false; }
      else if (labelFilter !== 'all' && !getContactTags(c).some(t => t._id === labelFilter)) return false;
      if (stageFilter === '__none__') { if (getContactStageIds(c).length) return false; }
      else if (stageFilter !== 'all' && !getContactStageIds(c).includes(stageFilter)) return false;
      if (!searchQuery || searchConvs !== null) return true;
      const q = searchQuery.toLowerCase();
      return getContactName(c).toLowerCase().includes(q) || getContactPhone(c).includes(q);
    });
    // Same customer's WhatsApp Cloud + QR threads collapse into one row (one
    // customer = one chat). Other channels (email/FB/IG/Telegram) stay separate.
    const byKey = new Map<string, Conversation>();
    for (const c of base) {
      const ch = (c as unknown as { channel?: string }).channel || 'whatsapp';
      const cid = getContactId(c);
      const key = (cid && (ch === 'whatsapp' || ch === 'whatsapp_qr')) ? `wa:${cid}` : `${ch}:${c._id}`;
      const cur = byKey.get(key);
      if (!cur) { byKey.set(key, c); continue; }
      const cp = !!(c as { pinnedAt?: string }).pinnedAt, pp = !!(cur as { pinnedAt?: string }).pinnedAt;
      if ((cp && !pp) || (cp === pp && convSortTime(c) > convSortTime(cur))) byKey.set(key, c);
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const ap = (a as { pinnedAt?: string }).pinnedAt, bp = (b as { pinnedAt?: string }).pinnedAt;
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp) return new Date(bp).getTime() - new Date(ap).getTime();
      const at = convSortTime(a), bt = convSortTime(b);
      if (sortOrder === 'unread') {
        const au = (a.unreadCount || 0) > 0 ? 1 : 0;
        const bu = (b.unreadCount || 0) > 0 ? 1 : 0;
        if (au !== bu) return bu - au;
        return bt - at;
      }
      if (sortOrder === 'oldest') return at - bt;
      return bt - at;
    });
  })();

  // Channel of the currently open conversation. WhatsApp-only features
  // (templates, presets, voice calls, AI toggles, payment links) are hidden
  // for Telegram / Instagram / Facebook / Email chats.
  const selectedChannel = (selectedConv as unknown as { channel?: string } | null)?.channel || 'whatsapp';
  const isWaChat = selectedChannel === 'whatsapp';
  // Channels where free-form sends work (Pay / Preset / Invoice / Chat AI)
  const isMsgChat = ['whatsapp', 'whatsapp_qr', 'telegram', 'telegram_personal', 'facebook', 'instagram'].includes(selectedChannel);

  const getConversationPreview = (conv: Conversation) => {
    const text = conv.lastMessage?.text || '';
    if (text.startsWith('Campaign:')) return text;
    if (conv.lastMessage?.type === 'template') return `Template: ${text}`;
    if (conv.lastMessage?.type === 'image') return 'Image';
    if (conv.lastMessage?.type === 'video') return 'Video';
    if (conv.lastMessage?.type === 'document') return 'Document';
    if (conv.lastMessage?.type === 'audio') return 'Audio';
    if (conv.lastMessage?.type === 'sticker') return 'Sticker';
    return text || getContactSubtitle(conv) || '';
  };

  return (
    <div className="flex h-[calc(100dvh-7rem)] md:h-[calc(100vh-7rem)] bg-white rounded-none md:rounded-xl border border-gray-200 overflow-hidden">
      {/* Conversation List */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{channelFilter === 'whatsapp' ? 'WhatsApp' : channelFilter === 'whatsapp_qr' ? 'WhatsApp QR' : channelFilter === 'instagram' ? 'Instagram' : channelFilter === 'facebook' ? 'Facebook' : channelFilter === 'telegram' ? 'Telegram Bot' : channelFilter === 'telegram_personal' ? 'Personal Telegram' : channelFilter === 'email' ? 'Email' : 'Conversations'}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {Math.max(convTotal, conversations.length)}
              </span>
              <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }} className={`p-1.5 rounded-lg border text-xs ${bulkMode ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`} title="Bulk select">
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <div className="relative">
                <button onClick={() => setExportMenu(exportMenu === 'all' ? null : 'all')}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  title="Export all chats (backup)">
                  <Download className="w-3.5 h-3.5" />
                </button>
                {exportMenu === 'all' && (
                  <div className="absolute right-0 top-8 z-20 bg-white border rounded-lg shadow-lg py-1 w-28">
                    {['csv', 'pdf', 'html'].map(fm => (
                      <button key={fm} onClick={() => handleExportAll(fm)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 uppercase">{fm}</button>
                    ))}
                  </div>
                )}
              </div>
              {channelFilter !== 'facebook' && channelFilter !== 'instagram' && (
              <button onClick={() => { if (channelFilter === 'email') { openEmailCompose('new'); } else if (channelFilter === 'whatsapp_qr') { setQrNewMsg(true); } else if (channelFilter === 'telegram' || channelFilter === 'telegram_personal') { setTgNewMsg(true); } else { setShowNewMsg(true); } }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                title={channelFilter === 'email' ? 'Compose a new email' : 'Send a template to any number (no need to save the contact)'}>
                <Plus className="w-3.5 h-3.5" /> {channelFilter === 'email' ? 'New Email' : 'New Msg'}
              </button>
              )}
            </div>
          </div>
          {notConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-2">
              <p className="text-xs text-amber-800"><b>{CHANNEL_META[channelFilter]?.label || 'This channel'}</b> is not connected yet.</p>
              <Link href={CHANNEL_META[channelFilter]?.href || '/client/channels'} className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Connect</Link>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search interactions"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {bulkMode && bulkSelected.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">{bulkSelected.size} selected</span>
              <button onClick={() => handleBulkAction('close')} className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700">Close All</button>
              <button onClick={() => handleBulkAction('delete')} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
              <button onClick={() => setBulkSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          )}
          {msgResults.length > 0 && (
            <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
              <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase bg-gray-50">Messages ({msgResults.length})</p>
              {msgResults.map(m => (
                <button key={m._id}
                  onClick={() => {
                    const conv = conversations.find(c => c._id === m.conversation);
                    if (conv) { setSearchQuery(''); setMsgResults([]); loadMessages(conv); }
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50">
                  <p className="text-xs font-medium text-gray-800">{m.contact?.name || m.contact?.phone || 'Unknown'} <span className="text-gray-400 font-normal">· {new Date(m.createdAt).toLocaleDateString('en-IN')}</span></p>
                  <p className="text-xs text-gray-500 truncate">{m.direction === 'outbound' ? 'You: ' : ''}{m.text}</p>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white">
              <option value="all">All labels</option>
              <option value="__reminder">⏰ Reminder set</option>
              {allTags.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white">
              <option value="all">All stages</option>
              <option value="__none__">No stage</option>
              {allStages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-0.5 items-center">
            {['all', 'unread', 'active', 'assigned', 'unassigned', 'resolved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-1.5 py-0.5 text-[10px] rounded-full whitespace-nowrap ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'unread')}
              title="Sort conversations"
              className="ml-auto text-[10px] border border-gray-200 rounded-full px-1.5 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="unread">Unread first</option>
            </select>
          </div>
          <div className="flex gap-1">
            {[['all', 'All'], ['hot', '\ud83d\udd25 Hot'], ['warm', 'Warm'], ['cold', 'Cold']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setLeadFilter(v)}
                className={`px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap ${leadFilter === v ? (v === 'hot' ? 'bg-red-600 text-white' : v === 'warm' ? 'bg-orange-500 text-white' : v === 'cold' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMoreConvs && !convsLoadingMore && !loadingConvs) {
              loadMoreConversations();
            }
          }}
        >
          {loadingConvs ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{searchingConvs ? 'Searching…' : searchQuery.trim().length >= 2 ? 'No record found' : 'No conversations'}</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div key={conv._id} className="relative group">
              <button
                onClick={() => { if (bulkMode) { setBulkSelected(prev => { const n = new Set(prev); if (n.has(conv._id)) n.delete(conv._id); else n.add(conv._id); return n; }); } else { loadMessages(conv); } }}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedConv?._id === conv._id ? 'bg-emerald-50' : ''} ${bulkSelected.has(conv._id) ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-2.5 ${bulkSelected.has(conv._id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300'}`}>
                      {bulkSelected.has(conv._id) && <Check className="w-3 h-3" />}
                    </div>
                  )}
                  <ContactAvatar conv={conv} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium truncate ${hasReminder(conv) ? 'text-red-600' : 'text-gray-900'}`}>{hasReminder(conv) && <Bell className="w-3 h-3 inline mr-1 text-red-500" />}{getContactName(conv)}{(conv as { pinnedAt?: string }).pinnedAt && <Pin className="w-3 h-3 inline ml-1 text-emerald-600 align-middle" fill="currentColor" />}{leadBadge(conv)}{(conv.status === 'closed' || (conv as { isResolved?: boolean }).isResolved) && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-emerald-600 text-white align-middle font-medium">Resolved</span>}{hasReminder(conv) && <span className="ml-1 text-[10px] text-red-500 font-normal">{new Date(reminderContacts[getContactId(conv)]).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}{(conv as { channel?: string }).channel === 'facebook' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 align-middle">FB</span> : null}{(conv as { channel?: string }).channel === 'instagram' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-pink-100 text-pink-700 align-middle">IG</span> : null}{(conv as { channel?: string }).channel === 'whatsapp_qr' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 align-middle">QR</span> : null}{(conv as { channel?: string }).channel === 'telegram' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">TG</span> : null}{(conv as { channel?: string }).channel === 'telegram_personal' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">TG-P</span> : null}{(conv as { channel?: string }).channel === 'email' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 align-middle">Email</span> : null}</p>
                      <span className="text-xs text-gray-400 shrink-0 ml-1">{fmtListTime(conv.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate">{getConversationPreview(conv)}</p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-emerald-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{conv.unreadCount}</span>
                      )}
                    </div>
                    {(getContactTags(conv).length > 0 || getContactBadges(conv).length > 0 || (conv.tags && conv.tags.length > 0) || getContactStages(conv).length > 0) && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {getContactStages(conv).map((st) => (
                          <span key={st._id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border" style={{ backgroundColor: (st.color || '#8B5CF6') + '18', color: st.color || '#8B5CF6', borderColor: (st.color || '#8B5CF6') + '55' }}>{st.name}</span>
                        ))}
                        {getContactTags(conv).slice(0, 3).map((t) => (
                          <span key={t._id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: (t.color || '#10b981') + '22', color: t.color || '#047857' }}>{t.name}</span>
                        ))}
                        {getContactBadges(conv).slice(0, 3).map((b) => (
                          <span key={'bg'+b._id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: (b.color || '#10b981') + '22', color: b.color || '#047857' }}>{b.name}</span>
                        ))}
                        {(conv.tags || []).slice(0, 2).map((tag: string, i: number) => (
                          <span key={`ct${i}`} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
              {!bulkMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(conv); }}
                  title={(conv as { pinnedAt?: string }).pinnedAt ? 'Unpin chat' : 'Pin chat to top'}
                  className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-full bg-white shadow border border-gray-100 text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-gray-50 transition-opacity"
                >
                  <Pin className="w-3.5 h-3.5" fill={(conv as { pinnedAt?: string }).pinnedAt ? 'currentColor' : 'none'} />
                </button>
              )}
              </div>
            ))
          )}
          {!loadingConvs && (hasMoreConvs || convsLoadingMore) && (
            <div className="text-center py-2 text-xs text-gray-400">
              {convsLoadingMore ? 'Loading more…' : 'Scroll for more'}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="border-b border-gray-200 bg-white">
            {/* Row 1: Contact info + quick utility icons */}
            <div className="px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0 max-w-[58%] sm:max-w-none">
                <button onClick={() => setSelectedConv(null)} className="md:hidden text-gray-500 mr-1">
                  <X className="w-5 h-5" />
                </button>
                <ContactAvatar conv={selectedConv} gradient size={40} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{getContactName(selectedConv)}</p>
                    <Badge variant={selectedConv.status === 'active' ? 'success' : selectedConv.status === 'resolved' ? 'info' : 'warning'}>
                      {selectedConv.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[220px]">{getContactSubtitle(selectedConv)}</p>
                    <WindowTimer messages={messages} channel={(selectedConv as unknown as { channel?: string })?.channel || 'whatsapp'} />
                    {presence && (selectedConv as unknown as { channel?: string })?.channel === 'whatsapp_qr' && (
                      presence.online
                        ? <span className="text-xs text-emerald-600 font-medium">● online</span>
                        : presence.lastSeen
                          ? <span className="text-xs text-gray-400">last seen {new Date(presence.lastSeen * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          : null
                    )}
                  </div>
                </div>
              </div>
              {/* Utility icons row */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0">
                <div className="relative" ref={stageMenuRef}>
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setStageMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                      setStageMenu(!stageMenu);
                    }}
                    className={`shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg transition-all ${stageMenu ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    title="Assign stage"
                  >
                    <GitBranch className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Stage</span>
                  </button>
                  {stageMenu && (
                    <div className="fixed z-50 bg-white border rounded-xl shadow-lg py-1 w-48 max-h-64 overflow-y-auto" style={{ top: stageMenuPos.top, right: stageMenuPos.right }}>
                      {allStages.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No stages yet — create them under Contacts &gt; Stages</p>
                      ) : (
                        <>
                          <p className="px-3 py-1 text-[10px] text-gray-400">Select one or more stages</p>
                          {allStages.map(s => {
                            const active = getContactStageIds(selectedConv).includes(s._id);
                            return (
                              <button key={s._id} onClick={() => toggleContactStage(s._id)}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                                <span className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || '#8B5CF6' }} />
                                  {s.name}
                                </span>
                                {active && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                              </button>
                            );
                          })}
                          {getContactStageIds(selectedConv).length > 0 && (
                            <button onClick={() => { applyContactStages([]); setStageMenu(false); }}
                              className="w-full px-3 py-1.5 text-xs text-left text-gray-400 hover:bg-gray-50 border-t">
                              Clear all stages
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative" ref={labelMenuRef}>
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setLabelMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                      setLabelMenu(!labelMenu);
                    }}
                    className={`shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg transition-all ${labelMenu ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    title="Assign labels"
                  >
                    <TagIcon className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Labels</span>
                  </button>
                  {labelMenu && (
                    <div className="fixed z-50 bg-white border rounded-xl shadow-lg py-1 w-48 max-h-64 overflow-y-auto" style={{ top: labelMenuPos.top, right: labelMenuPos.right }}>
                      {allTags.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No labels yet — create them under Contacts &gt; Labels</p>
                      ) : allTags.map(t => {
                        const active = getContactTags(selectedConv).some(x => x._id === t._id);
                        return (
                          <button key={t._id} onClick={() => { toggleContactLabel(t._id); setLabelMenu(false); }}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color || '#10b981' }} />
                              {t.name}
                            </span>
                            {active && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {isMsgChat && (
                <button onClick={handleOpenPay} className="shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all" title="Send payment link">
                  <IndianRupee className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Pay</span>
                </button>
                )}
                <button onClick={handleOpenNotes} className="shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all" title="Notes & reminders">
                  <StickyNote className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Notes</span>
                </button>
                <button
                  onClick={() => { setInChatSearch(!inChatSearch); setInChatQuery(''); setMatchIdx(0); }}
                  className={`shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg transition-all ${inChatSearch ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  title="Search in this chat"
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Search</span>
                </button>
                <div className="relative">
                  <button
                    onClick={() => setExportMenu(exportMenu === 'chat' ? null : 'chat')}
                    className="shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all"
                    title="Export this chat"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Export</span>
                  </button>
                  {exportMenu === 'chat' && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-xl shadow-lg py-1 w-28">
                      {['csv', 'pdf', 'html'].map(fm => (
                        <button key={fm} onClick={() => handleExportChat(fm)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 uppercase">{fm}</button>
                      ))}
                    </div>
                  )}
                </div>
                {isWaChat && (
                <>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={() => startCall(getContactPhone(selectedConv), getContactName(selectedConv))}
                  disabled={callActive}
                  className="shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-50"
                  title="Call this contact yourself (uses your microphone)"
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">Call</span>
                </button>
                <button
                  onClick={handleAiCall}
                  disabled={aiCalling}
                  className="shrink-0 flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
                  title="AI calls the customer and talks to them"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">AI Call</span>
                </button>
                </>
                )}
              </div>
            </div>
            {/* Row 2: Action buttons bar */}
            <div className="px-3 sm:px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {isMsgChat && (
              <>
              <button
                onClick={() => handleToggleAI('chat')}
                disabled={togglingAI}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap disabled:opacity-50 ${chatAiOn ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                title={chatAiOn ? 'Chat AI is ON — click to turn off' : 'Turn ON Chat AI'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chatAiOn ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <Bot className="w-3.5 h-3.5" />
                Chat AI
                <span className={`text-[10px] font-bold ${chatAiOn ? 'text-emerald-600' : 'text-gray-400'}`}>{chatAiOn ? 'ON' : 'OFF'}</span>
              </button>
              {isWaChat && (
              <button
                onClick={() => handleToggleAI('call')}
                disabled={togglingAI}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap disabled:opacity-50 ${selectedConv.aiCallEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                title={selectedConv.aiCallEnabled ? 'Call AI is ON — click to turn off' : 'Turn ON Call AI'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedConv.aiCallEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <PhoneCall className="w-3.5 h-3.5" />
                Call AI
                <span className={`text-[10px] font-bold ${selectedConv.aiCallEnabled ? 'text-emerald-600' : 'text-gray-400'}`}>{selectedConv.aiCallEnabled ? 'ON' : 'OFF'}</span>
              </button>
              )}
              <div className="w-px h-5 bg-gray-200 mx-0.5" />
              {isWaChat && (
              <button
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all whitespace-nowrap"
                title="Send a template message"
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                Template
              </button>
              )}
              <button
                onClick={() => setShowPresetModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all whitespace-nowrap"
                title="Send a preset message (free)"
              >
                <PiggyBank className="w-3.5 h-3.5" />
                Preset
              </button>
              </>
              )}
              <div ref={assignMenuRef}>
                <button
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setAssignMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) });
                    setShowAssignMenu(v => !v);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all whitespace-nowrap"
                  title="Assign to agent"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign
                </button>
                {showAssignMenu && assignMenuPos && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setShowAssignMenu(false)} />
                    <div className="fixed w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] py-1 max-h-64 overflow-y-auto" style={{ top: assignMenuPos.top, left: assignMenuPos.left }}>
                      <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase border-b">Assign to Agent</p>
                      {agents.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-400">No agents available</p>
                      )}
                      {agents.map(a => {
                        const assignedId = typeof selectedConv?.assignedAgent === 'string' ? selectedConv.assignedAgent : selectedConv?.assignedAgent?._id;
                        const isAssigned = assignedId === a._id;
                        return (
                          <button
                            key={a._id}
                            onClick={() => handleAssignAgent(a._id)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${isAssigned ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
                          >
                            <span className="truncate">{a.name}</span>
                            {isAssigned && <CheckIcon className="w-4 h-4 text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div>
                <button
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPipelineMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) });
                    setShowPipelineMenu(v => !v);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-all whitespace-nowrap"
                  title="Add this chat to a sales pipeline stage"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Pipeline
                </button>
                {showPipelineMenu && pipelineMenuPos && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setShowPipelineMenu(false)} />
                    <div className="fixed w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] py-1 max-h-72 overflow-y-auto" style={{ top: pipelineMenuPos.top, left: pipelineMenuPos.left }}>
                      {pipelines.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-400">No pipeline found. Create one in Pipelines.</p>
                      )}
                      {pipelines.map(p => {
                        const cid = typeof selectedConv?.contact === 'string' ? selectedConv?.contact : (selectedConv?.contact as { _id?: string })?._id;
                        const currentDeal = p.deals?.find(d => (typeof d.contact === 'string' ? d.contact : d.contact?._id) === cid);
                        return (
                          <div key={p._id}>
                            <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase border-b">{p.name}</p>
                            {(p.stages || []).map(s => {
                              const isCurrent = currentDeal?.stage === s.name;
                              return (
                                <button
                                  key={s.name}
                                  onClick={() => handleAddToPipeline(p._id, s.name)}
                                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${isCurrent ? 'bg-violet-50 text-violet-700' : 'text-gray-700'}`}
                                >
                                  <span className="truncate">{s.name}</span>
                                  {isCurrent && <CheckIcon className="w-4 h-4 text-violet-600" />}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {isMsgChat && (
              <button onClick={() => setShowInvoice(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all whitespace-nowrap"
                title="Create & send Quotation/Invoice">
                🧾 Invoice
              </button>
              )}
              {showInvoice && <InvoiceModal convId={selectedConv._id} onClose={() => setShowInvoice(false)} />}
              <button
                onClick={async () => {
                  if (summarizing) return;
                  setSummarizing(true);
                  try {
                    const r = await conversationApi.aiSummary(selectedConv._id);
                    setAiSummaryText(r.data?.data?.summary || 'No summary');
                  } catch (err: unknown) {
                    const e = err as { response?: { data?: { message?: string } } };
                    setAiSummaryText(e.response?.data?.message || 'Summary failed');
                  }
                  setSummarizing(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all whitespace-nowrap shadow-sm"
                title="AI summary of conversation"
              >
                {summarizing ? '...' : '✨ Summary'}
              </button>
              {aiSummaryText && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAiSummaryText(null)}>
                  <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900">✨ AI Summary</h3>
                      <button onClick={() => setAiSummaryText(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-80 overflow-y-auto">{aiSummaryText}</p>
                  </div>
                </div>
              )}
              <div className="ml-auto">
                <button
                  onClick={async () => {
                    try {
                      const r = await conversationApi.resolve(selectedConv._id);
                      const st = r.data?.data?.status || 'closed';
                      const resolved = st === 'closed';
                      setSelectedConv({ ...selectedConv, status: st, isResolved: resolved } as Conversation);
                      setConversations(prev => prev.map(c => c._id === selectedConv._id ? ({ ...c, status: st, isResolved: resolved } as Conversation) : c));
                    } catch { /* empty */ }
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shadow-sm ${selectedConv.status === 'closed' ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  title={selectedConv.status === 'closed' ? 'Reopen conversation' : 'Resolve conversation'}
                >
                  {selectedConv.status === 'closed' ? 'Reopen' : 'Resolve'}
                </button>
              </div>
            </div>
          </div>

          {inChatSearch && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input autoFocus type="text" value={inChatQuery}
                onChange={(e) => { setInChatQuery(e.target.value); setMatchIdx(0); }}
                onKeyDown={(e) => { if (e.key === 'Enter') jumpToMatch(matchIdx < matchIds.length - 1 ? matchIdx + 1 : 0); }}
                placeholder="Search in this chat..."
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              <span className="text-xs text-gray-500">{chatSearching ? 'Searching…' : matchIds.length ? `${matchIdx + 1}/${matchIds.length}` : inChatQuery.trim().length >= 2 ? 'No record found' : ''}</span>
              <button onClick={() => jumpToMatch(matchIdx > 0 ? matchIdx - 1 : matchIds.length - 1)} className="p-1 text-gray-500 hover:bg-gray-200 rounded" title="Previous">↑</button>
              <button onClick={() => jumpToMatch(matchIdx < matchIds.length - 1 ? matchIdx + 1 : 0)} className="p-1 text-gray-500 hover:bg-gray-200 rounded" title="Next">↓</button>
              <button onClick={() => { setInChatSearch(false); setInChatQuery(''); }} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={(e) => {
              if (e.currentTarget.scrollTop < 120 && hasOlder && !olderLoading && !loadingMsgs) {
                loadOlderMessages();
              }
            }}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-[#f0f2f5] space-y-3"
          >
            {!loadingMsgs && (hasOlder || olderLoading) && (
              <div className="text-center py-2 text-xs text-gray-400">
                {olderLoading ? 'Loading older messages…' : 'Scroll up for older messages'}
              </div>
            )}
            {loadingMsgs ? (
              <div className="text-center py-8 text-gray-400">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No messages yet</p>
                <p className="text-gray-400 text-xs mt-1">{isWaChat ? 'Send a template message to begin chatting' : 'Type a message below to reply'}</p>
                {isWaChat && (
                <button onClick={() => setShowTemplateModal(true)} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                  <LayoutTemplate className="w-4 h-4 inline mr-1" /> Send Template
                </button>
                )}
              </div>
            ) : (
              messages.map((msg) => {
                const isEmailMsg = (msg as { metadata?: { source?: string } }).metadata?.source === 'email'
                  || (selectedConv as unknown as { channel?: string } | null)?.channel === 'email';
                return (
                <div key={msg._id} id={`msg-${msg._id}`} className={`group flex min-w-0 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} ${matchIds.includes(msg._id) ? (matchIds[matchIdx] === msg._id ? 'rounded-lg ring-2 ring-amber-400' : 'rounded-lg ring-1 ring-amber-200') : ''}`}>
                  <div className={`${isEmailMsg ? 'max-w-[98%] w-full' : 'max-w-[85%] sm:max-w-[70%]'} min-w-0 break-words [overflow-wrap:anywhere] rounded-xl px-4 py-2 shadow-sm ${
                    msg.direction === 'outbound' ? 'bg-[#d9fdd3] text-gray-900 rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm'
                  }`}>
                    {msg.context?.messageId && (
                      <div className="mb-1 border-l-4 border-emerald-500 bg-black/5 rounded px-2 py-1 text-xs text-gray-600">
                        <span className="font-medium text-emerald-700">{msg.context.from === 'outbound' ? 'You' : 'Customer'}</span>
                        <div className="truncate max-w-[240px]">{msg.context.text || 'Message'}</div>
                      </div>
                    )}
                    {renderMessageContent(msg)}
                    <div className={`flex items-center justify-end gap-1 mt-1 text-gray-400`}>
                      <span className="text-[10px]">{new Date(msg.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                      <button onClick={() => setReactPickerId(reactPickerId === msg._id ? null : msg._id)} className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 hover:text-emerald-600 transition-opacity" title="React"><Smile className="w-3 h-3" /></button>
                      <button onClick={() => setReplyTo(msg)} className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 hover:text-emerald-600 transition-opacity" title="Reply"><Reply className="w-3 h-3" /></button>
                      <button onClick={() => setForwardMsg(msg)} className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 hover:text-emerald-600 transition-opacity" title="Forward"><Share2 className="w-3 h-3" /></button>
                    </div>
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex gap-0.5 -mt-0.5">
                        {msg.reactions.map((r, i) => (
                          <span key={i} className="text-xs bg-white rounded-full px-1.5 py-0.5 shadow-sm border border-gray-100">{r.emoji}</span>
                        ))}
                      </div>
                    )}
                    {reactPickerId === msg._id && (
                      <div className="flex gap-1 mt-1 bg-white rounded-full shadow border px-2 py-1 w-fit">
                        {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((e) => (
                          <button key={e} onClick={() => handleReact(msg, e)} className="text-base leading-none hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}
            {typingAgent && (
              <div className="flex justify-start">
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm">
                  <p className="text-xs text-gray-500 italic">{typingAgent} is typing...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="p-2 sm:p-3 border-t border-gray-200 bg-white">
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 border-l-4 border-emerald-500 bg-gray-50 rounded px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-emerald-700">Replying to {replyTo.direction === 'outbound' ? 'yourself' : 'customer'}</div>
                  <div className="text-xs text-gray-600 truncate">{replyTo.text || replyTo.media?.caption || `[${replyTo.type}]`}</div>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
            )}
            {/* Quick Reply Bar */}
            {showQuickReplies && quickReplies.length > 0 && (
              <div className="mb-2 p-2 bg-gray-50 rounded-lg border max-h-40 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">Quick Replies</span>
                  <button onClick={() => setShowQuickReplies(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                </div>
                {quickReplies.map((qr) => (
                  <button key={qr._id} onClick={() => handleQuickReply(qr)} className="w-full text-left px-3 py-2 hover:bg-white rounded text-sm flex items-center gap-2">
                    <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900">{qr.title}</span>
                      <span className="text-gray-400 ml-2 text-xs">{qr.shortcut}</span>
                      <p className="text-xs text-gray-500 truncate">{qr.message}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(() => {
              const assignedId = typeof selectedConv?.assignedAgent === 'string' ? selectedConv.assignedAgent : selectedConv?.assignedAgent?._id;
              if (!assignedId || !user || assignedId === user._id) return null;
              const assignedName = (typeof selectedConv?.assignedAgent === 'object' && selectedConv?.assignedAgent?.name)
                || agents.find(a => a._id === assignedId)?.name || 'another agent';
              return (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-sm text-amber-800 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" /> Taken by {assignedName} — only they can reply
                  </span>
                  <button onClick={async () => {
                    try {
                      await conversationApi.assign(selectedConv!._id, user._id);
                      setSelectedConv({ ...selectedConv!, assignedAgent: { _id: user._id, name: user.name } });
                      toast.success('Chat taken over');
                    } catch { toast.error('Failed to take over'); }
                  }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    Take over
                  </button>
                </div>
              );
            })() || (selectedChannel === 'email' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => openEmailCompose('reply')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
                  <Mail className="w-4 h-4" /> Reply
                </button>
                <button onClick={() => openEmailCompose('replyAll')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Reply All
                </button>
                <button onClick={() => openEmailCompose('forward')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Share2 className="w-4 h-4" /> Forward
                </button>
              </div>
            ) : (
            <div className="relative flex flex-wrap items-end gap-1.5 sm:flex-nowrap sm:gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={fileAccept}
                onChange={handleFileUpload}
              />

              {/* Attachment button with popup */}
              <div className="relative order-2 sm:order-none" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={uploading}
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0"
                  title="Attach"
                >
                  {uploading ? (
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Paperclip className="w-5 h-5" />
                  )}
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 bg-white rounded-xl shadow-lg border border-gray-200 py-2 w-52 z-50">
                    <button onClick={() => handleAttachFile('image/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-purple-600" /></div>
                      Image
                    </button>
                    <button onClick={() => handleAttachFile('video/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><Video className="w-4 h-4 text-red-600" /></div>
                      Video
                    </button>
                    <button onClick={() => handleAttachFile('.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-600" /></div>
                      Document
                    </button>
                    <button onClick={() => handleAttachFile('audio/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center"><Mic className="w-4 h-4 text-orange-600" /></div>
                      Audio
                    </button>
                    <button onClick={() => { stickerModeRef.current = true; handleAttachFile('image/*,.webp,.gif'); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center"><Smile className="w-4 h-4 text-yellow-600" /></div>
                      Sticker
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { setShowQuickReplies(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Zap className="w-4 h-4 text-emerald-600" /></div>
                      Quick Reply
                    </button>
                    {isWaChat && (
                    <>
                    <button onClick={() => { setShowFormPicker(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center"><ClipboardList className="w-4 h-4 text-pink-600" /></div>
                      Form
                    </button>
                    <button onClick={() => { setShowCatalog(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-amber-600" /></div>
                      Product / Catalog
                    </button>
                    <button onClick={() => { setShowTemplateModal(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center"><LayoutTemplate className="w-4 h-4 text-teal-600" /></div>
                      Template
                    </button>
                    </>
                    )}
                  </div>
                )}
              </div>

              <div className="order-1 min-w-0 relative w-full basis-full sm:order-none sm:basis-auto sm:flex-1">
                <textarea
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    if (selectedConv) emitTyping(selectedConv._id, e.target.value.length > 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full min-h-[40px] max-h-28 px-3 sm:px-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="relative order-2 sm:order-none">
                {showEmoji && (
                  <div className="absolute bottom-12 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                    <div className="grid grid-cols-8 gap-0.5">
                      {['😀','😁','😂','🤣','😅','😊','😇','😉','😍','😘','😋','😜','🤗','🤔','😎','🤩','🥳','😢','😭','😡','😱','😴','🤒','🤕','👍','👎','👌','✌️','🤝','🙏','💪','👏','🙌','❤️','💕','💔','🔥','⭐','✨','🎉','🎊','🏆','🎁','💰','💸','✅','❌','⚠️','📌','📞','📧','🗓️','⏰','🚀','💡','📊','🛒','🌟','😌','🥰','🙃','🙄','😬','🤑'].map(e => (
                        <button key={e} onClick={() => { setMessageText(t => t + e); }} className="text-xl p-1 hover:bg-gray-100 rounded">{e}</button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => setShowEmoji(v => !v)} className={`p-1.5 sm:p-2 rounded-lg hover:bg-gray-50 shrink-0 ${showEmoji ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Smile className="w-5 h-5" />
                </button>
              </div>
              <div className="relative order-2 hidden sm:order-none sm:block">
                {showStickers && (
                  <div className="absolute bottom-12 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-72 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-500">Stickers</span>
                      <button
                        onClick={() => { setShowStickers(false); stickerModeRef.current = true; handleAttachFile('image/*,.webp,.gif'); }}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        + Add new
                      </button>
                    </div>
                    {!stickerLibLoaded ? (
                      <div className="py-6 text-center text-xs text-gray-400">Loading...</div>
                    ) : stickerLib.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-400">No stickers yet. Tap &quot;+ Add new&quot; to send one.</div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {stickerLib.map((s) => (
                          <button key={s.url} onClick={() => sendStickerUrl(s.url)} className="aspect-square rounded-lg hover:bg-gray-100 p-1 flex items-center justify-center">
                            <img src={s.url} alt="" className="max-w-full max-h-full object-contain" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => { setShowStickers(v => { const nv = !v; if (nv && !stickerLibLoaded) loadStickerLib(); return nv; }); setShowEmoji(false); }}
                  className={`p-2 rounded-lg hover:bg-gray-50 shrink-0 ${showStickers ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Stickers"
                >
                  <StickerIcon className="w-5 h-5" />
                </button>
              </div>
              {scheduleMode && (
                <div className="absolute bottom-14 left-2 right-2 z-50 rounded-xl border bg-white p-3 shadow-lg sm:left-auto sm:right-2 sm:w-72">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Schedule message
                    </span>

                    <button
                      onClick={() => setScheduleMode(false)}
                      className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Cancel schedule"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Date
                      </label>

                      <input
                        type="date"
                        value={scheduleTime ? scheduleTime.split("T")[0] : ""}
                        onChange={(e) => {
                          const currentTime =
                            scheduleTime?.split("T")[1] || "09:00";

                          setScheduleTime(
                            e.target.value
                              ? `${e.target.value}T${currentTime}`
                              : ""
                          );
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Time
                      </label>

                      <input
                        type="time"
                        value={scheduleTime ? scheduleTime.split("T")[1] : ""}
                        onChange={(e) => {
                          const currentDate =
                            scheduleTime?.split("T")[0] || "";

                          setScheduleTime(
                            currentDate
                              ? `${currentDate}T${e.target.value}`
                              : ""
                          );
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      onClick={() => setScheduleMode(false)}
                      disabled={!scheduleTime}
                      className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => setScheduleMode(!scheduleMode)}
                className={`order-2 block shrink-0 rounded-lg p-2 hover:bg-gray-50 sm:order-none ${
                  scheduleMode
                    ? "text-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Schedule message"
              >
                <Calendar className="h-5 w-5" />
              </button>
              {recording ? (
                <div className="order-2 flex items-center gap-2 px-1 sm:order-none sm:px-2 shrink-0">
                  <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
                  </span>
                  <button onClick={() => finishRecording(true)} className="p-2 text-gray-400 hover:text-gray-600" title="Cancel recording">
                    <X className="w-5 h-5" />
                  </button>
                  <button onClick={() => finishRecording(false)} className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700" title="Send voice message">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                  <button onClick={startRecording} disabled={uploading} className="order-2 p-1.5 sm:order-none sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0" title="Record voice message">
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
                className="order-2 ml-auto p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 sm:order-none sm:ml-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-[#f0f2f5]">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">Welcome to {brand.name}{brand.tagline ? ` ${brand.tagline}` : ''}</h3>
            <p className="text-sm text-gray-400 mt-1">Choose a conversation from the sidebar to begin chatting or send a new message</p>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setForwardMsg(null); setForwardSearch(''); }}>
          <div className="bg-white rounded-xl p-6 w-96 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Forward Message</h3>
              <button onClick={() => { setForwardMsg(null); setForwardSearch(''); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg mb-3 text-sm text-gray-600 max-h-20 overflow-hidden">{forwardMsg.text || forwardMsg.media?.caption || '[Media]'}</div>
            <input type="text" placeholder="Search contact..." value={forwardSearch} onChange={e => setForwardSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex-1 overflow-y-auto space-y-1">
              {conversations.filter(c => !forwardSearch || getContactName(c).toLowerCase().includes(forwardSearch.toLowerCase()) || getContactPhone(c).includes(forwardSearch)).map(c => (
                <button key={c._id} onClick={() => handleForwardMessage(c._id)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-semibold">{getContactInitial(c)}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{getContactName(c)}</p><p className="text-xs text-gray-500">{getContactSubtitle(c)}</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Catalog/Product Send Modal */}
      {showCatalog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCatalog(false)}>
          <div className="bg-white rounded-xl p-6 w-[440px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Send Product</h3>
              <button onClick={() => setShowCatalog(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {catalogProducts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No products in catalog. Add products in Catalogs page first.</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {catalogProducts.map(p => (
                  <button key={p._id} onClick={() => handleSendProduct(p)} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 text-left">
                    {p.image ? <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-gray-400" /></div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-emerald-600 font-semibold">Rs.{p.price}</p>
                      {p.description && <p className="text-xs text-gray-500 truncate">{p.description}</p>}
                    </div>
                    <Send className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Modal */}
          {/* Form Picker Modal */}
          {showFormPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFormPicker(false)}>
              <div className="bg-white rounded-xl p-6 w-96 max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Send Form</h3>
                  <button onClick={() => setShowFormPicker(false)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                {forms.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No forms created yet. Create one from Forms page.</p>
                ) : (
                  <div className="space-y-2">
                    {forms.map((form) => (
                      <button key={form._id} onClick={async () => {
                        if (!selectedConv) return;
                        try {
                          if (form.waFlow?.status === 'published') {
                            await formApi.sendFlow(form._id, selectedConv._id);
                            toast.success('Native WhatsApp form sent');
                          } else {
                            const formUrl = `${window.location.origin}/form/${form._id}`;
                            const text = `📋 *${form.name}*\n${form.description ? form.description + '\n' : ''}\n👉 ${formUrl}`;
                            await conversationApi.sendMessage(selectedConv._id, { type: 'text', text });
                          }
                          setShowFormPicker(false);
                        } catch (err) {
                          const er = err as { response?: { data?: { message?: string } } };
                          toast.error(er.response?.data?.message || 'Form send failed');
                        }
                      }} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition">
                        <p className="font-medium text-sm text-gray-900">{form.name}</p>
                        {form.description && <p className="text-xs text-gray-500 mt-0.5">{form.description}</p>}
                        {form.waFlow?.status === 'published'
                          ? <p className="text-xs text-emerald-600 mt-1 font-medium">Native WhatsApp form (opens inside WhatsApp)</p>
                          : <p className="text-xs text-gray-400 mt-1">Sends as link — publish on Forms page for native form</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowTemplateModal(false); setTplToSend(null); }}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900">Send Template</h3>
              <button onClick={() => { setShowTemplateModal(false); setTplToSend(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {tplToSend ? (
                <div className="flex flex-col md:flex-row gap-5">
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{tplToSend.name}</p>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{tplToSend.category} · {tplToSend.language || 'en'}</span>
                    </div>
                    {tplVars.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500">This template has {tplVars.length} variable(s) — fill in the values (live preview below):</p>
                        {tplVars.map((v, i) => (
                          <input key={i} value={v} placeholder={`Value for {{${i + 1}}}`} onChange={(e) => setTplVars(prev => prev.map((p, idx) => idx === i ? e.target.value : p))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        ))}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">This template has no variables — send it directly.</p>
                    )}
                    {waNumbers.length > 1 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Send from number</label>
                        <select value={tplFromNumber} onChange={(e) => setTplFromNumber(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">Conversation&apos;s number (default)</option>
                          {waNumbers.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setTplToSend(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Back</button>
                      <button disabled={tplVars.some(v => !v.trim()) || sending} onClick={() => handleSendTemplate(tplToSend, tplVars)} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{sending ? 'Sending...' : 'Send Template'}</button>
                    </div>
                  </div>
                  <div className="mx-auto shrink-0">
                    <WhatsAppPhonePreview data={tplPreviewData(tplToSend, tplVars)} />
                  </div>
                </div>
              ) : templates.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No approved templates available. Go to Templates page to sync from Meta.</p>
              ) : (
                templates.map((t) => (
                  <button key={t._id} onClick={() => handlePickTemplate(t)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{t.category} · {t.language || 'en'}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{t.body || 'No preview available'}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* New Message Modal — send template to any number */}
      {qrNewMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setQrNewMsg(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">New WhatsApp QR Message</h3>
            <p className="text-xs text-gray-500">Send a free-form message to any number — no template needed, no per-message charge. Counts toward the daily safety limit.</p>
            <input type="tel" placeholder="Phone with country code, e.g. 919876543210" value={qrNewPhone} onChange={(e) => setQrNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <textarea rows={4} placeholder="Type your message..." value={qrNewText} onChange={(e) => setQrNewText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setQrNewMsg(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button disabled={qrNewSending || !qrNewPhone.trim() || !qrNewText.trim()} onClick={async () => {
                setQrNewSending(true);
                try {
                  await waqrApi.sendNew(qrNewPhone, qrNewText);
                  toast.success('Message sent');
                  setQrNewMsg(false); setQrNewPhone(''); setQrNewText('');
                  try { const res = await conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>); setConversations(res.data.data || []); } catch { /* */ }
                } catch (err) {
                  const e = err as { response?: { data?: { message?: string } } };
                  toast.error(e.response?.data?.message || 'Failed to send');
                }
                setQrNewSending(false);
              }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{qrNewSending ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
      {/* New Telegram Message Modal — plain text to any number */}
      {tgNewMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTgNewMsg(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">New Telegram Message</h3>
            <p className="text-xs text-gray-500">Send a message to any phone number that has a Telegram account.</p>
            <input type="tel" placeholder="Phone with country code, e.g. 919876543210" value={tgNewPhone} onChange={(e) => setTgNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <textarea rows={4} placeholder="Type your message..." value={tgNewText} onChange={(e) => setTgNewText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setTgNewMsg(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button disabled={tgNewSending || !tgNewPhone.trim() || !tgNewText.trim()} onClick={async () => {
                setTgNewSending(true);
                try {
                  const convRes = await api.post('/conversations/by-phone', { phone: tgNewPhone, channel: channelFilter });
                  const conv = convRes.data.data;
                  const res = await conversationApi.sendMessage(conv._id, { type: 'text', text: tgNewText });
                  if (res.data.data?.status === 'failed') {
                    toast.error(res.data.data.errorMessage || 'Failed to send');
                  } else {
                    toast.success('Message sent');
                    setTgNewMsg(false); setTgNewPhone(''); setTgNewText('');
                    setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
                    loadMessages(conv);
                  }
                } catch (err) {
                  const e = err as { response?: { data?: { message?: string } } };
                  toast.error(e.response?.data?.message || 'Failed to send');
                }
                setTgNewSending(false);
              }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{tgNewSending ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
      {showNewMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewMsg(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900">{channelFilter === 'email' ? (emailMode === 'reply' ? 'Reply' : emailMode === 'replyAll' ? 'Reply All' : emailMode === 'forward' ? 'Forward' : 'New Email') : 'New Message'}</h3>
              <button onClick={() => setShowNewMsg(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {channelFilter === 'email' ? (
              <div className="p-4 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="email" value={newEmail.to} onChange={(e) => setNewEmail(p => ({ ...p, to: e.target.value }))} placeholder="customer@example.com"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-xs text-emerald-600 hover:underline shrink-0">Add Cc</button>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">The email is sent from your connected inbox (configure SMTP on the Channels page).</p>
                </div>
                {showCc && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cc</label>
                    <input type="text" value={newEmail.cc} onChange={(e) => setNewEmail(p => ({ ...p, cc: e.target.value }))} placeholder="cc1@example.com, cc2@example.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input value={newEmail.subject} onChange={(e) => setNewEmail(p => ({ ...p, subject: e.target.value }))} placeholder="Subject line"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message <span className="text-red-500">*</span></label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50 text-gray-600">
                      <button type="button" title="Bold" onMouseDown={(e) => { e.preventDefault(); execFmt('bold'); }} className="w-7 h-7 rounded hover:bg-gray-200 font-bold text-sm">B</button>
                      <button type="button" title="Italic" onMouseDown={(e) => { e.preventDefault(); execFmt('italic'); }} className="w-7 h-7 rounded hover:bg-gray-200 italic text-sm">I</button>
                      <button type="button" title="Underline" onMouseDown={(e) => { e.preventDefault(); execFmt('underline'); }} className="w-7 h-7 rounded hover:bg-gray-200 underline text-sm">U</button>
                      <span className="w-px h-4 bg-gray-200 mx-1" />
                      <button type="button" title="Bulleted list" onMouseDown={(e) => { e.preventDefault(); execFmt('insertUnorderedList'); }} className="w-7 h-7 rounded hover:bg-gray-200 text-sm">•</button>
                      <button type="button" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); execFmt('insertOrderedList'); }} className="w-7 h-7 rounded hover:bg-gray-200 text-xs">1.</button>
                      <button type="button" title="Insert link" onMouseDown={(e) => { e.preventDefault(); const url = prompt('Link URL:'); if (url) execFmt('createLink', url); }} className="w-7 h-7 rounded hover:bg-gray-200 text-xs underline">↗</button>
                    </div>
                    <div ref={emailBodyRef} contentEditable suppressContentEditableWarning
                      onInput={(e) => setNewEmail(p => ({ ...p, body: (e.target as HTMLDivElement).innerText }))}
                      data-placeholder="Write your email..."
                      className="email-compose min-h-[160px] max-h-[300px] overflow-y-auto px-3 py-2 text-sm focus:outline-none [&_a]:text-emerald-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" />
                  </div>
                  <style jsx>{`.email-compose:empty:before{content:attr(data-placeholder);color:#9ca3af;}`}</style>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input ref={emailFileRef} type="file" multiple className="hidden" onChange={handleEmailAttach} />
                    <button type="button" onClick={() => emailFileRef.current?.click()} disabled={emailUploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      <Paperclip className="w-4 h-4" /> {emailUploading ? 'Uploading...' : 'Attach files'}
                    </button>
                    {emailAttachments.length > 0 && <span className="text-xs text-gray-400">{emailAttachments.length} attached</span>}
                  </div>
                  {emailAttachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emailAttachments.map((a, i) => (
                        <span key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-700">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          <span className="max-w-[160px] truncate">{a.filename}</span>
                          <button onClick={() => setEmailAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowNewMsg(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel</button>
                  <button disabled={!newEmail.to.trim() || !newEmail.body.trim() || submitting} onClick={handleSendNewEmail}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{submitting ? 'Sending...' : 'Send Email'}</button>
                </div>
              </div>
            ) : (
            <div className="p-4 overflow-y-auto">
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1 space-y-4 min-w-0">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                    <input value={newMsgPhone} onChange={(e) => setNewMsgPhone(e.target.value)} placeholder="9198765XXXXX"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <p className="text-xs text-gray-400 mt-1">With country code (91 is auto-added for 10-digit Indian numbers). No need to save the contact.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                    <p className="text-xs text-gray-400 mb-1.5">Select one from your WhatsApp approved template messages</p>
                    <select value={newMsgTpl?._id || ''} onChange={(e) => {
                      const t = templates.find(x => x._id === e.target.value) || null;
                      setNewMsgTpl(t);
                      setNewMsgVars(t ? Array(countTemplateVars(t.body)).fill('') : []);
                    }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Select</option>
                      {templates.map(t => <option key={t._id} value={t._id}>{t.name} ({t.category} · {t.language || 'en'})</option>)}
                    </select>
                  </div>
                  {waNumbers.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Send From Number</label>
                      <select value={newMsgFrom} onChange={(e) => setNewMsgFrom(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        {waNumbers.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                      </select>
                    </div>
                  )}
                  {newMsgVars.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Template variables:</p>
                      {newMsgVars.map((v, i) => (
                        <input key={i} value={v} placeholder={`Value for {{${i + 1}}}`} onChange={(e) => setNewMsgVars(prev => prev.map((p, idx) => idx === i ? e.target.value : p))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setShowNewMsg(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel</button>
                    <button disabled={!newMsgTpl || newMsgVars.some(v => !v.trim()) || submitting} onClick={handleSendNewMsg}
                      className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{submitting ? 'Sending...' : 'Send Message'}</button>
                  </div>
                </div>
                <div className="mx-auto shrink-0">
                  <WhatsAppPhonePreview data={newMsgTpl ? tplPreviewData(newMsgTpl, newMsgVars) : { body: '' }} />
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPresetModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Send Preset (Free)</h3>
              <button onClick={() => setShowPresetModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-gray-500 mb-3">Only goes to customers with an open 24-hr window — no template charge.</p>
              {presets.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No preset templates. Create one under Save Money &rarr; Preset Templates.</p>
              ) : presets.map((p) => (
                <button key={p._id} disabled={sending} onClick={() => handleSendPreset(p._id)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 mb-2 disabled:opacity-50">
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <p className="text-sm text-gray-500 line-clamp-2">{p.body}</p>
                </button>
              ))}
              {respResources.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-2">Response Resources (insert into message box)</p>
                  {respResources.map((r) => (
                    <button key={r._id} onClick={() => { setMessageText(r.content); setShowPresetModal(false); api.post(`/response-resources/${r._id}/use`).catch(() => {}); }} className="w-full text-left p-3 rounded-lg hover:bg-emerald-50 border border-emerald-100 mb-2">
                      <span className="font-medium text-gray-900">{r.title}</span>
                      {r.shortcut && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{r.shortcut}</span>}
                      <p className="text-sm text-gray-500 line-clamp-2">{r.content}</p>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {payOpen && selectedConv && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setPayOpen(false)} />
          <div className="w-full max-w-md bg-white h-full shadow-xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-emerald-600" /> Payment Links</h3>
              <button onClick={() => setPayOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 border rounded-xl p-3 bg-emerald-50/40 border-emerald-100">
              <div className="flex gap-2">
                <input type="number" min="1" placeholder="Amount (₹)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="px-2 py-2 border rounded-lg text-sm">
                  {[['razorpay', 'Razorpay'], ['stripe', 'Stripe'], ['paypal', 'PayPal'], ['cashfree', 'Cashfree'], ['payu', 'PayU'], ['paytm', 'Paytm'], ['phonepe', 'PhonePe'], ['paystack', 'Paystack'], ['mercadopago', 'Mercado Pago']].filter(([v]) => payGateways.includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  <option value="upi">UPI</option>
                  {(((selectedConv as unknown as { channel?: string })?.channel || 'whatsapp') === 'whatsapp') && <option value="whatsapp_pay">WhatsApp Pay (in-chat)</option>}
                </select>
                {!['razorpay', 'upi', 'paytm', 'phonepe', 'whatsapp_pay'].includes(payMethod) && (
                  <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)} className="px-2 py-2 border rounded-lg text-sm">
                    {['INR', 'USD', 'EUR', 'GBP', 'AED', 'NGN', 'ZAR', 'BRL', 'MXN'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              {payMethod === 'upi' && (
                <input placeholder="Your UPI ID (e.g. name@upi)" value={payUpi} onChange={(e) => setPayUpi(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              )}
              <input placeholder="Description (optional)" value={payDesc} onChange={(e) => setPayDesc(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <button type="button" onClick={() => setPayAutoOpen(!payAutoOpen)} className="w-full text-left text-xs font-medium text-emerald-700 hover:text-emerald-800">
                {payAutoOpen ? '▾' : '▸'} Auto-delivery after payment (optional)
              </button>
              {payAutoOpen && (
                <div className="space-y-2 border rounded-lg p-2.5 bg-white">
                  <textarea placeholder="On success: message to send (e.g. Thank you! Here is your ebook 📖)" value={paySuccessMsg} onChange={(e) => setPaySuccessMsg(e.target.value)}
                    rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  <ImageUploadInput label="On success: file to deliver (PDF/ebook/image)" value={paySuccessFile} onChange={setPaySuccessFile} folder="payment-files" accept="*/*" hint="Sent automatically on WhatsApp when payment succeeds" />
                  <textarea placeholder="On failure: message to send (e.g. Payment failed — please try again)" value={payFailMsg} onChange={(e) => setPayFailMsg(e.target.value)}
                    rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  <p className="text-[11px] text-gray-400">Works automatically with Razorpay webhooks. For UPI/other gateways, delivery happens when you tap &quot;Mark paid&quot;.</p>
                </div>
              )}
              <button onClick={handleSendPayLink} disabled={paySending}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {paySending ? 'Sending...' : 'Send Payment Link in Chat'}
              </button>
              {payMethod === 'razorpay' && <p className="text-[11px] text-gray-400">Razorpay tracks payment automatically. Connect Razorpay (Key ID & Secret) on the Integrations page.</p>}
              {payMethod === 'upi' && <p className="text-[11px] text-gray-400">UPI links open the customer&apos;s UPI app. Mark as paid manually once received.</p>}
              {payMethod === 'whatsapp_pay' && <p className="text-[11px] text-gray-400">Customer pays inside WhatsApp (UPI) without leaving the chat. Requires a Payment Configuration in WhatsApp Manager (Razorpay/PayU/UPI) — set its name on the WhatsApp settings page. India only.</p>}
              {!['razorpay', 'upi', 'whatsapp_pay'].includes(payMethod) && <p className="text-[11px] text-gray-400">The customer pays on the gateway&apos;s secure page — mark as paid once received.</p>}
              {payGateways.length === 0 && <p className="text-[11px] text-gray-400">Connect a payment gateway on the Integrations page to send gateway payment links.</p>}
            </div>
            <div className="mt-4 space-y-2">
              {payLinks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No payment links yet</p>}
              {payLinks.map(pl => (
                <div key={pl._id} className="border rounded-lg p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">₹{pl.amount} <span className="text-xs font-normal text-gray-400">· {pl.method === 'upi' ? 'UPI' : pl.method.charAt(0).toUpperCase() + pl.method.slice(1)}</span></p>
                    {pl.description && <p className="text-xs text-gray-500">{pl.description}</p>}
                    <p className="text-[11px] text-gray-400">{new Date(pl.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${pl.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : pl.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{pl.status}</span>
                    {pl.status === 'created' && <button onClick={() => handleMarkPaid(pl._id)} className="text-[11px] px-2 py-1 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50">Mark Paid</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {notesOpen && selectedConv && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setNotesOpen(false)}>
          <div className="w-full max-w-sm h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Notes & Reminders</p>
                <p className="text-xs text-gray-500">{getContactName(selectedConv)}</p>
              </div>
              <button onClick={() => setNotesOpen(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b space-y-2">
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder="Write an internal note about this customer..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <input type="datetime-local" value={noteRemind} onChange={e => setNoteRemind(e.target.value)}
                  className="flex-1 px-2 py-1.5 border rounded-lg text-xs" />
              </div>
              <p className="text-[11px] text-gray-400">Optional: set a reminder time — you&apos;ll get a notification with sound.</p>
              <button onClick={handleAddNote} disabled={!noteText.trim()}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">Add Note</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notes.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No notes yet</p>}
              {notes.map(n => (
                <div key={n._id} className="border rounded-lg p-3 bg-amber-50/50 border-amber-100">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{n.text}</p>
                    <button onClick={() => handleDeleteNote(n._id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{new Date(n.createdAt).toLocaleString('en-IN')}</span>
                    {n.remindAt && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${n.contacted ? 'bg-gray-100 text-gray-400' : new Date(n.remindAt) < new Date() ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                        <Bell className="w-3 h-3" /> {new Date(n.remindAt).toLocaleString('en-IN')}{n.contacted ? ' (contacted)' : ''}
                      </span>
                    )}
                    {n.remindAt && !n.contacted && contactedFor !== n._id && editingNote !== n._id && (
                      <button onClick={() => { setContactedFor(n._id); setContactedRemark(''); }}
                        className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">Contacted</button>
                    )}
                    {n.remindAt && !n.contacted && contactedFor !== n._id && editingNote !== n._id && (
                      <button onClick={() => { setEditingNote(n._id); setEditRemind(toLocalInput(n.remindAt!)); }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"><Pencil className="w-3 h-3" /> Edit</button>
                    )}
                  </div>
                  {contactedFor === n._id && (
                    <div className="mt-2 p-2 bg-white border border-emerald-200 rounded-lg space-y-1.5">
                      <textarea value={contactedRemark} onChange={e => setContactedRemark(e.target.value)} rows={2}
                        autoFocus placeholder="Remarks — what was discussed? (optional)"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => { setContactedFor(null); setContactedRemark(''); }}
                          className="px-2 py-1 rounded border border-gray-200 text-gray-500 text-[11px]">Cancel</button>
                        <button onClick={() => handleContacted(n._id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">Save — Contacted</button>
                      </div>
                    </div>
                  )}
                  {editingNote === n._id && (
                    <div className="mt-2 p-2 bg-white border border-blue-200 rounded-lg space-y-1.5">
                      <input type="datetime-local" value={editRemind} onChange={e => setEditRemind(e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => { setEditingNote(null); setEditRemind(''); }}
                          className="px-2 py-1 rounded border border-gray-200 text-gray-500 text-[11px]">Cancel</button>
                        <button onClick={() => handleEditRemind(n._id)}
                          className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">Save time</button>
                      </div>
                    </div>
                  )}
                  {n.contacted && n.contactedRemark && (
                    <p className="mt-1 text-[11px] text-gray-500 italic">Remark: {n.contactedRemark}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceModal({ convId, onClose }: { convId: string; onClose: () => void }) {
  const [docType, setDocType] = useState('invoice');
  const [items, setItems] = useState([{ name: '', qty: 1, price: 0 }]);
  const [gst, setGst] = useState(0);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const total = subtotal + subtotal * gst / 100;
  const send = async () => {
    if (sending) return;
    if (!items.some(i => i.name.trim())) { toast.error('Add at least one item'); return; }
    setSending(true);
    try {
      await conversationApi.sendInvoice(convId, { docType, items: items.filter(i => i.name.trim()), gstPercent: gst, notes });
      toast.success((docType === 'quotation' ? 'Quotation' : 'Invoice') + ' sent 🧾');
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to send');
    }
    setSending(false);
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">🧾 Send Quotation / Invoice</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {['quotation', 'invoice'].map(t => (
              <button key={t} onClick={() => setDocType(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize ${docType === t ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{t}</button>
            ))}
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={it.name} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Item name" className="flex-1 px-2 py-1.5 border rounded-lg text-sm" />
                <input type="number" value={it.qty} min={1} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                  className="w-16 px-2 py-1.5 border rounded-lg text-sm" title="Qty" />
                <input type="number" value={it.price} min={0} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))}
                  className="w-24 px-2 py-1.5 border rounded-lg text-sm" title="Price (Rs.)" placeholder="Price" />
                {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">✕</button>}
              </div>
            ))}
            <button onClick={() => setItems([...items, { name: '', qty: 1, price: 0 }])} className="text-xs text-emerald-600 hover:underline">+ Add item</button>
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-xs text-gray-500">GST %</label>
            <input type="number" value={gst} min={0} max={28} onChange={e => setGst(Number(e.target.value))} className="w-20 px-2 py-1.5 border rounded-lg text-sm" />
            <span className="ml-auto text-sm font-bold text-gray-800">Total: Rs. {total.toFixed(2)}</span>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional — payment terms, validity...)"
            className="w-full px-2 py-1.5 border rounded-lg text-sm h-16 resize-y" />
          <button onClick={send} disabled={sending}
            className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {sending ? 'Sending...' : `Send ${docType === 'quotation' ? 'Quotation' : 'Invoice'} PDF on WhatsApp`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return <React.Suspense fallback={null}><ChatPageInner /></React.Suspense>;
}
