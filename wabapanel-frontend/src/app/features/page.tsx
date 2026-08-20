/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Send, Users, BarChart3, Bot, Zap, Phone, Menu, X,
  Check, ArrowRight, MousePointerClick, Globe, Inbox,
  FileText, Webhook, Palette, Lock, Headphones, Rocket
} from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function FeaturesPage() {
  const c = useSiteContent();
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  const biz = settings?.business || { name: 'KKHS Media', tagline: 'WhatsApp Business Platform' };
  const logo = settings?.branding?.logo;

  const fp = c.featuresPage;
  const featureIcons = [<MessageSquare className="w-7 h-7" key="0" />, <Send className="w-7 h-7" key="1" />, <Bot className="w-7 h-7" key="2" />, <Zap className="w-7 h-7" key="3" />, <Users className="w-7 h-7" key="4" />, <BarChart3 className="w-7 h-7" key="5" />, <Phone className="w-7 h-7" key="6" />, <MousePointerClick className="w-7 h-7" key="7" />, <Inbox className="w-7 h-7" key="8" />, <Globe className="w-7 h-7" key="9" />, <FileText className="w-7 h-7" key="10" />, <Webhook className="w-7 h-7" key="11" />, <Palette className="w-7 h-7" key="12" />, <Lock className="w-7 h-7" key="13" />, <Headphones className="w-7 h-7" key="14" />, <Rocket className="w-7 h-7" key="15" />];
  const allFeatures = (fp.items || []).map((f: any, i: number) => ({ ...f, icon: featureIcons[i % featureIcons.length] }));

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
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-[300px] h-[300px] bg-gradient-to-br from-fuchsia-100/20 to-pink-100/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{fp.badge}</span>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6"><span className="text-gray-900">{fp.title} </span><span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{fp.titleHighlight}</span></h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">{fp.subtitle}</p>
          <Link href="/auth/register" className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl shadow-xl shadow-violet-200/60 hover:shadow-2xl transition-all hover:-translate-y-0.5">
            {fp.ctaText} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          {allFeatures.map((f: any, i: number) => (
            <div key={i} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center p-8 md:p-10 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <div className="w-14 h-14 bg-gradient-to-br from-violet-100 to-purple-50 rounded-2xl flex items-center justify-center text-violet-600 mb-5">
                  {f.icon}
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">{f.title}</h2>
                <p className="text-gray-500 leading-relaxed mb-6">{f.desc}</p>
                <Link href="/auth/register" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                  {fp.itemLinkText} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className={i % 2 === 1 ? 'lg:order-1' : ''}>
                <div className="bg-gradient-to-br from-violet-50/50 to-purple-50/30 rounded-2xl p-6 border border-violet-100/50">
                  <ul className="space-y-3">
                    {(f.points || []).map((point: string, j: number) => (
                      <li key={j} className="flex items-start gap-3">
                        <div className="mt-0.5 w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-violet-600" /></div>
                        <span className="text-sm text-gray-700">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl p-10 md:p-16 text-center shadow-2xl shadow-violet-200/50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <h2 className="relative text-3xl md:text-4xl font-extrabold text-white mb-4">{fp.cta.title}</h2>
          <p className="relative text-violet-100 text-lg mb-8">{fp.cta.subtitle}</p>
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/register" className="w-full sm:w-auto px-8 py-4 bg-white text-violet-700 font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">{fp.cta.primaryText}</Link>
            <Link href="/contact" className="w-full sm:w-auto px-8 py-4 border-2 border-white/30 text-white font-bold rounded-2xl hover:bg-white/10 transition-all">{fp.cta.secondaryText}</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                {logo ? <img src={logo} alt={biz.name} className="h-7 w-auto" /> : (
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center"><MessageSquare className="w-4 h-4 text-white" /></div>
                )}
              </Link>
              <p className="text-sm text-gray-400">{biz.tagline || 'WhatsApp Business Platform'}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/features" className="hover:text-violet-600">Features</Link></li>
                <li><Link href="/#pricing" className="hover:text-violet-600">Pricing</Link></li>
                <li><Link href="/blog" className="hover:text-violet-600">Blog</Link></li>
                <li><Link href="/knowledge-base" className="hover:text-violet-600">Knowledge Base</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/about" className="hover:text-violet-600">About Us</Link></li>
                <li><Link href="/team" className="hover:text-violet-600">Our Team</Link></li>
                <li><Link href="/contact" className="hover:text-violet-600">Contact Us</Link></li>
                <li><Link href="/privacy" className="hover:text-violet-600">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-violet-600">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/knowledge-base" className="hover:text-violet-600">Documentation</Link></li>
                <li><Link href="/blog" className="hover:text-violet-600">Guides</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Connect</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                {settings?.social?.facebook && <li><a href={settings.social.facebook} target="_blank" className="hover:text-violet-600">Facebook</a></li>}
                {settings?.social?.instagram && <li><a href={settings.social.instagram} target="_blank" className="hover:text-violet-600">Instagram</a></li>}
                {settings?.social?.linkedin && <li><a href={settings.social.linkedin} target="_blank" className="hover:text-violet-600">LinkedIn</a></li>}
                {settings?.social?.youtube && <li><a href={settings.social.youtube} target="_blank" className="hover:text-violet-600">YouTube</a></li>}
                {!settings?.social?.facebook && <>
                  <li><a href="#" className="hover:text-violet-600">Facebook</a></li>
                  <li><a href="#" className="hover:text-violet-600">Instagram</a></li>
                  <li><a href="#" className="hover:text-violet-600">LinkedIn</a></li>
                  <li><a href="#" className="hover:text-violet-600">YouTube</a></li>
                </>}
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <Link href="/privacy" className="hover:text-violet-600">Privacy</Link>
              <Link href="/terms" className="hover:text-violet-600">Terms</Link>
              <Link href="/contact" className="hover:text-violet-600">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
