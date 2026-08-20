'use client';
import React, { useState, useEffect } from 'react';
import { Trash2, Copy } from 'lucide-react';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface ShortLink { _id: string; title: string; originalUrl: string; shortCode: string; clicks: number; isActive: boolean; createdAt: string; userId?: { name: string; email: string }; }

export default function AdminShortLinksPage() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => adminApi.getShortLinks().then(r => setLinks(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const columns = [
    { key: 'title', title: 'Title', render: (l: ShortLink) => <span className="font-medium">{l.title}</span> },
    { key: 'user', title: 'User', render: (l: ShortLink) => l.userId ? <span className="text-sm text-gray-500">{l.userId.name}</span> : '-' },
    { key: 'url', title: 'Original URL', render: (l: ShortLink) => <a href={l.originalUrl} target="_blank" className="text-sm text-blue-600 hover:underline truncate block max-w-xs">{l.originalUrl}</a> },
    { key: 'short', title: 'Short Code', render: (l: ShortLink) => (
      <div className="flex items-center gap-1">
        <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{l.shortCode}</code>
        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/s/${l.shortCode}`); toast.success('Copied'); }} className="p-0.5 hover:bg-gray-100 rounded"><Copy className="w-3 h-3 text-gray-400" /></button>
      </div>
    )},
    { key: 'clicks', title: 'Clicks', render: (l: ShortLink) => <span className="font-medium">{l.clicks}</span> },
    { key: 'status', title: 'Status', render: (l: ShortLink) => <Badge variant={l.isActive ? 'success' : 'warning'}>{l.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'date', title: 'Created', render: (l: ShortLink) => new Date(l.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (l: ShortLink) => (
      <button onClick={() => { if (confirm('Delete?')) adminApi.deleteShortLink(l._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Short Links (All Users)</h1>
        <p className="text-sm mt-1">Platform-wide short links and their click stats</p>
        </div>
      </div>
      <Table columns={columns} data={links} loading={loading} />
    </div>
  );
}
