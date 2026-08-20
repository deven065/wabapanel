"use client";
import React, { useState, useEffect } from "react";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { platformApi } from "@/lib/api";
import toast from "react-hot-toast";

interface TMsg { sender: string; senderName: string; text: string; at: string; }
interface Ticket { _id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; messages: TMsg[]; createdAt: string; updatedAt: string; }

const statusColor: Record<string, string> = { open: "bg-blue-100 text-blue-700", awaiting_reply: "bg-amber-100 text-amber-700", answered: "bg-emerald-100 text-emerald-700", closed: "bg-gray-100 text-gray-500" };
const statusLabel: Record<string, string> = { open: "Open", awaiting_reply: "Awaiting reply", answered: "Answered", closed: "Closed" };

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Ticket | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "other", priority: "medium", message: "" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => platformApi.myTickets().then(r => {
    const data = r.data.data || [];
    setTickets(data);
    setActive(a => a ? data.find((t: Ticket) => t._id === a._id) || null : null);
  }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.subject.trim() || !form.message.trim()) { toast.error("Subject and message are required"); return; }
    setBusy(true);
    try {
      const r = await platformApi.createTicket(form);
      toast.success(r.data.message || "Ticket created");
      setShowForm(false); setForm({ subject: "", category: "other", priority: "medium", message: "" });
      load(); setActive(r.data.data);
    } catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setBusy(true);
    try { const r = await platformApi.replyTicket(active._id, reply.trim()); setActive(r.data.data); setReply(""); load(); }
    catch { toast.error("Failed to send reply"); }
    finally { setBusy(false); }
  };

  const closeTicket = async () => {
    if (!active) return;
    try { const r = await platformApi.closeTicket(active._id); setActive(r.data.data); load(); toast.success("Ticket closed"); }
    catch { toast.error("Failed"); }
  };

  const reopenTicket = async () => {
    if (!active) return;
    try { const r = await platformApi.reopenTicket(active._id); setActive(r.data.data); load(); toast.success("Ticket reopened"); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Support</h1><p className="text-sm text-gray-500 mt-1">Raise a ticket and our team will reply here</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Ticket</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Create Support Ticket</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1"><label className="text-xs text-gray-500 block mb-1">Subject *</label><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary of your issue" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Category</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="billing">Billing</option><option value="technical">Technical</option><option value="feature_request">Feature request</option><option value="account">Account</option><option value="other">Other</option></select></div>
            <div><label className="text-xs text-gray-500 block mb-1">Priority</label><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          </div>
          <div><label className="text-xs text-gray-500 block mb-1">Message *</label><textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={4} placeholder="Describe your issue in detail..." className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{busy ? "Creating..." : "Submit Ticket"}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border overflow-hidden lg:col-span-1 max-h-[65vh] overflow-y-auto">
          {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div> : tickets.length === 0 ? (
            <div className="text-center py-10"><LifeBuoy className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">No tickets yet</p></div>
          ) : tickets.map(t => (
            <button key={t._id} onClick={() => setActive(t)} className={`w-full text-left p-3 border-b hover:bg-gray-50 ${active?._id === t._id ? "bg-emerald-50/50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[t.status]}`}>{statusLabel[t.status]}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate mt-1">{t.subject}</p>
              <p className="text-xs text-gray-400">{new Date(t.updatedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border lg:col-span-2 flex flex-col max-h-[65vh]">
          {!active ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a ticket to view the conversation</div> : (
            <>
              <div className="p-4 border-b flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm">{active.subject}</h2>
                  <p className="text-xs text-gray-500">{active.ticketNumber} · {active.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[active.status]}`}>{statusLabel[active.status]}</span>
                  {active.status !== "closed" && <button onClick={closeTicket} className="text-xs px-2 py-1 border rounded-lg text-gray-600 hover:bg-gray-50">Close ticket</button>}
                  {active.status === "closed" && <button onClick={reopenTicket} className="text-xs px-2 py-1 border border-emerald-300 rounded-lg text-emerald-700 hover:bg-emerald-50">Reopen ticket</button>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages.map((m, i) => (
                  <div key={i} className={`max-w-[80%] rounded-xl p-3 text-sm ${m.sender === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.sender === "user" ? "text-emerald-100" : "text-gray-400"}`}>{m.sender === "admin" ? "Support team" : m.senderName} · {new Date(m.at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {active.status !== "closed" && (
                <div className="p-3 border-t flex gap-2">
                  <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Type your reply..." className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none" />
                  <button onClick={sendReply} disabled={busy || !reply.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 self-end"><Send className="w-4 h-4" /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
