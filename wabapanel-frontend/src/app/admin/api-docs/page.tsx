'use client';
import React from 'react';
import { Code2 } from 'lucide-react';
import AllEndpoints from '@/components/ApiEndpointsDocs';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '') + '/api/v1';

export default function AdminApiDocsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Code2 className="w-6 h-6 text-emerald-600" /> Client API Documentation</h1>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-bold">Each client (workspace) has its own separate API key.</p>
        <p>• Clients generate their own key: Client Panel → Settings → API &amp; Developers</p>
        <p>• Auth: send the <code className="bg-blue-100 px-1 rounded">X-API-Key</code> header with every request • Base URL: <code className="bg-blue-100 px-1 rounded">{BASE}</code></p>
        <p>• You can share this documentation with clients — ideal for panel resale</p>
      </div>
      <AllEndpoints KEY="CLIENT_API_KEY" />
    </div>
  );
}
