/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Send, Users, BarChart3, Bot, Zap, Phone,
  Check, ChevronDown, Menu, X, ArrowRight, Shield, Sparkles,
  Play, MousePointerClick, Star, Quote, MonitorCheck, ShieldCheck,
  Megaphone, MessageCircle, Code2, FileText, Clock3
} from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';
import { useSiteTheme, SiteThemeData } from '@/lib/siteTheme';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`${className} transition-all duration-700 ease-out will-change-transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>{children}</div>;
}

function CountUp({ end, suffix = '', decimals = 0, duration = 1800 }: { end: number; suffix?: string; decimals?: number; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / duration); setVal(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-IN')}{suffix}</span>;
}

const TESTIMONIALS = [
  { name: 'Rajesh Sharma', role: 'Founder, StyleKart (E-Commerce)', initials: 'RS', color: 'from-violet-500 to-purple-600', text: 'Broadcasts + abandoned cart recovery alone paid for the panel in the first month. Our repeat orders on WhatsApp went up 3x.' },
  { name: 'Dr. Priya Mehta', role: 'Director, CityCare Clinic', initials: 'PM', color: 'from-fuchsia-500 to-pink-600', text: 'Appointment booking and reminders run completely on autopilot now. Patients love replying on WhatsApp instead of calling.' },
  { name: 'Aman Verma', role: 'Agency Owner, GrowthLab Media', initials: 'AV', color: 'from-indigo-500 to-violet-600', text: 'We manage 14 client accounts from one dashboard. The AI chatbot answers 80% of queries before my team even opens the chat.' },
];

const SERVICE_PACKAGES = [
  { title: 'Full onboarding setup', category: 'Setup', price: '12.20', icon: MonitorCheck, description: 'Full setup including account creation, FB Business setup, and number migration if needed. Best for businesses starting from scratch.', features: ['New account + FB Business setup', 'Number migration supported', 'Dashboard walkthrough included'], process: ['Session via Google Meet or Anydesk', 'Max 30 mins allotted', 'Guided setup from start to finish'], requirement: 'Any paid plan', action: 'Buy now', featured: false },
  { title: 'Facebook Business verification', category: 'Compliance', price: '12.20', icon: ShieldCheck, description: 'We handle the FB Business Manager verification process on your behalf and help prepare the required documents.', features: ['Document submission guided by our team', 'GST, MSME, or incorporation certificate accepted', 'Verification status tracked'], process: ['Document review with our team', 'Submission to Meta', 'Updates until a decision is received'], requirement: 'Any paid plan', action: 'Buy now', featured: false },
  { title: 'Verified FB account + full setup', category: 'Premium', price: '121.95', icon: Star, description: 'We create a verified Facebook Business account from scratch and connect your WhatsApp Business setup for you.', features: ['FB Business account created by our team', 'Verification submitted and tracked', 'Complete WhatsApp setup included'], process: ['Account and document preparation', 'Meta verification submission', 'Final connection and walkthrough'], requirement: 'Any paid plan', action: 'Chat on WhatsApp', featured: true },
  { title: 'Broadcast campaign setup', category: 'Ongoing', price: '24.40', icon: Megaphone, description: 'Launch your first broadcast campaign with templates, audience selection, and delivery tracking configured.', features: ['Template and audience setup', 'Campaign launch assistance', 'Delivery tracking walkthrough'], process: ['Campaign planning call', 'Build and test the campaign', 'Launch with tracking enabled'], requirement: 'Active WhatsApp number', action: 'Buy now', featured: false },
  { title: 'Chatbot flow setup', category: 'Custom', price: '36.60', icon: MessageCircle, description: 'A practical WhatsApp chatbot flow designed around your FAQs, lead capture, and handoff requirements.', features: ['Conversation flow mapped with you', 'FAQ and lead capture setup', 'Human handoff configured'], process: ['Flow and content review', 'Build and test the experience', 'Go live with a walkthrough'], requirement: 'Active WhatsApp number', action: 'Buy now', featured: false },
  { title: 'Custom integration', category: 'Custom', price: 'Contact us', icon: Code2, description: 'Connect your existing tools and workflows to WhatsApp with a tailored integration plan from our team.', features: ['Integration scope review', 'API and webhook guidance', 'Testing and launch support'], process: ['Technical discovery call', 'Integration plan and estimate', 'Build, test, and hand over'], requirement: 'Project scope required', action: 'Chat on WhatsApp', featured: false },
];

export default function HomeLanding({ initialTheme, initialContent }: { initialTheme?: SiteThemeData; initialContent?: any }) {
  const c = useSiteContent(initialContent);
  const h = c.home;
  const theme = useSiteTheme(initialTheme);
  const L = theme.layout || { nav: 'floating', hero: 'centered', features: 'grid' };
  const navDark = L.nav === 'dark';
  const [settings, setSettings] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const cyclePrice = (plan: any) => {
    const m = plan.price || plan.monthlyPrice || 0;
    if (cycle === 'quarterly') return plan.quarterlyPrice > 0 ? plan.quarterlyPrice : Math.round(m * 3);
    if (cycle === 'yearly') return plan.yearlyPrice > 0 ? plan.yearlyPrice : Math.round(m * 10);
    return m;
  };
  const cycleSuffix = cycle === 'quarterly' ? 'quarter' : cycle === 'yearly' ? 'year' : 'month';
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [selectedService, setSelectedService] = useState<typeof SERVICE_PACKAGES[number] | null>(null);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
    fetch(`${API}/plans`).then(r => r.json()).then(d => { if (d.success) setPlans(d.data || []); else if (Array.isArray(d)) setPlans(d); }).catch(() => {});
  }, []);

  const biz = settings?.business || { name: 'KKHS Media', tagline: 'WhatsApp Business Platform' };
  const logo = settings?.branding?.logo;
  const faqs = h.faqs;

  const featureIcons = [<MessageSquare key="0" className="w-6 h-6" />, <Send key="1" className="w-6 h-6" />, <Bot key="2" className="w-6 h-6" />, <Zap key="3" className="w-6 h-6" />, <Users key="4" className="w-6 h-6" />, <BarChart3 key="5" className="w-6 h-6" />, <Phone key="6" className="w-6 h-6" />, <MousePointerClick key="7" className="w-6 h-6" />];
  const features = (h.features.items || []).map((f: any, i: number) => ({ ...f, icon: featureIcons[i % featureIcons.length] }));
  const trustedByLogos = Array.isArray(h.trustedByLogos) ? h.trustedByLogos : [];
  const trustedBySplitIndex = Math.ceil(trustedByLogos.length / 2);
  const trustedByRows = [trustedByLogos.slice(0, trustedBySplitIndex), trustedByLogos.slice(trustedBySplitIndex)].filter(row => row.length > 0);
  const trustedLogoAssets: Record<string, string> = {
    cloudsy: '/assets/logos/cloudsy.svg',
    edulearn: '/assets/logos/edulearn.svg',
    estatepro: '/assets/logos/estatepro.svg',
    finserve: '/assets/logos/finserve.svg',
    healthplus: '/assets/logos/healthplus.svg',
    logiflow: '/assets/logos/logiflow.svg',
    retailmax: '/assets/logos/retailmax.svg',
    shopnova: '/assets/logos/shopnova.svg',
  };
  const trustedLogoNames: Record<string, string> = {
    cloudsy: 'Cloudsy',
    edulearn: 'EduLearn',
    estatepro: 'EstatePro',
    finserve: 'FinServe',
    healthplus: 'HealthPlus',
    logiflow: 'LogiFlow',
    retailmax: 'RetailMax',
    shopnova: 'ShopNova',
  };
  const trustedIntegrationNames = [
    'Google Calendar', 'Google Sheets', 'Shopify', 'WooCommerce', 'HubSpot', 'Mailchimp',
    'Razorpay', 'Stripe', 'Google Analytics', 'Custom Webhook', 'Zapier', 'Make', 'Calendly',
    'Pabbly Connect', 'n8n', 'IFTTT', 'Salesforce', 'Zoho CRM', 'Pipedrive', 'Bitrix24',
    'PayPal', 'Paytm', 'PhonePe', 'Cashfree', 'Payments', 'PayU', 'Paystack', 'Mercado Pago',
    'OpenAI / Custom GPT', 'IndiaMART', 'Justdial', 'TradeIndia', 'ExportersIndia',
    'Facebook Lead Ads', 'Google Lead Forms', 'LinkedIn Lead Gen', 'X (Twitter) Ads',
    '99acres', 'MagicBricks', 'Housing.com', 'OLX', 'TagMango', 'LeadSquared', 'GoHighLevel',
    'WordPress Forms', 'Google Forms', 'Typeform', 'Jotform', 'Landing Pages', 'FlexiFunnels',
  ];
  const getTrustedLogoKey = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/^.*\//, '')
    .replace(/\.svg$/, '');
  const renderTrustedLogo = (b: string, key: string, fallbackName?: string) => {
    const logoKey = getTrustedLogoKey(b);
    const logoSource = trustedLogoAssets[logoKey] || (b.startsWith('/') || b.startsWith('http') ? b : '');
    const logoName = trustedLogoNames[logoKey] || fallbackName || b;

    return logoSource ? (
      <div key={key} className="flex h-12 items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50/80 px-4 text-sm font-semibold text-gray-500 whitespace-nowrap transition-colors hover:border-violet-100 hover:bg-violet-50 hover:text-violet-700">
        <span className="flex h-6 w-6 shrink-0 items-center overflow-hidden" aria-hidden="true">
          <img src={logoSource} alt="" className="h-6 w-auto max-w-none" />
        </span>
        <span>{logoName}</span>
      </div>
    ) : (
      <div key={key} className="flex h-12 items-center rounded-lg border border-gray-100 bg-gray-50/80 px-4 text-sm font-semibold text-gray-500 whitespace-nowrap transition-colors hover:border-violet-100 hover:bg-violet-50 hover:text-violet-700">{b}</div>
    );
  };

  return (
    <div className="min-h-screen bg-[#faf9fe] text-gray-900 overflow-x-hidden">
      {/* ─── Navbar (floating | solid | dark, per theme) ─── */}
      <nav className={L.nav === 'floating'
        ? 'fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-white/80 backdrop-blur-2xl border border-gray-200/60 rounded-2xl shadow-lg shadow-purple-100/30 z-50 px-5 py-2.5'
        : navDark
          ? 'fixed top-0 left-0 w-full bg-gray-950/95 backdrop-blur-xl border-b border-gray-800 z-50 px-4 py-2.5'
          : 'fixed top-0 left-0 w-full bg-white/95 backdrop-blur-xl border-b border-gray-200/70 z-50 px-4 py-2.5'}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex-shrink-0">
            {logo ? <img src={logo} alt={biz.name} className="h-10 w-auto" /> : (
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
            )}
          </Link>

          {/* Desktop Nav — centered */}
          <div className="hidden lg:flex items-center gap-1">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} className={navDark
                ? 'px-3 py-1.5 text-sm font-bold text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-all'
                : 'px-3 py-1.5 text-sm font-bold text-gray-900 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-all'}>{l.label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link href="/auth/login" className={navDark
              ? 'px-4 py-2 text-sm font-bold text-gray-200 hover:text-white transition-all'
              : 'px-4 py-2 text-sm font-bold text-gray-900 hover:text-violet-700 transition-all'}>{c.nav.loginText}</Link>
            <Link href="/auth/register" className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg shadow-md shadow-violet-200/40 hover:shadow-lg hover:shadow-violet-300/40 transition-all hover:-translate-y-0.5">{c.nav.registerText}</Link>
          </div>

          <button onClick={() => setMobileMenu(!mobileMenu)} className={navDark ? 'lg:hidden p-2 rounded-lg text-gray-200 hover:bg-gray-800' : 'lg:hidden p-2 rounded-lg hover:bg-gray-100'}>
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenu && (
          <div className="lg:hidden pt-3 pb-2 border-t border-gray-100/60 mt-2 space-y-1">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} onClick={() => setMobileMenu(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-violet-50">{l.label}</a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/auth/login" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-lg">{c.nav.loginText}</Link>
              <Link href="/auth/register" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg">{c.nav.registerText}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ─── Hero Section (centered | split | dark | minimal, per theme) ─── */}
      {L.hero === 'split' ? (
      <section className="relative pt-32 md:pt-36 pb-16 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-200/40 to-purple-100/30 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-violet-100 rounded-full shadow-sm mb-6">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-700">{h.badge}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
              <span className="text-gray-900">{h.heroTitle} </span>
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">{h.heroTitleHighlight}</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 leading-relaxed">{h.heroSubtitle}</p>
            <div className="flex flex-col sm:flex-row items-start gap-4 mb-8">
              <Link href="/auth/register" className="group px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl shadow-xl shadow-violet-200/60 hover:shadow-2xl transition-all hover:-translate-y-0.5 flex items-center gap-2">
                {h.ctaPrimary} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#features" className="px-8 py-4 text-base font-semibold text-gray-700 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                <Play className="w-4 h-4 text-violet-600" /> {h.ctaSecondary}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
              {(h.trustBadges || []).map((t: string, i: number) => (
                <span key={i} className="flex items-center gap-1.5">{i === (h.trustBadges.length - 1) ? <Shield className="w-4 h-4 text-violet-500" /> : <Check className="w-4 h-4 text-violet-500" />} {t}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-violet-200/20 via-purple-200/20 to-fuchsia-200/20 rounded-[2rem] blur-xl" />
            <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-violet-100/50 overflow-hidden">
              <img src={h.heroImage} alt={`${biz.name} Dashboard`} className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>
      ) : L.hero === 'dark' ? (
      <section className="relative pt-32 md:pt-40 pb-20 px-4 bg-gray-950">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-violet-500/30 rounded-full mb-8">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-violet-300">{h.badge}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mb-6">
            <span className="text-white">{h.heroTitle} </span>
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">{h.heroTitleHighlight}</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">{h.heroSubtitle}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link href="/auth/register" className="group w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl shadow-xl shadow-violet-900/40 hover:shadow-2xl transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2">
              {h.ctaPrimary} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="#features" className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-gray-200 bg-white/5 border border-gray-700 rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <Play className="w-4 h-4 text-violet-400" /> {h.ctaSecondary}
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500 mb-16">
            {(h.trustBadges || []).map((t: string, i: number) => (
              <span key={i} className="flex items-center gap-1.5">{i === (h.trustBadges.length - 1) ? <Shield className="w-4 h-4 text-violet-400" /> : <Check className="w-4 h-4 text-violet-400" />} {t}</span>
            ))}
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-violet-600/20 rounded-[2rem] blur-2xl" />
            <div className="relative bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
              <img src={h.heroImage} alt={`${biz.name} Dashboard`} className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>
      ) : L.hero === 'minimal' ? (
      <section className="relative pt-32 md:pt-40 pb-16 px-4">
        <div className="relative max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 uppercase tracking-wider mb-6"><Sparkles className="w-4 h-4" /> {h.badge}</span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
              <span className="text-gray-900">{h.heroTitle} </span>
              <span className="text-violet-600">{h.heroTitleHighlight}</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-500 mb-10 leading-relaxed">{h.heroSubtitle}</p>
            <div className="flex flex-col sm:flex-row items-start gap-4 mb-10">
              <Link href="/auth/register" className="group px-8 py-4 text-base font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-all flex items-center gap-2">
                {h.ctaPrimary} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#features" className="px-8 py-4 text-base font-semibold text-violet-700 border-2 border-violet-200 rounded-xl hover:bg-violet-50 transition-all flex items-center gap-2">
                <Play className="w-4 h-4" /> {h.ctaSecondary}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400 mb-14">
              {(h.trustBadges || []).map((t: string, i: number) => (
                <span key={i} className="flex items-center gap-1.5">{i === (h.trustBadges.length - 1) ? <Shield className="w-4 h-4 text-violet-500" /> : <Check className="w-4 h-4 text-violet-500" />} {t}</span>
              ))}
            </div>
          </div>
          <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-violet-100/50 overflow-hidden">
            <img src={h.heroImage} alt={`${biz.name} Dashboard`} className="w-full h-auto" />
          </div>
        </div>
      </section>
      ) : (
      <section className="relative pt-32 md:pt-40 pb-10 px-4">
        {/* Background gradient blobs + grid */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 lp-grid-bg" />
          <div className="lp-blob absolute top-20 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-200/50 to-purple-100/40 rounded-full blur-3xl" />
          <div className="lp-blob-2 absolute top-40 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-fuchsia-100/40 to-pink-100/30 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="lp-hero-in inline-flex items-center gap-2 px-4 py-2 bg-white border border-violet-100 rounded-full shadow-sm mb-8">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-medium text-violet-700">{h.badge}</span>
            <ArrowRight className="w-3.5 h-3.5 text-violet-500" />
          </div>

          {/* Main Heading */}
          <h1 className="lp-hero-in-1 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mb-6">
            <span className="text-gray-900">{h.heroTitle} </span>
            <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">{h.heroTitleHighlight}</span>
          </h1>

          <p className="lp-hero-in-2 text-lg md:text-xl text-gray-500 max-w-3xl mx-auto mb-10 leading-relaxed">{h.heroSubtitle}</p>

          {/* CTA Buttons */}
          <div className="lp-hero-in-3 flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/auth/register" className="group w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl shadow-xl shadow-violet-200/60 hover:shadow-2xl hover:shadow-violet-300/60 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2">
              {h.ctaPrimary} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="#features" className="group w-full sm:w-auto px-8 py-4 text-base font-semibold text-gray-700 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2">
              <Play className="w-4 h-4 text-violet-600" /> {h.ctaSecondary}
            </a>
          </div>

          {/* Rating row */}
          <div className="lp-hero-in-3 flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center">{[0,1,2,3,4].map(i => <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />)}</div>
            <span className="text-sm font-semibold text-gray-700">4.9/5</span>
            <span className="text-sm text-gray-400">— loved by 500+ businesses</span>
          </div>

          {/* Trust badges */}
          <div className="lp-hero-in-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400 mb-16">
            {(h.trustBadges || []).map((t: string, i: number) => (
              <span key={i} className="flex items-center gap-1.5">{i === (h.trustBadges.length - 1) ? <Shield className="w-4 h-4 text-violet-500" /> : <Check className="w-4 h-4 text-violet-500" />} {t}</span>
            ))}
          </div>

          {/* Dashboard Preview Image */}
          <div className="lp-hero-in-4 relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-violet-300/30 via-purple-300/30 to-fuchsia-300/30 rounded-[2rem] blur-2xl" />
            <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-violet-200/60 overflow-hidden">
              <img src={h.heroImage} alt={`${biz.name} Dashboard`} className="w-full h-auto" />
            </div>
            {/* Floating stat chips */}
            <div className="lp-floaty hidden md:flex absolute -left-8 top-16 items-center gap-3 bg-white/90 backdrop-blur border border-gray-100 rounded-2xl shadow-xl shadow-violet-100/60 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div>
              <div className="text-left"><p className="text-sm font-bold text-gray-900">98.6% Delivery</p><p className="text-xs text-gray-400">last 30 days</p></div>
            </div>
            <div className="lp-floaty-2 hidden md:flex absolute -right-8 top-40 items-center gap-3 bg-white/90 backdrop-blur border border-gray-100 rounded-2xl shadow-xl shadow-violet-100/60 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center"><Bot className="w-5 h-5 text-violet-600" /></div>
              <div className="text-left"><p className="text-sm font-bold text-gray-900">AI replies 24/7</p><p className="text-xs text-gray-400">chatbot active</p></div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ─── Trusted By (Logo Marquee) ─── */}
      <section className="py-14 border-y border-gray-200/60 bg-white/50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm font-medium text-gray-400 tracking-wide uppercase mb-8">{h.trustedByTitle}</p>
          <div className="relative space-y-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            {trustedByRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="lp-marquee flex w-max items-center gap-10 md:gap-16"
                style={rowIndex === 0 ? { animationDirection: 'reverse' } : undefined}
              >
                {[...row, ...row].map((b: string, i: number) => renderTrustedLogo(
                  b,
                  `${rowIndex}-${i}`,
                  trustedIntegrationNames[(rowIndex * trustedBySplitIndex) + (i % row.length)],
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Automation Section (Cheerio-style: text + image) ─── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.automation.badge}</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6">{h.automation.title} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.automation.titleHighlight}</span></h2>
              <ul className="space-y-4">
                {(h.automation.points || []).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-violet-600" /></div>
                    <span className="text-gray-600 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className="relative">
              <div className="absolute -inset-3 bg-gradient-to-br from-violet-100/40 to-purple-100/30 rounded-2xl blur-xl" />
              <img src={h.automation.image} alt="Workflow Automation" className="relative rounded-2xl shadow-xl border border-gray-200/60 w-full hover:scale-[1.015] transition-transform duration-500" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── AI Chat Section (image + text) ─── */}
      <section className="py-24 px-4 bg-gradient-to-b from-white to-violet-50/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Reveal delay={120} className="relative order-2 lg:order-1">
              <div className="absolute -inset-3 bg-gradient-to-br from-purple-100/40 to-fuchsia-100/30 rounded-2xl blur-xl" />
              <img src={h.aiChat.image} alt="AI Chat Interface" className="relative rounded-2xl shadow-xl border border-gray-200/60 w-full hover:scale-[1.015] transition-transform duration-500" />
            </Reveal>
            <Reveal className="order-1 lg:order-2">
              <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.aiChat.badge}</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6">{h.aiChat.title} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.aiChat.titleHighlight}</span></h2>
              <ul className="space-y-4">
                {(h.aiChat.points || []).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-violet-600" /></div>
                    <span className="text-gray-600 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Stats (Dark) ─── */}
      <section className="relative py-24 px-4 bg-gray-950 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="lp-blob absolute -top-32 left-1/4 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-3xl" />
          <div className="lp-blob-2 absolute -bottom-40 right-1/4 w-[450px] h-[450px] bg-fuchsia-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <span className="inline-flex items-center px-3 py-1 bg-white/5 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-full mb-4">Proven at scale</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white">Numbers that speak <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">for themselves</span></h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { val: <CountUp end={12000000} suffix="+" />, label: 'Messages delivered', sub: 'across WhatsApp, FB & IG' },
              { val: <CountUp end={500} suffix="+" />, label: 'Businesses onboard', sub: 'from 15+ industries' },
              { val: <CountUp end={98.6} decimals={1} suffix="%" />, label: 'Delivery rate', sub: 'on official Cloud API' },
              { val: <span>24/7</span>, label: 'AI answering', sub: 'chatbots never sleep' },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="h-full p-7 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/40 hover:bg-white/[0.07] transition-all text-center">
                  <p className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent mb-2">{s.val}</p>
                  <p className="text-sm font-bold text-white">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.features.badge}</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">{h.features.title}<br className="hidden md:block" /> <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.features.titleHighlight}</span></h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">{h.features.subtitle}</p>
          </Reveal>

          {L.features === 'list' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f: any, i: number) => (
              <div key={i} className="group flex items-start gap-4 p-6 bg-white rounded-2xl border border-gray-100 hover:border-violet-200 shadow-sm hover:shadow-lg transition-all">
                <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 group-hover:from-violet-600 group-hover:to-purple-600 group-hover:text-white transition-all duration-300">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
            {features.map((f: any, i: number) => {
              const spans = ['md:col-span-3', 'md:col-span-3', 'md:col-span-2', 'md:col-span-2', 'md:col-span-2', 'md:col-span-2', 'md:col-span-2', 'md:col-span-2'];
              const hero = i % 8 === 0;
              return (
                <Reveal key={i} delay={(i % 4) * 80} className={spans[i % 8]}>
                  <div className={hero
                    ? 'group h-full p-7 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-xl shadow-violet-200/60 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl relative overflow-hidden'
                    : 'group h-full p-7 bg-white rounded-2xl border border-gray-100 hover:border-violet-200 shadow-sm hover:shadow-xl hover:shadow-violet-100/50 transition-all duration-300 hover:-translate-y-1.5'}>
                    {hero && <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />}
                    <div className={hero
                      ? 'w-12 h-12 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300'
                      : 'w-12 h-12 bg-gradient-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center text-violet-600 mb-4 group-hover:from-violet-600 group-hover:to-purple-600 group-hover:text-white group-hover:scale-110 transition-all duration-300'}>
                      {f.icon}
                    </div>
                    <h3 className={hero ? 'text-lg font-bold mb-2' : 'text-base font-bold text-gray-900 mb-2'}>{f.title}</h3>
                    <p className={hero ? 'text-sm text-violet-100 leading-relaxed' : 'text-sm text-gray-500 leading-relaxed'}>{f.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          )}
          <div className="text-center mt-10"><a href="/features" className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-violet-600 border-2 border-violet-200 rounded-xl hover:bg-violet-50 transition-all">{h.features.viewAllText} <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a></div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-24 px-4 bg-gradient-to-b from-violet-50/30 to-white">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.steps.badge}</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900">{h.steps.title} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.steps.titleHighlight}</span></h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {(h.steps.items || []).map((s: any, i: number) => (
              <Reveal key={i} delay={i * 120}>
                <div className="relative h-full p-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1 transition-all duration-300 group">
                  <span className="absolute -top-4 left-6 px-3 py-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-violet-200 group-hover:scale-110 transition-transform">{s.step}</span>
                  <h3 className="text-lg font-bold text-gray-900 mt-2 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">Loved by businesses</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">Don&apos;t take our word <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">for it</span></h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">Real teams, real results — here&apos;s what they say.</p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 120}>
                <div className="relative h-full p-7 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1 transition-all duration-300">
                  <Quote className="absolute top-6 right-6 w-8 h-8 text-violet-100" />
                  <div className="flex items-center gap-1 mb-4">{[0,1,2,3,4].map(j => <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />)}</div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-6">“{t.text}”</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold shadow-md`}>{t.initials}</div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.role}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use Cases ─── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.solutions.badge}</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900">{h.solutions.title} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.solutions.titleHighlight}</span></h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(h.solutions.items || []).map((uc: any, i: number) => (
              <Reveal key={i} delay={(i % 3) * 100}>
                <div className="h-full p-6 bg-white rounded-2xl border border-gray-100 hover:border-violet-200 shadow-sm hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1 transition-all duration-300">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{uc.title}</h3>
                  <ul className="space-y-2">
                    {(uc.items || []).map((item: string, j: number) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-gray-500">
                        <Check className="w-4 h-4 text-violet-500 flex-shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-24 px-4 bg-gradient-to-b from-violet-50/30 to-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-12">
            <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">{h.pricing.badge}</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">{h.pricing.title} <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{h.pricing.titleHighlight}</span> {h.pricing.titleAfter}</h2>
            <p className="text-lg text-gray-500">{h.pricing.subtitle}</p>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
              {SERVICE_PACKAGES.map((service, i) => {
                const ServiceIcon = service.icon;
                const chatUrl = settings?.whatsappWidget?.phone
                  ? `https://wa.me/${String(settings.whatsappWidget.phone).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${service.title}.`)}`
                  : '/contact';
                return (
                  <Reveal key={service.title} delay={(i % 3) * 90} className="h-full">
                    <article className={`relative flex h-full min-h-[510px] flex-col rounded-2xl border bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${service.featured ? 'border-emerald-500 shadow-lg shadow-emerald-100/60' : 'border-gray-200 shadow-sm'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
                          <ServiceIcon className="h-6 w-6" />
                        </div>
                        <div className="flex items-center gap-2">
                          {service.featured && <span className="rounded-full bg-gray-950 px-3 py-1.5 text-xs font-bold text-white">Featured</span>}
                          <span className="rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-700">● {service.category}</span>
                        </div>
                      </div>
                      <h3 className="mt-5 text-xl font-extrabold tracking-tight text-gray-950">{service.title}</h3>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-3xl font-extrabold text-gray-950">{service.price === 'Contact us' ? service.price : `₹${service.price}`}</span>
                        {service.price !== 'Contact us' && <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500">one-time</span>}
                      </div>
                      <p className="mt-5 min-h-[72px] text-base leading-7 text-gray-500">{service.description}</p>
                      <ul className="mt-5 space-y-3">
                        {service.features.slice(0, 2).map(feature => <li key={feature} className="flex items-start gap-2 text-sm leading-5 text-gray-800"><Check className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-emerald-100 p-0.5 text-emerald-600" />{feature}</li>)}
                      </ul>
                      <button type="button" onClick={() => setSelectedService(service)} className="mt-3 self-start text-sm font-semibold text-gray-400 transition-colors hover:text-emerald-700">+{service.features.length - 2} more — view details</button>
                      <div className="mt-5 flex items-center gap-2 text-sm text-gray-400"><FileText className="h-4 w-4 text-gray-400" /> Requires: <span className="font-medium text-gray-700">{service.requirement}</span></div>
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
                        <button type="button" onClick={() => setSelectedService(service)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700"><ArrowRight className="mr-1 inline h-4 w-4" />Details</button>
                        {service.action === 'Chat on WhatsApp' ? <a href={chatUrl} target={chatUrl.startsWith('http') ? '_blank' : undefined} rel={chatUrl.startsWith('http') ? 'noopener noreferrer' : undefined} className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600">{service.action} <ArrowRight className="ml-1 inline h-4 w-4" /></a> : <Link href="/auth/register" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600">{service.action} <ArrowRight className="ml-1 inline h-4 w-4" /></Link>}
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            {/* Toggle */}
            <h3 className="mt-20 text-center text-2xl font-extrabold text-gray-950">Platform plans</h3>
            <div className="inline-flex items-center bg-white border border-gray-200 rounded-xl p-1.5 mt-6 shadow-sm">
              <button onClick={() => setCycle('monthly')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${cycle === 'monthly' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>Monthly</button>
              <button onClick={() => setCycle('quarterly')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${cycle === 'quarterly' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>Quarterly</button>
              <button onClick={() => setCycle('yearly')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${cycle === 'yearly' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>Yearly <span className={cycle === 'yearly' ? 'text-violet-200 ml-1' : 'text-violet-400 ml-1'}>-20%</span></button>
            </div>
          </Reveal>

          {plans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {plans.filter((p: any) => p.isActive !== false).slice(0, 4).map((plan: any, i: number, arr: any[]) => {
                const pop = arr.some((p: any) => p.isPopular) ? !!plan.isPopular : i === 1;
                return (
                <div key={plan._id || i} className={`relative p-7 rounded-2xl border ${pop ? 'border-violet-300 bg-gradient-to-b from-violet-50 to-white shadow-xl shadow-violet-100/50 scale-[1.02]' : 'border-gray-200 bg-white shadow-sm'} transition-all duration-300 hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1`}>
                  {pop && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold rounded-full">{h.pricing.popularBadge}</span>}
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-400 mt-1 mb-4">{plan.description || 'Best for growing businesses'}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold text-gray-900">₹{cyclePrice(plan)}</span>
                    <span className="text-gray-400 text-sm">/{cycleSuffix}</span>
                    {plan.trialDays > 0 && plan.price > 0 && (
                      <div className="mt-2"><span className="inline-flex items-center px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">{plan.trialDays}-day Free Trial</span></div>
                    )}
                  </div>
                  <Link href="/auth/register" className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all ${pop ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-200/50 hover:shadow-xl' : 'bg-gray-100 text-gray-700 hover:bg-violet-50 hover:text-violet-700'}`}>
                    {h.pricing.buttonText}
                  </Link>
                  {(plan.featureList?.length || plan.features) && (
                    <ul className="mt-6 space-y-2.5">
                      {(Array.isArray(plan.featureList) && plan.featureList.length ? plan.featureList : (Array.isArray(plan.features) ? plan.features : [])).map((f: string, j: number) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-gray-600"><Check className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">Loading plans...</div>
          )}
        </div>
      </section>

      {selectedService && (() => {
        const ServiceIcon = selectedService.icon;
        const chatUrl = settings?.whatsappWidget?.phone
          ? `https://wa.me/${String(settings.whatsappWidget.phone).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${selectedService.title}.`)}`
          : '/contact';
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm" onClick={() => setSelectedService(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="border-t-4 border-emerald-500 bg-emerald-50/70 px-6 py-6 sm:px-7">
                <button type="button" aria-label="Close details" onClick={() => setSelectedService(null)} className="absolute right-6 top-5 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-gray-950"><X className="h-5 w-5" /></button>
                <div className="flex items-center gap-4 pr-12"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600"><ServiceIcon className="h-6 w-6" /></div><div><span className="text-xs font-bold text-emerald-700">● {selectedService.category}</span><h2 id="service-dialog-title" className="mt-1 text-xl font-extrabold text-gray-950">{selectedService.title}</h2></div></div>
              </div>
              <div className="overflow-y-auto px-6 py-6 sm:px-7">
                <div className="flex items-center gap-3"><span className="text-3xl font-extrabold text-gray-950">{selectedService.price === 'Contact us' ? selectedService.price : `₹${selectedService.price}`}</span>{selectedService.price !== 'Contact us' && <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">one-time</span>}</div>
                <p className="mt-5 text-base leading-7 text-gray-500">{selectedService.description}</p>
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5"><h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">What we do</h3><ul className="mt-4 space-y-3">{selectedService.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm text-gray-700"><Check className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-emerald-100 p-0.5 text-emerald-600" />{feature}</li>)}</ul></div>
                <div className="mt-5 rounded-xl border border-gray-200 p-5"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400"><Clock3 className="h-4 w-4" /> How it works</h3><ul className="mt-4 space-y-3">{selectedService.process.map(step => <li key={step} className="flex items-start gap-2 text-sm text-gray-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{step}</li>)}</ul></div>
                <p className="mt-5 flex items-center gap-2 text-sm text-gray-500"><FileText className="h-4 w-4 text-gray-400" /> Requires: <span className="font-semibold text-gray-800">{selectedService.requirement}</span></p>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:px-7"><button type="button" onClick={() => setSelectedService(null)} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-600">Close</button>{selectedService.action === 'Chat on WhatsApp' ? <a href={chatUrl} target={chatUrl.startsWith('http') ? '_blank' : undefined} rel={chatUrl.startsWith('http') ? 'noopener noreferrer' : undefined} className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600">{selectedService.action} <ArrowRight className="ml-1 inline h-4 w-4" /></a> : <Link href="/auth/register" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600">{selectedService.action} <ArrowRight className="ml-1 inline h-4 w-4" /></Link>}</div>
            </div>
          </div>
        );
      })()}

      {/* ─── FAQ ─── */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">{h.faqTitle}</h2>
          </Reveal>
          <div className="space-y-3">
            {faqs.map((faq: any, i: number) => (
              <div key={i} className={`border rounded-xl overflow-hidden bg-white shadow-sm transition-all duration-300 ${openFaq === i ? 'border-violet-200 shadow-md shadow-violet-100/50' : 'border-gray-100 hover:border-violet-100'}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-6 py-4 text-left">
                  <span className="font-semibold text-gray-900 text-sm md:text-base">{faq.q || faq.question}</span>
                  <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${openFaq === i ? 'rotate-180 text-violet-500' : 'text-gray-400'}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-out ${openFaq === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="px-6 pb-4 text-sm text-gray-500 leading-relaxed">{faq.a || faq.answer}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-20 px-4">
        <Reveal className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl p-10 md:p-16 text-center shadow-2xl shadow-violet-300/50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.12),transparent)] pointer-events-none" />
          <div className="lp-blob absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <h2 className="relative text-3xl md:text-4xl font-extrabold text-white mb-4">{h.cta.title}</h2>
          <p className="relative text-violet-100 text-lg mb-8 max-w-2xl mx-auto">{h.cta.subtitle}</p>
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/register" className="w-full sm:w-auto px-8 py-4 bg-white text-violet-700 font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">{h.cta.primaryText}</Link>
            <Link href="/contact" className="w-full sm:w-auto px-8 py-4 border-2 border-white/30 text-white font-bold rounded-2xl hover:bg-white/10 transition-all">{h.cta.secondaryText}</Link>
          </div>
        </div>
        </Reveal>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-200/60 bg-white py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                {logo ? <img src={logo} alt={biz.name} className="h-7 w-auto" /> : (
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center"><MessageSquare className="w-4 h-4 text-white" /></div>
                )}
              </Link>
              <p className="text-sm text-gray-400 leading-relaxed">{biz.tagline || c.footer.tagline}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">{c.footer.productTitle}</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-violet-600 transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-violet-600 transition-colors">Pricing</a></li>
                <li><Link href="/blog" className="hover:text-violet-600 transition-colors">Blog</Link></li>
                <li><Link href="/knowledge-base" className="hover:text-violet-600 transition-colors">Knowledge Base</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">{c.footer.companyTitle}</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/about" className="hover:text-violet-600 transition-colors">About Us</Link></li>
                <li><Link href="/team" className="hover:text-violet-600 transition-colors">Our Team</Link></li>
                <li><Link href="/contact" className="hover:text-violet-600 transition-colors">Contact Us</Link></li>
                <li><Link href="/privacy" className="hover:text-violet-600 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-violet-600 transition-colors">Terms of Service</Link></li>
                <li><Link href="/data-deletion" className="hover:text-violet-600 transition-colors">Data Deletion</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">{c.footer.connectTitle}</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                {settings?.social?.facebook && <li><a href={settings.social.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">Facebook</a></li>}
                {settings?.social?.twitter && <li><a href={settings.social.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">Twitter / X</a></li>}
                {settings?.social?.instagram && <li><a href={settings.social.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">Instagram</a></li>}
                {settings?.social?.linkedin && <li><a href={settings.social.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">LinkedIn</a></li>}
                {settings?.social?.youtube && <li><a href={settings.social.youtube} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">YouTube</a></li>}
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <Link href="/privacy" className="hover:text-violet-600">Privacy</Link>
              <Link href="/terms" className="hover:text-violet-600">Terms</Link>
              <Link href="/data-deletion" className="hover:text-violet-600">Data Deletion</Link>
              <Link href="/about" className="hover:text-violet-600">About</Link>
              <Link href="/team" className="hover:text-violet-600">Team</Link>
              <Link href="/contact" className="hover:text-violet-600">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
      {settings?.whatsappWidget?.enabled && settings?.whatsappWidget?.phone && (
        <a
          href={`https://wa.me/${String(settings.whatsappWidget.phone).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(settings.whatsappWidget.message || '')}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          className="fixed bottom-5 right-5 z-[60] group flex items-center gap-2 rounded-full bg-[#25D366] text-white pl-3.5 pr-3.5 py-3.5 shadow-lg hover:shadow-2xl hover:pr-5 transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current shrink-0" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {settings.whatsappWidget.greeting && (
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 group-hover:max-w-[220px]">{settings.whatsappWidget.greeting}</span>
          )}
        </a>
      )}
    </div>
  );
}
