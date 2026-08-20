'use client';
import React, { useState, useEffect } from 'react';
import { Bell, Send, AlertTriangle, Clock, CheckCircle, Settings, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface ExpiringVendor {
  _id: string; name: string; email: string; companyName?: string;
  planExpiry: string; plan?: { name: string; price: number };
}

export default function PlanRemindersPage() {
  const [expiring, setExpiring] = useState<ExpiringVendor[]>([]);
  const [expired, setExpired] = useState<ExpiringVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [sending, setSending] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoDays, setAutoDays] = useState('7,3,1');
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [runningAuto, setRunningAuto] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await adminApi.checkExpiringPlans({ days });
      setExpiring(res.data.data?.expiring || []);
      setExpired(res.data.data?.expired || []);
    } catch { /* */ }
    setLoading(false);
  };

  const fetchAutoSettings = async () => {
    try {
      const res = await adminApi.getAutoReminderSettings();
      const d = res.data.data;
      setAutoEnabled(d.enabled || false);
      setAutoDays((d.daysBefore || [7, 3, 1]).join(', '));
      setLastRunAt(d.lastRunAt || null);
    } catch { /* */ }
  };

  useEffect(() => { fetchData(); }, [days]);
  useEffect(() => { fetchAutoSettings(); }, []);

  const sendReminder = async (vendor: ExpiringVendor) => {
    setSending(vendor._id);
    try {
      const res = await adminApi.sendPlanReminder({ vendorId: vendor._id });
      toast.success(res.data.message || 'Reminder sent');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to send');
    }
    setSending(null);
  };

  const sendAll = async (vendors: ExpiringVendor[]) => {
    if (!confirm(`Send reminder to ${vendors.length} vendors?`)) return;
    for (const v of vendors) {
      await sendReminder(v);
    }
    toast.success('All reminders sent');
  };

  const daysUntilExpiry = (date: string) => {
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return diff;
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bell className="w-6 h-6 text-emerald-600" /> Plan Reminders</h1>
          <p className="text-sm text-gray-500 mt-1">Auto-detect expiring plans and send reminders to vendors</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
            <option value={3}>Next 3 days</option>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
          <Button variant="secondary" onClick={fetchData}><Clock className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>
      </div>

      {/* Auto Reminder Settings */}
      <Card className="p-5 border-l-4 border-l-emerald-500">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-emerald-600" /> Auto Reminder Setup</h3>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" disabled={runningAuto} onClick={async () => {
              setRunningAuto(true);
              try {
                const res = await adminApi.runAutoReminder();
                const d = res.data.data;
                if (d.skipped) toast.error(d.reason || 'Auto reminder is disabled');
                else toast.success(`Sent ${d.sentCount || 0} reminders`);
                fetchAutoSettings();
              } catch { toast.error('Failed'); }
              setRunningAuto(false);
            }}>
              <Play className="w-3.5 h-3.5 mr-1" /> {runningAuto ? 'Running...' : 'Run Now'}
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition-colors ${autoEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setAutoEnabled(!autoEnabled)}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium">{autoEnabled ? 'Auto Reminders ON' : 'Auto Reminders OFF'}</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Days Before Expiry (comma-separated)</label>
            <input value={autoDays} onChange={e => setAutoDays(e.target.value)}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="7, 3, 1" />
            <p className="text-xs text-gray-400 mt-1">Reminder emails will be sent this many days before plan expiry. E.g. &quot;7, 3, 1&quot; = reminders at 7 days, 3 days, and 1 day before.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={savingAuto} onClick={async () => {
              setSavingAuto(true);
              try {
                const daysBefore = autoDays.split(',').map(d => parseInt(d.trim())).filter(d => d > 0);
                if (!daysBefore.length) { toast.error('Enter valid days'); setSavingAuto(false); return; }
                await adminApi.updateAutoReminderSettings({ enabled: autoEnabled, daysBefore });
                toast.success('Auto reminder settings saved');
              } catch { toast.error('Failed to save'); }
              setSavingAuto(false);
            }}>{savingAuto ? 'Saving...' : 'Save Settings'}</Button>
            {lastRunAt && <p className="text-xs text-gray-400">Last auto-run: {new Date(lastRunAt).toLocaleString()}</p>}
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">When enabled, the system automatically checks for expiring plans every 6 hours and sends email reminders using the &quot;Plan Expiry&quot; email template from Settings → Email SMTP. SMTP must be configured for this to work.</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border-l-4 border-l-red-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div><p className="font-bold text-red-600 text-xl">{expired.length}</p><p className="text-xs text-gray-500">Already Expired</p></div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-orange-500">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <div><p className="font-bold text-orange-600 text-xl">{expiring.length}</p><p className="text-xs text-gray-500">Expiring in {days} days</p></div>
          </div>
        </Card>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : (
        <>
          {/* Expired Plans */}
          {expired.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Expired Plans</h3>
                <Button size="sm" variant="secondary" onClick={() => sendAll(expired)}><Send className="w-3.5 h-3.5 mr-1" /> Send All</Button>
              </div>
              <div className="space-y-2">
                {expired.map(v => (
                  <div key={v._id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{v.name}</p>
                      <p className="text-xs text-gray-500">{v.email} {v.companyName ? `| ${v.companyName}` : ''}</p>
                      <p className="text-xs text-red-500 mt-1">Expired {Math.abs(daysUntilExpiry(v.planExpiry))} days ago | Plan: {v.plan?.name || 'N/A'}</p>
                    </div>
                    <Button size="sm" onClick={() => sendReminder(v)} disabled={sending === v._id}>
                      {sending === v._id ? 'Sending...' : <><Send className="w-3.5 h-3.5 mr-1" /> Remind</>}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Expiring Soon */}
          {expiring.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-orange-600 flex items-center gap-2"><Clock className="w-4 h-4" /> Expiring Soon</h3>
                <Button size="sm" variant="secondary" onClick={() => sendAll(expiring)}><Send className="w-3.5 h-3.5 mr-1" /> Send All</Button>
              </div>
              <div className="space-y-2">
                {expiring.map(v => {
                  const d = daysUntilExpiry(v.planExpiry);
                  return (
                    <div key={v._id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{v.name}</p>
                        <p className="text-xs text-gray-500">{v.email} {v.companyName ? `| ${v.companyName}` : ''}</p>
                        <p className="text-xs text-orange-600 mt-1">
                          Expires in {d} day{d !== 1 ? 's' : ''} ({new Date(v.planExpiry).toLocaleDateString()}) | Plan: {v.plan?.name || 'N/A'}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => sendReminder(v)} disabled={sending === v._id}>
                        {sending === v._id ? 'Sending...' : <><Send className="w-3.5 h-3.5 mr-1" /> Remind</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {expired.length === 0 && expiring.length === 0 && (
            <Card className="p-10 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-lg">All Good!</h3>
              <p className="text-sm text-gray-500">No plans expiring in the next {days} days</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
