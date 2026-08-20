/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, Menu, X, Trash2 } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function DataDeletionPage() {
  const c = useSiteContent();
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  const biz = settings?.business || { name: 'KKHS Media', email: '', url: '' };
  const logo = settings?.branding?.logo;
  const email = biz.email || 'info@kkhsmedia.com';
  const brand = biz.name || 'KKHS Media';

  const sections: { title: string; body: React.ReactNode }[] = [
    {
      title: '1. Overview',
      body: <>This page explains how you can request the deletion of your personal data that {brand} stores in connection with our WhatsApp Business Platform / Facebook-integrated services. We respect your right to control your data and comply with Meta Platform Terms and applicable data-protection laws.</>,
    },
    {
      title: '2. What data we store',
      body: <>Depending on your use of our service we may store: your name, phone number, email, WhatsApp/Facebook profile identifiers, message history exchanged through the platform, contact lists you upload, and usage/log data required to operate the service.</>,
    },
    {
      title: '3. How to request deletion',
      body: (
        <>
          To delete your data, send a deletion request in either of these ways:
          <ul className="list-disc pl-5 mt-3 space-y-1">
            <li>Email us at <a href={`mailto:${email}?subject=Data%20Deletion%20Request`} className="text-violet-600 font-semibold">{email}</a> from the email or phone number associated with your account, with the subject line <b>&quot;Data Deletion Request&quot;</b>.</li>
            <li>Or, if you have an account, log in and go to <b>Settings → Account → Delete My Data</b> and confirm the request.</li>
          </ul>
          Please include your registered name and phone number/email so we can verify your identity.
        </>
      ),
    },
    {
      title: '4. What happens next',
      body: <>Once we verify your request, we will permanently delete your personal data from our active systems within <b>30 days</b>. Data held in encrypted backups is removed on the normal backup rotation cycle. Certain records may be retained where required by law (e.g. billing/tax records) or to prevent fraud; these are kept only for as long as legally necessary.</>,
    },
    {
      title: '5. Confirmation',
      body: <>After your data is deleted, we will send a confirmation to your registered email. If you do not receive a response within 7 business days, please contact us again at {email}.</>,
    },
    {
      title: '6. Contact',
      body: <>For any questions about data deletion or privacy, contact {brand} at <a href={`mailto:${email}`} className="text-violet-600 font-semibold">{email}</a>.</>,
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9fe] text-gray-900 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-5xl bg-white/80 backdrop-blur-2xl border border-gray-200/60 rounded-2xl shadow-lg shadow-purple-100/30 z-50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {logo ? <img src={logo} alt={brand} className="h-10 w-auto" /> : (
              <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
            )}
          </Link>
          <div className="hidden lg:flex items-center gap-3">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} className="text-sm font-bold text-gray-900 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-all">{l.label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-bold text-gray-900 hover:text-violet-700 transition-all">{c.nav.loginText}</Link>
            <Link href="/auth/register" className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg shadow-md shadow-violet-200/40 hover:shadow-lg transition-all hover:-translate-y-0.5">{c.nav.registerText}</Link>
          </div>
          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 rounded-lg hover:bg-gray-100">
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="md:hidden pt-4 pb-2 border-t border-gray-100 mt-3 space-y-2">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} onClick={() => setMobileMenu(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-violet-50">{l.label}</a>
            ))}
          </div>
        )}
      </nav>

      {/* Content */}
      <section className="pt-32 md:pt-40 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4"><Trash2 className="w-3.5 h-3.5" /> Data Deletion</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">Data Deletion <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">Instructions</span></h1>
          <p className="text-sm text-gray-400 mb-10">Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

          <div className="space-y-8">
            {sections.map((s, i) => (
              <div key={i} className="p-6 bg-white rounded-2xl border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-3">{s.title}</h2>
                <div className="text-sm text-gray-600 leading-relaxed">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {brand}. {c.footer.copyrightText}</p>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-violet-600">Privacy</Link>
            <Link href="/terms" className="hover:text-violet-600">Terms</Link>
            <Link href="/data-deletion" className="hover:text-violet-600">Data Deletion</Link>
            <Link href="/contact" className="hover:text-violet-600">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
