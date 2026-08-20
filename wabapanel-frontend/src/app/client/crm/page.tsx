'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Search, MessageSquare, Phone, StickyNote, Calendar, ShoppingBag,
  Kanban, Bell, RefreshCw, Plus, IndianRupee, CheckCircle2, Clock, X,
} from 'lucide-react';
import { crmApi, noteApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Summary {
  contacts: number; openDeals: number; openValue: number; wonDeals: number; wonValue: number;
  dueToday: number; overdue: number; callsWeek: number; upcomingAppts: number; ordersWeek: number;
}
interface CrmContact {
  _id: string; name?: string; phone: string; email?: string; source?: string;
  tags?: { _id: string; name: string; color?: string }[];
  lastActivity?: { t: number; text: string; unread: number } | null;
}
interface TimelineEvent { kind: string; at: string; data: Record<string, unknown> }
interface Deal { _id: string; pipeline: string; title: string; value: number; status: string; stage: string; currency: string }
interface FollowupNote {
  _id: string;
  text: string;
  remindAt?: string;
  contacted?: boolean;
  contact?: { _id: string; name?: string; phone?: string } | null;
  createdBy?: { name?: string } | null;
}
interface Timeline {
  contact: CrmContact & { createdAt?: string };
  conversationId: string | null;
  deals: Deal[];
  hasMoreMessages: boolean;
  oldestMessageAt: string | null;
  stats: { messages: number; notes: number; calls: number; appointments: number; orders: number; deals: number };
  events: TimelineEvent[];
}

const kindMeta: Record<string, { label: string; icon: JSX.Element; cls: string }> = {
  message: { label: 'Message', icon: <MessageSquare className="w-4 h-4" />, cls: 'bg-blue-100 text-blue-700' },
  call: { label: 'Call', icon: <Phone className="w-4 h-4" />, cls: 'bg-emerald-100 text-emerald-700' },
  scheduled_call: { label: 'Scheduled Call', icon: <Phone className="w-4 h-4" />, cls: 'bg-teal-100 text-teal-700' },
  note: { label: 'Note', icon: <StickyNote className="w-4 h-4" />, cls: 'bg-amber-100 text-amber-700' },
  appointment: { label: 'Appointment', icon: <Calendar className="w-4 h-4" />, cls: 'bg-purple-100 text-purple-700' },
  order: { label: 'Order', icon: <ShoppingBag className="w-4 h-4" />, cls: 'bg-pink-100 text-pink-700' },
  deal: { label: 'Deal', icon: <Kanban className="w-4 h-4" />, cls: 'bg-indigo-100 text-indigo-700' },
};

const fmtDate = (d: string | number) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

function eventText(e: TimelineEvent): string {
  const d = e.data as Record<string, string | number | boolean>;
  switch (e.kind) {
    case 'message': return `${d.direction === 'inbound' ? '⬅ Received' : '➡ Sent'}${d.type !== 'text' ? ` [${d.type}]` : ''}: ${String(d.text || '').slice(0, 140) || '(media)'}`;
    case 'call': return `${d.direction === 'USER_INITIATED' ? 'Incoming' : 'Outgoing'} call — ${d.status}${d.duration ? ` (${d.duration}s)` : ''}`;
    case 'scheduled_call': return `Scheduled call — ${d.status}`;
    case 'note': return `${d.text}${d.remindAt ? ` (reminder: ${fmtDate(String(d.remindAt))})` : ''}${d.by ? ` — ${d.by}` : ''}`;
    case 'appointment': return `${d.title || 'Appointment'} at ${d.startTime} — ${d.status}${d.notes ? `: ${d.notes}` : ''}`;
    case 'order': return `Order ${d.orderNumber} — ${fmtMoney(Number(d.totalAmount))} — ${d.status}`;
    case 'deal': return `${d.title} — ${fmtMoney(Number(d.value))} — ${d.stage} (${d.status}) in ${d.pipeline}`;
    default: return '';
  }
}

export default function CrmPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [listPages, setListPages] = useState(1);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loadingTl, setLoadingTl] = useState(false);
  const [filter, setFilter] = useState('all');
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteRemind, setNoteRemind] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [fuModal, setFuModal] = useState<null | 'today' | 'overdue'>(null);
  const [fuItems, setFuItems] = useState<FollowupNote[]>([]);
  const [fuLoading, setFuLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    try { const r = await crmApi.summary(); setSummary(r.data.data); } catch { /* noop */ }
  }, []);

  const loadContacts = useCallback(async (s: string) => {
    setLoadingList(true);
    try {
      const r = await crmApi.contacts({ search: s || undefined });
      setContacts(r.data.data || []);
      setListPage(1);
      setListPages(r.data.pagination?.pages || 1);
    }
    catch { toast.error('Failed to load contacts'); }
    setLoadingList(false);
  }, []);

  const loadMoreContacts = useCallback(async () => {
    if (listLoadingMore || listPage >= listPages) return;
    setListLoadingMore(true);
    try {
      const next = listPage + 1;
      const r = await crmApi.contacts({ search: search || undefined, page: next });
      setContacts(prev => [...prev, ...(r.data.data || [])]);
      setListPage(next);
      setListPages(r.data.pagination?.pages || next);
    } catch { /* noop */ }
    setListLoadingMore(false);
  }, [listLoadingMore, listPage, listPages, search]);

  const loadTimeline = useCallback(async (id: string) => {
    setLoadingTl(true);
    try { const r = await crmApi.timeline(id); setTimeline(r.data.data); }
    catch { toast.error('Failed to load timeline'); }
    setLoadingTl(false);
  }, []);

  const loadOlder = async () => {
    if (!selected || !timeline?.oldestMessageAt) return;
    setLoadingMore(true);
    try {
      const r = await crmApi.timeline(selected, timeline.oldestMessageAt);
      const older: Timeline = r.data.data;
      const olderMsgs = older.events.filter(e => e.kind === 'message');
      setTimeline({
        ...timeline,
        events: [...timeline.events, ...olderMsgs].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
        hasMoreMessages: older.hasMoreMessages,
        oldestMessageAt: older.oldestMessageAt,
      });
    } catch { toast.error('Failed to load older messages'); }
    setLoadingMore(false);
  };

  useEffect(() => { loadSummary(); loadContacts(''); }, [loadSummary, loadContacts]);
  useEffect(() => { const t = setTimeout(() => loadContacts(search), 350); return () => clearTimeout(t); }, [search, loadContacts]);
  useEffect(() => { if (selected) loadTimeline(selected); }, [selected, loadTimeline]);

  const saveNote = async () => {
    if (!selected || !noteText.trim()) return;
    try {
      await noteApi.create({ contact: selected, text: noteText.trim(), remindAt: noteRemind || undefined });
      toast.success('Note added');
      setNoteModal(false); setNoteText(''); setNoteRemind('');
      loadTimeline(selected);
    } catch { toast.error('Failed to add note'); }
  };

  const openFollowups = async (mode: 'today' | 'overdue') => {
    setFuModal(mode); setFuLoading(true);
    try { const r = await crmApi.followups(); setFuItems(r.data.data || []); }
    catch { toast.error('Failed to load follow-ups'); }
    setFuLoading(false);
  };

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const fuFiltered = fuItems.filter(n => !n.contacted && n.remindAt && (fuModal === 'today'
    ? new Date(n.remindAt) >= dayStart && new Date(n.remindAt) <= dayEnd
    : new Date(n.remindAt) < dayStart));

  const filteredEvents = timeline?.events.filter(e => filter === 'all' || e.kind === filter || (filter === 'call' && e.kind === 'scheduled_call')) || [];

  const cards = summary ? [
    { label: 'Total Contacts', value: summary.contacts, icon: <Users className="w-5 h-5" />, cls: 'text-blue-600 bg-blue-50', onClick: () => router.push('/client/contacts') },
    { label: 'Open Deals', value: `${summary.openDeals} · ${fmtMoney(summary.openValue)}`, icon: <Kanban className="w-5 h-5" />, cls: 'text-indigo-600 bg-indigo-50', onClick: () => router.push('/client/pipelines') },
    { label: 'Won Deals', value: `${summary.wonDeals} · ${fmtMoney(summary.wonValue)}`, icon: <CheckCircle2 className="w-5 h-5" />, cls: 'text-emerald-600 bg-emerald-50', onClick: () => router.push('/client/pipelines') },
    { label: 'Follow-ups Due Today', value: summary.dueToday, icon: <Bell className="w-5 h-5" />, cls: 'text-amber-600 bg-amber-50', onClick: () => openFollowups('today') },
    { label: 'Overdue Follow-ups', value: summary.overdue, icon: <Clock className="w-5 h-5" />, cls: 'text-red-600 bg-red-50', onClick: () => openFollowups('overdue') },
    { label: 'Calls (7 days)', value: summary.callsWeek, icon: <Phone className="w-5 h-5" />, cls: 'text-teal-600 bg-teal-50', onClick: () => router.push('/client/ai-calling') },
    { label: 'Upcoming Appointments', value: summary.upcomingAppts, icon: <Calendar className="w-5 h-5" />, cls: 'text-purple-600 bg-purple-50', onClick: () => router.push('/client/appointments') },
    { label: 'Orders (7 days)', value: summary.ordersWeek, icon: <ShoppingBag className="w-5 h-5" />, cls: 'text-pink-600 bg-pink-50', onClick: () => router.push('/client/orders') },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM 360°</h1>
          <p className="text-gray-500 text-sm mt-1">Every contact&apos;s messages, calls, notes, deals, appointments &amp; orders — in one place</p>
        </div>
        <button onClick={() => { loadSummary(); if (selected) loadTimeline(selected); }} className="p-2 rounded-lg border bg-white hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <button key={c.label} onClick={c.onClick} className="bg-white rounded-xl border p-3 flex items-center gap-3 text-left hover:shadow-md hover:border-gray-300 transition-shadow cursor-pointer">
            <div className={`p-2 rounded-lg ${c.cls}`}>{c.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">{c.value}</div>
              <div className="text-xs text-gray-500 truncate">{c.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contact list */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / phone / email"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto divide-y"
            onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) loadMoreContacts(); }}>
            {loadingList ? <div className="p-6 text-center text-sm text-gray-400">Loading…</div> :
              contacts.length === 0 ? <div className="p-6 text-center text-sm text-gray-400">No contacts found</div> :
              contacts.map(c => (
                <button key={c._id} onClick={() => setSelected(c._id)}
                  className={`w-full text-left p-3 hover:bg-gray-50 ${selected === c._id ? 'bg-emerald-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">{c.name || c.phone}</span>
                    {c.lastActivity?.t ? <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(c.lastActivity.t)}</span> : null}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{c.phone}{c.lastActivity?.text ? ` · ${c.lastActivity.text.slice(0, 40)}` : ''}</div>
                  {c.tags && c.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.tags.slice(0, 3).map(t => <span key={t._id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.name}</span>)}
                    </div>
                  )}
                </button>
              ))}
            {!loadingList && listPage < listPages && (
              <button onClick={loadMoreContacts} disabled={listLoadingMore}
                className="w-full py-2.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                {listLoadingMore ? 'Loading…' : 'Load more contacts'}
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a contact to see their complete 360° history</p>
            </div>
          ) : loadingTl || !timeline ? (
            <div className="p-12 text-center text-sm text-gray-400">Loading timeline…</div>
          ) : (
            <div>
              <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-gray-900">{timeline.contact.name || timeline.contact.phone}</div>
                  <div className="text-xs text-gray-500">{timeline.contact.phone}{timeline.contact.email ? ` · ${timeline.contact.email}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setNoteModal(true)} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-gray-50 flex items-center gap-1"><Plus className="w-3 h-3" /> Note / Reminder</button>
                  {timeline.conversationId && (
                    <button onClick={() => router.push(`/client/chat?conv=${timeline.conversationId}`)} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Open Chat</button>
                  )}
                </div>
              </div>

              {timeline.deals.length > 0 && (
                <div className="px-4 pt-3 flex flex-wrap gap-2">
                  {timeline.deals.map(d => (
                    <span key={d._id} className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${d.status === 'won' ? 'bg-emerald-100 text-emerald-700' : d.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      <IndianRupee className="w-3 h-3" />{d.title} · {fmtMoney(d.value)} · {d.stage}
                    </span>
                  ))}
                </div>
              )}

              <div className="px-4 pt-3 flex flex-wrap gap-1">
                {[['all', `All (${timeline.events.length})`],
                  ['message', `Messages (${timeline.stats.messages})`],
                  ['call', `Calls (${timeline.stats.calls})`],
                  ['note', `Notes (${timeline.stats.notes})`],
                  ['deal', `Deals (${timeline.stats.deals})`],
                  ['appointment', `Appointments (${timeline.stats.appointments})`],
                  ['order', `Orders (${timeline.stats.orders})`]].map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className={`px-2.5 py-1 text-xs rounded-full ${filter === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
                ))}
              </div>

              <div className="p-4 max-h-[52vh] overflow-y-auto space-y-3">
                {filteredEvents.length === 0 ? <div className="text-center text-sm text-gray-400 py-8">No activity yet</div> :
                  filteredEvents.map((e, i) => {
                    const m = kindMeta[e.kind] || kindMeta.note;
                    return (
                      <div key={i} className="flex gap-3">
                        <div className={`p-1.5 rounded-lg h-fit ${m.cls}`}>{m.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>
                            <span className="text-[10px] text-gray-400">{fmtDate(e.at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 break-words mt-0.5">{eventText(e)}</p>
                        </div>
                      </div>
                    );
                  })}
                {timeline.hasMoreMessages && (filter === 'all' || filter === 'message') && (
                  <button onClick={loadOlder} disabled={loadingMore}
                    className="w-full py-2 text-xs rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {loadingMore ? 'Loading…' : 'Load older messages'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {fuModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{fuModal === 'today' ? "Today's Follow-ups" : 'Overdue Follow-ups'}</h3>
              <button onClick={() => setFuModal(null)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto divide-y">
              {fuLoading ? <div className="p-6 text-center text-sm text-gray-400">Loading…</div> :
                fuFiltered.length === 0 ? <div className="p-6 text-center text-sm text-gray-400">No follow-ups</div> :
                fuFiltered.map(n => (
                  <button key={n._id} onClick={() => { if (n.contact?._id) { setSelected(n.contact._id); setFuModal(null); } }}
                    className="w-full text-left py-2.5 hover:bg-gray-50 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{n.contact?.name || n.contact?.phone || 'Unknown'}</span>
                      {n.remindAt && <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(n.remindAt)}</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{n.text}</div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Add Note / Follow-up Reminder</h3>
              <button onClick={() => setNoteModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="Note text…"
              className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div>
              <label className="text-xs text-gray-500 block mb-1">Remind me at (optional)</label>
              <input type="datetime-local" value={noteRemind} onChange={e => setNoteRemind(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNoteModal(false)} className="px-3 py-1.5 text-sm rounded-lg border">Cancel</button>
              <button onClick={saveNote} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
