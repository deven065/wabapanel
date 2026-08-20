'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import { StatCard } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Send, CheckCheck, Eye, AlertCircle, MessageSquare, Users, Phone, Megaphone, Wallet, TrendingUp, Download, Clock, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import api from '@/lib/api';
import useBranding from '@/lib/useBranding';
import Link from 'next/link';

interface DashData {
  contacts: number;
  conversations: { total: number; active: number };
  messages: { sent: number; delivered: number; read: number; failed: number; total: number };
  messageChart: { _id: string; sent: number; received: number; total: number }[];
  campaigns?: { total: number; running: number; scheduled: number; completed: number; draft: number; paused: number; failed: number; sentTotal: number };
  templates?: { total: number; approved: number; pending: number; rejected: number };
  aiCalls?: { total: number; completed: number; failed: number; minutes: number };
  callChart?: { _id: string; count: number; seconds: number }[];
  contactChart?: { _id: string; count: number }[];
  newContacts?: number;
  spend?: number;
  unreadCount?: number;
  walletBalance?: number;
  hourlyActivity?: { hour: number; count: number }[];
  weekdayActivity?: { day: number; count: number }[];
  topCustomers?: { _id: string; name?: string; phone?: string; total: number; inbound: number; outbound: number; lastAt: string }[];
  campaignTable?: { _id: string; name: string; type: string; status: string; createdAt: string; stats?: { sent?: number; delivered?: number; read?: number; failed?: number; skipped?: number } }[];
  typeBreakdown?: { source: string; count: number }[];
  responseTime?: { avgMinutes: number; medianMinutes: number; samples: number };
}

const RANGES = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
];

const PIE_COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#6B7280', '#EC4899', '#14B8A6'];
const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual / Chat',
  template: 'Meta Template',
  preset: 'Preset (Inbox)',
  preset_campaign: 'Preset Campaign',
  campaign: 'Broadcast Campaign',
  drip: 'Drip Campaign',
  keyword_auto_reply: 'Keyword Auto-Reply',
  ai_auto_reply: 'AI Auto-Reply',
  ai_call: 'AI Call',
  ai_call_summary: 'AI Call Summary',
  ai_handoff: 'AI Handoff',
  preset_button_value: 'Button Auto-Reply',
  welcome: 'Welcome Message',
  out_of_office: 'Out of Office',
  automation: 'Automation',
};

const sourceLabel = (s: string) => SOURCE_LABELS[s] || (s.startsWith('appointment') ? 'Appointment' : s.replace(/_/g, ' '));

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
const fmtHour = (h: number) => `${((h % 12) || 12)}${h < 12 ? 'am' : 'pm'}`;
const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${m} min`);

export default function AnalyticsPage() {
  const router = useRouter();
  const brand = useBranding();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [campStatus, setCampStatus] = useState('all');
  const [campType, setCampType] = useState('all');
  const [showAllCamps, setShowAllCamps] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/dashboard/client?days=${days}`);
      setData(res.data.data);
    } catch { /* empty */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = (data?.messageChart || []).map(d => ({ date: fmtDate(d._id), sent: d.sent, received: d.received, total: d.total }));
  const contactData = (data?.contactChart || []).map(d => ({ date: fmtDate(d._id), contacts: d.count }));
  const callData = (data?.callChart || []).map(d => ({ date: fmtDate(d._id), calls: d.count, minutes: Math.round((d.seconds || 0) / 60) }));

  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: fmtHour(h),
    replies: (data?.hourlyActivity || []).find(x => x.hour === h)?.count || 0,
  }));
  const weekdayData = [1, 2, 3, 4, 5, 6, 7].map(d => ({
    day: WEEKDAYS[d],
    replies: (data?.weekdayActivity || []).find(x => x.day === d)?.count || 0,
  }));
  const bestHour = (data?.hourlyActivity || []).slice().sort((a, b) => b.count - a.count)[0];
  const bestDay = (data?.weekdayActivity || []).slice().sort((a, b) => b.count - a.count)[0];

  const typeData = (data?.typeBreakdown || []).map(t => ({ name: sourceLabel(t.source), value: t.count }));

  const totalMessages = data?.messages?.total || 0;
  const totalSent = data?.messages?.sent || 0;
  const totalDelivered = data?.messages?.delivered || 0;
  const totalRead = data?.messages?.read || 0;
  const totalFailed = data?.messages?.failed || 0;
  const outbound = totalSent + totalDelivered + totalRead + totalFailed;

  const deliveryRate = outbound > 0 ? (((totalDelivered + totalRead) / outbound) * 100).toFixed(1) : '0';
  const readRate = outbound > 0 ? ((totalRead / outbound) * 100).toFixed(1) : '0';
  const failRate = outbound > 0 ? ((totalFailed / outbound) * 100).toFixed(1) : '0';

  const c = data?.campaigns;
  const campaignPie = [
    { name: 'Completed', value: c?.completed || 0 },
    { name: 'Draft', value: c?.draft || 0 },
    { name: 'Running', value: c?.running || 0 },
    { name: 'Scheduled', value: c?.scheduled || 0 },
    { name: 'Failed', value: c?.failed || 0 },
    { name: 'Paused', value: c?.paused || 0 },
  ].filter(d => d.value > 0);

  const allCamps = data?.campaignTable || [];
  const campTypes = Array.from(new Set(allCamps.map(cp => cp.type).filter(Boolean)));
  const campStatuses = Array.from(new Set(allCamps.map(cp => cp.status).filter(Boolean)));
  const filteredCamps = allCamps.filter(cp =>
    (campStatus === 'all' || cp.status === campStatus) && (campType === 'all' || cp.type === campType));
  const visibleCamps = showAllCamps ? filteredCamps : filteredCamps.slice(0, 10);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(`${brand.name} Analytics Export,Last ${days} days,Generated ${new Date().toLocaleString('en-IN')}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Total Messages,${totalMessages}`);
    lines.push(`Delivered,${totalDelivered},Delivery Rate,${deliveryRate}%`);
    lines.push(`Read,${totalRead},Read Rate,${readRate}%`);
    lines.push(`Failed,${totalFailed},Fail Rate,${failRate}%`);
    lines.push(`Contacts,${data.contacts},New Contacts,${data.newContacts || 0}`);
    lines.push(`Conversations,${data.conversations?.total || 0},Active,${data.conversations?.active || 0}`);
    lines.push(`AI Calls,${data.aiCalls?.total || 0},Minutes,${data.aiCalls?.minutes || 0}`);
    lines.push(`Spend,₹${(data.spend || 0).toFixed(2)},Wallet Balance,₹${(data.walletBalance || 0).toFixed(2)}`);
    lines.push(`Avg Response Time (min),${data.responseTime?.avgMinutes || 0},Median (min),${data.responseTime?.medianMinutes || 0}`);
    lines.push('');
    lines.push('DAILY MESSAGES');
    lines.push('Date,Sent,Received,Total');
    (data.messageChart || []).forEach(d => lines.push(`${d._id},${d.sent},${d.received},${d.total}`));
    lines.push('');
    lines.push('MESSAGE TYPES (OUTBOUND)');
    lines.push('Type,Count');
    (data.typeBreakdown || []).forEach(t => lines.push(`${esc(sourceLabel(t.source))},${t.count}`));
    lines.push('');
    lines.push('TOP CUSTOMERS');
    lines.push('Name,Phone,Total Messages,Received,Sent,Last Activity');
    (data.topCustomers || []).forEach(t => lines.push(`${esc(t.name)},${esc(t.phone)},${t.total},${t.inbound},${t.outbound},${new Date(t.lastAt).toLocaleString('en-IN')}`));
    lines.push('');
    lines.push('CAMPAIGNS');
    lines.push('Name,Type,Status,Sent,Delivered,Read,Failed,Skipped,Created');
    (data.campaignTable || []).forEach(cp => lines.push(`${esc(cp.name)},${cp.type},${cp.status},${cp.stats?.sent || 0},${cp.stats?.delivered || 0},${cp.stats?.read || 0},${cp.stats?.failed || 0},${cp.stats?.skipped || 0},${new Date(cp.createdAt).toLocaleDateString('en-IN')}`));
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${days}days-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Complete performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setDays(r.value)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${days === r.value ? 'bg-white shadow text-emerald-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Message metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/chat"><StatCard title="Total Messages" value={totalMessages.toLocaleString()} icon={<Send className="w-6 h-6" />} change={`last ${days} days`} color="emerald" /></L>
        <L href="/client/chat"><StatCard title="Delivery Rate" value={`${deliveryRate}%`} icon={<CheckCheck className="w-6 h-6" />} change={`${(totalDelivered + totalRead).toLocaleString()} delivered`} color="blue" /></L>
        <L href="/client/chat"><StatCard title="Read Rate" value={`${readRate}%`} icon={<Eye className="w-6 h-6" />} change={`${totalRead.toLocaleString()} read`} color="purple" /></L>
        <L href="/client/chat"><StatCard title="Fail Rate" value={`${failRate}%`} icon={<AlertCircle className="w-6 h-6" />} change={`${totalFailed.toLocaleString()} failed`} color="red" /></L>
      </div>

      {/* Business metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/contacts"><StatCard title="Contacts" value={(data?.contacts || 0).toLocaleString()} icon={<Users className="w-6 h-6" />} change={`+${data?.newContacts || 0} new`} color="blue" /></L>
        <L href="/client/chat"><StatCard title="Conversations" value={(data?.conversations?.total || 0).toLocaleString()} icon={<MessageSquare className="w-6 h-6" />} change={`${data?.conversations?.active || 0} active`} color="emerald" /></L>
        <L href="/client/ai-calling"><StatCard title="AI Calls" value={(data?.aiCalls?.total || 0).toLocaleString()} icon={<Phone className="w-6 h-6" />} change={`${data?.aiCalls?.minutes || 0} minutes`} color="purple" /></L>
        <L href="/client/transactions"><StatCard title="Spend" value={`₹${(data?.spend || 0).toFixed(2)}`} icon={<Wallet className="w-6 h-6" />} change={`last ${days} days`} color="orange" /></L>
      </div>

      {/* Response time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Timer className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Avg Response Time</p><p className="text-xl font-bold text-gray-900">{fmtMins(data?.responseTime?.avgMinutes || 0)}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Median Response Time</p><p className="text-xl font-bold text-gray-900">{fmtMins(data?.responseTime?.medianMinutes || 0)}</p></div>
          </div>
        </Card></L>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Best Time to Send</p>
              <p className="text-xl font-bold text-gray-900">{bestHour ? `${fmtHour(bestHour.hour)}${bestDay ? ` · ${WEEKDAYS[bestDay.day]}` : ''}` : '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Volume</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="sent" stroke="#10B981" fill="url(#colorSent)" name="Sent" />
                  <Area type="monotone" dataKey="received" stroke="#3B82F6" fill="transparent" name="Received" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sent" fill="#10B981" name="Sent" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="received" fill="#3B82F6" name="Received" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No message data in this period.</p>
          </div>
        </Card>
      )}

      {/* Best time to send */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Customer Replies by Hour (IST)</h3>
          <p className="text-xs text-gray-400 mb-4">The hours when you get the most replies — the best time to send</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" fontSize={10} interval={1} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="replies" fill="#8B5CF6" name="Replies" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Customer Replies by Day</h3>
          <p className="text-xs text-gray-400 mb-4">Which days of the week your customers are most active</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="replies" fill="#10B981" name="Replies" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Message type breakdown + top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Outbound Message Types</h3>
          <div className="h-80">
            {typeData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={90} label>
                    {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">No outbound messages yet</div>}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right">Received</th>
                  <th className="pb-2 font-medium text-right">Sent</th>
                  <th className="pb-2 font-medium text-right">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topCustomers || []).length ? (data?.topCustomers || []).map(t => (
                  <tr key={t._id} onClick={() => router.push('/client/chat')} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                    <td className="py-2">
                      <p className="font-medium text-gray-900">{t.name || t.phone}</p>
                      <p className="text-xs text-gray-400">{t.phone}</p>
                    </td>
                    <td className="py-2 text-right font-semibold">{t.total}</td>
                    <td className="py-2 text-right text-blue-600">{t.inbound}</td>
                    <td className="py-2 text-right text-emerald-600">{t.outbound}</td>
                    <td className="py-2 text-right text-xs text-gray-400">{fmtDate(t.lastAt)}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="py-8 text-center text-gray-400">No data yet</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Campaign comparison table */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Campaign Performance</h3>
          <div className="flex items-center gap-2">
            <select value={campStatus} onChange={e => { setCampStatus(e.target.value); setShowAllCamps(false); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 bg-white">
              <option value="all">All Status</option>
              {campStatuses.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <select value={campType} onChange={e => { setCampType(e.target.value); setShowAllCamps(false); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 bg-white">
              <option value="all">All Types</option>
              {campTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Campaign</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Sent</th>
                <th className="pb-2 font-medium text-right">Delivered</th>
                <th className="pb-2 font-medium text-right">Read</th>
                <th className="pb-2 font-medium text-right">Failed</th>
                <th className="pb-2 font-medium text-right">Read Rate</th>
                <th className="pb-2 font-medium text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {visibleCamps.length ? visibleCamps.map(cp => {
                const sent = cp.stats?.sent || 0;
                const read = cp.stats?.read || 0;
                const rr = sent > 0 ? ((read / sent) * 100).toFixed(0) + '%' : '—';
                return (
                  <tr key={cp._id} onClick={() => router.push(cp.type === 'preset' ? '/client/save-money/campaigns' : '/client/broadcasts')} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                    <td className="py-2 font-medium text-gray-900">{cp.name}</td>
                    <td className="py-2 text-gray-500">{cp.type}</td>
                    <td className="py-2"><Badge variant={cp.status === 'completed' || cp.status === 'running' ? 'success' : cp.status === 'failed' ? 'danger' : 'default'}>{cp.status}</Badge></td>
                    <td className="py-2 text-right">{sent}</td>
                    <td className="py-2 text-right">{cp.stats?.delivered || 0}</td>
                    <td className="py-2 text-right">{read}</td>
                    <td className="py-2 text-right text-red-500">{cp.stats?.failed || 0}</td>
                    <td className="py-2 text-right">{rr}</td>
                    <td className="py-2 text-right text-xs text-gray-400">{fmtDate(cp.createdAt)}</td>
                  </tr>
                );
              }) : <tr><td colSpan={9} className="py-8 text-center text-gray-400">No campaigns found</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredCamps.length > 10 && (
          <div className="mt-3 text-center">
            <button onClick={() => setShowAllCamps(v => !v)} className="text-sm text-emerald-600 font-medium hover:underline">
              {showAllCamps ? 'Show less' : `Show all (${filteredCamps.length})`}
            </button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Growth</h3>
          <div className="h-64">
            {contactData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contactData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="contacts" stroke="#8B5CF6" fill="#EDE9FE" name="New Contacts" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">No new contacts in this period</div>}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Calls</h3>
          <div className="h-64">
            {callData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="calls" fill="#3B82F6" name="Calls" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="minutes" fill="#10B981" name="Minutes" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">No AI calls in this period</div>}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaigns by Status</h3>
          <div className="h-64">
            {campaignPie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={campaignPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label>
                    {campaignPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">No campaigns yet</div>}
          </div>
        </Card>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/broadcasts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Megaphone className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Campaign Messages Sent</p><p className="text-xl font-bold text-gray-900">{c?.sentTotal || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/broadcasts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Total Campaigns</p><p className="text-xl font-bold text-gray-900">{c?.total || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/ai-calling"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Phone className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">AI Calls Completed</p><p className="text-xl font-bold text-gray-900">{data?.aiCalls?.completed || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/wallet"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><Wallet className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Wallet Balance</p><p className="text-xl font-bold text-gray-900">₹{(data?.walletBalance || 0).toFixed(2)}</p></div>
          </div>
        </Card></L>
      </div>
    </div>
  );
}
