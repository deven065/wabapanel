'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { Calendar, Clock, ChevronLeft, ChevronRight, CheckCircle, User, Phone, Mail } from 'lucide-react';

interface Config {
  title: string;
  description: string;
  slotDuration: number;
  advanceDays: number;
  timezone: string;
  days: boolean[];
  overrides?: Record<string, boolean>;
  workspaceName: string;
}
interface Slot { start: string; end: string; capacity: number; remaining: number; available: boolean; }

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api';
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function PublicBookingPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [formVals, setFormVals] = useState({ name: '', phone: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ id: string; token: string; date: string; start: string; end: string } | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!slug) return;
    axios.get(`${apiBase()}/public/booking/${slug}`)
      .then(res => { if (res.data.success) setConfig(res.data.data); else setNotFound(true); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const loadSlots = useCallback((date: string) => {
    setSlotsLoading(true);
    setSlots([]);
    axios.get(`${apiBase()}/public/booking/${slug}/slots`, { params: { date } })
      .then(res => { if (res.data.success) setSlots(res.data.data.slots || []); })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [slug]);

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    loadSlots(date);
  };

  const submit = async () => {
    if (submitting || !selectedSlot) return;
    setError('');
    if (!formVals.name.trim() || !formVals.phone.trim()) { setError('Name and phone are required.'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${apiBase()}/public/booking/${slug}`, {
        name: formVals.name, phone: formVals.phone, email: formVals.email, notes: formVals.notes,
        date: selectedDate, start: selectedSlot.start,
      });
      if (res.data.success) setConfirmed(res.data.data);
      else setError(res.data.message || 'Booking failed');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Booking failed. The slot may no longer be available.');
      if (selectedDate) loadSlots(selectedDate);
      setSelectedSlot(null);
    } finally { setSubmitting(false); }
  };

  const cancelBooking = async () => {
    if (!confirmed || cancelling) return;
    setCancelling(true);
    try {
      await axios.post(`${apiBase()}/public/booking/${slug}/cancel`, { id: confirmed.id, token: confirmed.token });
      setCancelled(true);
    } catch { setError('Could not cancel. Please contact us.'); } finally { setCancelling(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  if (notFound || !config) return <div className="min-h-screen flex items-center justify-center text-gray-500">This booking page is not available.</div>;

  // Calendar grid
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + (config.advanceDays || 30) * 86400000);
  const firstDow = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const dayEnabled = (d: Date) => {
    if (d < today || d > maxDate) return false;
    const ov = config.overrides || {};
    const ds = dstr(d);
    if (ds in ov) return ov[ds];
    return !!config.days[d.getDay()];
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border max-w-md w-full p-8 text-center">
          {cancelled ? (
            <>
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4"><Calendar className="w-7 h-7 text-gray-500" /></div>
              <h2 className="text-xl font-bold text-gray-900">Booking cancelled</h2>
              <p className="text-sm text-gray-500 mt-2">Your appointment has been cancelled.</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-7 h-7 text-emerald-600" /></div>
              <h2 className="text-xl font-bold text-gray-900">You&apos;re booked!</h2>
              <p className="text-sm text-gray-500 mt-2">{config.title}</p>
              <div className="mt-4 inline-flex items-center gap-2 bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-700">
                <Calendar className="w-4 h-4 text-emerald-600" />
                {new Date(confirmed.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                <span className="mx-1 text-gray-300">|</span>
                <Clock className="w-4 h-4 text-emerald-600" /> {confirmed.start}–{confirmed.end}
              </div>
              <button onClick={cancelBooking} disabled={cancelling} className="mt-6 block w-full text-sm text-red-600 hover:underline disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Cancel this booking'}
              </button>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="grid md:grid-cols-[280px_1fr_260px]">
          {/* Info */}
          <div className="p-6 border-b md:border-b-0 md:border-r">
            {config.workspaceName && <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">{config.workspaceName}</p>}
            <h1 className="text-xl font-bold text-gray-900 mt-1">{config.title}</h1>
            {config.description && <p className="text-sm text-gray-500 mt-2">{config.description}</p>}
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-4"><Clock className="w-4 h-4" /> {config.slotDuration} min</div>
            {selectedSlot && selectedDate && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 mt-2 font-medium"><Calendar className="w-4 h-4" /> {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {selectedSlot.start}</div>
            )}
          </div>

          {/* Calendar */}
          <div className="p-6 border-b md:border-b-0 md:border-r">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{MONTHS[month.getMonth()]} {month.getFullYear()}</h3>
              <div className="flex gap-1">
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
              {DOW.map(d => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const ds = dstr(d);
                const enabled = dayEnabled(d);
                const sel = ds === selectedDate;
                return (
                  <button key={i} disabled={!enabled} onClick={() => selectDate(ds)}
                    className={`aspect-square rounded-lg text-sm transition-colors ${sel ? 'bg-emerald-600 text-white font-semibold' : enabled ? 'text-gray-700 hover:bg-emerald-50 font-medium' : 'text-gray-300 cursor-not-allowed'}`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slots / Form */}
          <div className="p-6">
            {!selectedDate ? (
              <p className="text-sm text-gray-400">Select a date to see available times.</p>
            ) : !selectedSlot ? (
              <>
                <h3 className="font-semibold text-gray-900 mb-3">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                {slotsLoading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : slots.filter(s => s.available).length === 0 ? (
                  <p className="text-sm text-gray-400">No slots available on this day.</p>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {slots.filter(s => s.available).map(s => (
                      <button key={s.start} onClick={() => setSelectedSlot(s)}
                        className="w-full py-2.5 rounded-lg border border-emerald-200 text-emerald-700 font-medium text-sm hover:bg-emerald-600 hover:text-white transition-colors">
                        {s.start}{s.capacity > 1 ? <span className="ml-1 text-xs opacity-70">({s.remaining} left)</span> : ''}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900 mb-3">Your details</h3>
                <div className="space-y-3">
                  <div className="relative"><User className="w-4 h-4 text-gray-400 absolute left-3 top-3" /><input value={formVals.name} onChange={e => setFormVals({ ...formVals, name: e.target.value })} placeholder="Full name *" className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" /></div>
                  <div className="relative"><Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" /><input value={formVals.phone} onChange={e => setFormVals({ ...formVals, phone: e.target.value })} placeholder="Phone *" className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" /></div>
                  <div className="relative"><Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" /><input value={formVals.email} onChange={e => setFormVals({ ...formVals, email: e.target.value })} placeholder="Email" className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" /></div>
                  <textarea value={formVals.notes} onChange={e => setFormVals({ ...formVals, notes: e.target.value })} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedSlot(null)} className="px-3 py-2.5 text-sm border rounded-lg hover:bg-gray-50">Back</button>
                    <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">{submitting ? 'Booking…' : 'Confirm booking'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">Powered by WABA Panel</p>
    </div>
  );
}
