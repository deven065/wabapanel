'use client';
import { useState, useEffect } from 'react';

export interface Branding { name: string; tagline: string; logo: string; favicon: string; loginBg: string; primaryColor: string; primaryFont: string; }

const DEFAULT: Branding = { name: 'WabaPanel', tagline: 'by KKHS Media', logo: '', favicon: '', loginBg: '', primaryColor: '#059669', primaryFont: 'Inter' };

let cached: Branding | null = null;

export default function useBranding(): Branding {
  const [brand, setBrand] = useState<Branding>(cached || DEFAULT);
  useEffect(() => {
    if (cached) return;
    fetch((process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '') + '/api/public/branding')
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.data) {
          const b: Branding = { ...DEFAULT, ...d.data };
          cached = b;
          setBrand(b);
          if (b.favicon) {
            // Point every existing icon link at the white-label favicon
            // instead of removing them: these <link> tags are React-managed,
            // and detaching them crashes React's DOM commit.
            const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']");
            links.forEach((l) => { l.href = b.favicon; l.removeAttribute('sizes'); l.removeAttribute('type'); });
            if (!links.length) {
              const link = document.createElement('link');
              link.rel = 'icon';
              link.href = b.favicon;
              document.head.appendChild(link);
            }
          }
          if (b.name && b.name !== 'WabaPanel') document.title = b.name;
          // Apply server-side theme color and font
          const root = document.documentElement;
          if (b.primaryColor) {
            root.classList.add('brand-themed');
            root.style.setProperty('--brand', b.primaryColor);
            localStorage.setItem('brandColor', b.primaryColor);
          }
          if (b.primaryFont && b.primaryFont !== 'Inter') {
            const id = 'brand-font-link';
            let flink = document.getElementById(id) as HTMLLinkElement | null;
            const href = `https://fonts.googleapis.com/css2?family=${b.primaryFont.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
            if (!flink) { flink = document.createElement('link'); flink.id = id; flink.rel = 'stylesheet'; document.head.appendChild(flink); }
            flink.href = href;
            root.style.setProperty('--app-font', `'${b.primaryFont}'`);
            localStorage.setItem('brandFont', b.primaryFont);
          }
        }
      })
      .catch(() => {});
  }, []);
  return brand;
}
