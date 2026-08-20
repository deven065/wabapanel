'use client';
import React, { useEffect, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import ClientSidebar from '@/components/layout/ClientSidebar';
import Header from '@/components/layout/Header';
import CallProvider from '@/contexts/CallProvider';
import { I18nProvider } from '@/lib/i18n';
import PageHelp from '@/components/PageHelp';
import NotificationProvider from '@/components/NotificationProvider';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { useAuthStore } from '@/stores/authStore';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();
  const [licenseActive, setLicenseActive] = useState<boolean | null>(null);
  const [maintenance, setMaintenance] = useState<{ isEnabled: boolean; message: string } | null>(null);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      try { sessionStorage.setItem('postLoginRedirect', window.location.pathname + window.location.search); } catch { /* */ }
      router.push('/auth/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Admin/super_admin must use the admin panel with their own account — keep the
  // client area for vendors only. During "Login as Vendor" the active session is
  // the vendor (role 'vendor'), so this guard does not fire then.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    const r = (user as unknown as { role?: string })?.role;
    if (r === 'admin' || r === 'super_admin') {
      router.replace('/admin/dashboard');
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Check license status
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');
    fetch(apiBase + '/api/public/license-status')
      .then(r => r.json())
      .then(d => setLicenseActive(d.active === true))
      .catch(() => setLicenseActive(true)); // If API unreachable, don't block
  }, [isLoading, isAuthenticated]);

  // Check maintenance mode (admins are not blocked)
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');
    fetch(apiBase + '/api/maintenance-status')
      .then(r => r.json())
      .then(d => setMaintenance(d.data || null))
      .catch(() => setMaintenance(null));
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-500 mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  // Admins are redirected away (above) — render nothing to avoid a flash of client UI
  {
    const r = (user as unknown as { role?: string })?.role;
    if (r === 'admin' || r === 'super_admin') return null;
  }

  // License not active — show locked screen
  if (licenseActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center p-10 bg-white rounded-2xl shadow-xl max-w-lg">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Panel Locked</h2>
          <p className="text-gray-500 mb-2">This panel requires an active license to operate.</p>
          <p className="text-gray-400 text-sm">Please contact your administrator to activate the license.</p>
        </div>
      </div>
    );
  }

  // Maintenance mode — block vendor panel (admins can still browse)
  const role = (user as unknown as { role?: string })?.role;
  if (maintenance?.isEnabled && role !== 'admin' && role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center p-10 bg-white rounded-2xl shadow-xl max-w-lg">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Under Maintenance</h2>
          <p className="text-gray-500">{maintenance.message || 'We are currently under maintenance. Please check back later.'}</p>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider>
    <CallProvider>
      <NotificationProvider />
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="flex h-screen bg-gray-50">
        <ClientSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <AnnouncementBanner />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
          <PageHelp />
        </div>
      </div>
    </CallProvider>
    </I18nProvider>
  );
}
