'use client';
import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

const ROLES = ['admin', 'user', 'agent', 'super_admin'];
const MODULES = [
  'dashboard', 'chat', 'analytics', 'contacts', 'segments', 'tags', 'templates',
  'broadcasts', 'drips', 'automations', 'whatsapp', 'forms', 'shortLinks',
  'agents', 'teams', 'subscriptions', 'billing', 'settings', 'pipelines', 'appointments',
];
const ACTIONS = ['view', 'create', 'edit', 'delete'];

type PermissionsData = Record<string, Record<string, Record<string, boolean>>>;

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionsData>({});
  const [selectedRole, setSelectedRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getPermissions().then(r => {
      const raw = r.data.data;
      const data: PermissionsData = {};
      if (Array.isArray(raw)) {
        raw.forEach((p: { role?: string; permissions?: Record<string, Record<string, boolean>> }) => {
          if (p?.role) data[p.role] = p.permissions || {};
        });
      } else if (raw && typeof raw === 'object') {
        Object.assign(data, raw);
      }
      const perms: PermissionsData = {};
      ROLES.forEach(role => {
        perms[role] = {};
        MODULES.forEach(mod => {
          perms[role][mod] = {};
          ACTIONS.forEach(act => { perms[role][mod][act] = data[role]?.[mod]?.[act] ?? (role === 'super_admin'); });
        });
      });
      setPermissions(perms);
    }).catch(() => {
      const perms: PermissionsData = {};
      ROLES.forEach(role => {
        perms[role] = {};
        MODULES.forEach(mod => {
          perms[role][mod] = {};
          ACTIONS.forEach(act => { perms[role][mod][act] = role === 'super_admin' || (role !== 'agent' && act === 'view'); });
        });
      });
      setPermissions(perms);
    }).finally(() => setLoading(false));
  }, []);

  const togglePermission = (mod: string, act: string) => {
    setPermissions(prev => ({
      ...prev, [selectedRole]: {
        ...prev[selectedRole], [mod]: { ...prev[selectedRole][mod], [act]: !prev[selectedRole][mod][act] }
      }
    }));
  };

  const setAll = (val: boolean) => {
    setPermissions(prev => {
      const rolePerms: Record<string, Record<string, boolean>> = {};
      MODULES.forEach(mod => { rolePerms[mod] = {}; ACTIONS.forEach(act => { rolePerms[mod][act] = val; }); });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  const setAllForAction = (act: string, val: boolean) => {
    setPermissions(prev => {
      const rolePerms = { ...prev[selectedRole] };
      MODULES.forEach(mod => { rolePerms[mod] = { ...rolePerms[mod], [act]: val }; });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updatePermissions({ role: selectedRole, permissions: permissions[selectedRole] });
      toast.success('Permissions saved');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Permissions Control</h1><p className="text-gray-500 text-sm mt-1">Manage role-based access</p></div>
        <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} loading={saving}>Save Changes</Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {ROLES.map(role => (
          <button key={role} onClick={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${selectedRole === role ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {role.replace('_', ' ')}
          </button>
        ))}
        {selectedRole !== 'super_admin' && (
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setAll(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">Select All</button>
            <button onClick={() => setAll(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">Unselect All</button>
          </div>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Module</th>
                {ACTIONS.map(act => {
                  const allChecked = MODULES.every(mod => permissions[selectedRole]?.[mod]?.[act]);
                  return (
                    <th key={act} className="text-center py-3 px-4 text-sm font-semibold text-gray-700 capitalize">
                      <div className="flex flex-col items-center gap-1">
                        {act}
                        <input type="checkbox" title={`Select all ${act}`} checked={allChecked} onChange={e => setAllForAction(act, e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" disabled={selectedRole === 'super_admin'} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MODULES.map(mod => (
                <tr key={mod} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium capitalize text-gray-800">{mod.replace(/([A-Z])/g, ' $1')}</td>
                  {ACTIONS.map(act => (
                    <td key={act} className="text-center py-3 px-4">
                      <input type="checkbox" checked={permissions[selectedRole]?.[mod]?.[act] || false} onChange={() => togglePermission(mod, act)}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        disabled={selectedRole === 'super_admin'} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
