'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users, Package, DollarSign, MessageSquare, Building2, Send, Phone, Wallet,
  TrendingUp, Clock, UserPlus, AlertTriangle, CreditCard, Activity, Shield, BarChart3,
  BellRing, ArrowRight, LifeBuoy, Mail,
} from 'lucide-react';
import { StatCard } from '@/components/ui/Card';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
  </div>
);

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

interface RecentUser {
  _id: string;
  name: string;
  email: string;
  plan: { name: string } | string | null;
  status: string;
  createdAt: string;
  lastLogin?: string;
  planExpiry?: string;
}

interface ExpiringUser {
  _id: string;
  name: string;
  email: string;
  plan: { name: string } | null;
  planExpiry: string;
}

interface RecentPayment {
  _id: string;
  user: { name: string; email: string } | null;
  amount: number;
  description?: string;
  createdAt: string;
}

interface SubStat {
  _id: string;
  count: number;
  planName?: string;
}

interface PaymentStat {
  _id: string;
  total: number;
  count: number;
}

export default function AdminDashboard() {
  const [data, setData] = useState<{
    users: { total: number; active: number };
    plans: number;
    revenue: number;
    recentSignups: RecentUser[];
    subscriptionStats: SubStat[];
    paymentStats: PaymentStat[];
    platform: { workspaces: number; msgSent30: number; msgRecv30: number; campaigns: number; aiCalls30: number; walletTotal: number; msgToday: number } | null;
    todaySignups: number;
    expiringSoon: ExpiringUser[];
    expiredUsers: number;
    recentPayments: RecentPayment[];
    todayRevenue: { total: number; count: number };
    userGrowthChart: Array<{ _id: string; count: number }>;
    pendingActions?: { manualPayments: number; openTickets: number; newInquiries: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getDashboard().then(r => {
      setData(r.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = data;
  const revenueByMonth = (d?.paymentStats || []).map(p => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthNum = parseInt(p._id.split('-')[1]) - 1;
    return { month: months[monthNum] || p._id, revenue: p.total, orders: p.count };
  }).reverse();

  const usersByPlan = (d?.subscriptionStats || []).map(s => ({
    plan: s.planName || 'Unknown',
    count: s.count,
  }));

  const growthData = (d?.userGrowthChart || []).map(g => ({
    date: fmtDate(g._id),
    users: g.count,
  }));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-emerald-50 text-sm mt-1">Platform overview, vendors & revenue at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm font-medium backdrop-blur">
            <Shield className="w-4 h-4" /> Super Admin
          </span>
        </div>
      </div>

      {/* Pending Actions */}
      {(() => {
        const pa = d?.pendingActions;
        const items = [
          { count: pa?.manualPayments || 0, label: 'Manual payment approval', plural: 'Manual payment approvals', href: '/admin/payments', icon: <CreditCard className="w-5 h-5" /> },
          { count: pa?.openTickets || 0, label: 'Open support ticket', plural: 'Open support tickets', href: '/admin/support', icon: <LifeBuoy className="w-5 h-5" /> },
          { count: pa?.newInquiries || 0, label: 'New inquiry', plural: 'New inquiries', href: '/admin/inquiries', icon: <Mail className="w-5 h-5" /> },
        ].filter(i => i.count > 0);
        if (!items.length) return null;
        return (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex w-8 h-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                <BellRing className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500" />
              </span>
              <h2 className="text-base font-bold text-amber-900">Action Required — {items.reduce((a, i) => a + i.count, 0)} pending task{items.reduce((a, i) => a + i.count, 0) > 1 ? 's' : ''}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {items.map(i => (
                <Link key={i.href} href={i.href} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-amber-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">{i.icon}</div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{i.count}</p>
                      <p className="text-xs text-gray-600">{i.count > 1 ? i.plural : i.label}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Today at a Glance */}
      <SectionTitle icon={<Clock className="w-4 h-4 text-white" />} title="Today at a Glance" accent="bg-gradient-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/admin/vendors"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><UserPlus className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">New Signups Today</p><p className="text-xl font-bold text-gray-900">{d?.todaySignups || 0}</p></div>
          </div>
        </Card></L>
        <L href="/admin/billing"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Revenue Today</p><p className="text-xl font-bold text-gray-900">{'\u20B9'}{(d?.todayRevenue?.total || 0).toLocaleString()}</p></div>
          </div>
        </Card></L>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Messages Today</p><p className="text-xl font-bold text-gray-900">{(d?.platform?.msgToday || 0).toLocaleString()}</p></div>
          </div>
        </Card>
        <L href="/admin/billing"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><CreditCard className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Payments Today</p><p className="text-xl font-bold text-gray-900">{d?.todayRevenue?.count || 0}</p></div>
          </div>
        </Card></L>
      </div>

      {/* Platform Overview */}
      <SectionTitle icon={<Activity className="w-4 h-4 text-white" />} title="Platform Overview" accent="bg-gradient-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/admin/vendors"><StatCard title="Total Vendors" value={d?.users?.total || 0} icon={<Users className="w-6 h-6" />} color="emerald" /></L>
        <L href="/admin/vendors"><StatCard title="Active Vendors" value={d?.users?.active || 0} icon={<Users className="w-6 h-6" />} color="blue" /></L>
        <L href="/admin/billing"><StatCard title="Total Revenue" value={`\u20B9${(d?.revenue || 0).toLocaleString()}`} icon={<DollarSign className="w-6 h-6" />} color="purple" /></L>
        <L href="/admin/subscriptions"><StatCard title="Active Plans" value={d?.plans || 0} icon={<Package className="w-6 h-6" />} color="orange" /></L>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Workspaces" value={d?.platform?.workspaces || 0} icon={<Building2 className="w-6 h-6" />} color="emerald" />
        <StatCard title="Messages Sent (30d)" value={(d?.platform?.msgSent30 || 0).toLocaleString()} icon={<Send className="w-6 h-6" />} color="blue" />
        <StatCard title="Messages Received (30d)" value={(d?.platform?.msgRecv30 || 0).toLocaleString()} icon={<MessageSquare className="w-6 h-6" />} color="purple" />
        <StatCard title="AI Calls (30d)" value={d?.platform?.aiCalls30 || 0} icon={<Phone className="w-6 h-6" />} color="orange" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Campaigns" value={d?.platform?.campaigns || 0} icon={<Send className="w-6 h-6" />} color="emerald" />
        <StatCard title="Wallets Total" value={`\u20B9${(d?.platform?.walletTotal || 0).toLocaleString()}`} icon={<Wallet className="w-6 h-6" />} color="blue" />
        <L href="/admin/plan-reminders"><StatCard title="Expiring Soon (7d)" value={(d?.expiringSoon || []).length} icon={<AlertTriangle className="w-6 h-6" />} color="red" /></L>
        <StatCard title="Expired Plans" value={d?.expiredUsers || 0} icon={<Clock className="w-6 h-6" />} color="orange" />
      </div>

      {/* Action Needed */}
      <SectionTitle icon={<AlertTriangle className="w-4 h-4 text-white" />} title="Action Needed" accent="bg-gradient-to-br from-red-500 to-rose-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Plans Expiring (7 days)</h3>
            <Link href="/admin/plan-reminders" className="text-sm text-emerald-600 hover:underline">Reminders</Link>
          </div>
          <div className="space-y-2.5">
            {(d?.expiringSoon || []).length ? (d?.expiringSoon || []).map(u => (
              <div key={u._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.plan?.name || 'No plan'}</p>
                </div>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg shrink-0">
                  {Math.ceil((new Date(u.planExpiry).getTime() - Date.now()) / 86400000)}d left
                </span>
              </div>
            )) : <p className="text-sm text-gray-400">No plans expiring soon</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Recent Payments</h3>
            <Link href="/admin/billing" className="text-sm text-emerald-600 hover:underline">All invoices</Link>
          </div>
          <div className="space-y-2.5">
            {(d?.recentPayments || []).length ? (d?.recentPayments || []).slice(0, 5).map(p => (
              <div key={p._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.user?.name || 'Unknown'}</p>
                  <p className="text-xs text-gray-400 truncate">{p.description || 'Payment'}</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg shrink-0">
                  {'\u20B9'}{p.amount?.toLocaleString()}
                </span>
              </div>
            )) : <p className="text-sm text-gray-400">No payments yet</p>}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <L href="/admin/subscriptions"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Subscriptions</p>
              <p className="text-lg font-bold text-gray-900">Manage</p>
              <p className="text-[11px] text-gray-400">Plans & assignments</p>
            </div>
          </Card></L>
          <L href="/admin/vendors"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Vendors</p>
              <p className="text-lg font-bold text-gray-900">{d?.users?.total || 0}</p>
              <p className="text-[11px] text-gray-400">{d?.users?.active || 0} active</p>
            </div>
          </Card></L>
          <L href="/admin/blog"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Blog</p>
              <p className="text-lg font-bold text-gray-900">Posts</p>
              <p className="text-[11px] text-gray-400">Manage content</p>
            </div>
          </Card></L>
          <L href="/admin/settings"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Settings</p>
              <p className="text-lg font-bold text-gray-900">Config</p>
              <p className="text-[11px] text-gray-400">SMTP, Branding</p>
            </div>
          </Card></L>
        </div>
      </div>

      {/* Charts */}
      <SectionTitle icon={<BarChart3 className="w-4 h-4 text-white" />} title="Analytics & Trends" accent="bg-gradient-to-br from-purple-500 to-fuchsia-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Overview (Monthly)</h3>
          <div className="h-64">
            {revenueByMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Users by Plan</h3>
          <div className="h-64">
            {usersByPlan.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={usersByPlan} dataKey="count" nameKey="plan" cx="50%" cy="50%" outerRadius={80} label>
                    {usersByPlan.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No plan data yet</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">User Growth (30 days)</h3>
          <div className="h-56">
            {growthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="users" stroke="#8B5CF6" fill="#EDE9FE" name="New Users" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">No growth data yet</div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Signups</h3>
            <Link href="/admin/vendors" className="text-sm text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-500">User</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Plan</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(d?.recentSignups || []).map(u => (
                  <tr key={u._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-semibold text-emerald-600">
                          {u.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="info">
                        {typeof u.plan === 'object' && u.plan ? u.plan.name : (u.plan || 'Free')}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge variant={u.status === 'active' ? 'success' : 'default'}>{u.status}</Badge>
                    </td>
                    <td className="py-2.5 text-gray-500">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
                {!(d?.recentSignups || []).length && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-400">No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Quick Tools */}
      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title="Quick Actions" accent="bg-gradient-to-br from-rose-500 to-red-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/admin/vendors"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Manage Vendors</p><p className="text-sm font-bold text-gray-900">View All</p></div>
          </div>
        </Card></L>
        <L href="/admin/subscriptions"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Package className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Subscriptions</p><p className="text-sm font-bold text-gray-900">Assign Plans</p></div>
          </div>
        </Card></L>
        <L href="/admin/billing"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><CreditCard className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Billing</p><p className="text-sm font-bold text-gray-900">Invoices</p></div>
          </div>
        </Card></L>
        <L href="/admin/plan-reminders"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Reminders</p><p className="text-sm font-bold text-gray-900">Send Alerts</p></div>
          </div>
        </Card></L>
      </div>
    </div>
  );
}
