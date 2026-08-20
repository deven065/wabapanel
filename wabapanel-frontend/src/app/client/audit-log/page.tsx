"use client";
import React, { useState, useEffect } from "react";
import { Shield, User, Clock } from "lucide-react";
import { auditLogApi } from "@/lib/api";

interface LogEntry { _id: string; action: string; resource: string; resourceId: string; details: string; ip: string; user?: { name: string; email: string }; createdAt: string; }

export default function AuditLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    auditLogApi.list({ page, limit: 50 }).then(r => { setLogs(r.data.data || []); setTotal(r.data.total || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="page-hero"><div><h1 className="text-2xl font-bold text-gray-900">Audit Log</h1><p className="text-sm text-gray-500 mt-1">Track all actions performed in your account</p></div></div>
      {logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border"><Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No activity logged yet</p></div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {logs.map(log => (
            <div key={log._id} className="p-4 flex items-start gap-3 hover:bg-gray-50">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-gray-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm"><span className="font-medium text-gray-900">{log.user?.name || "System"}</span> <span className="text-gray-600">{log.action}</span> {log.resource && <span className="text-gray-500">on {log.resource}</span>}</p>
                {log.details && <p className="text-xs text-gray-400 mt-0.5">{log.details}</p>}
              </div>
              <div className="text-right shrink-0"><p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(log.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>{log.ip && <p className="text-[10px] text-gray-300">{log.ip}</p>}</div>
            </div>
          ))}
          {total > 50 && (
            <div className="p-3 flex items-center justify-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Previous</button>
              <span className="text-sm text-gray-500">Page {page}</span>
              <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
