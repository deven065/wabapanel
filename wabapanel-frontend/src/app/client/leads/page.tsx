'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { integrationApi } from '@/lib/api';
import { Search, RefreshCw, Users } from 'lucide-react';

interface LeadItem { _id: string; name: string; phone: string; email: string; tags: string[]; createdAt: string }

const SOURCE_LABELS: Record<string, string> = {
  indiamart: 'IndiaMART', justdial: 'Justdial', tradeindia: 'TradeIndia', exportersindia: 'ExportersIndia',
  '99acres': '99acres', magicbricks: 'MagicBricks', housing: 'Housing.com', olx: 'OLX', tagmango: 'TagMango',
  'google-lead-forms': 'Google Lead Forms', 'wordpress-forms': 'WordPress Forms', 'google-forms': 'Google Forms',
  typeform: 'Typeform', jotform: 'Jotform', 'landing-pages': 'Landing Page', flexifunnels: 'FlexiFunnels',
  website: 'Website', 'linkedin-ads': 'LinkedIn', 'twitter-ads': 'X Ads', leadsquared: 'LeadSquared',
  gohighlevel: 'GoHighLevel', facebook_lead: 'Facebook Lead Ads', 'facebook-leads': 'Facebook Lead Ads',
};

export default function AllLeadsPage() {
  const [items, setItems] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await integrationApi.allLeads({ page: p, limit: 25, search, source });
      setItems(r.data.data.items || []);
      setTotal(r.data.data.total || 0);
      setPage(r.data.data.page || 1);
      setPages(r.data.data.pages || 1);
    } catch { /* keep old data */ }
    setLoading(false);
  }, [search, source]);

  useEffect(() => { load(1); }, [load]);

  const sourceOf = (tags: string[]) => {
    const t = (tags || []).find(tag => tag !== 'lead' && SOURCE_LABELS[tag]) || (tags || []).find(tag => tag !== 'lead');
    return t ? (SOURCE_LABELS[t] || t) : '-';
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-emerald-600" /> All Leads</h1>
          <p className="text-sm text-gray-500">Leads from every connected source — IndiaMART, Facebook, website, and more ({total} total)</p>
        </div>
        <button onClick={() => load(page)} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={source} onChange={e => setSource(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'facebook-leads').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            No leads yet. Connect an integration and leads will appear here automatically.
            <div className="mt-3"><Link href="/client/integrations" className="text-emerald-600 hover:underline">Go to Integrations →</Link></div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(l => (
                <tr key={l._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{l.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{l.email || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs">{sourceOf(l.tags)}</span></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Prev</button>
          <span className="text-gray-500">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
