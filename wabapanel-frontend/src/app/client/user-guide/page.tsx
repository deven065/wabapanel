'use client';
import React from 'react';
import GuideView, { GuideSection } from '@/components/layout/GuideView';
import useBranding from '@/lib/useBranding';

const SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    intro: 'The basics of logging in and finding your way around {app}.',
    items: [
      {
        q: 'What is {app} and what can I do with it?',
        a: [
          '{app} is an all-in-one customer communication and business platform. From a single inbox you can chat with customers on WhatsApp (official API and QR), WhatsApp QR, Telegram, Personal Telegram, Instagram, Facebook and Email.',
          'On top of messaging you get: automation flows and chatbots, AI auto-reply, broadcasts and campaigns, a sales pipeline (CRM), contacts and segments, lead-generation forms, product catalogs and orders, payment links, invoices/quotations, appointments, tickets, and detailed analytics.',
        ],
      },
      {
        q: 'How do I log in and switch language?',
        a: [
          'Open your {app} URL and sign in with the email and password given to you. If you forgot your password, use “Forgot password” on the login screen or ask your admin to reset it.',
          'Use the Language selector in the top bar to switch the interface language. Your choice is remembered on your device.',
        ],
      },
      {
        q: 'How is the screen organised?',
        a: [
          'Left sidebar = all the sections (Inbox, Contacts, Campaigns, Automation, etc.). Click a heading to expand its sub-items.',
          'Top bar = global search, wallet balance, language, theme, and your profile.',
          'Main area = the page you selected. Most list pages have their own search and filters at the top.',
        ],
      },
      {
        q: 'How do I install {app} as an app (PWA) on my phone or desktop?',
        a: [
          'Click “Install App” in the top bar (or your browser’s Install icon in the address bar). This adds {app} to your home screen / desktop so it opens like a native app with faster access and notifications.',
        ],
      },
    ],
  },
  {
    id: 'channels',
    title: 'Connecting Channels',
    intro: 'Connect the platforms you want to talk to customers on. Go to Channels in the sidebar.',
    items: [
      {
        q: 'WhatsApp (Official API) — how to connect?',
        a: [
          'This is the official WhatsApp Business Cloud API. Go to Channels → WhatsApp and follow the connect steps (you need a Meta Business account, a phone number not already on WhatsApp, and access token / phone number ID).',
          'Best for: verified green tick, approved message templates, unlimited broadcasts to opted-in customers, and no ban risk. Sending outside the 24-hour window requires an approved template.',
        ],
      },
      {
        q: 'WhatsApp by QR — how does it work and is it safe?',
        a: [
          'Channels → “WhatsApp by QR” → Connect → a QR code appears. On your phone open WhatsApp → Settings → Linked Devices → Link a Device → scan. Your number connects like WhatsApp Web and the session stays saved, so you don’t rescan every time.',
          'Use a secondary/business number. This is an unofficial connection (WhatsApp Web protocol), so a Number Warmer & Anti-Ban engine is built in: gradual daily limits (Day 1 ~25 msgs, rising over ~2 weeks), human-like random delays, typing indicator, and auto-pause if a ban/logout is detected.',
          'Safety rules: don’t bulk-message unknown numbers, don’t send the same text repeatedly, keep replying to real conversations. Real tappable buttons are not reliable on QR (they render as numbered options instead) — for approved templates and guaranteed buttons use the official WhatsApp API.',
        ],
      },
      {
        q: 'Telegram Bot — what is it for?',
        a: [
          'A public support/sales line on Telegram. Create a bot with @BotFather (send /newbot, pick a name, copy the token), paste the token in Channels → Telegram → Connect. {app} sets the webhook automatically.',
          'Share your bot link (t.me/your_bot) on your site/social. When customers message the bot it lands in your Telegram Inbox — your team, flows and AI reply from there. It’s free, no per-message charge and no ban risk (official Bot API). Note: the bot can’t message a customer first — the customer must start the chat.',
        ],
      },
      {
        q: 'Personal Telegram — how to connect with QR?',
        a: [
          'Channels → Personal Telegram → “Connect with QR” → a QR appears. On your phone open Telegram → Settings → Devices → Link Desktop Device → scan. If you have a 2FA password it will ask for it.',
          'This connects your own Telegram account (official Telegram API — no ban risk). Existing chats sync, you can message first, and flows/keywords/AI all work. The session auto-reconnects after restarts.',
        ],
      },
      {
        q: 'Instagram & Facebook — how to connect?',
        a: [
          'Channels → connect your Facebook Page and Instagram professional account via Meta login and grant messaging permissions. Incoming DMs/messages then appear in the Instagram Inbox and Facebook Inbox.',
          'Note: Meta only lets you reply within a 24-hour window after the customer’s last message (standard messaging policy).',
        ],
      },
      {
        q: 'Email — how to connect?',
        a: [
          'Channels → Email → enter your mailbox IMAP/SMTP settings (host, port, user, password/app-password). Incoming mail lands in the Email Inbox; you can reply, reply-all and forward from there. New emails are shown with full formatting.',
        ],
      },
      {
        q: 'A channel shows “Not connected” — what do I do?',
        a: [
          'When you open an inbox whose channel isn’t connected, a notice with a Connect button appears at the top of the conversation list. Click it to jump straight to that channel’s setup page.',
        ],
      },
    ],
  },
  {
    id: 'inbox',
    title: 'The Inbox & Chatting',
    intro: 'One shared inbox for every channel. Each channel has its own filtered inbox in the sidebar.',
    items: [
      {
        q: 'How do I send a new message?',
        a: [
          'Open the channel’s inbox and click “New Msg” (or “New Email” for email). Enter the number/recipient (with country code for WhatsApp/Telegram) and your message.',
          'On WhatsApp API, messaging a customer outside the 24-hour window needs an approved template. On QR/Telegram/Personal Telegram there is no window restriction and no per-message charge.',
        ],
      },
      {
        q: 'What do the toolbar buttons in a chat do?',
        a: [
          'Labels — tag the conversation. Pay — send a payment link. Notes — private internal notes. Search — find text in this chat. Export — download the chat (CSV/PDF/HTML). Chat AI — turn AI auto-reply on/off for this chat. Preset — send a saved preset message. Assign — hand the chat to a team member. Invoice — create & send an invoice/quotation PDF. Summary — AI summary of the conversation.',
          'These now work on WhatsApp, WhatsApp QR, Telegram, Personal Telegram, Instagram and Facebook. Templates are WhatsApp-API only; Call / AI Call show only where a phone number is available.',
        ],
      },
      {
        q: 'Can I send images, videos, documents and voice notes?',
        a: [
          'Yes — use the attachment/media button in the chat composer. Supported across WhatsApp, QR, Telegram, Instagram and Facebook (subject to each platform’s file rules).',
        ],
      },
      {
        q: 'How do presets and quick replies work?',
        a: [
          'Preset Templates (Save Money → Preset Templates) are reusable messages with text, media and buttons. Send them from the Preset button in a chat — free on QR/Telegram, no 24-hour restriction. On channels without real buttons, buttons are sent as numbered options and the customer replies with the number.',
          'Quick Replies (Automation → Quick Replies) are short canned answers you can insert while typing.',
        ],
      },
      {
        q: 'What is Assign and how does team collaboration work?',
        a: [
          'Assign hands a conversation to a specific agent so it’s clear who’s responsible. Use labels, notes and ticket status to coordinate. Agents only see what their permissions allow.',
        ],
      },
      {
        q: 'If I reload the page, do I stay on the same chat?',
        a: [
          'Yes. Reloading keeps you on the same channel inbox (e.g. Instagram) instead of jumping to the dashboard.',
        ],
      },
    ],
  },
  {
    id: 'automation',
    title: 'Automation, Bots & AI',
    intro: 'Automate replies so customers get instant responses 24/7. See the Automation section.',
    items: [
      {
        q: 'How do Bot Flows / the Flow Builder work?',
        a: [
          'Automation → Bot Flow Builder. Create a flow with a trigger (a keyword like “price”, or “first message” / “any message”) and then steps: send text, buttons/list, ask a question and save the answer, conditions (if/else), delays, add a tag, assign to a human, an AI step, send a payment link, book a slot, and more.',
          'When a matching message arrives on any connected channel, the flow runs automatically and replies on that same channel (with safety delays on QR). On channels without real buttons, options are shown as numbered choices.',
        ],
      },
      {
        q: 'How does AI auto-reply work?',
        a: [
          'Set up your AI in the Automation / AI settings: add an API key and give it your business context (products, FAQs, tone). Turn it on globally, or toggle “Chat AI” inside a specific conversation.',
          'When a customer messages and no flow/keyword matches (or an AI step is reached), the AI writes and sends a smart reply. If the AI is unsure or the customer asks for a human, the chat is handed off to an agent.',
        ],
      },
      {
        q: 'What are Keyword Triggers?',
        a: [
          'Automation → Keyword Triggers. Map a keyword to an automatic text/media reply. Simpler than a full flow — great for FAQs like “hours”, “location”, “price”.',
        ],
      },
      {
        q: 'What are Welcome and Out-of-Office messages?',
        a: [
          'Configure a Welcome message (sent on a customer’s first message) and an Out-of-Office message (sent outside your business hours) so no one is left waiting. These run on all connected channels.',
        ],
      },
      {
        q: 'What are AI Follow-ups?',
        a: [
          'Automation → AI Follow-ups automatically nudges leads who went quiet, with AI-written follow-up messages on a schedule you control.',
        ],
      },
    ],
  },
  {
    id: 'campaigns',
    title: 'Campaigns & Broadcasts',
    intro: 'Reach many customers at once. See Campaigns and Save Money.',
    items: [
      {
        q: 'How do I send a broadcast?',
        a: [
          'Campaigns → Broadcast. Choose your audience (a segment or tag), pick the message (an approved template on WhatsApp API), schedule or send now. Track delivered/read/replied in the report.',
          'On WhatsApp API, broadcasts to customers outside the 24-hour window must use approved templates. Avoid mass-messaging unknown numbers on QR — that’s the fastest way to get banned.',
        ],
      },
      {
        q: 'What are Message Templates and how do I get them approved?',
        a: [
          'Campaigns → Message Templates. Create a template (with variables, buttons, header/media) and submit it to WhatsApp for approval. Once approved you can use it in broadcasts and outside the 24-hour window. Templates are a WhatsApp-API feature.',
        ],
      },
      {
        q: 'What are Drip Campaigns and Preset Campaigns?',
        a: [
          'Drip Campaigns (Save Money → Drip) send a pre-planned sequence of messages over days/weeks automatically. Preset Campaigns send your saved preset messages to a chosen audience.',
        ],
      },
    ],
  },
  {
    id: 'crm',
    title: 'Contacts, Pipeline & Leads',
    intro: 'Your CRM — organise people and move deals forward.',
    items: [
      {
        q: 'How do I manage contacts, segments and tags?',
        a: [
          'Contacts → Contact Directory lists everyone. Import contacts via CSV (see Import Logs for results). Use Tags to label contacts and Segments to build dynamic groups (e.g. “paid customers”) for targeting.',
          'Data Fields let you add custom fields (e.g. city, plan) to store extra info per contact.',
        ],
      },
      {
        q: 'How does the Pipeline Board (CRM) work?',
        a: [
          'Pipeline Board is a drag-and-drop sales board. Create stages (e.g. New → Contacted → Won) and move deals/contacts between them. Conversations can auto-link to the pipeline so nothing slips.',
        ],
      },
      {
        q: 'How do I capture leads with forms and Facebook Leads?',
        a: [
          'Leads & Commerce → Lead Gen Forms: build a form, share its link/embed, and submissions become contacts automatically. Facebook Leads syncs lead-ad submissions straight into {app}.',
        ],
      },
    ],
  },
  {
    id: 'commerce',
    title: 'Payments, Invoices & Commerce',
    intro: 'Sell and get paid inside your chats.',
    items: [
      {
        q: 'How do payment links work?',
        a: [
          'Click Pay in any chat to create a payment link (UPI or gateway). The customer taps it to pay. Payment gateways are configured by your admin; UPI can be sent directly.',
        ],
      },
      {
        q: 'How do I send an invoice or quotation?',
        a: [
          'Click the Invoice button in a chat, add line items, tax and notes, and choose Invoice or Quotation. {app} generates a branded PDF and sends it on the current channel.',
          'Your company details (name, address, GSTIN/Tax ID, phone, billing email, footer) come from settings your admin controls; the tax rate comes from the active default tax.',
        ],
      },
      {
        q: 'What are Product Catalogs and Order Management?',
        a: [
          'Leads & Commerce → Product Catalogs lets you list products (name, price, image). Order Management tracks orders customers place. You can share catalog items in chats and flows.',
        ],
      },
      {
        q: 'What are Short Links?',
        a: [
          'Create trackable short links to share in messages so you can measure clicks.',
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account, Billing & Wallet',
    intro: 'Manage your subscription and spending.',
    items: [
      {
        q: 'What is the wallet balance in the top bar?',
        a: [
          'Your wallet funds usage-based charges (e.g. certain message/AI costs, depending on your plan). Top it up from the billing area; low-balance reminders keep you informed.',
        ],
      },
      {
        q: 'How do I see my plan and invoices?',
        a: [
          'Your subscription, plan limits and billing history are in the billing/account area. If a feature is locked, it’s not included in your current plan — upgrade or contact your admin.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & FAQs',
    intro: 'Quick fixes for the most common issues.',
    items: [
      {
        q: 'Messages are not arriving (WhatsApp QR).',
        a: [
          'Make sure the phone with the linked WhatsApp stays connected to the internet. In Channels → WhatsApp by QR click “Sync Messages”. If still stuck, Disconnect → Connect → re-scan the QR to refresh the session.',
          'Full old chat history only imports at the moment you scan the QR, so a fresh re-scan is the way to pull in past chats.',
        ],
      },
      {
        q: 'A message shows “Waiting for this message” on the recipient’s phone.',
        a: [
          'This is an encryption-sync hiccup on QR. It auto-recovers now, but if an old message is stuck, do Disconnect → Connect → re-scan to reset the encryption session.',
        ],
      },
      {
        q: 'Real tappable buttons don’t appear on WhatsApp QR.',
        a: [
          'WhatsApp blocks unofficial buttons on newer app versions, so on QR they’re sent as numbered options (“1. … 2. …”) which deliver reliably everywhere. The customer replies with the number to trigger the action. For guaranteed tappable buttons, use the official WhatsApp API channel.',
        ],
      },
      {
        q: 'Can I make WhatsApp voice/video calls from the panel?',
        a: [
          'No. The WhatsApp calling protocol isn’t available to any third-party tool. Call / AI Call buttons place a normal phone call through your configured voice provider, not a WhatsApp call.',
        ],
      },
      {
        q: 'My number got restricted/banned on QR — why?',
        a: [
          'QR uses an unofficial connection, so heavy or spammy sending (bulk to unknown numbers, repeated identical text, low reply rate) can get a number restricted. Keep the warm-up limits, message real conversations, and use the official API for large-scale sending.',
        ],
      },
      {
        q: 'A feature is greyed out or missing.',
        a: [
          'It’s likely not in your current plan, or your agent role doesn’t have permission. Ask your admin to enable it or upgrade your plan.',
        ],
      },
      {
        q: 'I still need help.',
        a: [
          'Open a Support ticket from the sidebar with a clear description and screenshots. Our team will respond there.',
        ],
      },
    ],
  },
];

export default function ClientUserGuidePage() {
  const app = useBranding().name || 'the platform';
  return (
    <GuideView
      app={app}
      heading="{app} User Guide"
      subheading="Everything you can do in {app}, A to Z — search any topic below."
      sections={SECTIONS}
    />
  );
}
