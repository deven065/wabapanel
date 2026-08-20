'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Send, CheckCheck, Eye, AlertCircle, Users, WifiOff, Wallet,
  Megaphone, LayoutTemplate, Phone, Calendar, ShoppingBag, Zap, Clock, TrendingUp, BellRing, Crown, ArrowRight,
} from 'lucide-react';
import { StatCard } from '@/components/ui/Card';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { dashboardApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

interface DashboardData {
  contacts: number;
  conversations: { total: number; active: number };
  messages: { sent: number; delivered: number; read: number; failed: number; total: number };
  messageChart: Array<{ _id: string; sent: number; received: number; total: number }>;
  recentConversations: Array<{ _id: string; contact: { name: string; phone: string }; lastMessage: { text: string }; updatedAt: string }>;
  walletBalance: number;
  rateCard?: { marketing: number; utility: number; authentication: number; service: number } | null;
  whatsappConnected: boolean;
  campaigns?: { total: number; running: number; scheduled: number; completed: number; draft: number; paused: number; failed: number; sentTotal: number };
  recentCampaigns?: Array<{ _id: string; name: string; type: string; status: string; stats?: { sent?: number; failed?: number }; createdAt: string }>;
  templates?: { total: number; approved: number; pending: number; rejected: number };
  presets?: number;
  aiCalls?: { total: number; completed: number; failed: number; minutes: number };
  appointments?: { total: number; upcoming: number };
  orders?: { total: number; revenue: number };
  keywords?: number;
  unreadCount?: number;
  newContacts?: number;
  contactChart?: Array<{ _id: string; count: number }>;
  spend?: number;
  today?: { sent: number; received: number };
  todayAppointments?: Array<{ _id: string; title: string; contactName: string; contactPhone: string; startTime: string; status: string; date?: string }>;
  dueReminders?: Array<{ _id: string; text: string; remindAt: string; contact?: { name?: string; phone?: string } }>;
  resolvedCount?: number;
  botFlowsActive?: number;
}

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'];

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
  </div>
);

export default function DashboardPage() {
  const { user, currentWorkspace } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await dashboardApi.getClientDashboard();
        setData(res.data.data);
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const m = data?.messages;
  const chartData = (data?.messageChart || []).map(d => ({ date: fmtDate(d._id), sent: d.sent, received: d.received, total: d.total }));
  const contactData = (data?.contactChart || []).map(d => ({ date: fmtDate(d._id), contacts: d.count }));

  const pieData = [
    { name: 'Sent', value: m?.sent || 0 },
    { name: 'Delivered', value: m?.delivered || 0 },
    { name: 'Read', value: m?.read || 0 },
    { name: 'Failed', value: m?.failed || 0 },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-emerald-50 text-sm mt-1">Welcome back, {user?.name} 👋</p>
        </div>
        <div className="flex items-center gap-2">
          {currentWorkspace?.whatsapp?.isConnected || data?.whatsappConnected ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-full text-sm font-semibold shadow-lg shadow-green-500/30">
              <CheckCheck className="w-4 h-4" /> WhatsApp Connected ✓
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-full text-sm font-semibold shadow-lg shadow-red-500/30 animate-pulse">
              <WifiOff className="w-4 h-4" /> WhatsApp Disconnected ✗
            </span>
          )}
        </div>
      </div>

      {(() => {
        const plan = (user as unknown as { plan?: { price?: number; name?: string } })?.plan;
        const isFree = !plan || !plan.price || plan.price <= 0;
        if (!isFree) return null;
        return (
          <Link href="/client/subscriptions" className="block">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-5 text-white shadow-lg shadow-violet-500/25 transition hover:-translate-y-0.5 hover:shadow-xl cursor-pointer">
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
              <div className="flex items-center justify-between gap-4 relative">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0"><Crown className="w-6 h-6 text-yellow-300" /></div>
                  <div>
                    <p className="font-bold text-base">You&apos;re on the Free plan — upgrade to unlock more!</p>
                    <p className="text-sm text-violet-100 mt-0.5">More contacts, campaigns, AI prompts, bot flows & team members with a paid plan.</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 px-4 py-2 bg-white text-violet-700 rounded-full text-sm font-semibold flex-shrink-0">Upgrade Now <ArrowRight className="w-4 h-4" /></span>
              </div>
            </div>
          </Link>
        );
      })()}

      {/* Today strip */}
      <SectionTitle icon={<Clock className="w-4 h-4 text-white" />} title="Today at a Glance" accent="bg-gradient-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Send className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Today Sent</p><p className="text-xl font-bold text-gray-900">{data?.today?.sent || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Today Received</p><p className="text-xl font-bold text-gray-900">{data?.today?.received || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><BellRing className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Unread Messages</p><p className="text-xl font-bold text-gray-900">{data?.unreadCount || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/contacts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">New Contacts (30d)</p><p className="text-xl font-bold text-gray-900">{data?.newContacts || 0}</p></div>
          </div>
        </Card></L>
      </div>

      {/* Action needed */}
      <SectionTitle icon={<BellRing className="w-4 h-4 text-white" />} title="Action Needed Today" accent="bg-gradient-to-br from-red-500 to-rose-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Upcoming Appointments</h3>
            <Link href="/client/appointments" className="text-sm text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2.5">
            {(data?.todayAppointments || []).length ? (data?.todayAppointments || []).map(a => (
              <div key={a._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 truncate">{a.contactName || a.contactPhone}</p>
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg shrink-0">{a.date ? new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' : ''}{a.startTime}</span>
              </div>
            )) : <p className="text-sm text-gray-400">No upcoming appointments 🎉</p>}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Due Reminders</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">Open inbox</Link>
          </div>
          <div className="space-y-2.5">
            {(data?.dueReminders || []).length ? (data?.dueReminders || []).map(r => (
              <div key={r._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-600 truncate">{r.contact?.name || r.contact?.phone || 'Contact'}</p>
                  <p className="text-xs text-gray-400 truncate">{r.text}</p>
                </div>
                <span className="text-xs text-red-500 shrink-0">{new Date(r.remindAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400">No pending reminders 🎉</p>}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <L href="/client/followups"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">AI Follow-ups</p>
              <p className="text-lg font-bold text-gray-900">Check leads →</p>
              <p className="text-[11px] text-gray-400">Needs reply / gone quiet</p>
            </div>
          </Card></L>
          <L href="/client/chat"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Active Chats</p>
              <p className="text-lg font-bold text-gray-900">{data?.conversations?.active || 0}</p>
              <p className="text-[11px] text-gray-400">{data?.resolvedCount || 0} resolved</p>
            </div>
          </Card></L>
          <L href="/client/bot-flows"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Active Bot Flows</p>
              <p className="text-lg font-bold text-gray-900">{data?.botFlowsActive || 0}</p>
              <p className="text-[11px] text-gray-400">Auto-replying 24×7</p>
            </div>
          </Card></L>
          <L href="/client/wallet"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Wallet</p>
              <p className="text-lg font-bold text-gray-900">₹{(data?.walletBalance || 0).toFixed(0)}</p>
              <p className="text-[11px] text-gray-400">₹{(data?.spend || 0).toFixed(0)} spent (30d)</p>
            </div>
          </Card></L>
        </div>
      </div>

      {/* Message rate card (wallet-billed clients only) */}
      {data?.rateCard && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Message Rate Card</h3>
            <span className="text-xs text-gray-400">Price / delivered message in INR</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([['Marketing', data.rateCard.marketing], ['Utility', data.rateCard.utility], ['Authentication', data.rateCard.authentication], ['Service', data.rateCard.service]] as [string, number][]).map(([label, rate]) => (
              <div key={label} className="border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50/50">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900">₹{Number(rate || 0).toFixed(4)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main stats */}
      <SectionTitle icon={<MessageSquare className="w-4 h-4 text-white" />} title="Messaging & Contacts" accent="bg-gradient-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/contacts"><StatCard title="Total Contacts" value={data?.contacts || 0} icon={<Users className="w-6 h-6" />} color="blue" /></L>
        <L href="/client/chat"><StatCard title="Messages Sent (30d)" value={m?.sent || 0} icon={<Send className="w-6 h-6" />} color="emerald" /></L>
        <L href="/client/chat"><StatCard title="Delivered" value={m?.delivered || 0} icon={<CheckCheck className="w-6 h-6" />} color="purple" /></L>
        <L href="/client/chat"><StatCard title="Read" value={m?.read || 0} icon={<Eye className="w-6 h-6" />} color="orange" /></L>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/chat"><StatCard title="Conversations" value={data?.conversations?.total || 0} icon={<MessageSquare className="w-6 h-6" />} color="blue" /></L>
        <L href="/client/chat"><StatCard title="Failed" value={m?.failed || 0} icon={<AlertCircle className="w-6 h-6" />} color="red" /></L>
        <L href="/client/broadcasts"><StatCard title="Campaigns" value={`${data?.campaigns?.running || 0} running / ${data?.campaigns?.total || 0}`} icon={<Megaphone className="w-6 h-6" />} color="purple" /></L>
        <L href="/client/wallet"><StatCard title="Wallet Balance" value={`₹${(data?.walletBalance || 0).toFixed(2)}`} icon={<Wallet className="w-6 h-6" />} color="emerald" /></L>
      </div>

      <SectionTitle icon={<Phone className="w-4 h-4 text-white" />} title="Business & Operations" accent="bg-gradient-to-br from-blue-500 to-indigo-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/ai-calling"><StatCard title="AI Calls" value={`${data?.aiCalls?.total || 0} (${data?.aiCalls?.minutes || 0} min)`} icon={<Phone className="w-6 h-6" />} color="blue" /></L>
        <L href="/client/appointments"><StatCard title="Appointments" value={`${data?.appointments?.upcoming || 0} upcoming / ${data?.appointments?.total || 0}`} icon={<Calendar className="w-6 h-6" />} color="orange" /></L>
        <L href="/client/templates"><StatCard title="Templates" value={`${data?.templates?.approved || 0} approved / ${data?.templates?.total || 0}`} icon={<LayoutTemplate className="w-6 h-6" />} color="purple" /></L>
        <L href="/client/transactions"><StatCard title="Spend (30d)" value={`₹${(data?.spend || 0).toFixed(2)}`} icon={<Zap className="w-6 h-6" />} color="red" /></L>
      </div>

      {/* Charts */}
      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title="Analytics & Trends" accent="bg-gradient-to-br from-purple-500 to-fuchsia-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Analytics (30 days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="sent" fill="#10B981" name="Sent" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" fill="#3B82F6" name="Received" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Status</h3>
          <div className="h-64">
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No data yet</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Growth (30 days)</h3>
          <div className="h-56">
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
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No new contacts yet</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Campaigns</h3>
            <Link href="/client/broadcasts" className="text-sm text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {(data?.recentCampaigns || []).length ? (data?.recentCampaigns || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.type} · sent {c.stats?.sent || 0}{c.stats?.failed ? ` · failed ${c.stats.failed}` : ''}</p>
                </div>
                <Badge variant={c.status === 'completed' || c.status === 'running' ? 'success' : c.status === 'failed' ? 'danger' : 'default'}>{c.status}</Badge>
              </div>
            )) : <p className="text-sm text-gray-400">No campaigns yet</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Conversations</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">Open inbox</Link>
          </div>
          <div className="space-y-3">
            {(data?.recentConversations || []).length ? (data?.recentConversations || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.contact?.name || c.contact?.phone}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.lastMessage?.text || ''}</p>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{new Date(c.updatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400">No conversations yet</p>}
          </div>
        </Card>
      </div>

      {/* Quick counts */}
      <SectionTitle icon={<Zap className="w-4 h-4 text-white" />} title="Quick Tools" accent="bg-gradient-to-br from-rose-500 to-red-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/save-money/templates"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Preset Templates</p><p className="text-xl font-bold text-gray-900">{data?.presets || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/keywords"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Auto-Reply Keywords</p><p className="text-xl font-bold text-gray-900">{data?.keywords || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/orders"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Orders</p><p className="text-xl font-bold text-gray-900">{data?.orders?.total || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/orders"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><Wallet className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Order Revenue</p><p className="text-xl font-bold text-gray-900">₹{(data?.orders?.revenue || 0).toFixed(0)}</p></div>
          </div>
        </Card></L>
      </div>
    </div>
  );
}
