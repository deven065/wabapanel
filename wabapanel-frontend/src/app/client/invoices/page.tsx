"use client";
import React, { useState, useEffect } from "react";
import { FileText, CreditCard, Download, Mail, Trash2 } from "lucide-react";
import { invoiceApi, paymentApi } from "@/lib/api";
import toast from "react-hot-toast";

interface InvoiceItem { _id: string; invoiceNumber: string; contact?: { name: string; phone: string }; items: { name: string; quantity: number; price: number }[]; total: number; status: string; dueDate: string; createdAt: string; }
interface SubInvoice { _id: string; source?: string; invoiceNumber: string; planName: string; amount: number; currency: string; interval: string; status: string; assignedBy?: string; gateway?: string; startDate?: string; endDate?: string; createdAt: string; }

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subSelected, setSubSelected] = useState<string[]>([]);
  const [subSending, setSubSending] = useState(false);

  const load = async () => { try { const r = await invoiceApi.list(); setInvoices(r.data.data || []); setSubscriptions(r.data.subscriptions || []); } catch { /* */ } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const toggleOne = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(p => p.length === invoices.length ? [] : invoices.map(i => i._id));

  const downloadInvoicePdf = async (id: string, num: string) => {
    try {
      const res = await invoiceApi.downloadPdf(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `invoice-${num}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download invoice"); }
  };

  const emailOne = async (id: string) => {
    try { const r = await invoiceApi.email(id); toast.success(r.data.message || "Invoice emailed"); }
    catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to email invoice"); }
  };

  const emailSelected = async () => {
    if (!selected.length) return;
    setSending(true);
    try { const r = await invoiceApi.emailBulk(selected); toast.success(r.data.message || "Invoices emailed"); setSelected([]); }
    catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to email invoices"); }
    finally { setSending(false); }
  };

  const deleteSelected = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} invoice(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(selected.map(id => invoiceApi.delete(id).catch(() => null)));
      toast.success("Invoice(s) deleted");
      setSelected([]);
      load();
    } catch { toast.error("Failed to delete invoices"); }
    finally { setDeleting(false); }
  };

  const emailableSubs = subscriptions.filter(s => s.source === "payment" && s.status === "completed");
  const toggleSub = (id: string) => setSubSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAllSubs = () => setSubSelected(p => p.length === emailableSubs.length ? [] : emailableSubs.map(s => s._id));

  const emailSubs = async (ids: string[]) => {
    if (!ids.length) return;
    setSubSending(true);
    try { const r = await invoiceApi.emailSubBulk(ids); toast.success(r.data.message || "Invoice emailed"); setSubSelected([]); }
    catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to email invoice"); }
    finally { setSubSending(false); }
  };

  const statusColor = (s: string) => (s === "paid" || s === "active" || s === "completed") ? "bg-emerald-100 text-emerald-700" : (s === "pending") ? "bg-amber-100 text-amber-700" : (s === "expired" || s === "cancelled" || s === "failed") ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600";

  const markPaid = async (id: string) => { try { await invoiceApi.update(id, { status: "paid" }); toast.success("Marked paid"); load(); } catch { toast.error("Failed"); } };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString() : "—";

  const downloadSubInvoice = async (id: string) => {
    try {
      const res = await paymentApi.downloadInvoice(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `invoice-${id.slice(-8).toUpperCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Invoice available only for completed payments"); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="page-hero"><div><h1 className="text-2xl font-bold text-gray-900">Invoices</h1><p className="text-sm text-gray-500 mt-1">Your subscription billing and order invoices</p></div></div>

      {/* Subscription & Plan billing */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-800">Subscription &amp; Plan</h2>
          </div>
          {subSelected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{subSelected.length} selected</span>
              <button onClick={() => emailSubs(subSelected)} disabled={subSending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Mail className="w-3.5 h-3.5" /> {subSending ? "Sending..." : "Send Email"}
              </button>
              <button onClick={() => setSubSelected([])} className="text-xs text-gray-500 hover:underline">Clear</button>
            </div>
          )}
        </div>
        {subscriptions.length === 0 ? (
          <div className="text-center py-10"><p className="text-gray-500 text-sm">No active subscription</p><p className="text-xs text-gray-400 mt-1">Pick a plan on the Subscription &amp; Plans page.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="px-4 py-3 w-10">{emailableSubs.length > 0 && <input type="checkbox" checked={subSelected.length === emailableSubs.length && emailableSubs.length > 0} onChange={toggleAllSubs} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Billing</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {subscriptions.map(s => {
                const canInvoice = s.source === "payment" && s.status === "completed";
                return (
                <tr key={s._id} className={`hover:bg-gray-50 ${subSelected.includes(s._id) ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-4 py-3">{canInvoice && <input type="checkbox" checked={subSelected.includes(s._id)} onChange={() => toggleSub(s._id)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />}</td>
                  <td className="px-4 py-3 font-medium">{s.invoiceNumber}</td>
                  <td className="px-4 py-3">{s.planName}<br/><span className="text-xs text-gray-400 capitalize">{s.interval}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500 capitalize">{s.gateway === "manual" ? "Assigned by admin" : (s.gateway || "—")}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(s.startDate)} {s.endDate ? "– " + fmtDate(s.endDate) : ""}</td>
                  <td className="px-4 py-3 text-right font-semibold">{s.currency === "INR" ? "Rs." : s.currency + " "}{s.amount}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>{s.status}</span></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{canInvoice ? (
                    <>
                      <button onClick={() => downloadSubInvoice(s._id)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-emerald-600 mr-3"><Download className="w-3.5 h-3.5" /> Download</button>
                      <button onClick={() => emailSubs([s._id])} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-emerald-600"><Mail className="w-3.5 h-3.5" /> Email</button>
                    </>
                  ) : <span className="text-gray-300 text-xs">—</span>}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Order invoices */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-800">Order Invoices</h2>
          </div>
          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{selected.length} selected</span>
              <button onClick={emailSelected} disabled={sending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Mail className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send Email"}
              </button>
              <button onClick={deleteSelected} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete"}
              </button>
              <button onClick={() => setSelected([])} className="text-xs text-gray-500 hover:underline">Clear</button>
            </div>
          )}
        </div>
        {invoices.length === 0 ? (
          <div className="text-center py-10"><p className="text-gray-500 text-sm">No order invoices yet</p><p className="text-xs text-gray-400 mt-1">Invoices are auto-created from orders. Go to Orders and create one first.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={selected.length === invoices.length && invoices.length > 0} onChange={toggleAll} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Items</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {invoices.map(inv => (
                <tr key={inv._id} className={`hover:bg-gray-50 ${selected.includes(inv._id) ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(inv._id)} onChange={() => toggleOne(inv._id)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></td>
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{inv.contact?.name || "—"}<br/><span className="text-xs text-gray-400">{inv.contact?.phone || ""}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inv.items.map(i => i.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">Rs.{inv.total}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(inv.status)}`}>{inv.status}</span></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {inv.status !== "paid" && <button onClick={() => markPaid(inv._id)} className="text-xs text-emerald-600 hover:underline mr-3">Mark Paid</button>}
                    <button onClick={() => downloadInvoicePdf(inv._id, inv.invoiceNumber)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-emerald-600 mr-3"><Download className="w-3.5 h-3.5" /> Download</button>
                    <button onClick={() => emailOne(inv._id)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-emerald-600"><Mail className="w-3.5 h-3.5" /> Email</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
