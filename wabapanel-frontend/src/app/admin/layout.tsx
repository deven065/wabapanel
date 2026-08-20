'use client';
import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import AdminSidebar from '@/components/layout/AdminSidebar';
import Header from '@/components/layout/Header';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loadUser, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [licenseActive, setLicenseActive] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { (() => { try { sessionStorage.setItem('postLoginRedirect', window.location.pathname + window.location.search); } catch { /* */ } router.push('/auth/login'); })(); return; }
    if (!isAuthenticated) { loadUser().then(() => setReady(true)).catch(() => router.push('/auth/login')); }
    else setReady(true);
  }, [isAuthenticated, loadUser, router]);

  useEffect(() => {
    if (ready && user && !['super_admin', 'admin'].includes(user.role)) {
      router.push('/client/dashboard');
    }
  }, [ready, user, router]);

  // Check license status
  useEffect(() => {
    if (!ready) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');
    fetch(apiBase + '/api/public/license-status')
      .then(r => r.json())
      .then(d => setLicenseActive(d.active === true))
      .catch(() => setLicenseActive(true)); // If API unreachable, don't block
  }, [ready]);

  // Redirect to license page if not active (allow license page itself)
  useEffect(() => {
    if (licenseActive === false && pathname !== '/admin/license') {
      router.push('/admin/license');
    }
  }, [licenseActive, pathname, router]);

  if (isLoading || !ready) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isAdmin />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {licenseActive === false && pathname !== '/admin/license' ? (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V4a2 2 0 00-2-2 2 2 0 00-2 2v5a2 2 0 01-2 2H6a2 2 0 00-2 2v3a2 2 0 002 2h12a2 2 0 002-2v-3a2 2 0 00-2-2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">License Required</h2>
                <p className="text-gray-500 mb-4">Please activate your license to access the panel.</p>
                <button onClick={() => router.push('/admin/license')} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors">
                  Activate License
                </button>
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}
