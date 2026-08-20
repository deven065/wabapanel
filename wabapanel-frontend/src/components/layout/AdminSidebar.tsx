'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import useBranding from '@/lib/useBranding';
import ThemePicker from './ThemePicker';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CreditCard, Receipt, Wallet, Users, User,
  FileText, Shield, Globe, Settings, Brain,
  Languages, DollarSign, Percent, Mail, ChevronDown, ChevronRight, Menu, X, LogOut,
  Store, Bell,
  Search, Key, Download, PenSquare, Ticket, Megaphone, LifeBuoy, Activity, BookOpen, ToggleRight, Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: { label: string; href: string; icon: React.ReactNode }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin/dashboard' },
  { label: 'Vendors', icon: <Store className="w-5 h-5" />, href: '/admin/vendors' },
  { label: 'Feature Controls', icon: <ToggleRight className="w-5 h-5" />, href: '/admin/features' },
  { label: 'Data Cleanup', icon: <Trash2 className="w-5 h-5" />, href: '/admin/data-cleanup' },
  {
    label: 'Accounting',
    icon: <Receipt className="w-5 h-5" />,
    children: [
      { label: 'Payments', href: '/admin/payments', icon: <Receipt className="w-4 h-4" /> },
      { label: 'Wallet Ledger', href: '/admin/wallet', icon: <Wallet className="w-4 h-4" /> },
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: <CreditCard className="w-4 h-4" /> },
      { label: 'Billing & Invoices', href: '/admin/billing', icon: <Receipt className="w-4 h-4" /> },
      { label: 'Taxes', href: '/admin/taxes', icon: <Percent className="w-4 h-4" /> },
      { label: 'Plan Reminders', href: '/admin/plan-reminders', icon: <Bell className="w-4 h-4" /> },
      { label: 'Plans', href: '/admin/plans', icon: <CreditCard className="w-4 h-4" /> },
    ],
  },
  { label: 'Inquiries', icon: <Mail className="w-5 h-5" />, href: '/admin/inquiries' },
  { label: 'Coupons', icon: <Ticket className="w-5 h-5" />, href: '/admin/coupons' },
  { label: 'Announcements', icon: <Megaphone className="w-5 h-5" />, href: '/admin/announcements' },
  { label: 'System Health', icon: <Activity className="w-5 h-5" />, href: '/admin/system' },
  { label: 'One Click Signup', icon: <FacebookIcon className="w-5 h-5 text-blue-600" />, href: '/admin/one-click-signup' },
  {
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    children: [
      { label: 'My Profile', href: '/admin/profile', icon: <User className="w-4 h-4" /> },
      { label: 'Site Settings', href: '/admin/site-settings', icon: <Globe className="w-4 h-4" /> },
      { label: 'Gateway Setup', href: '/admin/gateways', icon: <CreditCard className="w-4 h-4" /> },
      { label: 'System Settings', href: '/admin/settings', icon: <Settings className="w-4 h-4" /> },
      { label: 'AI Intelligence', href: '/admin/ai', icon: <Brain className="w-4 h-4" /> },
      { label: 'Permissions', href: '/admin/permissions', icon: <Shield className="w-4 h-4" /> },
      { label: 'Blog', href: '/admin/blog', icon: <PenSquare className="w-4 h-4" /> },
      { label: 'Knowledge Base', href: '/admin/knowledge', icon: <Brain className="w-4 h-4" /> },
      { label: 'Staff & Members', href: '/admin/users', icon: <Users className="w-4 h-4" /> },
      { label: 'Languages', href: '/admin/languages', icon: <Languages className="w-4 h-4" /> },
      { label: 'Currencies', href: '/admin/currencies', icon: <DollarSign className="w-4 h-4" /> },
    ],
  },
  { label: 'Client API Docs', icon: <FileText className="w-5 h-5" />, href: '/admin/api-docs' },
  { label: 'Panel Updates', icon: <Download className="w-5 h-5" />, href: '/admin/updates' },
  { label: 'License & Updates', icon: <Key className="w-5 h-5" />, href: '/admin/license' },
  { label: 'Support Tickets', icon: <LifeBuoy className="w-5 h-5" />, href: '/admin/support' },
  { label: 'User Guide', icon: <BookOpen className="w-5 h-5" />, href: '/admin/user-guide' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const { logout, user } = useAuthStore();

  const q = menuQuery.trim().toLowerCase();
  const filteredNav = !q
    ? navItems
    : navItems
        .map((sec) => ({
          ...sec,
          children: (sec.children || []).filter(
            (c) => c.label.toLowerCase().includes(q) || sec.label.toLowerCase().includes(q)
          ),
        }))
        .filter((sec) => sec.href ? sec.label.toLowerCase().includes(q) : (sec.children || []).length > 0);

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [label]
    );
  };

  const brand = useBranding();

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="relative flex items-center justify-center min-h-[3rem]">
          <div className="flex items-center justify-center min-w-0">{brand.logo ? <img src={brand.logo} alt={brand.name} className="max-w-full w-auto h-auto max-h-12 object-contain mx-auto" /> : <h1 className="text-xl font-bold text-emerald-600 truncate">{brand.name}</h1>}</div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <ThemePicker />
          </div>
        </div>
        
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            autoComplete="off" placeholder="Search menu..."
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white bg-gray-50 transition-colors"
          />
          {menuQuery && (
            <button onClick={() => setMenuQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {filteredNav.map((section) => (
          <div key={section.label} className="mb-1">
            {section.href ? (
              <Link
                href={section.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold tracking-wide rounded-xl transition-colors ${
                  pathname === section.href
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                {section.icon} {section.label}
              </Link>
            ) : (
              <>
                <button
                  onClick={() => toggleSection(section.label)}
                  className="flex items-center justify-between w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold text-gray-900 tracking-wide hover:bg-gray-100/70 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-2">{section.icon} {section.label}</span>
                  {expandedSections.includes(section.label) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {(q ? true : expandedSections.includes(section.label)) && section.children?.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 pl-3 pr-4 py-1.5 mr-2 text-[13px] font-bold border-l-2 ml-5 rounded-r-xl transition-colors ${
                      pathname === item.href
                        ? 'text-emerald-600 bg-emerald-50 border-l-emerald-600 shadow-sm shadow-emerald-600/5'
                        : 'text-gray-500 border-l-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-l-gray-400'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/profile" className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-gray-50" title="My Profile">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </Link>
          <button onClick={logout} className="text-gray-400 hover:text-red-600" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 shadow-[1px_0_8px_rgba(0,0,0,0.03)] transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>
    </>
  );
}
