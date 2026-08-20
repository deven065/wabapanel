'use client';
import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, BookOpen } from 'lucide-react';

export interface GuideItem {
  q: string;        // question / topic title
  a: string[];      // answer paragraphs / steps (plain text, {app} placeholder allowed)
}
export interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  items: GuideItem[];
}

function fill(text: string, app: string) {
  return text.replace(/\{app\}/g, app);
}

export default function GuideView({
  app,
  heading,
  subheading,
  sections,
}: {
  app: string;
  heading: string;
  subheading: string;
  sections: GuideSection[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (it) =>
            it.q.toLowerCase().includes(q) ||
            it.a.some((p) => p.toLowerCase().includes(q)) ||
            s.title.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [q, sections]);

  const totalMatches = filtered.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fill(heading, app)}</h1>
          <p className="text-sm text-gray-500">{fill(subheading, app)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur py-3 -mx-1 px-1">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide — e.g. connect WhatsApp, invoice, ban, refund, flow…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
          />
        </div>
        {q && (
          <p className="text-xs text-gray-500 mt-1.5 px-1">
            {totalMatches} result{totalMatches === 1 ? '' : 's'} for “{query}”
          </p>
        )}
      </div>

      {/* Quick nav (only when not searching) */}
      {!q && (
        <div className="flex flex-wrap gap-2 my-4">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700"
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No results found. Try another keyword, or open a Support ticket.
        </div>
      )}

      <div className="space-y-8 mt-2">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{s.title}</h2>
            {s.intro && <p className="text-sm text-gray-500 mb-3">{fill(s.intro, app)}</p>}
            <div className="space-y-2">
              {s.items.map((it, i) => {
                const key = `${s.id}-${i}`;
                const isOpen = !!open[key] || !!q;
                return (
                  <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-gray-800">{fill(it.q, app)}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-0 space-y-2 border-t border-gray-100">
                        {it.a.map((p, j) => (
                          <p key={j} className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mt-2 first:mt-3">
                            {fill(p, app)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-12">
        Still stuck? Open a <b>Support</b> ticket from the sidebar and our team will help you out.
      </p>
    </div>
  );
}
