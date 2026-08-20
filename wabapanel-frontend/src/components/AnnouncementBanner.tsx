'use client';
import React, { useEffect, useState } from 'react';
import { X, Megaphone, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { platformApi } from '@/lib/api';

interface Announcement { _id: string; title: string; message: string; type: string; }

const styles: Record<string, { bar: string; bg: string; iconBg: string; title: string; text: string; Icon: typeof Megaphone }> = {
  info: { bar: 'bg-blue-500', bg: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300', iconBg: 'bg-blue-500', title: 'text-blue-900', text: 'text-blue-800', Icon: Megaphone },
  success: { bar: 'bg-emerald-500', bg: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300', iconBg: 'bg-emerald-500', title: 'text-emerald-900', text: 'text-emerald-800', Icon: CheckCircle2 },
  warning: { bar: 'bg-amber-500', bg: 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300', iconBg: 'bg-amber-500', title: 'text-amber-900', text: 'text-amber-800', Icon: AlertTriangle },
  danger: { bar: 'bg-red-500', bg: 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300', iconBg: 'bg-red-500', title: 'text-red-900', text: 'text-red-800', Icon: AlertOctagon },
};

export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem('dismissedAnnouncements') || '[]')); } catch {}
    platformApi.activeAnnouncements().then(r => setItems(r.data.data || [])).catch(() => {});
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('dismissedAnnouncements', JSON.stringify(next.slice(-50)));
  };

  const visible = items.filter(a => !dismissed.includes(a._id));
  if (!visible.length) return null;

  return (
    <div className="space-y-2 px-4 pt-3 lg:px-6">
      {visible.map(a => {
        const s = styles[a.type] || styles.info;
        const Icon = s.Icon;
        return (
          <div key={a._id} className={`relative overflow-hidden flex items-start gap-3 border rounded-xl pl-4 pr-3 py-3 shadow-sm ${s.bg}`}>
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${s.bar}`} />
            <div className={`w-9 h-9 rounded-full ${s.iconBg} text-white flex items-center justify-center shrink-0 animate-pulse`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${s.title}`}>{a.title}</p>
              {a.message && <p className={`text-sm mt-0.5 ${s.text}`}>{a.message}</p>}
            </div>
            <button onClick={() => dismiss(a._id)} className={`shrink-0 p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/50 ${s.text}`} aria-label="Dismiss announcement">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
