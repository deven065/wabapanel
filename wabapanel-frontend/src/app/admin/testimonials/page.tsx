'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Star } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Testimonial { _id: string; name: string; role: string; company: string; text: string; rating: number; avatar: string; isActive: boolean; }

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Testimonial | null>(null);
  const [form, setForm] = useState({ name: '', role: '', company: '', text: '', rating: 5, avatar: '' });

  const fetch = () => adminApi.getTestimonials().then(r => setTestimonials(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try {
      if (editItem) await adminApi.updateTestimonial(editItem._id, form);
      else await adminApi.createTestimonial(form);
      toast.success(editItem ? 'Updated' : 'Created'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Testimonial Management</h1>
        <p className="text-sm mt-1">Customer testimonials shown on the public site</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ name: '', role: '', company: '', text: '', rating: 5, avatar: '' }); setShowModal(true); }}>Add Testimonial</Button>
      </div>
      {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map(t => (
            <Card key={t._id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-medium">{t.name.charAt(0)}</div>
                  <div><h4 className="font-medium text-gray-900 text-sm">{t.name}</h4><p className="text-xs text-gray-500">{t.role}{t.company ? ` at ${t.company}` : ''}</p></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditItem(t); setForm({ name: t.name, role: t.role, company: t.company, text: t.text, rating: t.rating, avatar: t.avatar }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-3 h-3 text-gray-400" /></button>
                  <button onClick={() => { if (confirm('Delete?')) adminApi.deleteTestimonial(t._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                </div>
              </div>
              <div className="flex gap-0.5 mb-2">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= t.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />)}</div>
              <p className="text-sm text-gray-600 line-clamp-3">{t.text}</p>
            </Card>
          ))}
        </div>
      )}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Testimonial' : 'Add Testimonial'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <Input label="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
          </div>
          <Input label="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
          <Input label="Avatar URL" value={form.avatar} onChange={e => setForm({ ...form, avatar: e.target.value })} />
          <Textarea label="Testimonial" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} rows={3} required />
          <div>
            <label className="text-sm font-medium text-gray-700">Rating</label>
            <div className="flex gap-1 mt-1">{[1,2,3,4,5].map(s => <button key={s} onClick={() => setForm({ ...form, rating: s })}><Star className={`w-6 h-6 ${s <= form.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} /></button>)}</div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
