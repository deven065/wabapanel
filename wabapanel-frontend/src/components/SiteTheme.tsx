'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fetchSiteTheme } from '@/lib/siteTheme';

const PUBLIC_PREFIXES = ['/about', '/contact', '/team', '/features', '/privacy', '/terms', '/blog', '/knowledge-base', '/p/'];

function isPublicPath(path: string) {
  return path === '/' || PUBLIC_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

export default function SiteTheme() {
  const pathname = usePathname() || '/';
  useEffect(() => {
    const root = document.documentElement;
    const old = document.getElementById('site-theme-css');
    if (!isPublicPath(pathname)) {
      root.removeAttribute('data-site-theme');
      if (old) old.remove();
      return;
    }
    fetchSiteTheme().then(t => {
      root.setAttribute('data-site-theme', t.id);
      let style = document.getElementById('site-theme-css') as HTMLStyleElement | null;
      if (!style) { style = document.createElement('style'); style.id = 'site-theme-css'; document.head.appendChild(style); }
      style.textContent = t.css || '';
      if (t.font && t.font !== 'Inter') {
        const id = 'site-theme-font';
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
        link.href = `https://fonts.googleapis.com/css2?family=${t.font.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
      }
    });
  }, [pathname]);
  return null;
}
