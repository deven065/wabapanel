'use client';
import React from 'react';
import GuideView, { GuideSection } from '@/components/layout/GuideView';
import useBranding from '@/lib/useBranding';

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    title: 'Admin Overview',
    intro: 'You are the platform owner/administrator of {app}. This guide covers running the whole platform.',
    items: [
      {
        q: 'What can I do as an admin?',
        a: [
          'As admin you manage the entire {app} platform: vendors (client accounts), their subscriptions and billing, payments and wallet, plans and pricing, coupons, taxes, gateways, branding, languages/currencies, AI settings, staff, support tickets and system health.',
          'The Admin Dashboard gives you a live overview: total vendors, revenue, active subscriptions, recent signups and system status.',
        ],
      },
      {
        q: 'Admin panel vs client panel — what’s the difference?',
        a: [
          'The client panel is what your vendors (customers) use to chat, run campaigns and sell. The admin panel is the control room for the whole business. Use “Back to Admin” / vendor login to move between them.',
        ],
      },
    ],
  },
  {
    id: 'vendors',
    title: 'Vendors & Subscriptions',
    intro: 'Vendors are your client accounts. Manage who can use {app} and on what plan.',
    items: [
      {
        q: 'How do I manage vendors (clients)?',
        a: [
          'Vendors lists every client account. From here you can view a vendor, see their usage, log in as them for support, suspend/activate them, and adjust their plan.',
        ],
      },
      {
        q: 'How do subscriptions and plans work?',
        a: [
          'Billing → Plans: define plans with feature limits and pricing. Billing → Subscriptions: see who’s on what plan and its status. Plan Reminders send automatic renewal/expiry notices to vendors.',
          'Feature access is driven by the plan — if a vendor can’t see a feature, it isn’t in their plan.',
        ],
      },
      {
        q: 'How do I handle payments, wallet and invoices?',
        a: [
          'Billing → Payments shows incoming payments. Wallet Ledger tracks vendor wallet top-ups and deductions. Billing & Invoices holds platform invoices. Taxes lets you set tax rates; the active default tax is applied to invoices.',
        ],
      },
      {
        q: 'How do coupons work?',
        a: [
          'Coupons lets you create discount codes (percentage or fixed, with limits/expiry) that vendors can apply at checkout to reduce their subscription cost.',
        ],
      },
    ],
  },
  {
    id: 'branding',
    title: 'Branding & White-Label',
    intro: 'Make {app} your own. Everything re-brands automatically from these settings.',
    items: [
      {
        q: 'How do I change the platform name, logo and colors?',
        a: [
          'Settings → Site Settings: set the app name, logo, favicon, login background, primary color and font. These apply across the whole platform instantly — including this User Guide, which shows your app name automatically.',
        ],
      },
      {
        q: 'Where do invoice company details and GST come from?',
        a: [
          'Admin → Settings → Invoice: set Company Name (blank = app name), Company Address, GSTIN/Tax ID, Phone, Billing Email and Footer note. The tax rate on invoices comes from the active default tax under Admin → Taxes.',
        ],
      },
      {
        q: 'How do I manage languages and currencies?',
        a: [
          'Settings → Languages: enable interface languages for vendors. Settings → Currencies: manage supported currencies and rates used across billing and invoices.',
        ],
      },
      {
        q: 'How do I edit the public website content?',
        a: [
          'Blog manages articles; Knowledge Base manages help articles shown publicly; Site Settings controls homepage/branding. Announcements pushes banners/notices to vendors inside the panel.',
        ],
      },
    ],
  },
  {
    id: 'gateways-ai',
    title: 'Gateways, AI & Integrations',
    intro: 'Connect the services that power payments and AI.',
    items: [
      {
        q: 'How do I set up payment gateways?',
        a: [
          'Settings → Gateway Setup: add your payment gateway credentials (e.g. keys/secrets). Once configured, vendors can collect payments and the platform can charge subscriptions.',
        ],
      },
      {
        q: 'What does AI Intelligence control?',
        a: [
          'Settings → AI Intelligence: configure the platform AI (provider/API key and defaults). This powers AI auto-reply, summaries and follow-ups available to vendors, according to their plan.',
        ],
      },
      {
        q: 'What is System Settings for?',
        a: [
          'Settings → System Settings holds global toggles and configuration (email/SMTP, limits, defaults, feature switches). Change carefully — these affect all vendors.',
        ],
      },
    ],
  },
  {
    id: 'staff',
    title: 'Staff & Permissions',
    intro: 'Add your team and control what they can access.',
    items: [
      {
        q: 'How do I add staff members and set permissions?',
        a: [
          'Settings → Staff & Members: invite admin staff. Settings → Permissions: control granular access per role/module so staff only see what they should.',
        ],
      },
    ],
  },
  {
    id: 'support-updates',
    title: 'Support, Updates & Health',
    intro: 'Keep the platform running and help your vendors.',
    items: [
      {
        q: 'How do I handle support tickets from vendors?',
        a: [
          'Support Tickets shows tickets raised by vendors. Open a ticket to read the thread, reply, change status (open / awaiting reply / answered / closed) and set priority.',
        ],
      },
      {
        q: 'What are Inquiries?',
        a: [
          'Inquiries collects contact/sales messages submitted from your public website so you can follow up with prospects.',
        ],
      },
      {
        q: 'How do updates and licensing work?',
        a: [
          'Panel Updates shows available platform updates. License & Updates manages your license key and applying new versions. Always back up before a major update.',
        ],
      },
      {
        q: 'How do I check system health?',
        a: [
          'System Health shows the status of core services (database, queues, integrations). Use it first when diagnosing a platform-wide issue.',
        ],
      },
      {
        q: 'Where are the API docs for clients?',
        a: [
          'Client API Docs documents the endpoints vendors can use to integrate {app} with their own systems (webhooks, sending messages, contacts, etc.).',
        ],
      },
    ],
  },
  {
    id: 'admin-troubleshooting',
    title: 'Troubleshooting (Admin)',
    intro: 'Common platform-level questions.',
    items: [
      {
        q: 'A vendor says a feature is missing.',
        a: [
          'Check their plan under Billing → Subscriptions and the plan’s feature limits under Billing → Plans. Enable the feature in their plan or move them to a higher plan. Also confirm their staff permissions if they use agents.',
        ],
      },
      {
        q: 'A vendor can’t connect WhatsApp / a channel.',
        a: [
          'For WhatsApp API, verify Meta credentials and gateway/webhook setup. For QR channels, the issue is usually the vendor’s linked phone losing internet — ask them to re-scan. Check System Health for integration errors.',
        ],
      },
      {
        q: 'Branding changes aren’t showing.',
        a: [
          'Ask users to hard-refresh (Ctrl+Shift+R) or Clear Cache from the top bar. Branding is cached per device for speed and refreshes on reload.',
        ],
      },
      {
        q: 'Payments aren’t working.',
        a: [
          'Recheck Gateway Setup credentials and that the gateway is active. Confirm the currency and tax configuration. Look at Billing → Payments logs for the specific error.',
        ],
      },
    ],
  },
];

export default function AdminUserGuidePage() {
  const app = useBranding().name || 'the platform';
  return (
    <GuideView
      app={app}
      heading="{app} Admin Guide"
      subheading="Run and white-label {app}, A to Z — search any topic below."
      sections={SECTIONS}
    />
  );
}
