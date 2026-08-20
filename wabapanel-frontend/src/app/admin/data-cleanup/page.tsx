'use client';
import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface CategoryCfg { enabled: boolean; days: number }
interface WorkspaceOpt { _id: string; name: string; owner?: { name?: string; email?: string } }
interface CleanupSettings {
  enabled: boolean;
  runHour: number;
  categories: Record<string, CategoryCfg>;
  lastRun?: string;
  lastRunSummary?: string;
}

export default function DataCleanupPage() {
  const [settings, setSettings] = useState<CleanupSettings>({ enabled: false, runHour: 3, categories: {} });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOpt[]>([]);
  const [selectedWs, setSelectedWs] = useState('');

  const load = async (ws?: string) => {
    try {
      const res = await adminApi.getDataCleanup(ws ?? selectedWs);
      const d = res.data.data;
      setSettings({
        enabled: !!d.settings.enabled,
        runHour: d.settings.runHour ?? 3,
        categories: d.settings.categories || {},
        lastRun: d.settings.lastRun,
        lastRunSummary: d.settings.lastRunSummary,
      });
      setCounts(d.counts || {});
      setLabels(d.labels || {});
      setWorkspaces(d.workspaces || []);
    } catch { toast.error('Failed to load cleanup settings'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setCat = (key: string, patch: Partial<CategoryCfg>) => {
    setSettings(s => ({
      ...s,
      categories: { ...s.categories, [key]: { ...{ enabled: false, days: 30 }, ...s.categories[key], ...patch } },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateDataCleanup(settings);
      toast.success('Cleanup settings saved');
      load();
    } catch { toast.error('Failed to save settings'); }
    setSaving(false);
  };

  const runNow = async () => {
    const scope = selectedWs ? (workspaces.find(w => w._id === selectedWs)?.name || 'this client') : 'ALL clients';
    if (!confirm(`Run cleanup now for ${scope}? Old records in enabled categories will be permanently deleted.`)) return;
    setRunning(true);
    try {
      const res = await adminApi.runDataCleanup(selectedWs || undefined);
      toast.success(res.data.data.summary || 'Cleanup completed');
      load();
    } catch { toast.error('Cleanup failed'); }
    setRunning(false);
  };

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="w-6 h-6" /> Data Cleanup
          </h1>
          <p className="text-sm mt-1">Automatically delete old data to keep the server light. Runs daily at the selected hour.</p>
        </div>
        <Button variant="outline" onClick={() => load()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Enable Auto Cleanup</p>
            <p className="text-xs text-gray-500">When on, enabled categories below are cleaned daily.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: settings.enabled ? 'translateX(22px)' : 'translateX(2px)' }} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">Run daily at</label>
          <select
            value={settings.runHour}
            onChange={e => setSettings(s => ({ ...s, runHour: Number(e.target.value) }))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">server time</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">Client</label>
          <select
            value={selectedWs}
            onChange={e => { setSelectedWs(e.target.value); load(e.target.value); }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white max-w-xs"
          >
            <option value="">All clients</option>
            {workspaces.map(w => (
              <option key={w._id} value={w._id}>{w.name}{w.owner?.email ? ` (${w.owner.email})` : ''}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">counts &amp; Run Now use this; daily auto-run always covers all clients</span>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          {Object.keys(labels).map(key => {
            const cat = settings.categories[key] || { enabled: false, days: 30 };
            return (
              <div key={key} className="flex items-center justify-between px-3 py-2.5 border border-gray-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">{labels[key]}</p>
                  <p className="text-xs text-gray-400">{(counts[key] ?? 0).toLocaleString()} records currently</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Delete older than</span>
                  <input
                    type="number" min={1} value={cat.days}
                    onChange={e => setCat(key, { days: Number(e.target.value) })}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                  <span className="text-xs text-gray-500">days</span>
                  <button
                    onClick={() => setCat(key, { enabled: !cat.enabled })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cat.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: cat.enabled ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {settings.lastRun && (
          <p className="text-xs text-gray-500">
            Last run: {new Date(settings.lastRun).toLocaleString()} — {settings.lastRunSummary}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={runNow} disabled={running}>
            <Play className="w-4 h-4 mr-1" /> {running ? 'Running...' : 'Run Now'}
          </Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Note: contacts, active conversations, billing records and subscriptions are never auto-deleted.
      </p>
    </div>
  );
}
