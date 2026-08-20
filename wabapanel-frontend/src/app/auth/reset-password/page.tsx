'use client';
import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/lib/api';
import useBranding from '@/lib/useBranding';
import toast from 'react-hot-toast';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      toast.success('Password reset successful!');
      router.push('/auth/login');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="New Password" type="password" placeholder="Enter new password" value={password} onChange={(e) => setPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
      <Input label="Confirm Password" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
      <Button type="submit" className="w-full" loading={loading}>Reset Password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const brand = useBranding();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-center">{brand.logo ? <img src={brand.logo} alt={brand.name} className="h-14 mx-auto mb-2" /> : <><h1 className="text-3xl font-bold text-emerald-600">{brand.name}</h1><p className="text-sm text-gray-400">{brand.tagline}</p></>}</div>
          <p className="text-gray-500 mt-2">Set your new password</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <Suspense fallback={<div className="text-center py-4">Loading...</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
