'use client';
import React, { useState, useEffect } from 'react';
import { Lock, Shield, Smartphone, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

type Status = { enabled: boolean; method: 'app' | 'email'; email?: string };

export default function AccountSecurity() {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [status, setStatus] = useState<Status>({ enabled: false, method: 'app' });
  const [setup, setSetup] = useState<{ method: 'app' | 'email'; qrCode?: string; secret?: string; email?: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = () => {
    authApi.twoFactorStatus()
      .then(r => setStatus(r.data.data))
      .catch(() => {});
  };
  useEffect(loadStatus, []);

  const handlePasswordChange = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (passwords.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      toast.success('Password changed');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to change password');
    }
    setSavingPw(false);
  };

  const startSetup = async (method: 'app' | 'email') => {
    setBusy(true);
    try {
      const r = await authApi.twoFactorSetup(method);
      setSetup({ method, ...r.data.data });
      setCode('');
      if (method === 'email') toast.success('Verification code sent to your email');
    } catch { toast.error('Could not start 2FA setup'); }
    setBusy(false);
  };

  const verifySetup = async () => {
    setBusy(true);
    try {
      await authApi.twoFactorVerify(code.trim());
      toast.success('Two-step verification enabled');
      setSetup(null); setCode('');
      loadStatus();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Invalid code');
    }
    setBusy(false);
  };

  const disable2FA = async () => {
    setBusy(true);
    try {
      await authApi.twoFactorDisable();
      toast.success('Two-step verification disabled');
      setStatus({ enabled: false, method: status.method });
      setSetup(null);
    } catch { toast.error('Failed to disable'); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4 max-w-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Lock className="w-5 h-5" /> Change Password</h3>
          <Input label="Current Password" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
          <Input label="New Password" type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
          <Input label="Confirm New Password" type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} />
          <Button onClick={handlePasswordChange} loading={savingPw}>Update Password</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-4 max-w-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5" /> Two-Step Verification (2FA)</h3>

          {status.enabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                Enabled via {status.method === 'email' ? 'Email OTP' : 'Authenticator App'}
              </div>
              <p className="text-sm text-gray-500">Every login will ask for a second-step code.</p>
              <Button variant="outline" onClick={disable2FA} loading={busy}>Disable 2FA</Button>
            </div>
          ) : setup ? (
            <div className="space-y-3">
              {setup.method === 'app' ? (
                <>
                  <p className="text-sm text-gray-600">Scan this QR code in Google Authenticator, Authy or any TOTP app:</p>
                  {setup.qrCode && <img src={setup.qrCode} alt="2FA QR" className="w-44 h-44 border rounded-lg" />}
                  <p className="text-xs text-gray-400 break-all">Manual key: {setup.secret}</p>
                </>
              ) : (
                <p className="text-sm text-gray-600">We sent a 6-digit code to <b>{setup.email}</b>. Enter it below to enable email 2FA.</p>
              )}
              <Input label="Enter 6-digit code" value={code} inputMode="numeric" placeholder="123456" onChange={(e) => setCode(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={verifySetup} loading={busy}>Verify & Enable</Button>
                <Button variant="outline" onClick={() => { setSetup(null); setCode(''); }}>Cancel</Button>
                {setup.method === 'email' && (
                  <Button variant="outline" onClick={() => authApi.twoFactorResend().then(() => toast.success('Code resent')).catch(() => toast.error('Failed'))}>Resend</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Add an extra layer of security. Choose how you want to receive your login codes:</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => startSetup('app')} disabled={busy} className="flex-1 flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors text-left">
                  <Smartphone className="w-6 h-6 text-violet-600" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Authenticator App</p>
                    <p className="text-xs text-gray-500">Google Authenticator, Authy etc.</p>
                  </div>
                </button>
                <button onClick={() => startSetup('email')} disabled={busy} className="flex-1 flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors text-left">
                  <Mail className="w-6 h-6 text-violet-600" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Email OTP</p>
                    <p className="text-xs text-gray-500">Code sent to your email on login</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
