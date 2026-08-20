'use client';
import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Download, Clock, AlertCircle, Package, Upload, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');

const IST_TZ = 'Asia/Kolkata';
// Render update timestamps in IST. The store sends `deployed_at` as a naive
// UTC string ("YYYY-MM-DD HH:MM:SS") which `new Date()` would otherwise parse
// in the browser's local zone; normalize it to UTC before converting to IST.
function toIST(value?: string | null, dateOnly = false): string {
  if (!value) return '';
  let s = value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return value;
  const opts: Intl.DateTimeFormatOptions = dateOnly
    ? { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }
    : { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  return new Intl.DateTimeFormat('en-IN', opts).format(d) + (dateOnly ? '' : ' IST');
}

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

interface PatchInfo {
  id: number;
  version: string;
  filename: string;
  description?: string;
  deployed_at: string;
  download_url: string;
}

export default function UpdatesPage() {
  const [status, setStatus] = useState<{
    isActive: boolean;
    lastHeartbeat: string | null;
    licenseData: { plan?: string };
    lastPatchVersion?: string;
    lastPatchAt?: string;
    panelVersion?: string;
  } | null>(null);
  const [patches, setPatches] = useState<PatchInfo[]>([]);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [patchVersion, setPatchVersion] = useState('');
  const [installedPatches, setInstalledPatches] = useState<{version: string; appliedAt: string; fileCount: number}[]>([]);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/status');
      if (res.success) setStatus(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchInstalledPatches = async () => {
    try {
      const res = await apiCall('/installed-patches');
      if (res.success) setInstalledPatches(res.patches || []);
    } catch { /* ignore */ }
  };

  const rollbackPatch = async (version: string) => {
    if (!confirm(`Rollback patch ${version}? This will restore the previous files and restart the panel.`)) return;
    setRollingBack(version);
    toast.loading(`Rolling back ${version}...`, { id: 'rollback' });
    try {
      const res = await apiCall('/rollback', 'POST', { version });
      if (res.success) {
        toast.success(res.message || 'Rollback complete!', { id: 'rollback' });
        setTimeout(() => { fetchStatus(); fetchInstalledPatches(); }, 5000);
      } else {
        toast.error(res.message || 'Rollback failed', { id: 'rollback' });
      }
    } catch { toast.error('Network error during rollback', { id: 'rollback' }); }
    setRollingBack(null);
  };

  useEffect(() => { fetchStatus(); fetchInstalledPatches(); }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    toast.loading('Checking for updates...', { id: 'upd' });
    try {
      const res = await apiCall('/check-updates');
      if (res.success && res.data) {
        setPatches(res.data.patches || []);
        setHasUpdate(res.data.hasUpdate || false);
        if (res.data.hasUpdate) {
          toast.success(`Update available: ${res.data.latestVersion}`, { id: 'upd' });
        } else {
          toast.success('Panel is up to date!', { id: 'upd' });
        }
      } else {
        toast.error(res.data?.error || res.message || 'Check failed', { id: 'upd' });
      }
    } catch { toast.error('Network error', { id: 'upd' }); }
    setChecking(false);
  };

  const installUpdate = async (patchId: number, version: string) => {
    if (!confirm(`Install update ${version}? The panel will restart after installation.`)) return;
    setInstalling(patchId);
    toast.loading(`Installing ${version}...`, { id: 'install' });
    try {
      const res = await apiCall('/install-update', 'POST', { patchId });
      if (res.success) {
        toast.success(res.message || 'Update installed! Panel restarting...', { id: 'install' });
        setTimeout(() => { fetchStatus(); checkForUpdates(); }, 5000);
      } else {
        toast.error(res.message || 'Installation failed', { id: 'install' });
      }
    } catch { toast.error('Network error during installation', { id: 'install' }); }
    setInstalling(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="page-hero"><h1>Panel Updates</h1><p>Check for updates and patches</p></div>
        <div className="mt-6 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="page-hero">
        <h1 className="flex items-center gap-2"><Download className="w-6 h-6" /> Panel Updates</h1>
        <p>Check for new features, patches, and improvements</p>
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={checkForUpdates} disabled={checking}>
            <RefreshCw className={`w-4 h-4 mr-1 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          {hasUpdate ? (
            <>
              <AlertCircle className="w-6 h-6 text-orange-500" />
              <div>
                <h2 className="text-lg font-semibold">Update Available</h2>
                <p className="text-sm text-gray-500">A new version is ready to install</p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <h2 className="text-lg font-semibold">Your panel is up to date</h2>
                <p className="text-sm text-gray-500">Version {status?.panelVersion || '1.0.0'}</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Clock className="w-4 h-4" /> Last Update Check
            </div>
            <div className="font-medium">
              {status?.lastHeartbeat ? toIST(status.lastHeartbeat) : 'Never'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Download className="w-4 h-4" /> License Status
            </div>
            <div className="font-medium">
              {status?.isActive ? (
                <span className="text-green-700">Active ({status.licenseData?.plan || 'Standard'})</span>
              ) : (
                <span className="text-orange-600">Not Activated</span>
              )}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Package className="w-4 h-4" /> Last Patch Applied
            </div>
            <div className="font-medium">
              {status?.lastPatchVersion ? (
                <span>{status.lastPatchVersion} <span className="text-xs text-gray-400">({status.lastPatchAt ? toIST(status.lastPatchAt, true) : ''})</span></span>
              ) : (
                <span className="text-gray-400">None</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Available Patches */}
      {patches.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> Available Updates
          </h3>
          <div className="space-y-3">
            {patches.map((patch) => {
              const isApplied = status?.lastPatchVersion === patch.version;
              return (
                <div key={patch.id} className={`flex items-center justify-between p-4 rounded-lg border ${isApplied ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {patch.version}
                      {isApplied && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Installed</span>}
                    </div>
                    {patch.description && <p className="text-sm text-gray-600 mt-1">{patch.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">Released: {toIST(patch.deployed_at)}</p>
                  </div>
                  {!isApplied && (
                    <Button
                      size="sm"
                      onClick={() => installUpdate(patch.id, patch.version)}
                      disabled={installing === patch.id}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {installing === patch.id ? 'Installing...' : 'Install'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Upload Patch */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-5 h-5 text-purple-600" /> Upload Patch (ZIP)
        </h3>
        <p className="text-sm text-gray-500 mb-4">Upload a patch ZIP file to manually update the panel.</p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version Label (optional)</label>
            <input type="text" value={patchVersion} onChange={e => setPatchVersion(e.target.value)} placeholder="e.g. 1.0.1" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-gray-300 text-gray-500' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Choose & Upload ZIP'}
            <input type="file" accept=".zip" className="hidden" disabled={uploading} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              toast.loading('Uploading patch...', { id: 'patch' });
              try {
                const form = new FormData();
                form.append('patch', file);
                if (patchVersion) form.append('version', patchVersion);
                const res = await fetch(`${API_BASE}/api/admin/kkhs-license/upload-patch`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${getToken()}` },
                  body: form,
                });
                const data = await res.json();
                if (data.success) {
                  toast.success(data.message || 'Patch applied!', { id: 'patch' });
                  setTimeout(() => fetchStatus(), 5000);
                } else {
                  toast.error(data.message || 'Upload failed', { id: 'patch' });
                }
              } catch { toast.error('Upload failed', { id: 'patch' }); }
              setUploading(false);
              e.target.value = '';
            }} />
          </label>
        </div>
      </Card>

      {/* Installed Patches (Rollback) */}
      {installedPatches.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" /> Installed Patches
          </h3>
          <p className="text-sm text-gray-500 mb-4">Previously applied patches. You can rollback to restore the original files.</p>
          <div className="space-y-3">
            {installedPatches.map((patch) => (
              <div key={patch.version} className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 border-gray-200">
                <div>
                  <div className="font-medium">{patch.version}</div>
                  <p className="text-xs text-gray-400 mt-1">
                    Applied: {toIST(patch.appliedAt)} &middot; {patch.fileCount} files
                  </p>
                </div>
                <button
                  onClick={() => rollbackPatch(patch.version)}
                  disabled={rollingBack === patch.version}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    rollingBack === patch.version
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {rollingBack === patch.version ? 'Rolling back...' : 'Rollback'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* How Updates Work */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3">How Updates Work</h3>
        <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
          <li>Updates are automatically checked every 12 hours</li>
          <li>New features and bug fixes are applied automatically when available</li>
          <li>No reinstallation required — patches are applied seamlessly</li>
          <li>You can manually check and install updates by clicking the button above</li>
          <li>After installing an update, the panel may restart briefly</li>
        </ul>
      </Card>
    </div>
  );
}
