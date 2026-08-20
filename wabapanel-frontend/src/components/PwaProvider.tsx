'use client';
import { useEffect } from 'react';

export default function PwaProvider() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const handler = (e: Event) => {
      e.preventDefault();
      (window as unknown as { deferredPwaPrompt?: Event }).deferredPwaPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-installable'));
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  return null;
}
