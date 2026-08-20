"use client";
import React, { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Send, Search } from "lucide-react";
import { platformApi } from "@/lib/api";
import toast from "react-hot-toast";

interface TMsg { sender: string; senderName: string; text: string; at: string; }
interface Ticket { _id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; messages: TMsg[]; user?: { name?: string; email?: string; companyName?: string }; createdAt: string; updatedAt: string; }

const statusColor: Record<string, string> = { open: "bg-blue-100 text-blue-700", awaiting_reply: "bg-amber-100 text-amber-700", answered: "bg-emerald-100 text-emerald-700", closed: "bg-gray-100 text-gray-500" };
const prioColor: Record<string, string> = { low: "bg-gray-100 text-gray-600", medium: "bg-blue-100 text-blue-700", high: "bg-amber-100 text-amber-700", urgent: "bg-red-100 text-red-700" };

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    platformApi.adminTickets().then(r => {
      const data = r.data.data || [];
      setTickets(data);
      setActive(a => a ? data.find((t: Ticket) => t._id === a._id) || null : null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try { const r = await platformApi.adminReplyTicket(active._id, reply.trim()); setActive(r.data.data); setReply(""); toast.success("Reply sent"); load(); }
    catch { toast.error("Failed to send reply"); }
    finally { setSending(false); }
  };

  const setStatus = async (status: string) => {
    if (!active) return;
    try { const r = await platformApi.adminTicketStatus(active._id, status); setActive(r.data.data); load(); }
    catch { toast.error("Failed"); }
  };

  const stats = {
    open: tickets.filter(t => t.status === "open").length,
    awaiting_reply: tickets.filter(t => t.status === "awaiting_reply").length,
    answered: tickets.filter(t => t.status === "answered").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };
  const visibleTickets = tickets
    .filter(t => !filter || t.status === filter)
    .filter(t => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [t.subject, t.ticketNumber, t.user?.name, t.user?.email, t.user?.companyName].some(v => (v || "").toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1><p className="text-sm text-gray-500 mt-1">Vendor support requests — reply and manage status</p></div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject, #, customer…" className="border rounded-lg pl-8 pr-3 py-2 text-sm w-56" />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All statuses</option><option value="open">Open</option><option value="awaiting_reply">Awaiting reply</option><option value="answered">Answered</option><option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([["open","Open"],["awaiting_reply","Awaiting reply"],["answered","Answered"],["closed","Closed"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(filter === k ? "" : k)} className={`text-left rounded-xl border p-3 transition-all ${filter === k ? "ring-2 ring-emerald-400 border-emerald-300" : "hover:bg-gray-50"}`}>
            <p className="text-2xl font-bold text-gray-900">{stats[k]}</p>
            <p className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${statusColor[k]}`}>{lbl}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border overflow-hidden lg:col-span-1 max-h-[70vh] overflow-y-auto">
          {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div> : tickets.length === 0 ? (
            <div className="text-center py-10"><LifeBuoy className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">No tickets</p></div>
          ) : visibleTickets.length === 0 ? (
            <div className="text-center py-10"><Search className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">No matching tickets</p></div>
          ) : visibleTickets.map(t => (
            <button key={t._id} onClick={() => setActive(t)} className={`w-full text-left p-3 border-b hover:bg-gray-50 ${active?._id === t._id ? "bg-emerald-50/50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[t.status]}`}>{t.status.replace("_", " ")}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate mt-1">{t.subject}</p>
              <p className="text-xs text-gray-500 truncate">{t.user?.companyName || t.user?.name || t.user?.email} · <span className={`px-1.5 rounded ${prioColor[t.priority]}`}>{t.priority}</span></p>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border lg:col-span-2 flex flex-col max-h-[70vh]">
          {!active ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a ticket to view the conversation</div> : (
            <>
              <div className="p-4 border-b flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm">{active.subject}</h2>
                  <p className="text-xs text-gray-500">{active.ticketNumber} · {active.category} · from {active.user?.name || active.user?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[active.status]}`}>{active.status.replace("_", " ")}</span>
                  {active.status !== "closed" ? (
                    <button onClick={() => setStatus("closed")} className="text-xs px-2 py-1 border rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
                  ) : (
                    <button onClick={() => setStatus("open")} className="text-xs px-2 py-1 border rounded-lg text-gray-600 hover:bg-gray-50">Reopen</button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages.map((m, i) => (
                  <div key={i} className={`max-w-[80%] rounded-xl p-3 text-sm ${m.sender === "admin" ? "ml-auto bg-emerald-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.sender === "admin" ? "text-emerald-100" : "text-gray-400"}`}>{m.senderName} · {new Date(m.at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {active.status !== "closed" && (
                <div className="p-3 border-t flex gap-2">
                  <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Type your reply..." className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none" />
                  <button onClick={sendReply} disabled={sending || !reply.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 self-end"><Send className="w-4 h-4" /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
