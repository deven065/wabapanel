/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, Mail, Phone, MapPin, Send, Menu, X } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function ContactPage() {
  const c = useSiteContent();
  const ct = c.contact;
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [captcha, setCaptcha] = useState<{ question: string; token: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const loadCaptcha = () => {
    fetch(`${API}/public/captcha`).then(r => r.json()).then(d => { if (d.success) { setCaptcha(d.data); setCaptchaAnswer(''); } }).catch(() => {});
  };

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => {
      if (d.success) { setSettings(d.data); if (d.data.captchaEnabled) loadCaptcha(); }
    }).catch(() => {});
  }, []);

  const captchaEnabled = !!settings?.captchaEnabled;

  const biz = settings?.business || { name: 'KKHS Media' };
  const logo = settings?.branding?.logo;
  const contact = settings?.contact || {};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaEnabled && !captchaAnswer.trim()) { setStatus('error'); return; }
    setStatus('sending');
    try {
      const payload: Record<string, unknown> = { ...form, subject: 'Website Contact Form', source: 'landing_page' };
      if (captchaEnabled && captcha) { payload.captchaToken = captcha.token; payload.captchaAnswer = captchaAnswer; }
      const res = await fetch(`${API}/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setStatus('sent');
        const waNumber = String(contact.phone || '917062010000').replace(/\D/g, '');
        const waText = encodeURIComponent(`Hi, I am ${form.name}. I have visited your website ${typeof window !== 'undefined' ? window.location.host : ''} for WhatsApp API.\n\n${form.message}`);
        window.open(`https://wa.me/${waNumber}?text=${waText}`, '_blank');
        setForm({ name: '', email: '', phone: '', message: '' });
        if (captchaEnabled) loadCaptcha();
      }
      else { setStatus('error'); if (captchaEnabled) loadCaptcha(); }
    } catch { setStatus('error'); if (captchaEnabled) loadCaptcha(); }
  };

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

      {/* Content */}
      <section className="pt-32 md:pt-40 pb-20 px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{ct.badge}</span>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4"><span className="text-gray-900">{ct.title} </span><span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{ct.titleHighlight}</span></h1>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">{ct.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Contact Info */}
            <div className="space-y-6">
              <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 mb-3"><Mail className="w-5 h-5" /></div>
                <h3 className="font-bold text-gray-900 mb-1">{ct.emailLabel}</h3>
                <p className="text-sm text-gray-500">{contact.email || biz.email || 'support@example.com'}</p>
              </div>
              <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 mb-3"><Phone className="w-5 h-5" /></div>
                <h3 className="font-bold text-gray-900 mb-1">{ct.phoneLabel}</h3>
                <p className="text-sm text-gray-500">{contact.phone || '+91 00000 00000'}</p>
              </div>
              <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 mb-3"><MapPin className="w-5 h-5" /></div>
                <h3 className="font-bold text-gray-900 mb-1">{ct.addressLabel}</h3>
                <p className="text-sm text-gray-500">{contact.address || 'India'}</p>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="p-8 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoComplete="off" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required autoComplete="off" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="off" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required rows={5} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none resize-none" />
                </div>
                {captchaEnabled && captcha && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Solve: {captcha.question} = ?</label>
                    <input type="text" inputMode="numeric" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} required autoComplete="off" placeholder="Enter the answer" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                  </div>
                )}
                <button type="submit" disabled={status === 'sending'} className="w-full flex items-center justify-center gap-2 px-6 py-3.5 text-white font-semibold bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl shadow-lg shadow-violet-200/50 hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-60">
                  <Send className="w-4 h-4" /> {status === 'sending' ? 'Sending...' : status === 'sent' ? 'Message Sent!' : ct.buttonText}
                </button>
                {status === 'sent' && <p className="text-sm text-green-600 text-center">{ct.successMessage}</p>}
                {status === 'error' && <p className="text-sm text-red-500 text-center">{ct.errorMessage}</p>}
              </form>
            </div>
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
            <Link href="/about" className="hover:text-violet-600">About</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
