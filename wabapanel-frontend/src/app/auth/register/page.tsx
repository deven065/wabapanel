'use client';
import React, { useState } from 'react';
import useBranding from '@/lib/useBranding';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock, MailCheck } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const brand = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const needsVerification = await register(name, email, password);
      if (needsVerification) {
        setVerificationSent(true);
        return;
      }
      toast.success('Account created!');
      router.push('/client/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-center">{brand.logo && <img src={brand.logo} alt={brand.name} className="h-12 mx-auto mb-2" />}</div>
          <p className="text-gray-500 mt-2">Create your account</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {verificationSent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Verify your email</h3>
              <p className="text-gray-500 text-sm">We sent a verification link to <strong>{email}</strong>. Click the link in the email to activate your account, then sign in.</p>
              <Link href="/auth/login" className="inline-block mt-4 text-violet-600 hover:text-violet-700 font-medium text-sm">Go to login</Link>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Full Name" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} required icon={<User className="w-4 h-4" />} />
            <Input label="Email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required icon={<Mail className="w-4 h-4" />} />
            <Input label="Password" type="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
            <Input label="Confirm Password" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
            <Button type="submit" className="w-full" loading={loading}>Create Account</Button>
          </form>
          )}
          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-violet-600 hover:text-violet-700 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
