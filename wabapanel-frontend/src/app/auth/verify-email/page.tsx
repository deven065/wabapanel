'use client';
import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck, XCircle, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const didRun = React.useRef(false);
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    if (!token) {
      setStatus('error');
      setMessage('Verification link is missing or invalid.');
      return;
    }
    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.data.message || 'Email verified successfully.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.response?.data?.message || 'Invalid or expired verification link.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Verifying your email...</h3>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Email Verified</h3>
            <p className="text-gray-500 text-sm mb-4">{message}</p>
            <Link href="/auth/login" className="inline-block bg-violet-600 hover:bg-violet-700 text-white font-medium px-6 py-2 rounded-lg text-sm">Sign In</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Verification Failed</h3>
            <p className="text-gray-500 text-sm mb-4">{message}</p>
            <Link href="/auth/login" className="text-violet-600 hover:text-violet-700 font-medium text-sm">Back to login</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Loading...</p></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
