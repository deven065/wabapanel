"use client";
import React, { useState, useEffect, useRef } from "react";
import { Bell, Search, ChevronDown, Wallet, Building2, RefreshCw, X, Globe } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useI18n, LANGUAGES } from "@/lib/i18n";
import api from "@/lib/api";
import PwaInstallButton from "@/components/PwaInstallButton";

interface Notification { _id: string; action: string; resource: string; details: string; createdAt: string; user?: { name: string }; }

export default function Header({ isAdmin }: { isAdmin?: boolean } = {}) {
  const { user, workspaces, currentWorkspace, switchWorkspace } = useAuthStore();
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { lang, setLang } = useI18n();
  const [showLang, setShowLang] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLang(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const loadNotifs = async () => {
    setNotifLoading(true);
    try {
      const r = await api.get("/audit-logs", { params: { limit: 20 } });
      setNotifs(r.data.data || []);
    } catch { setNotifs([]); }
    setNotifLoading(false);
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      if ("caches" in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
      if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
      localStorage.removeItem("next-cache");
      window.location.reload();
    } catch { window.location.reload(); }
  };

  return (
    <header className="h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" autoComplete="off" placeholder="Search..." className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-white text-sm transition-colors focus:bg-white dark:focus:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <PwaInstallButton />
        {!isAdmin && user?.role !== "super_admin" && user?.role !== "admin" && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-inset ring-emerald-600/10 rounded-full">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(user?.walletBalance || 0)}</span>
          </div>
        )}
        {!isAdmin && (
          <div className="relative" ref={langRef}>
            <button onClick={() => setShowLang(!showLang)} title="Change panel language"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">{(LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]).name}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {showLang && (
              <div className="absolute right-0 top-full mt-2 w-44 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 overflow-hidden py-1">
                {LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => { setLang(l.code); setShowLang(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${l.code === lang ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium" : "text-gray-700 dark:text-gray-200"}`}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={handleClearCache} disabled={clearing} title="Clear Cache & Reload" className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-emerald-600 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${clearing ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Clear Cache</span>
        </button>
        {!isAdmin && workspaces.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowWsDropdown(!showWsDropdown)} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm transition-colors">
              <Building2 className="w-4 h-4 text-gray-500" /><span className="hidden sm:inline max-w-[120px] truncate dark:text-gray-200">{currentWorkspace?.name || "Select"}</span><ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {showWsDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 overflow-hidden">
                {workspaces.map((ws) => (<button key={ws._id} onClick={() => { switchWorkspace(ws._id); setShowWsDropdown(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${ws._id === currentWorkspace?._id ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "text-gray-700 dark:text-gray-200"}`}>{ws.name}</button>))}
              </div>
            )}
          </div>
        )}
        {/* Notification Center */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => { setShowNotif(!showNotif); if (!showNotif) loadNotifs(); }} className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Bell className="w-5 h-5" />
            {notifs.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 overflow-hidden max-h-96 flex flex-col">
              <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h4>
                <button onClick={() => setShowNotif(false)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {notifLoading ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
                ) : notifs.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No recent activity</div>
                ) : (
                  notifs.map(n => (
                    <div key={n._id} className="px-3 py-2 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <p className="text-sm text-gray-700 dark:text-gray-200"><span className="font-medium">{n.user?.name || "System"}</span> {n.action} {n.resource && <span className="text-gray-500">({n.resource})</span>}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
