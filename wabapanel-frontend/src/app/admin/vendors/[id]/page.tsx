'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Users, Megaphone, MessageCircle, Wallet, CreditCard, LogIn, Mail, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface VendorDetail {
  vendor: {
    _id: string; name: string; email: string; phone: string; status: string;
    companyName: string; website: string; gstNumber: string; address: string;
    plan?: { name: string; price: number; interval: string }; planExpiry?: string;
    walletBalance: number; createdAt: string; lastLogin?: string;
  };
  stats: { totalMessages: number; messages30d: number; messages7d: number; totalContacts: number; totalCampaigns: number; totalConversations: number };
  subscriptions: { _id: string; plan: { name: string; price: number; interval: string }; status: string; startDate: string; endDate: string | null }[];
  invoices: { _id: string; invoiceNumber: string; total: number; status: string; createdAt: string }[];
  walletTransactions: { _id: string; amount: number; type: string; description: string; createdAt: string }[];
  recentMessages: { _id: string; body: string; type: string; createdAt: string }[];
}

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    adminApi.getVendorDetail(params.id as string)
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load vendor'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleLoginAs = async () => {
    if (!data) return;
    try {
      const res = await adminApi.loginAsVendor(data.vendor._id);
      const { token, user } = res.data.data;
      window.open(`/auth/login?token=${token}&name=${encodeURIComponent(user.name)}`, '_blank');
      toast.success('Logged in as ' + data.vendor.name);
    } catch { toast.error('Failed'); }
  };

  if (loading) return <div className="p-6 text-center text-gray-400">Loading...</div>;
  if (!data) return <div className="p-6 text-center text-gray-400">Vendor not found</div>;

  const { vendor, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/admin/vendors')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
          <p className="text-sm text-gray-500">{vendor.email} {vendor.companyName ? `| ${vendor.companyName}` : ''}</p>
        </div>
        <Badge variant={vendor.status === 'active' ? 'success' : 'danger'}>{vendor.status}</Badge>
        <Button size="sm" onClick={handleLoginAs} icon={<LogIn className="w-4 h-4" />}>Login as Vendor</Button>
      </div>

      {/* Vendor Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-xs text-gray-500">Phone</p><p className="font-medium">{vendor.phone || '-'}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Plan</p><p className="font-medium">{vendor.plan?.name || 'Free'} <span className="text-xs text-gray-400">({vendor.plan?.interval || '-'})</span></p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Plan Expiry</p><p className="font-medium">{vendor.planExpiry ? new Date(vendor.planExpiry).toLocaleDateString() : 'Lifetime'}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Wallet Balance</p><p className="font-medium text-emerald-600">Rs.{(vendor.walletBalance || 0).toLocaleString()}</p></Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { icon: <MessageSquare className="w-5 h-5 text-blue-500" />, label: 'Total Messages', val: stats.totalMessages },
          { icon: <MessageSquare className="w-5 h-5 text-emerald-500" />, label: 'Messages (30d)', val: stats.messages30d },
          { icon: <MessageSquare className="w-5 h-5 text-cyan-500" />, label: 'Messages (7d)', val: stats.messages7d },
          { icon: <Users className="w-5 h-5 text-purple-500" />, label: 'Contacts', val: stats.totalContacts },
          { icon: <Megaphone className="w-5 h-5 text-orange-500" />, label: 'Campaigns', val: stats.totalCampaigns },
          { icon: <MessageCircle className="w-5 h-5 text-pink-500" />, label: 'Conversations', val: stats.totalConversations },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center">
            <div className="flex justify-center mb-2">{s.icon}</div>
            <p className="text-2xl font-bold">{s.val.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Subscriptions */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> Subscription History</h3>
          {data.subscriptions.length === 0 ? <p className="text-sm text-gray-400">No subscriptions</p> : (
            <div className="space-y-2">
              {data.subscriptions.map(s => (
                <div key={s._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm">
                  <div><p className="font-medium">{s.plan?.name}</p><p className="text-xs text-gray-400">{new Date(s.startDate).toLocaleDateString()} - {s.endDate ? new Date(s.endDate).toLocaleDateString() : 'Lifetime'}</p></div>
                  <Badge variant={s.status === 'active' ? 'success' : 'default'}>{s.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Invoices */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Mail className="w-4 h-4 text-blue-600" /> Recent Invoices</h3>
          {data.invoices.length === 0 ? <p className="text-sm text-gray-400">No invoices</p> : (
            <div className="space-y-2">
              {data.invoices.map(inv => (
                <div key={inv._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm">
                  <div><p className="font-medium">{inv.invoiceNumber}</p><p className="text-xs text-gray-400">{new Date(inv.createdAt).toLocaleDateString()}</p></div>
                  <div className="text-right"><p className="font-medium">Rs.{inv.total.toLocaleString()}</p><Badge variant={inv.status === 'paid' ? 'success' : 'default'}>{inv.status}</Badge></div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Wallet */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="w-4 h-4 text-amber-600" /> Wallet Transactions</h3>
          {data.walletTransactions.length === 0 ? <p className="text-sm text-gray-400">No transactions</p> : (
            <div className="space-y-2">
              {data.walletTransactions.map(t => (
                <div key={t._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm">
                  <div><p className="font-medium">{t.description || t.type}</p><p className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</p></div>
                  <p className={`font-medium ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-500'}`}>{t.type === 'credit' ? '+' : '-'}Rs.{Math.abs(t.amount).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Messages */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600" /> Recent Messages</h3>
          {data.recentMessages.length === 0 ? <p className="text-sm text-gray-400">No messages</p> : (
            <div className="space-y-2">
              {data.recentMessages.map(m => (
                <div key={m._id} className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="text-gray-700 line-clamp-2">{m.body || `[${m.type}]`}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Vendor Details */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-600" /> Vendor Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500">Website</p><p className="font-medium">{vendor.website || '-'}</p></div>
          <div><p className="text-gray-500">GST Number</p><p className="font-medium">{vendor.gstNumber || '-'}</p></div>
          <div><p className="text-gray-500">Address</p><p className="font-medium">{vendor.address || '-'}</p></div>
          <div><p className="text-gray-500">Joined</p><p className="font-medium">{new Date(vendor.createdAt).toLocaleDateString()}</p></div>
          <div><p className="text-gray-500">Last Login</p><p className="font-medium">{vendor.lastLogin ? new Date(vendor.lastLogin).toLocaleString() : 'Never'}</p></div>
        </div>
      </Card>
    </div>
  );
}
