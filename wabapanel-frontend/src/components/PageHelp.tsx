'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';

// Route-based help guides. Shown via a floating "?" button on every client page.
const HELP: Record<string, { title: string; points: string[] }> = {
  '/client/dashboard': { title: 'Dashboard', points: [
    'Your business at a glance: chats, contacts, messages, orders and revenue.',
    'Use the quick links to jump into any module.',
    'Numbers update in real time as customers message you.',
  ]},
  '/client/analytics': { title: 'Analytics', points: [
    'Track message volume, delivery rates, and agent performance over time.',
    'Agent performance shows chats handled, response time, and resolutions per agent (last 30 days).',
    'Use these reports to find your busiest hours and best-performing campaigns.',
  ]},
  '/client/chat': { title: 'Inbox', points: [
    'All customer conversations from WhatsApp, Instagram, Facebook, Telegram, and Email in one place.',
    'Assign: give a chat to a specific agent. Use the checkbox icon for bulk actions.',
    'Schedule messages with the calendar icon, forward messages on hover, and send catalog products from the attach menu.',
    'Open/Closed filter: Open = active chats, Closed = resolved chats.',
  ]},
  '/client/contacts': { title: 'Contacts', points: [
    'Your customer directory. Import via CSV or add contacts manually.',
    'Click a contact to see their full activity timeline, notes, and tags.',
    'Use tags and custom data fields to organize customers for targeted campaigns.',
  ]},
  '/client/segments': { title: 'Segments', points: [
    'Dynamic groups of contacts based on rules (tags, fields, broadcast behavior).',
    'Segments auto-update: when a contact matches the rules, they join automatically.',
    'Retargeting: build segments like "received broadcast X but did not reply" and re-broadcast to them.',
  ]},
  '/client/templates': { title: 'Message Templates', points: [
    'WhatsApp requires pre-approved templates for messages sent outside the 24-hour window.',
    'Create a template here and submit it to Meta for approval (usually minutes to hours).',
    'Use variables like {{1}} for personalization, and add buttons, images, or carousels.',
  ]},
  '/client/broadcasts': { title: 'Broadcasts', points: [
    'Send an approved template to many contacts at once (a campaign).',
    'Choose recipients by segment, tags, or upload a list without saving contacts.',
    'A/B Testing: pick a second template and a split percentage — after sending, click the A/B button on the campaign to compare delivery, read, and reply rates.',
  ]},
  '/client/automations': { title: 'Automation', points: [
    'Set-and-forget workflows: welcome messages, keyword replies, cart recovery, round-robin chat routing.',
    'Owner Alerts: get WhatsApp notifications for orders, hot leads, complaints, and more — each alert has its own toggle.',
    'Round-Robin Routing distributes new chats evenly among your agents.',
  ]},
  '/client/bot-flows': { title: 'Bot Flow Builder', points: [
    'Build visual chatbots: drag nodes for messages, questions, conditions, and actions.',
    'Flow Analytics shows how many users reach each step and where they drop off.',
    'Connect flows to keywords or run them for every new conversation.',
  ]},
  '/client/pipelines': { title: 'Pipeline Board', points: [
    'A Kanban board for your sales process (e.g. Lead → Qualified → Won).',
    'New inbound chats are added to the first stage automatically; replying moves them to the second stage.',
    'Drag cards between stages as deals progress.',
  ]},
  '/client/agents': { title: 'Agents', points: [
    'Add team members who can log in and handle chats.',
    'Permissions: click the shield icon to control exactly which modules an agent can see (e.g. Inbox only, no Billing).',
    'Agents with no permissions selected get full access.',
  ]},
  '/client/teams': { title: 'Teams', points: [
    'Group agents into teams (e.g. Sales, Support) for organized chat assignment.',
    'Team performance is tracked in Analytics.',
  ]},
  '/client/integrations': { title: 'Integrations', points: [
    'Connect external tools: Google Sheets (auto-export leads), Google Calendar (auto-create events from appointments), payment gateways, Zapier, and more.',
    'Each card has its own setup guide — click to configure.',
  ]},
  '/client/catalogs': { title: 'Product Catalogs', points: [
    'Manage your product list and sync with Meta Commerce catalogs.',
    'Products can be sent directly in chats from the attach menu.',
  ]},
  '/client/orders': { title: 'Orders', points: [
    'Track customer orders, payment status, and fulfillment.',
    'Pending unpaid orders can trigger automatic cart-recovery reminders (see Automation).',
  ]},
  '/client/appointments': { title: 'Appointments', points: [
    'Bookings made by customers via chat, AI calls, or manually.',
    'Reminders are sent automatically 1 hour before; Google Calendar sync creates events if configured.',
  ]},
  '/client/tickets': { title: 'Tickets', points: [
    'Support tickets created from chats or by agents.',
    'Track status from Open to Resolved; owner alerts can notify you of new tickets.',
  ]},
  '/client/api-docs': { title: 'API & Developers', points: [
    'Full public REST API: send messages, manage contacts, campaigns, orders, and more.',
    'Authenticate with your API key in the X-API-Key header.',
    'Webhooks: subscribe to events (new message, order created, etc.) to receive real-time HTTP callbacks.',
  ]},
  '/client/forms': { title: 'Lead Gen Forms', points: [
    'Create WhatsApp Flows — native forms that open inside WhatsApp (no external link).',
    'Submissions are captured automatically and saved as leads.',
  ]},
  '/client/ctwa-ads': { title: 'CTWA Ads', points: [
    'Click-to-WhatsApp ads: track which Facebook/Instagram ads bring customers into your inbox.',
    'See cost, conversations, and conversions per ad.',
  ]},
  '/client/media-library': { title: 'Media Library', points: [
    'Central storage for images, videos, and documents used in messages and templates.',
  ]},
  '/client/wallet': { title: 'Wallet', points: [
    'Prepaid credits used for message sending and AI features.',
    'Top up here; every transaction is listed under Transactions.',
  ]},
  '/client/settings': { title: 'Settings', points: [
    'Workspace profile, password, API key, webhooks, and security (2FA).',
    'Enable Two-Factor Authentication under the Security tab for extra protection.',
  ]},
  '/client/ai-settings': { title: 'AI Settings', points: [
    'Configure the AI assistant: API key, model, features (auto-reply, summaries, sentiment).',
    'Add business information in Knowledge Base so the AI answers customer questions accurately.',
  ]},
  '/client/ai-calling': { title: 'AI Calling', points: [
    'The AI can make and receive voice calls: book appointments, capture leads, schedule callbacks.',
    'Configure the agent voice, greeting, and behavior here.',
  ]},
  '/client/knowledge-base': { title: 'Knowledge Base', points: [
    'Add facts about your business (products, prices, policies, FAQs).',
    'The AI uses this information when replying to customers.',
  ]},
};

export default function PageHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = pathname.split('?')[0];
  const help = HELP[base] || HELP[base.replace(/\/$/, '')];
  if (!help) return null;
  return (
    <>
      <button onClick={() => setOpen(!open)} title="Page guide"
        className="fixed bottom-5 right-5 z-40 w-10 h-10 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 flex items-center justify-center">
        <HelpCircle className="w-5 h-5" />
      </button>
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">How {help.title} works</h4>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <ul className="space-y-2">
            {help.points.map((p, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-2">
                <span className="text-emerald-600 mt-0.5">•</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
