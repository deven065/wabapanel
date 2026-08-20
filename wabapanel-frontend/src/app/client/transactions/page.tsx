"use client";
import React, { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { paymentApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Transaction { _id: string; amount: number; currency: string; gateway: string; status: string; plan: string | { name?: string }; type: string; createdAt: string; }

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const fetchTransactions = async () => {
    try {
      const res = await paymentApi.getHistory();
      setTransactions(res.data.data || res.data || []);
    } catch { /* empty */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const toggleOne = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const allSelected = transactions.length > 0 && selected.length === transactions.length;
  const toggleAll = () => setSelected(allSelected ? [] : transactions.map(t => t._id));

  const deleteSelected = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} transaction record(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(selected.map(id => paymentApi.deleteHistory(id).catch(() => null)));
      toast.success("Transaction(s) deleted");
      setSelected([]);
      fetchTransactions();
    } catch { toast.error("Failed to delete transactions"); }
    finally { setDeleting(false); }
  };

  const statusColors: Record<string, string> = { completed: "bg-emerald-100 text-emerald-800", pending: "bg-yellow-100 text-yellow-800", failed: "bg-red-100 text-red-800", refunded: "bg-blue-100 text-blue-800" };

  const planLabel = (p: Transaction["plan"]) => (p && typeof p === "object" ? p.name : p) || "-";

  const downloadInvoice = async (id: string) => {
    try {
      const res = await paymentApi.downloadInvoice(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id.slice(-8).toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* empty */ }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="p-6">
      <div className="page-hero">
      <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Transactions</h1>
      <p className="text-sm text-gray-500 mb-6">View your payment transaction history</p>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="text-2xl font-bold mt-1">{transactions.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total Spent</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">&#8377;{transactions.filter(t => t.status === "completed").reduce((s, t) => s + (t.amount || 0), 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{transactions.filter(t => t.status === "completed").length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{transactions.filter(t => t.status === "pending").length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        {selected.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-b bg-red-50">
            <span className="text-sm font-medium text-red-800">{selected.length} selected</span>
            <div className="flex items-center gap-3">
              <button onClick={deleteSelected} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
              </button>
              <button onClick={() => setSelected([])} className="text-xs text-gray-500 hover:underline">Clear</button>
            </div>
          </div>
        )}
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No transactions yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="px-6 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gateway</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoice</th>
            </tr></thead>
            <tbody className="divide-y">{transactions.map(t => (
              <tr key={t._id} className={`hover:bg-gray-50 ${selected.includes(t._id) ? "bg-red-50/40" : ""}`}>
                <td className="px-6 py-4"><input type="checkbox" checked={selected.includes(t._id)} onChange={() => toggleOne(t._id)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></td>
                <td className="px-6 py-4 text-sm">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm capitalize">{t.type || "subscription"}</td>
                <td className="px-6 py-4 text-sm">{planLabel(t.plan)}</td>
                <td className="px-6 py-4 text-sm capitalize">{t.gateway || "-"}</td>
                <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${statusColors[t.status] || "bg-gray-100"}`}>{t.status}</span></td>
                <td className="px-6 py-4 text-right font-medium">&#8377;{(t.amount || 0).toFixed(2)}</td>
                <td className="px-6 py-4 text-right">{t.status === "completed" ? (
                  <button onClick={() => downloadInvoice(t._id)} className="text-emerald-600 hover:text-emerald-800 text-sm font-medium">Download</button>
                ) : <span className="text-gray-300 text-sm">-</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
