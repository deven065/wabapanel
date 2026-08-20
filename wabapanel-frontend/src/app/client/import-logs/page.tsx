"use client";
import React, { useState, useEffect } from "react";

interface ImportLog {
  _id: string;
  fileName: string;
  totalRows: number;
  imported: number;
  failed: number;
  status: string;
  createdAt: string;
}

export default function ImportLogsPage() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://api.wabapanel.com/api"}/contacts/import-logs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.data) ? data.data : [];
          setLogs(items.filter((item: Record<string, unknown>) => item.fileName || item.totalRows));
        } else {
          setLogs([]);
        }
      } catch { setLogs([]); } finally { setLoading(false); }
    };
    fetchLogs();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Logs</h1>
          <p className="text-sm text-gray-500 mt-1">View history of contact imports</p>
        </div>
        <a href="/client/contacts" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Import Contacts</a>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {logs.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Import History</h3>
            <p className="text-gray-500 mb-4">Import contacts from the Contacts page to see logs here.</p>
            <a href="/client/contacts" className="text-emerald-600 hover:text-emerald-700 font-medium">Go to Contacts &rarr;</a>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imported</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr></thead>
            <tbody className="divide-y">
              {logs.map(log => (
                <tr key={log._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{log.fileName}</td>
                  <td className="px-6 py-4">{log.totalRows}</td>
                  <td className="px-6 py-4 text-emerald-600">{log.imported}</td>
                  <td className="px-6 py-4 text-red-600">{log.failed}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${log.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-yellow-100 text-yellow-800"}`}>{log.status}</span></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(log.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
