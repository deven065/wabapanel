'use client';
import useBranding from '@/lib/useBranding';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loadUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [twoFA, setTwoFA] = useState<{ method: string; challengeToken: string } | null>(null);
  const [code, setCode] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [blockRemaining, setBlockRemaining] = useState(0);

  const redirectAfterLogin = () => {
    const u = useAuthStore.getState().user;
    let saved = '';
    try { saved = sessionStorage.getItem('postLoginRedirect') || ''; sessionStorage.removeItem('postLoginRedirect'); } catch { /* */ }
    const isAdmin = u?.role === 'admin' || u?.role === 'super_admin';
    if (saved && (isAdmin || !saved.startsWith('/admin'))) router.push(saved);
    else router.push(isAdmin ? '/admin/dashboard' : '/client/dashboard');
  };

  // Auto-login with token from admin "Login as Vendor" button
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      // Save current admin token so we can switch back
      const currentToken = localStorage.getItem('token');
      if (currentToken && currentToken !== token) {
        localStorage.setItem('adminToken', currentToken);
      }
      localStorage.setItem('token', token);
      loadUser().then(() => {
        toast.success('Logged in successfully');
        const u = useAuthStore.getState().user;
        (() => {
        let saved = '';
        try { saved = sessionStorage.getItem('postLoginRedirect') || ''; sessionStorage.removeItem('postLoginRedirect'); } catch { /* */ }
        const isAdmin = u?.role === 'admin' || u?.role === 'super_admin';
        if (saved && (isAdmin || !saved.startsWith('/admin'))) router.push(saved);
        else router.push(isAdmin ? '/admin/dashboard' : '/client/dashboard');
      })();
      }).catch(() => {
        toast.error('Token expired or invalid');
        localStorage.removeItem('token');
      });
    }
  }, [searchParams, loadUser, router]);

  useEffect(() => {
    if (!blocked || blockRemaining <= 0) return;
    const t = setInterval(() => {
      setBlockRemaining((s) => {
        if (s <= 1) { setBlocked(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [blocked, blockRemaining]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && result.requires2FA) {
        setTwoFA({ method: result.method || 'app', challengeToken: result.challengeToken || '' });
        toast.success(result.method === 'email' ? 'Code sent to your email' : 'Enter your authenticator code');
        return;
      }
      toast.success('Login successful!');
      redirectAfterLogin();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
      if (error.response?.status === 429 || error.response?.data?.code === 'LOGIN_BLOCKED') {
        setBlocked(true);
        setBlockRemaining(5 * 60);
        toast.error(error.response?.data?.message || 'Too many attempts. Login temporarily blocked.');
      } else {
        if (error.response?.data?.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
        toast.error(error.response?.data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFA) return;
    setLoading(true);
    try {
      await useAuthStore.getState().complete2FALogin(twoFA.challengeToken, code.trim());
      toast.success('Login successful!');
      redirectAfterLogin();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAResend = async () => {
    if (!twoFA) return;
    try {
      await authApi.twoFactorLoginResend(twoFA.challengeToken);
      toast.success('New code sent to your email');
    } catch {
      toast.error('Could not resend code');
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendVerification(email);
      toast.success('Verification email sent. Please check your inbox.');
    } catch {
      toast.error('Could not send verification email');
    }
  };

  const brand = useBranding();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-center">{brand.logo && <img src={brand.logo} alt={brand.name} className="h-14 mx-auto mb-2" />}</div>
          <p className="text-gray-500 mt-2">Sign in to your account</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {twoFA ? (
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 mx-auto bg-violet-100 rounded-full flex items-center justify-center mb-3">
                <Lock className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Two-Step Verification</h3>
              <p className="text-sm text-gray-500 mt-1">
                {twoFA.method === 'email'
                  ? 'Enter the 6-digit code sent to your email.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
            </div>
            <Input
              label="Verification Code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" loading={loading}>Verify & Sign In</Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setTwoFA(null); setCode(''); }} className="text-gray-500 hover:text-gray-700">Back to login</button>
              {twoFA.method === 'email' && (
                <button type="button" onClick={handle2FAResend} className="text-violet-600 hover:text-violet-700 font-medium">Resend code</button>
              )}
            </div>
          </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              icon={<Mail className="w-4 h-4" />}
            />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon={<Lock className="w-4 h-4" />}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                Remember me
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-violet-600 hover:text-violet-700">
                Forgot password?
              </Link>
            </div>
            {blocked && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <p className="font-medium">Login temporarily blocked</p>
                <p className="mt-1">Too many failed attempts. It will unlock automatically in <span className="font-semibold">{fmt(blockRemaining)}</span>.</p>
                <Link href="/auth/forgot-password" className="mt-1 inline-block font-medium text-red-700 underline">Reset password to unblock now</Link>
              </div>
            )}
            {needsVerification && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Your email is not verified yet.{' '}
                <button type="button" onClick={handleResend} className="font-medium text-violet-600 hover:text-violet-700 underline">Resend verification email</button>
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading} disabled={blocked}>
              {blocked ? `Blocked (${fmt(blockRemaining)})` : 'Sign In'}
            </Button>
          </form>
          )}
          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-violet-600 hover:text-violet-700 font-medium">
              Sign up
            </Link>
          </p>
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
