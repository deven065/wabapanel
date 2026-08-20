import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Toaster } from 'react-hot-toast';
import SeoHead from '@/components/SeoHead';
import SiteTheme from '@/components/SiteTheme';
import PwaProvider from '@/components/PwaProvider';
import './globals.css';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://wabapanel.com').replace(/\/$/, '');
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');

const DEFAULT_TITLE = 'WabaPanel — WhatsApp Business API CRM & AI Automation Platform';
const DEFAULT_DESC = 'WabaPanel is a complete WhatsApp Business API platform: team inbox, AI chatbot, bot flow builder, broadcasts, drip campaigns, CRM pipeline, AI voice calling and white-label reselling. Free plan available.';

// Re-evaluate branding at request time so each self-hosted install shows its own name/logo
export const dynamic = 'force-dynamic';

async function fetchJson(url: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Server-side fetch base: prefer INTERNAL_API_URL (localhost backend) to avoid
// hairpin routing to the public domain, then absolute NEXT_PUBLIC_API_URL, then host-derived.
function serverApiBase(): string {
  const internal = (process.env.INTERNAL_API_URL || '').replace(/\/$/, '');
  if (internal) return internal;
  if (!API_BASE.startsWith('/')) return API_BASE;
  const h = headers();
  const host = h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}${API_BASE}` : API_BASE;
}

// White-label: canonical/OG/JSON-LD site URL must be the panel's OWN domain, not
// the master default. Prefer an explicit NEXT_PUBLIC_SITE_URL (set on master),
// otherwise derive it from the incoming request host so no install leaks wabapanel.com.
function siteUrlFor(): string {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (env) return env;
  try {
    const h = headers();
    const host = h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  } catch { /* noop */ }
  return SITE;
}

export async function generateMetadata(): Promise<Metadata> {
  const base = serverApiBase();
  const [brandRes, contentRes] = await Promise.all([
    fetchJson(`${base}/public/branding`),
    fetchJson(`${base}/public/site-content`),
  ]);
  const brand = brandRes?.data || {};
  const seo = contentRes?.data?.seo || {};
  const brandName: string = brand.name && brand.name !== 'WabaPanel' ? brand.name : 'WabaPanel';
  // Ignore the shipped default SEO copy (which names WabaPanel) so a white-label
  // install never leaks it; build title/description from the panel's own brand.
  const seoTitle: string = seo.metaTitle && !/wabapanel/i.test(seo.metaTitle) ? seo.metaTitle : '';
  const seoDesc: string = seo.metaDescription && !/wabapanel/i.test(seo.metaDescription) ? seo.metaDescription : '';
  const title: string = seoTitle || (brandName !== 'WabaPanel' ? `${brandName} — WhatsApp Business Platform` : DEFAULT_TITLE);
  const description: string = seoDesc || (brandName !== 'WabaPanel' ? `${brandName} — a complete WhatsApp Business API platform: team inbox, AI chatbot, bot flows, broadcasts, drip campaigns, CRM pipeline and AI voice calling.` : DEFAULT_DESC);
  // Prefer the panel's own share image, then its logo, so a white-label install
  // never leaks the default (KKHS-branded) screenshot in WhatsApp/social previews.
  const ogImage: string = seo.ogImage || brand.logo || '/assets/panel-dashboard.png';
  const favicon: string = brand.favicon || '/favicon.ico';
  // iOS home-screen icon must be a square PNG; the raw logo is often rectangular,
  // so use the backend's squared pwa-icon (logo composited on a white square) when a
  // brand logo exists — this makes the panel's own logo show as the installed app icon.
  const appleIcon: string = brand.logo ? `${API_BASE}/public/pwa-icon-192.png` : (brand.favicon || '/icons/icon-192.png');

  const site = siteUrlFor();
  return {
    metadataBase: new URL(site),
    title: { default: title, template: brandName !== 'WabaPanel' ? `%s | ${brandName}` : '%s | WabaPanel' },
    description,
    keywords: ['WhatsApp Business API', 'WhatsApp CRM', 'WhatsApp automation', 'AI chatbot', 'WhatsApp broadcast', 'bot flow builder', 'WhatsApp panel'],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: site,
      siteName: brandName,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: brandName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
    manifest: `${API_BASE}/public/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: brandName },
    icons: { icon: favicon, shortcut: favicon, apple: appleIcon },
  };
}

// Build schema.org JSON-LD from the panel's own branding so white-label installs
// never leak the default (WabaPanel / KKHS Media) name. orgName defaults to the
// brand name but can be overridden from Admin → Site Settings → SEO.
function buildJsonLd(site: string, orgName: string, brandName: string, desc: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: orgName,
        url: site,
        logo: `${site}/icons/icon-192.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: brandName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: site,
        description: desc,
        offers: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Starter', price: '999', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Growth', price: '1499', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Business', price: '1999', priceCurrency: 'INR' },
        ],
        publisher: { '@id': `${site}/#organization` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What is ${brandName}?`,
            acceptedAnswer: { '@type': 'Answer', text: `${brandName} is a WhatsApp Business API platform by ${orgName} that combines a shared team inbox, AI chatbot, drag-and-drop bot flow builder, broadcast & drip campaigns, sales pipeline CRM and AI voice calling in one dashboard.` },
          },
          {
            '@type': 'Question',
            name: `Does ${brandName} have a free plan?`,
            acceptedAnswer: { '@type': 'Answer', text: `Yes. ${brandName} offers a Free plan (₹0) and paid plans starting at ₹999/month with more contacts, agents, bot flows and AI features.` },
          },
          {
            '@type': 'Question',
            name: `Does ${brandName} support the official WhatsApp Business API?`,
            acceptedAnswer: { '@type': 'Answer', text: `Yes. ${brandName} works with the official WhatsApp Cloud API, including message templates, broadcasts and click-to-WhatsApp ads, and also supports QR-based WhatsApp connections.` },
          },
          {
            '@type': 'Question',
            name: 'Can I train the AI chatbot on my own data?',
            acceptedAnswer: { '@type': 'Answer', text: `Yes. You can train the ${brandName} AI chatbot with your own PDFs, Excel files and website content so it answers customer questions automatically 24x7.` },
          },
        ],
      },
    ],
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#059669',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const base = serverApiBase();
  const [brandRes, contentRes] = await Promise.all([
    fetchJson(`${base}/public/branding`),
    fetchJson(`${base}/public/site-content`),
  ]);
  const brand = brandRes?.data || {};
  const seo = contentRes?.data?.seo || {};
  const brandName: string = brand.name || 'WabaPanel';
  const orgName: string = seo.organizationName || brandName;
  const desc: string = (seo.metaDescription && !/wabapanel/i.test(seo.metaDescription)) ? seo.metaDescription : `${brandName} — WhatsApp Business API CRM & AI automation platform with team inbox, AI chatbot, bot flow builder, broadcasts, drip campaigns, sales pipeline and AI voice calling.`;
  const jsonLd = buildJsonLd(siteUrlFor(), orgName, brandName, desc);
  return (
    <html lang="en">
      <body className="antialiased">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var r=document.documentElement;var c=localStorage.getItem('brandColor');if(c){r.classList.add('brand-themed');r.style.setProperty('--brand',c);}var f=localStorage.getItem('brandFont');if(f&&f!=='Inter'){r.style.setProperty('--app-font',"'"+f+"'");}}catch(e){}})();` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var K='__chunk_reload__';function chunk(m){m=String(m||'');return /Loading chunk [\\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(m);}function fix(m){if(!chunk(m))return;var last=+(sessionStorage.getItem(K)||0);if(Date.now()-last<10000)return;sessionStorage.setItem(K,String(Date.now()));window.location.reload();}window.addEventListener('error',function(e){fix((e&&e.message)||(e&&e.error&&e.error.message));},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;fix(r&&(r.message||r.name||r));});}catch(e){}})();` }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <SeoHead />
        <SiteTheme />
        <PwaProvider />
        {children}
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </body>
    </html>
  );
}
