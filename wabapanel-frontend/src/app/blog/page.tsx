/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, Search, Calendar, Menu, X } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface Post { _id: string; title: string; slug: string; excerpt: string; coverImage: string; tags: string[]; publishedAt: string; createdAt: string; }

export default function BlogPage() {
  const c = useSiteContent();
  const [posts, setPosts] = useState<Post[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '9' });
    fetch(`${API}/public/blog?${params}`).then(r => r.json()).then(d => {
      if (d.success) { setPosts(d.data); setTotalPages(d.pagination?.pages || 1); }
    }).catch(() => {});
  }, [page]);

  const biz = settings?.business || { name: 'KKHS Media' };
  const logo = settings?.branding?.logo;
  const filtered = search ? posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase())) : posts;

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

      {/* Header */}
      <section className="pt-32 md:pt-40 pb-12 px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4">Blog</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">Blog & <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">Resources</span></h1>
          <p className="text-lg text-gray-500 max-w-2xl mb-8">Stay updated with the latest tips, guides, and news about WhatsApp Business API and growth strategies.</p>
          <div className="max-w-md">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search articles..." value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none shadow-sm" />
            </div>
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(post => (
                <Link key={post._id} href={`/blog/${post.slug}`} className="group rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-xl hover:border-violet-200 transition-all duration-300 hover:-translate-y-1">
                  <div className="aspect-[16/9] bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center overflow-hidden">
                    {post.coverImage ? (
                      <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <MessageSquare className="w-10 h-10 text-violet-200" />
                    )}
                  </div>
                  <div className="p-5">
                    {post.tags?.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {post.tags.slice(0, 2).map(t => (
                          <span key={t} className="px-2 py-0.5 bg-violet-50 text-violet-600 text-xs font-medium rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                    <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-violet-600 transition-colors line-clamp-2">{post.title}</h2>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{post.excerpt}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <MessageSquare className="w-12 h-12 text-violet-200 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No blog posts yet. Check back soon!</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-violet-50 transition-colors">Previous</button>
              <span className="px-4 py-2 text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-violet-50 transition-colors">Next</button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-violet-600">Privacy</Link>
            <Link href="/terms" className="hover:text-violet-600">Terms</Link>
            <Link href="/about" className="hover:text-violet-600">About</Link>
            <Link href="/contact" className="hover:text-violet-600">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
