'use client';
import React, { useState, useEffect } from 'react';
import { Share2, RefreshCw, Eye, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';
import { facebookLeadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Lead {
  _id: string; name: string; email: string; phone: string; adName: string; formName: string;
  status: string; data: Record<string, string>; createdAt: string;
}

export default function FacebookLeadsPage() {
  const { currentWorkspace } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetch = () => {
    if (!currentWorkspace) return;
    facebookLeadApi.getLeads().then(r => setLeads(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, [currentWorkspace]);

  const handleSync = async () => {
    if (submitting) return;
    setSubmitting(true);

    setSyncing(true);
    try { await facebookLeadApi.syncLeads(); toast.success('Synced'); fetch(); } catch { toast.error('Failed to sync'); } finally { setSubmitting(false); }
    setSyncing(false);
  };

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
  };

  const columns = [
    { key: 'name', title: 'Name', render: (l: Lead) => <span className="font-medium">{l.name}</span> },
    { key: 'email', title: 'Email', render: (l: Lead) => <span className="text-sm text-gray-500">{l.email}</span> },
    { key: 'phone', title: 'Phone', render: (l: Lead) => l.phone },
    { key: 'adName', title: 'Ad Campaign', render: (l: Lead) => <span className="text-sm">{l.adName}</span> },
    { key: 'formName', title: 'Form', render: (l: Lead) => <span className="text-sm text-gray-500">{l.formName}</span> },
    { key: 'status', title: 'Status', render: (l: Lead) => <Badge variant={l.status === 'converted' ? 'success' : l.status === 'contacted' ? 'info' : 'warning'}>{l.status}</Badge> },
    { key: 'date', title: 'Date', render: (l: Lead) => new Date(l.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (l: Lead) => <button onClick={() => setSelected(l)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-gray-400" /></button> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Facebook Leads</h1>
        <p className="text-sm mt-1">Sync Facebook Lead Ads directly into your contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={() => toast.success('Export started')}>Export</Button>
          <Button icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} loading={syncing}>Sync Leads</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={stats.total} icon={<Share2 className="w-5 h-5" />} color="blue" />
        <StatCard title="New" value={stats.new} icon={<Share2 className="w-5 h-5" />} color="yellow" />
        <StatCard title="Contacted" value={stats.contacted} icon={<Share2 className="w-5 h-5" />} color="blue" />
        <StatCard title="Converted" value={stats.converted} icon={<Share2 className="w-5 h-5" />} color="green" />
      </div>

      <Table columns={columns} data={leads} loading={loading} />

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Lead Details" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Name:</span> <span className="font-medium">{selected.name}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="font-medium">{selected.email}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{selected.phone}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant={selected.status === 'converted' ? 'success' : 'info'}>{selected.status}</Badge></div>
              <div><span className="text-gray-500">Ad:</span> <span>{selected.adName}</span></div>
              <div><span className="text-gray-500">Form:</span> <span>{selected.formName}</span></div>
            </div>
            {selected.data && Object.keys(selected.data).length > 0 && (
              <div><h4 className="font-medium mb-2">Form Data</h4><div className="bg-gray-50 rounded-lg p-3 space-y-1">{Object.entries(selected.data).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}:</span><span>{v}</span></div>)}</div></div>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
