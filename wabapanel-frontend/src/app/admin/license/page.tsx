'use client';
import React, { useState, useEffect } from 'react';
import { Key, RefreshCw, Shield, AlertTriangle, CheckCircle, XCircle, Zap, Puzzle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';
import useBranding from '@/lib/useBranding';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('token') || '';
  return '';
}

async function apiCall(endpoint: string, method = 'GET', body?: object) {
  const res = await fetch(`${API_BASE}/api/admin/kkhs-license${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

interface LicenseStatus {
  isActive: boolean;
  licenseKey: string | null;
  domain: string | null;
  lastHeartbeat: string | null;
  licenseData: { plan?: string; license_type?: string; expiry_date?: string };
  killSwitch: boolean;
}

interface Addon {
  id?: string;
  slug?: string;
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  status?: string;
  price?: number;
  url?: string;
}

export default function LicensePage() {
  const brand = useBranding();
  const brandName = brand.name || 'WabaPanel';
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/status');
      if (res.success) setStatus(res.data);
      const ad = await apiCall('/addons');
      if (ad.success) setAddons(ad.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleActivate = async () => {
    if (!licenseKey.trim()) return toast.error('Enter a license key');
    setActivating(true);
    try {
      const res = await apiCall('/activate', 'POST', { licenseKey: licenseKey.trim() });
      if (res.success) {
        toast.success('License activated successfully!');
        setLicenseKey('');
        fetchStatus();
        // Reload so every layout re-checks the gate and the panel unlocks.
        setTimeout(() => { window.location.reload(); }, 1200);
      } else {
        toast.error(res.message || 'Activation failed');
      }
    } catch { toast.error('Network error'); }
    setActivating(false);
  };

  const handleDeactivate = async () => {
    if (!confirm('Are you sure? This will deactivate your license for domain transfer.')) return;
    const res = await apiCall('/deactivate', 'POST');
    if (res.success) {
      toast.success('License deactivated');
      fetchStatus();
    } else {
      toast.error(res.message || 'Failed');
    }
  };

  const handleHeartbeat = async () => {
    toast.loading('Sending heartbeat...', { id: 'hb' });
    const res = await apiCall('/heartbeat', 'POST');
    if (res.success) {
      toast.success('Heartbeat sent successfully', { id: 'hb' });
      fetchStatus();
    } else {
      toast.error('Heartbeat failed', { id: 'hb' });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="page-hero"><h1>License & Updates</h1><p>Manage your panel license and receive updates</p></div>
        <div className="mt-6 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="page-hero">
        <h1 className="flex items-center gap-2"><Key className="w-6 h-6" /> License & Updates</h1>
        <p>Manage your panel license, feature locks, and receive remote updates from {brandName}</p>
      </div>

      {/* Status Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" /> License Status
          </h2>
          <Button size="sm" variant="outline" onClick={handleHeartbeat}>
            <RefreshCw className="w-4 h-4 mr-1" /> Sync Now
          </Button>
        </div>

        {status?.killSwitch && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-red-700 font-medium">Panel has been deactivated by admin. Contact support.</span>
          </div>
        )}

        {status?.isActive ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">License Active</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">License Key</div>
                <div className="font-mono text-sm mt-1">{status.licenseKey || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">Plan</div>
                <div className="font-medium mt-1 capitalize">{status.licenseData?.plan || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">Type</div>
                <div className="font-medium mt-1 capitalize">{status.licenseData?.license_type || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">Domain</div>
                <div className="font-medium mt-1">{status.domain || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">Expiry</div>
                <div className="font-medium mt-1">{status.licenseData?.expiry_date || 'Lifetime'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">Last Sync</div>
                <div className="font-medium mt-1 text-sm">{status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleString() : 'Never'}</div>
              </div>
            </div>
            <div className="pt-4 border-t mt-4">
              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleDeactivate}>
                Deactivate (Domain Transfer)
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-orange-700 bg-orange-50 rounded-lg p-3">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">No Active License</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Enter license key (e.g. NJSP-XXXX-XXXXXXXX-XXXXXXXX)"
                value={licenseKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLicenseKey(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleActivate} disabled={activating}>
                <Zap className="w-4 h-4 mr-1" /> {activating ? 'Activating...' : 'Activate'}
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Purchase a license from {brandName} and enter the key above.
            </p>
          </div>
        )}
      </Card>

      {/* Addons from store */}
      {status?.isActive && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Puzzle className="w-5 h-5" /> Addons</h2>
          </div>
          {addons.length === 0 ? (
            <p className="text-sm text-gray-500">No addons available yet. New addons published on the {brandName} store will appear here automatically after the next sync.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {addons.map((a, i) => (
                <div key={a.id || a.slug || i} className="border rounded-lg p-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{a.name || a.title || 'Addon'}</p>
                    {a.description && <p className="text-sm text-gray-500 mt-0.5">{a.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{a.version ? `v${a.version}` : ''}{a.price ? ` · ₹${a.price}` : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {a.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === 'active' || a.status === 'installed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>}
                    {a.url && <a href={a.url} target="_blank" className="text-xs text-blue-600 underline">View</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Feature Locks Info */}
      {status?.isActive && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-2">How It Works</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Your panel syncs with {brandName} server every 12 hours automatically</li>
            <li>Feature locks, remote config, notifications, and addons are updated on each sync</li>
            <li>Software patches are auto-applied when available — no manual update needed</li>
            <li>Click &quot;Sync Now&quot; to manually trigger a sync at any time</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
