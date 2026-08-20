/* eslint-disable @typescript-eslint/no-explicit-any */
import { headers } from 'next/headers';
import HomeLanding from '@/components/HomeLanding';
import type { SiteThemeData } from '@/lib/siteTheme';
import { buildSiteContent } from '@/lib/siteContentData';

export const dynamic = 'force-dynamic';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');

const DEFAULT_THEME: SiteThemeData = { id: 'royal-violet', name: 'Royal Violet', font: 'Inter', layout: { nav: 'floating', hero: 'centered', features: 'grid' }, css: '' };

function serverApiBase(): string {
  const internal = (process.env.INTERNAL_API_URL || '').replace(/\/$/, '');
  if (internal) return internal;
  if (!API_BASE.startsWith('/')) return API_BASE;
  const h = headers();
  const host = h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}${API_BASE}` : API_BASE;
}

async function getSiteTheme(): Promise<SiteThemeData | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${serverApiBase()}/public/site-theme`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.data ? { ...DEFAULT_THEME, ...d.data } : null;
  } catch { return null; }
}

async function getSiteContent(): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const base = serverApiBase();
    const [c, s] = await Promise.all([
      fetch(`${base}/public/site-content`, { cache: 'no-store', signal: ctrl.signal }).then(r => r.json()),
      fetch(`${base}/public/site-settings`, { cache: 'no-store', signal: ctrl.signal }).then(r => r.json()),
    ]);
    clearTimeout(t);
    const bizName = (s && s.data && s.data.business && s.data.business.name) || 'KKHS Media';
    return buildSiteContent(c && c.success ? c.data : null, bizName);
  } catch { return null; }
}

export default async function Page() {
  const [theme, content] = await Promise.all([getSiteTheme(), getSiteContent()]);
  return (
    <>
      {theme && (
        <script
          dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute('data-site-theme',${JSON.stringify(theme.id)});` }}
        />
      )}
      {theme?.css ? <style id="site-theme-css" dangerouslySetInnerHTML={{ __html: theme.css }} /> : null}
      <HomeLanding initialTheme={theme || undefined} initialContent={content || undefined} />
    </>
  );
}
