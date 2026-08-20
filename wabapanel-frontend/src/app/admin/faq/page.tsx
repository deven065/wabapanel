'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, HelpCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FAQ { _id: string; question: string; answer: string; order: number; isActive: boolean; }

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<FAQ | null>(null);
  const [form, setForm] = useState({ question: '', answer: '', order: 0 });

  const fetch = () => adminApi.getFAQs().then(r => setFaqs(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try {
      if (editItem) await adminApi.updateFAQ(editItem._id, form);
      else await adminApi.createFAQ(form);
      toast.success(editItem ? 'Updated' : 'Created'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">FAQ Management</h1>
        <p className="text-sm mt-1">Frequently asked questions shown on the public site</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ question: '', answer: '', order: faqs.length }); setShowModal(true); }}>Add FAQ</Button>
      </div>
      {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : faqs.length === 0 ? (
        <Card><div className="text-center py-8"><HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No FAQs yet</p></div></Card>
      ) : (
        <div className="space-y-3">
          {faqs.map(faq => (
            <Card key={faq._id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{faq.question}</h3>
                  <p className="text-sm text-gray-500 mt-1">{faq.answer}</p>
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => { setEditItem(faq); setForm({ question: faq.question, answer: faq.answer, order: faq.order }); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => { if (confirm('Delete?')) adminApi.deleteFAQ(faq._id).then(fetch); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit FAQ' : 'Add FAQ'}>
        <div className="space-y-4">
          <Input label="Question" value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} required />
          <Textarea label="Answer" value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={4} required />
          <Input label="Order" type="number" value={String(form.order)} onChange={e => setForm({ ...form, order: Number(e.target.value) })} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
