'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, MessageSquare, Clock, AlertCircle, RefreshCw, Copy, X } from 'lucide-react';
import { followupApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FollowupItem {
  conversationId: string;
  contact: { _id: string; name?: string; phone?: string };
  reason: 'unanswered' | 'window_closing' | 'gone_quiet';
  lastMessage: { text?: string; direction?: string; timestamp?: string };
  ageHrs: number;
  windowOpen: boolean;
  windowLeftHrs: number;
}

const reasonMeta: Record<string, { label: string; cls: string; desc: string }> = {
  unanswered: { label: 'Needs Reply', cls: 'bg-red-100 text-red-700', desc: 'Customer messaged, no reply sent yet' },
  window_closing: { label: 'Window Closing', cls: 'bg-amber-100 text-amber-700', desc: 'Free 24-hr window expires soon' },
  gone_quiet: { label: 'Gone Quiet', cls: 'bg-blue-100 text-blue-700', desc: 'No customer reply for 3+ days' },
};

const ageLabel = (hrs: number) => hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;

export default function FollowupsPage() {
  const router = useRouter();
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await followupApi.list();
      setItems(r.data.data || []);
    } catch { toast.error('Failed to load follow-ups'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDraft = async (id: string) => {
    setDrafting(id);
    try {
      const r = await followupApi.draft(id);
      setDraft({ id, text: r.data.data.draft });
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'AI draft failed');
    }
    setDrafting(null);
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.reason === filter);
  const counts = { all: items.length, unanswered: items.filter(i => i.reason === 'unanswered').length, window_closing: items.filter(i => i.reason === 'window_closing').length, gone_quiet: items.filter(i => i.reason === 'gone_quiet').length };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="page-hero flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Sparkles className="w-6 h-6 text-purple-600" /> AI Follow-ups</h1>
        <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      <p className="text-gray-500 text-sm mb-4">Leads that need a follow-up right now — with AI-drafted messages ready to send</p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['all', 'All'], ['unanswered', 'Needs Reply'], ['window_closing', 'Window Closing'], ['gone_quiet', 'Gone Quiet']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filter === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {l} ({counts[v as keyof typeof counts]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-16">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">All caught up — no follow-ups needed right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.conversationId} className="bg-white rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{item.contact?.name || item.contact?.phone || 'Unknown'}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${reasonMeta[item.reason].cls}`}>{reasonMeta[item.reason].label}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{ageLabel(item.ageHrs)}</span>
                    {item.reason === 'window_closing' && <span className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{item.windowLeftHrs}h left</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{reasonMeta[item.reason].desc}</p>
                  <p className="text-sm text-gray-600 mt-1 truncate max-w-xl">
                    <span className="text-gray-400">{item.lastMessage?.direction === 'inbound' ? 'Customer: ' : 'You: '}</span>
                    {item.lastMessage?.text || '[media]'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleDraft(item.conversationId)} disabled={drafting === item.conversationId}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> {drafting === item.conversationId ? 'Drafting...' : 'AI Draft'}
                  </button>
                  <button onClick={() => router.push(`/client/chat?conv=${item.conversationId}`)}
                    className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" /> Open Chat
                  </button>
                </div>
              </div>
              {draft?.id === item.conversationId && (
                <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{draft.text}</p>
                    <button onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:bg-purple-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { navigator.clipboard.writeText(draft.text); toast.success('Copied'); }}
                      className="px-3 py-1 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
                    <button onClick={() => router.push(`/client/chat?conv=${item.conversationId}&draft=${encodeURIComponent(draft.text)}`)}
                      className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">Use in Chat</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
