'use client';
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

type Recipient = { phone: string; name: string; status: string; error: string; at: string };
type Counts = { total: number; sent: number; delivered: number; read: number; failed: number; deliveredTotal: number; sentTotal: number };

const COLORS: Record<string, string> = { Read: '#6366f1', Delivered: '#10b981', 'Sent only': '#3b82f6', Failed: '#ef4444', Pending: '#d1d5db' };

function RateBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-500 mb-0.5"><span>{label}</span><span className="font-semibold text-gray-700">{value}%</span></div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} /></div>
    </div>
  );
}

// Dashboard-style analytics block for campaign delivery reports.
export default function CampaignReportAnalytics({ counts, recipients }: { counts: Counts; recipients: Recipient[] }) {
  const total = counts.total || 0;
  if (!total) return null;

  const read = counts.read || 0;
  const deliveredOnly = Math.max(0, (counts.deliveredTotal || 0) - read);
  const sentOnly = Math.max(0, counts.sent || 0);
  const failed = counts.failed || 0;
  const pending = Math.max(0, total - read - deliveredOnly - sentOnly - failed);

  const pieData = [
    { name: 'Read', value: read },
    { name: 'Delivered', value: deliveredOnly },
    { name: 'Sent only', value: sentOnly },
    { name: 'Failed', value: failed },
    { name: 'Pending', value: pending },
  ].filter(d => d.value > 0);

  const pct = (n: number) => total ? Math.round((n / total) * 1000) / 10 : 0;
  const deliveryRate = pct(counts.deliveredTotal || 0);
  const readRate = pct(read);
  const failRate = pct(failed);

  const hourly: Record<string, number> = {};
  recipients.forEach(r => {
    if (!r.at) return;
    const d = new Date(r.at);
    if (isNaN(d.getTime())) return;
    const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    hourly[key] = (hourly[key] || 0) + 1;
  });
  const timeline = Object.entries(hourly).sort(([a], [b]) => a.localeCompare(b)).map(([time, count]) => ({ time, count }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-700 mb-1">Delivery Breakdown</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2}>
                {pieData.map(d => <Cell key={d.name} fill={COLORS[d.name]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${Number(v) || 0} (${pct(Number(v) || 0)}%)`, String(n)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
          {pieData.map(d => (
            <span key={d.name} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[d.name] }} /> {d.name} ({d.value})
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Performance</p>
        <RateBar label="Delivery rate" value={deliveryRate} color="#10b981" />
        <RateBar label="Read rate" value={readRate} color="#6366f1" />
        <RateBar label="Failure rate" value={failRate} color="#ef4444" />
        {timeline.length > 1 && (
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Send timeline (per hour)</p>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline}>
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
