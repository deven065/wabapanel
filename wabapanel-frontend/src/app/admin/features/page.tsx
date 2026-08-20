'use client';
import React, { useState, useEffect } from 'react';
import { Search, ToggleRight, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FeatureDef { key: string; label: string; path: string; group?: string; addon?: boolean }
interface Vendor {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  status: string;
  featureOverrides?: Record<string, boolean>;
  plan?: { _id: string; name: string } | null;
}

export default function FeatureControlsPage() {
  const [catalog, setCatalog] = useState<FeatureDef[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getFeatureControls();
      setCatalog(res.data.data.catalog || []);
      setVendors(res.data.data.vendors || []);
    } catch { toast.error('Failed to load feature controls'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openVendor = (v: Vendor) => {
    setSelected(v);
    const map: Record<string, boolean> = {};
    // Add-ons are off until explicitly granted; base features are on unless disabled.
    for (const f of catalog) map[f.key] = f.addon ? v.featureOverrides?.[f.key] === true : v.featureOverrides?.[f.key] !== false;
    setToggles(map);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminApi.updateFeatureControls(selected._id, toggles);
      toast.success('Features updated');
      await load();
    } catch { toast.error('Failed to update features'); }
    setSaving(false);
  };

  const disabledCount = (v: Vendor) =>
    catalog.filter(f => (f.addon ? v.featureOverrides?.[f.key] !== true : v.featureOverrides?.[f.key] === false)).length;

  const filtered = vendors.filter(v => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return v.name?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q) || v.companyName?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ToggleRight className="w-6 h-6" /> Feature Controls
          </h1>
          <p className="text-sm mt-1">Turn any client feature on or off. Disabled features are hidden from the client panel and blocked in the API.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1 max-h-[65vh] overflow-y-auto">
            {loading && <p className="text-sm text-gray-400 p-2">Loading...</p>}
            {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 p-2">No clients found</p>}
            {filtered.map(v => (
              <button
                key={v._id}
                onClick={() => openVendor(v)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 ${selected?._id === v._id ? 'bg-emerald-50 border border-emerald-200' : ''}`}
              >
                <div className="font-medium text-gray-900">{v.name}</div>
                <div className="text-xs text-gray-500">{v.email}{v.plan?.name ? ` • ${v.plan.name}` : ''}</div>
                {disabledCount(v) > 0 && (
                  <div className="text-xs text-red-500 mt-0.5">{disabledCount(v)} feature(s) off</div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          {!selected ? (
            <p className="text-sm text-gray-400 p-4">Select a client to manage their features.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                  <p className="text-xs text-gray-500">{selected.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setToggles(Object.fromEntries(catalog.map(f => [f.key, true])))}>Enable All</Button>
                  <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
              </div>
              {Array.from(new Set(catalog.map(f => f.group || 'Other'))).map(group => {
                const groupKeys = catalog.filter(f => (f.group || 'Other') === group).map(f => f.key);
                const allOn = groupKeys.every(k => toggles[k]);
                return (
                <div key={group} className="mb-4 border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</h3>
                    <button
                      type="button"
                      onClick={() => setToggles({ ...toggles, ...Object.fromEntries(groupKeys.map(k => [k, !allOn])) })}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      {allOn ? 'Turn all off' : 'Turn all on'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {catalog.filter(f => (f.group || 'Other') === group).map(f => (
                      <label key={f.key} className="flex items-center justify-between px-3 py-2.5 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <span className="text-sm text-gray-700">{f.label}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setToggles({ ...toggles, [f.key]: !toggles[f.key] }); }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${toggles[f.key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" style={{ transform: toggles[f.key] ? 'translateX(18px)' : 'translateX(2px)' }} />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
