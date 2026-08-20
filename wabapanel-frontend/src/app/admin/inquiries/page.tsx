'use client';
import React, { useState, useEffect } from 'react';
import { Eye, Trash2, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Textarea from '@/components/ui/Textarea';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Inquiry { _id: string; name: string; email: string; phone?: string; subject: string; message: string; status: string; createdAt: string; }

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [reply, setReply] = useState('');

  const fetch = () => adminApi.getInquiries().then(r => setInquiries(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleReply = async () => {
    if (!selected) return;
    try { await adminApi.replyInquiry(selected._id, { reply }); toast.success('Reply sent'); setSelected(null); fetch(); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'name', title: 'Name', render: (i: Inquiry) => <span className="font-medium">{i.name}</span> },
    { key: 'email', title: 'Email', render: (i: Inquiry) => <span className="text-sm text-gray-500">{i.email}</span> },
    { key: 'phone', title: 'Phone', render: (i: Inquiry) => <span className="text-sm text-gray-500">{i.phone || '—'}</span> },
    { key: 'subject', title: 'Subject', render: (i: Inquiry) => <span className="text-sm">{i.subject}</span> },
    { key: 'status', title: 'Status', render: (i: Inquiry) => <Badge variant={i.status === 'resolved' ? 'success' : i.status === 'pending' ? 'warning' : 'info'}>{i.status}</Badge> },
    { key: 'date', title: 'Date', render: (i: Inquiry) => new Date(i.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (i: Inquiry) => (
      <div className="flex gap-1">
        <button onClick={() => { setSelected(i); setReply(''); }} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm('Delete?')) adminApi.deleteInquiry(i._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900">Customer Inquiries</h1>
      </div>
      <p className="text-sm mt-1">Leads and inquiries submitted from the public site</p>
      <Table columns={columns} data={inquiries} loading={loading} />
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Inquiry Details" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Name:</span> <span className="font-medium">{selected.name}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="font-medium">{selected.email}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{selected.phone || '—'}</span></div>
            </div>
            <div><span className="text-gray-500 text-sm">Subject:</span><p className="font-medium">{selected.subject}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-sm">{selected.message}</p></div>
            <Textarea label="Reply" value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your reply..." />
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button><Button onClick={handleReply} icon={<Mail className="w-4 h-4" />}>Send Reply</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
