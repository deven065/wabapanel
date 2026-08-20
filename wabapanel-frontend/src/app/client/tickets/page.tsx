'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, CheckCircle, RotateCcw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Ticket {
  _id: string;
  contact?: { _id: string; name?: string; phone?: string };
  conversation?: string;
  subject: string;
  keyword: string;
  status: 'open' | 'closed';
  createdAt: string;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open');

  const load = useCallback(() => {
    api.get('/tickets' + (filter === 'all' ? '' : `?status=${filter}`))
      .then(r => setTickets(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: 'open' | 'closed') => {
    try { await api.patch(`/tickets/${id}`, { status }); toast.success(status === 'closed' ? 'Ticket closed' : 'Ticket reopened'); load(); }
    catch { toast.error('Failed'); }
  };
  const del = async (id: string) => {
    if (!confirm('Delete this ticket?')) return;
    try { await api.delete(`/tickets/${id}`); load(); } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><LifeBuoy className="w-6 h-6 text-emerald-600" /> Tickets</h1>
        <p className="text-sm mt-1">Track and resolve customer complaints raised automatically or manually</p>
        </div>
        <div className="flex gap-1">
          {(['open', 'closed', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">When Auto Ticket is enabled, a ticket is created here automatically whenever a message contains a complaint keyword (toggle & keywords in AI Settings → AI Features).</p>
      {loading ? <p className="text-sm text-gray-400">Loading...</p> : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No tickets yet</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {tickets.map(t => (
            <div key={t._id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {t.contact?.name || t.contact?.phone || 'Unknown'}
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${t.status === 'open' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                  {t.keyword && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{t.keyword}</span>}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{t.subject}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{new Date(t.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.conversation && <a href={`/client/chat?conversation=${t.conversation}`} className="text-xs text-emerald-600 hover:underline">Open chat</a>}
                {t.status === 'open' ? (
                  <button onClick={() => setStatus(t._id, 'closed')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> Close</button>
                ) : (
                  <button onClick={() => setStatus(t._id, 'open')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-500 text-white rounded-lg hover:bg-gray-600"><RotateCcw className="w-3.5 h-3.5" /> Reopen</button>
                )}
                <button onClick={() => del(t._id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
