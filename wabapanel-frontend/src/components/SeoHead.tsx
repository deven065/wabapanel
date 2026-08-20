/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function SeoHead() {
  useEffect(() => {
    fetch(`${API}/public/site-content?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const seo = d?.data?.seo;
        if (!seo) return;
        if (seo.metaTitle) document.title = seo.metaTitle;
        const setMeta = (name: string, content: string, attr = 'name') => {
          if (!content) return;
          let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
          if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
          el.setAttribute('content', content);
        };
        setMeta('description', seo.metaDescription);
        setMeta('keywords', seo.keywords);
        setMeta('og:image', seo.ogImage, 'property');
        setMeta('google-site-verification', seo.googleSiteVerification);
        setMeta('msvalidate.01', seo.bingSiteVerification);
        if (seo.googleAnalyticsId && !document.getElementById('ga-script')) {
          const s = document.createElement('script');
          s.id = 'ga-script'; s.async = true;
          s.src = `https://www.googletagmanager.com/gtag/js?id=${seo.googleAnalyticsId}`;
          document.head.appendChild(s);
          const inline = document.createElement('script');
          inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${seo.googleAnalyticsId}');`;
          document.head.appendChild(inline);
        }
        if (seo.googleTagManagerId && !document.getElementById('gtm-script')) {
          const s = document.createElement('script');
          s.id = 'gtm-script';
          s.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${seo.googleTagManagerId}');`;
          document.head.appendChild(s);
        }
        if (seo.facebookPixelId && !document.getElementById('fb-pixel')) {
          const s = document.createElement('script');
          s.id = 'fb-pixel';
          s.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${seo.facebookPixelId}');fbq('track','PageView');`;
          document.head.appendChild(s);
        }
        if (seo.customHeadCode && !document.getElementById('custom-head-code')) {
          const div = document.createElement('div');
          div.innerHTML = seo.customHeadCode;
          const holder = document.createElement('div');
          holder.id = 'custom-head-code'; holder.style.display = 'none';
          document.body.appendChild(holder);
          Array.from(div.childNodes).forEach(node => {
            if (node.nodeName === 'SCRIPT') {
              const sc = document.createElement('script');
              const orig = node as HTMLScriptElement;
              if (orig.src) sc.src = orig.src; else sc.textContent = orig.textContent;
              document.head.appendChild(sc);
            } else {
              document.head.appendChild(node);
            }
          });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
