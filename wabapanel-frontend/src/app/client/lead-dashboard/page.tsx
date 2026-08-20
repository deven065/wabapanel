'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crmApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import {
  Users, CheckCircle2, XCircle, Trophy, IndianRupee, Package,
  MessageCircle, RefreshCw, Milestone, Tags, UserRound, Layers,
} from 'lucide-react';

interface Breakdown { _id: string; name: string; color?: string; count: number }
interface DashboardData {
  totalLeads: number; closedTotal: number; wonCount: number; openLeads: number;
  totalValue: number; totalItems: number; msgIn: number; msgOut: number;
  stageBreakdown: Breakdown[]; labelBreakdown: Breakdown[]; agentBreakdown: Breakdown[];
  unassigned: number; closeReasons: { reason: string; count: number }[];
  series: { date: string; count: number }[];
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  if (key === 'today') { /* same day */ }
  else if (key === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  else if (key === 'tomorrow') { start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 1); }
  else if (key === '7d') { start.setDate(start.getDate() - 6); }
  else if (key === '30d') { start.setDate(start.getDate() - 29); }
  else if (key === '12m') { start.setMonth(start.getMonth() - 12); }
  else if (key === 'all') { return { from: '', to: '' }; }
  return { from: fmt(start), to: fmt(end) };
}

const PRESETS: { k: string; label: string }[] = [
  { k: 'today', label: 'Today' },
  { k: 'yesterday', label: 'Yesterday' },
  { k: 'tomorrow', label: 'Tomorrow' },
  { k: '7d', label: 'Last 7 days' },
  { k: '30d', label: 'Last 30 days' },
  { k: '12m', label: 'Last 12 months' },
  { k: 'all', label: 'All time' },
];

export default function LeadDashboardPage() {
  const router = useRouter();
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(presetRange('30d').from);
  const [to, setTo] = useState(presetRange('30d').to);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    crmApi.dashboard({ from: from || undefined, to: to || undefined })
      .then(r => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (k: string) => {
    setPreset(k);
    if (k !== 'custom') { const r = presetRange(k); setFrom(r.from); setTo(r.to); }
  };

  // Drill down into Lead Report with the current time window + a dimension filter.
  const drill = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    router.push(`/client/call-center?${p.toString()}`);
  };

  const maxSeries = useMemo(() => Math.max(1, ...(data?.series || []).map(s => s.count)), [data]);

  const cards = data ? [
    { label: 'Total Leads', value: data.totalLeads, icon: <Users className="w-5 h-5" />, color: 'bg-blue-50 text-blue-600', onClick: () => drill({}) },
    { label: 'Open Leads', value: data.openLeads, icon: <MessageCircle className="w-5 h-5" />, color: 'bg-emerald-50 text-emerald-600', onClick: () => drill({}) },
    { label: 'Closed', value: data.closedTotal, icon: <XCircle className="w-5 h-5" />, color: 'bg-gray-100 text-gray-600', onClick: () => drill({}) },
    { label: 'Won', value: data.wonCount, icon: <Trophy className="w-5 h-5" />, color: 'bg-amber-50 text-amber-600', onClick: () => drill({}) },
    { label: 'Deal Value', value: `₹${data.totalValue.toLocaleString('en-IN')}`, icon: <IndianRupee className="w-5 h-5" />, color: 'bg-green-50 text-green-600' },
    { label: 'Items Ordered', value: data.totalItems, icon: <Package className="w-5 h-5" />, color: 'bg-purple-50 text-purple-600' },
    { label: 'Messages In', value: data.msgIn, icon: <CheckCircle2 className="w-5 h-5" />, color: 'bg-sky-50 text-sky-600' },
    { label: 'Messages Out', value: data.msgOut, icon: <CheckCircle2 className="w-5 h-5" />, color: 'bg-indigo-50 text-indigo-600' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">A manager overview — click any card to drill into the leads</p>
        </div>
        <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={load} loading={loading}>Refresh</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.k} onClick={() => applyPreset(p.k)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${preset === p.k ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}>{p.label}</button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset('custom'); }} className="border rounded-lg text-sm p-1.5" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset('custom'); }} className="border rounded-lg text-sm p-1.5" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <button key={c.label} onClick={c.onClick} disabled={!c.onClick}
            className={`text-left bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${c.onClick ? 'hover:shadow-md hover:border-emerald-200 cursor-pointer' : 'cursor-default'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.color}`}>{c.icon}</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">{c.value}</div>
            <div className="text-xs text-gray-500">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard title="By Stage" icon={<Milestone className="w-4 h-4" />} rows={data?.stageBreakdown || []}
          onRow={(id) => drill({ stage: id })} />
        <BreakdownCard title="By Label / Product / Service" icon={<Tags className="w-4 h-4" />} rows={data?.labelBreakdown || []}
          onRow={(id) => drill({ tag: id })} />
        <BreakdownCard title="By Agent" icon={<UserRound className="w-4 h-4" />}
          rows={[...(data?.agentBreakdown || []), ...(data && data.unassigned ? [{ _id: '__none__', name: 'Unassigned', count: data.unassigned }] : [])]}
          onRow={(id) => drill({ agent: id })} />
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3"><Layers className="w-4 h-4" /> Close Reasons</div>
          {(data?.closeReasons || []).length === 0 ? <div className="text-sm text-gray-400">No closed leads in this range.</div> : (
            <div className="space-y-2">
              {data!.closeReasons.map(c => (
                <div key={c.reason} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-gray-600">{c.reason.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-gray-900">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-700 mb-3">New leads over time</div>
        {(data?.series || []).length === 0 ? <div className="text-sm text-gray-400">No data in this range.</div> : (
          <div className="flex items-end gap-1 h-40 overflow-x-auto">
            {data!.series.map(s => (
              <div key={s.date} className="flex flex-col items-center justify-end shrink-0" style={{ width: 22 }} title={`${s.date}: ${s.count}`}>
                <div className="w-4 bg-emerald-500 rounded-t" style={{ height: `${(s.count / maxSeries) * 100}%` }} />
                <div className="text-[8px] text-gray-400 mt-1 rotate-45 origin-left whitespace-nowrap">{s.date.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownCard({ title, icon, rows, onRow }: { title: string; icon: React.ReactNode; rows: Breakdown[]; onRow: (id: string) => void }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">{icon} {title}</div>
      {rows.length === 0 ? <div className="text-sm text-gray-400">No data in this range.</div> : (
        <div className="space-y-2">
          {rows.map(r => (
            <button key={r._id} onClick={() => onRow(r._id)}
              className="w-full text-left group">
              <div className="flex items-center justify-between text-sm mb-0.5">
                <span className="flex items-center gap-1.5 text-gray-600 group-hover:text-emerald-700 truncate">
                  {r.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="font-semibold text-gray-900 shrink-0 ml-2">{r.count}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color || '#10b981' }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
