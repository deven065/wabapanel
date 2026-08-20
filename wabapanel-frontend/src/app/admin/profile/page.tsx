'use client';
import React, { useState } from 'react';
import { Save, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import AccountSecurity from '@/components/AccountSecurity';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);

  const handleProfileSave = async () => {
    setSaving(true);
    try {
      const res = await authApi.updateProfile(profile);
      updateUser(res.data.data);
      toast.success('Profile updated');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your account, password and two-step verification</p>
        </div>
      </div>

      <Tabs tabs={[
        { key: 'profile', label: 'Profile', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center text-2xl font-bold text-violet-600">
                  {user?.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{user?.name}</h3>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
              </div>
              <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} icon={<User className="w-4 h-4" />} />
              <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Button onClick={handleProfileSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save Changes</Button>
            </div>
          </Card>
        )},
        { key: 'security', label: 'Security', content: (
          <AccountSecurity />
        )},
      ]} />
    </div>
  );
}
