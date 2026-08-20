/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageSquare, Menu, X } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function CustomPage() {
  const c = useSiteContent();
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string);
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API}/public/pages/${slug}`)
      .then(r => r.json())
      .then(d => setPage(d.success ? d.data : null))
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const biz = settings?.business || { name: 'KKHS Media' };
  const logo = settings?.branding?.logo;

  return (
    <div className="min-h-screen bg-[#faf9fe] text-gray-900 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-5xl bg-white/80 backdrop-blur-2xl border border-gray-200/60 rounded-2xl shadow-lg shadow-purple-100/30 z-50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {logo ? <img src={logo} alt={biz.name} className="h-10 w-auto" /> : (
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
          {loading ? (
            <p className="text-gray-400">Loading…</p>
          ) : !page ? (
            <div className="text-center py-20">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Page not found</h1>
              <p className="text-gray-500 mb-6">This page does not exist or is not published.</p>
              <Link href="/" className="inline-block px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl">Back to home</Link>
            </div>
          ) : (
            <>
              <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">{page.title}</h1>
              <p className="text-sm text-gray-400 mb-10">Last updated: {new Date(page.updatedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <div className="p-6 md:p-8 bg-white rounded-2xl border border-gray-100 prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-violet-600"
                dangerouslySetInnerHTML={{ __html: page.content || '' }} />
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
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
