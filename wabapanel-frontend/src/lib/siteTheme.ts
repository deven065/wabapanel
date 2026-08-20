'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api';

export interface ThemeLayout { nav: string; hero: string; features: string; }
export interface SiteThemeData { id: string; name: string; font: string; layout: ThemeLayout; css: string; }

const DEFAULT: SiteThemeData = { id: 'royal-violet', name: 'Royal Violet', font: 'Inter', layout: { nav: 'floating', hero: 'centered', features: 'grid' }, css: '' };

let cached: SiteThemeData | null = null;
let cachedKey = '';
let pending: Promise<SiteThemeData> | null = null;

export function fetchSiteTheme(): Promise<SiteThemeData> {
  const preview = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('previewTheme') : null;
  const key = preview || 'active';
  if (cached && cachedKey === key) return Promise.resolve(cached);
  if (pending && cachedKey === key) return pending;
  cachedKey = key;
  const url = preview ? `${API}/public/site-theme?id=${encodeURIComponent(preview)}` : `${API}/public/site-theme?t=${Date.now()}`;
  pending = fetch(url, { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
      const t: SiteThemeData = d?.data ? { ...DEFAULT, ...d.data } : DEFAULT;
      cached = t;
      return t;
    })
    .catch(() => DEFAULT);
  return pending;
}

export function useSiteTheme(initial?: SiteThemeData): SiteThemeData {
  const [theme, setTheme] = useState<SiteThemeData>(cached || initial || DEFAULT);
  useEffect(() => { fetchSiteTheme().then(setTheme); }, []);
  return theme;
}
