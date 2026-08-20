/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageSquare, ArrowLeft, Copy, Check } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function KnowledgeArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState<any>(null);
  const [biz, setBiz] = useState({ name: 'KKHS Media', logo: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => {
      if (d.success) setBiz({ name: d.data.business?.name || 'KKHS Media', logo: d.data.branding?.logo || '' });
    }).catch(() => {});
    if (slug) fetch(`${API}/public/knowledge/${slug}`).then(r => r.json()).then(d => { if (d.success) setArticle(d.data); }).catch(() => {});
  }, [slug]);

  const copyAll = () => {
    if (!article) return;
    const el = document.createElement('div');
    el.innerHTML = article.content;
    navigator.clipboard.writeText(el.textContent || el.innerText || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!article) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;

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
          <Link href="/knowledge-base" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-6"><ArrowLeft className="w-4 h-4" /> Knowledge Base</Link>

          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              {article.category && <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full capitalize mb-3 inline-block">{article.category}</span>}
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight">{article.title}</h1>
            </div>
            <button onClick={copyAll} className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-emerald-100 text-gray-600 hover:text-emerald-700 rounded-lg text-sm font-medium transition-colors" title="Copy all content">
              {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy All</>}
            </button>
          </div>

          {article.excerpt && <p className="text-lg text-gray-500 mb-8 pb-8 border-b border-gray-100">{article.excerpt}</p>}

          <div className="prose prose-lg prose-blue max-w-none" dangerouslySetInnerHTML={{ __html: article.content }} />

          {article.tags?.length > 0 && (
            <div className="mt-10 pt-6 border-t border-gray-100 flex gap-2 flex-wrap">
              {article.tags.map((t: string) => <span key={t} className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">{t}</span>)}
            </div>
          )}
        </div>
      </article>

      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-400">© {new Date().getFullYear()} {biz.name}. All rights reserved.</div>
      </footer>
    </div>
  );
}
