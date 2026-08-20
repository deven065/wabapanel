/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageSquare, ArrowLeft, Calendar } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState<any>(null);
  const [biz, setBiz] = useState({ name: 'KKHS Media', logo: '' });

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => {
      if (d.success) setBiz({ name: d.data.business?.name || 'KKHS Media', logo: d.data.branding?.logo || '' });
    }).catch(() => {});
    if (slug) fetch(`${API}/public/blog/${slug}`).then(r => r.json()).then(d => { if (d.success) setPost(d.data); }).catch(() => {});
  }, [slug]);

  if (!post) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-gray-400">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5">
            {biz.logo ? <img src={biz.logo} alt={biz.name} className="h-8 w-auto" /> : (
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center"><MessageSquare className="w-5 h-5 text-white" /></div>
            )}
            <span className="text-lg font-bold text-gray-900">{biz.name}</span>
          </Link>
          <Link href="/auth/register" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-xl">Get Started</Link>
        </div>
      </nav>

      <article className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-6"><ArrowLeft className="w-4 h-4" /> All Posts</Link>

          {post.coverImage && (
            <div className="rounded-2xl overflow-hidden mb-8 aspect-[2/1]">
              <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
            </div>
          )}

          {post.tags?.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {post.tags.map((t: string) => <span key={t} className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">{t}</span>)}
            </div>
          )}

          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">{post.title}</h1>

          <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-8 border-b border-gray-100">
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>

          <div className="prose prose-lg prose-emerald max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>
      </article>

      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-400">
          © {new Date().getFullYear()} {biz.name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
