import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://wabapanel.com').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/features`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/team`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE}/knowledge-base`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/data-deletion`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/auth/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  type Doc = { slug?: string; updatedAt?: string; createdAt?: string };
  const dynamicUrls: MetadataRoute.Sitemap = [];

  try {
    const r = await fetch(`${SITE}/api/public/blog?limit=200`, { cache: 'no-store' });
    const d = await r.json();
    const posts: Doc[] = Array.isArray(d.data) ? d.data : [];
    posts.forEach((p) => {
      if (p.slug) dynamicUrls.push({
        url: `${SITE}/blog/${p.slug}`,
        lastModified: new Date(p.updatedAt || p.createdAt || Date.now()),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    });
  } catch { /* API unavailable at build time */ }

  try {
    const r = await fetch(`${SITE}/api/public/knowledge-base`, { cache: 'no-store' });
    const d = await r.json();
    const articles: Doc[] = Array.isArray(d.data) ? d.data : [];
    articles.forEach((a) => {
      if (a.slug) dynamicUrls.push({
        url: `${SITE}/knowledge-base/${a.slug}`,
        lastModified: new Date(a.updatedAt || a.createdAt || Date.now()),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    });
  } catch { /* API unavailable at build time */ }

  return [...staticPages, ...dynamicUrls];
}
