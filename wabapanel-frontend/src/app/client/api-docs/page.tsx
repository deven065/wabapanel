'use client';
import React, { useState, useEffect } from 'react';
import { Code2, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import AllEndpoints from '@/components/ApiEndpointsDocs';
import { workspaceApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '') + '/api/v1';

export default function ApiDocsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [wsId, setWsId] = useState('');

  useEffect(() => {
    const id = localStorage.getItem('workspaceId') || '';
    setWsId(id);
    if (id) workspaceApi.get(id).then(r => setApiKey(r.data.data?.apiKey || '')).catch(() => {});
  }, []);

  const generate = async () => {
    if (apiKey && !confirm('Your old key will stop working. Generate a new key?')) return;
    try {
      const r = await api.post(`/workspaces/${wsId}/api-key`);
      setApiKey(r.data.data.apiKey); setShowKey(true);
      toast.success('New API key generated');
    } catch { toast.error('Failed'); }
  };

  const KEY = apiKey || 'YOUR_API_KEY';
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Code2 className="w-6 h-6 text-emerald-600" /> API &amp; Developers</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Your API Key</h2>
        <div className="flex gap-2 items-center">
          <input readOnly type={showKey ? 'text' : 'password'} value={apiKey || 'No key yet — generate one'}
            className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono bg-gray-50" />
          <button onClick={() => setShowKey(!showKey)} className="p-2 text-gray-500 hover:text-gray-700">{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          {apiKey && <button onClick={() => { navigator.clipboard.writeText(apiKey); toast.success('Copied'); }} className="p-2 text-gray-500 hover:text-gray-700"><Copy className="w-4 h-4" /></button>}
          <button onClick={generate} className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
            <RefreshCw className="w-3.5 h-3.5" /> {apiKey ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">Send this header with every request: <code className="bg-gray-100 px-1 rounded">X-API-Key: {'{your key}'}</code> • Base URL: <code className="bg-gray-100 px-1 rounded">{BASE}</code></p>
      </div>

      <AllEndpoints KEY={KEY} />
    </div>
  );
}
