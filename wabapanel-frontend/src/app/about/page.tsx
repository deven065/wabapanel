/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, Shield, Zap, Heart, Target, Users, Globe, Menu, X } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function AboutPage() {
  const c = useSiteContent();
  const a = c.about;
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  const biz = settings?.business || { name: 'KKHS Media', tagline: 'WhatsApp Business Platform' };
  const logo = settings?.branding?.logo;

  const valueIcons = [<Target key="0" className="w-6 h-6" />, <Shield key="1" className="w-6 h-6" />, <Zap key="2" className="w-6 h-6" />, <Heart key="3" className="w-6 h-6" />, <Users key="4" className="w-6 h-6" />, <Globe key="5" className="w-6 h-6" />];
  const values = (a.values || []).map((v: any, i: number) => ({ ...v, icon: valueIcons[i % valueIcons.length] }));
  const stats = a.stats || [];

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
            <div className="flex gap-2 pt-2">
              <Link href="/auth/login" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl">{c.nav.loginText}</Link>
              <Link href="/auth/register" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl">{c.nav.registerText}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 md:pt-40 pb-16 px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/3 w-[500px] h-[500px] bg-gradient-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{a.badge}</span>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6"><span className="text-gray-900">{a.title} </span><span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{biz.name}</span></h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">{a.intro}</p>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s: any, i: number) => (
              <div key={i} className="text-center p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mb-1">{s.value}</div>
                <div className="text-sm text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">{a.valuesTitle} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{a.valuesTitleHighlight}</span></h2>
            <p className="text-gray-500 max-w-xl mx-auto">{a.valuesSubtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((v: any, i: number) => (
              <div key={i} className="p-7 bg-white rounded-2xl border border-gray-100 hover:border-violet-200 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 mb-4">{v.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{v.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl p-10 md:p-14 text-center shadow-2xl shadow-violet-200/50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <h2 className="relative text-3xl md:text-4xl font-extrabold text-white mb-4">{a.cta.title}</h2>
          <p className="relative text-violet-100 text-lg mb-8">{a.cta.subtitle}</p>
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/contact" className="w-full sm:w-auto px-8 py-4 bg-white text-violet-700 font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">{a.cta.primaryText}</Link>
            <Link href="/auth/register" className="w-full sm:w-auto px-8 py-4 border-2 border-white/30 text-white font-bold rounded-2xl hover:bg-white/10 transition-all">{a.cta.secondaryText}</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-violet-600">Privacy</Link>
            <Link href="/terms" className="hover:text-violet-600">Terms</Link>
            <Link href="/team" className="hover:text-violet-600">Team</Link>
            <Link href="/contact" className="hover:text-violet-600">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
