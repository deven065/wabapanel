// Comprehensive, branding-aware "AI Master Guide" content for the public
// Knowledge Base. One place → rendered on screen (searchable), copied to
// clipboard for AI training, and exported to PDF.

export interface Biz {
  name: string;
  email?: string;
  url?: string;
  phone?: string;
  address?: string;
  tagline?: string;
}

export interface GItem { q: string; a: string[]; }
export interface GSection { id: string; title: string; items: GItem[]; }

function fill(t: string, b: Biz): string {
  return t
    .replace(/\{app\}/g, b.name || 'the platform')
    .replace(/\{email\}/g, b.email || 'our support email')
    .replace(/\{website\}/g, b.url || 'our website')
    .replace(/\{phone\}/g, b.phone || 'our support number')
    .replace(/\{address\}/g, b.address || '');
}

const RAW: GSection[] = [
  {
    id: 'about',
    title: '1. About {app} (Sales Overview)',
    items: [
      { q: 'What is {app}?', a: [
        '{app} is an all-in-one customer communication and business platform. From one shared inbox you talk to customers on WhatsApp (official Cloud API), WhatsApp by QR, Telegram Bot, Personal Telegram, Instagram, Facebook and Email.',
        'It also includes automation flows and chatbots, AI auto-reply, broadcasts and drip campaigns, a sales pipeline (CRM), contacts/segments/tags, lead-generation forms, product catalogs and orders, payment links, invoices and quotations, appointments, events, support tickets, analytics and full white-label branding.' ] },
      { q: 'Who is {app} for?', a: [
        'SMBs, agencies, e-commerce sellers, coaching/education, real estate, clinics, restaurants, travel, and any team doing sales or support over chat that wants one inbox with automation and AI.' ] },
      { q: 'Why choose {app} over other tools?', a: [
        'One inbox for every channel; official WhatsApp API plus an unofficial QR option with a built-in Anti-Ban/Number-Warmer engine; no-code automation and AI; payments, invoices and a full CRM inside chats; and complete white-label branding.',
        'Contact: {email} · {website}. {address}' ] },
      { q: 'How is {app} priced?', a: [
        'Access is plan-based (subscriptions). Each plan unlocks features and limits. Some usage (certain messages/AI) can draw from a prepaid wallet. Exact plans, prices and coupons are set by the provider — see the pricing page or contact {email}.' ] },
      { q: 'Is there a free trial?', a: [
        'A free/trial plan may be offered via “Get Started Free”. Available plans and trial length are configured by the provider; check the pricing page.' ] },
      { q: 'Is {app} white-label?', a: [
        'Yes. The provider can set the platform name, logo, favicon, colors, fonts, domain and company details, so the whole product (including this guide and its PDF) shows their brand automatically.' ] },
    ],
  },
  {
    id: 'getting-started',
    title: '2. Getting Started & Navigation',
    items: [
      { q: 'How do I log in?', a: [
        'Open your {app} URL and sign in with your email and password. Use “Forgot password” to reset, or ask your admin. New businesses can self-register via “Get Started Free” if enabled.' ] },
      { q: 'How is the screen organised?', a: [
        'Left sidebar = all sections (Inbox, Contacts, Campaigns, Automation, Commerce, Support, User Guide, etc.); click a heading to expand it. Top bar = global search, wallet balance, language, theme and your profile. Main area = the selected page, most with their own search/filters.' ] },
      { q: 'How do I change the interface language?', a: [
        'Use the Language selector in the top bar. Your choice is saved on your device. Admins enable which languages are available.' ] },
      { q: 'How do I switch theme / colors?', a: [
        'Use the theme picker in the top bar for light/accent options. Platform-wide branding colors are controlled by the admin under Site Settings.' ] },
      { q: 'Where is the built-in User Guide?', a: [
        'Both the client and admin panels have a “User Guide” item at the bottom of the sidebar (under Support) with a searchable A-Z help centre that always shows your branded app name.' ] },
    ],
  },
  {
    id: 'setup',
    title: '3. Setup Guide — Connecting Channels',
    items: [
      { q: 'How to connect WhatsApp Official API?', a: [
        'Channels → WhatsApp. You need a Meta Business account, a phone number not currently active on WhatsApp, and API access (access token + phone number ID). Follow the connect steps and verify.',
        'Best for: verified green tick, approved templates, unlimited broadcasts to opted-in users, guaranteed tappable buttons, and zero ban risk. Messaging outside the 24-hour customer window requires an approved template.' ] },
      { q: 'How to connect WhatsApp by QR?', a: [
        'Channels → “WhatsApp by QR” → Connect → a QR appears. On the phone: WhatsApp → Settings → Linked Devices → Link a Device → scan. The session is saved and auto-reconnects; no rescan needed unless you disconnect.',
        'Use a secondary/business number. This is unofficial (WhatsApp Web protocol) so a Number Warmer & Anti-Ban engine is built in. Full old chat history imports only at scan time — re-scan to import past chats. Use the “Sync Messages” button to pull missed messages.' ] },
      { q: 'How to connect a Telegram Bot?', a: [
        'Create a bot in Telegram with @BotFather (send /newbot, choose a name, copy the token). Paste the token in Channels → Telegram → Connect; the webhook is set automatically. Share the bot link (t.me/your_bot). Customers must message the bot first; the bot cannot initiate.' ] },
      { q: 'How to connect Personal Telegram (QR)?', a: [
        'Channels → Personal Telegram → “Connect with QR”. On the phone: Telegram → Settings → Devices → Link Desktop Device → scan (enter 2FA password if set). Uses the official Telegram API (no ban risk), syncs existing chats, and can message first. Session auto-reconnects after restarts.' ] },
      { q: 'How to connect Instagram & Facebook?', a: [
        'Channels → connect your Facebook Page and Instagram professional account via Meta login and grant messaging permissions. Incoming DMs then appear in the Instagram and Facebook inboxes. Replies are allowed within Meta’s 24-hour window after the customer’s last message.' ] },
      { q: 'How to connect Email?', a: [
        'Channels → Email → enter IMAP/SMTP settings (host, port, user, password/app-password). Incoming mail appears in the Email Inbox with full HTML formatting; reply, reply-all and forward are supported.' ] },
      { q: 'A channel shows “Not connected” — what do I do?', a: [
        'Opening an inbox for an unconnected channel shows a notice with a Connect button at the top of the conversation list; click it to jump to that channel’s setup page.' ] },
      { q: 'Can I connect multiple channels at once?', a: [
        'Yes. Connect as many channels as your plan allows; each gets its own filtered inbox and they all share the same contacts, automation and AI.' ] },
    ],
  },
  {
    id: 'inbox',
    title: '4. Inbox & Chatting',
    items: [
      { q: 'How does the shared inbox work?', a: [
        'Each channel has its own filtered inbox in the sidebar. Open a conversation to chat, send media and use action tools. The chat header shows the channel name; reloading keeps you on the same channel inbox.' ] },
      { q: 'How do I start a new conversation?', a: [
        'Open the channel’s inbox and click “New Msg” (or “New Email”). Enter the recipient (with country code for WhatsApp/Telegram) and your message. On WhatsApp API, messaging outside the 24-hour window needs an approved template; QR/Telegram have no window limit and no per-message charge.' ] },
      { q: 'Can I send images, videos, documents and voice notes?', a: [
        'Yes — use the attachment/media button in the composer. Supported across WhatsApp, QR, Telegram, Instagram and Facebook (subject to each platform’s file rules).' ] },
      { q: 'How do I search inside a conversation?', a: [
        'Use the Search button in the chat toolbar to find text within that conversation and jump between matches.' ] },
      { q: 'Can I forward a message?', a: [
        'Hover a message and use the forward icon to send it to another conversation.' ] },
      { q: 'What are unread counts and conversation status?', a: [
        'Each conversation tracks unread messages and a status (active/closed). Assigning, tagging and ticket status help your team stay organised.' ] },
    ],
  },
  {
    id: 'chat-tools',
    title: '5. Chat Action Tools',
    items: [
      { q: 'What do the chat toolbar buttons do?', a: [
        'Labels — tag the conversation. Pay — send a payment link. Notes — private internal notes. Search — find text in the chat. Export — download the chat (CSV/PDF/HTML). Chat AI — toggle AI auto-reply for this chat. Preset — send a saved preset message. Assign — hand the chat to a teammate. Invoice — create & send an invoice/quotation PDF. Summary — AI summary of the conversation.',
        'These work on WhatsApp, WhatsApp QR, Telegram, Personal Telegram, Instagram and Facebook. Templates are WhatsApp-API only; Call / AI Call appear only where a phone number is available.' ] },
      { q: 'What are Labels used for?', a: [
        'Labels colour-code and categorise chats (e.g. “Lead”, “Paid”, “Urgent”) so you can filter and report on them.' ] },
      { q: 'What are Notes?', a: [
        'Internal notes are private to your team (customers never see them). Use them to leave context for the next agent.' ] },
      { q: 'How does Assign work?', a: [
        'Assign gives a conversation to a specific agent so ownership is clear. Combine with labels and ticket status to coordinate the team.' ] },
      { q: 'What does Summary do?', a: [
        'Summary uses AI to produce a short recap of a long conversation so you can catch up instantly.' ] },
      { q: 'What does Export do?', a: [
        'Export downloads the conversation (e.g. CSV/PDF/HTML) for records or sharing.' ] },
    ],
  },
  {
    id: 'presets',
    title: '6. Presets, Quick Replies & Templates',
    items: [
      { q: 'What are Preset Templates?', a: [
        'Save Money → Preset Templates: reusable messages with text, media and buttons. Send them from the Preset button in a chat — free on QR/Telegram with no 24-hour limit. On channels without native buttons, buttons become numbered options and the customer replies with the number.' ] },
      { q: 'What are Quick Replies?', a: [
        'Automation → Quick Replies: short canned answers you insert while typing to reply faster to common questions.' ] },
      { q: 'What are Message Templates and approval?', a: [
        'Campaigns → Message Templates: WhatsApp-API templates (with variables, buttons, header/media) submitted to Meta for approval. Once approved they can be used in broadcasts and to message outside the 24-hour window.' ] },
      { q: 'What are Response Resources / Predefined Actions?', a: [
        'Reusable content and predefined actions you can attach in flows and replies to standardise how your team responds.' ] },
    ],
  },
  {
    id: 'bot-flows',
    title: '7. Automation — Bot Flow Builder',
    items: [
      { q: 'How do Bot Flows work?', a: [
        'Automation → Bot Flow Builder. A flow has a trigger (keyword, first message, or any message) and steps: send text, buttons/list, question (save the answer), condition (if/else), delay, add tag, assign to human, AI step, payment link, booking, and more. It runs automatically on any connected channel and replies there.' ] },
      { q: 'What triggers can start a flow?', a: [
        'A keyword (e.g. “price”), the customer’s first-ever message, any incoming message, or a step inside another flow. On QR/Telegram, buttons are shown as numbered options; the customer replies with the number or text to continue.' ] },
      { q: 'Can flows collect and save data?', a: [
        'Yes. A question step captures the customer’s answer into a contact/data field for use later (segments, personalisation, CRM).' ] },
      { q: 'Can a flow hand off to a human?', a: [
        'Yes. Add an assign step to route the chat to an agent, optionally after conditions (e.g. VIP customer, or AI unsure).' ] },
      { q: 'What is the Flow Builder vs Automation Flows?', a: [
        'Both build automations; the visual Flow Builder is drag-and-drop for multi-step journeys, while simpler automations handle single triggers and actions.' ] },
    ],
  },
  {
    id: 'ai',
    title: '8. AI Assistant & Auto-Reply',
    items: [
      { q: 'How does AI auto-reply work?', a: [
        'Configure AI in the AI settings: add an API key and give it business context (products, FAQs, tone). Turn it on globally or per-chat (Chat AI). When no flow/keyword matches, the AI writes and sends a smart reply.' ] },
      { q: 'How does AI hand off to a human?', a: [
        'When the AI is unsure or the customer asks for an agent, the chat is assigned to a human so nothing is mishandled.' ] },
      { q: 'What can I train the AI on?', a: [
        'Give it your product list, FAQs, policies and preferred tone. The better the context, the more accurate the replies. You can also paste the Knowledge Base “AI Master Guide” to teach an external AI about the platform.' ] },
      { q: 'Does AI work on all channels?', a: [
        'Yes — WhatsApp, WhatsApp QR, Telegram, Personal Telegram, Instagram and Facebook.' ] },
      { q: 'What is AI Calling / AI Call?', a: [
        'Where a phone number is available, AI Call can place an automated voice call through the configured voice provider. It is not a WhatsApp call.' ] },
    ],
  },
  {
    id: 'keywords',
    title: '9. Keywords, Welcome & Out-of-Office',
    items: [
      { q: 'What are Keyword Triggers?', a: [
        'Automation → Keyword Triggers: map a keyword to an automatic text/media reply — great for FAQs like “hours”, “location”, “price”. Simpler than a full flow.' ] },
      { q: 'What is the Welcome message?', a: [
        'A message sent automatically on a customer’s first contact, so no one is greeted by silence. Runs on all connected channels.' ] },
      { q: 'What is the Out-of-Office message?', a: [
        'An automatic reply sent outside your configured business hours to set response-time expectations.' ] },
    ],
  },
  {
    id: 'followups',
    title: '10. AI Follow-ups',
    items: [
      { q: 'What are AI Follow-ups?', a: [
        'Automation → AI Follow-ups automatically nudges leads who went quiet with AI-written messages on a schedule you control, helping recover deals without manual chasing.' ] },
      { q: 'Can I control timing and stop conditions?', a: [
        'Yes — set the delay/sequence and it stops when the customer replies or the goal is met.' ] },
    ],
  },
  {
    id: 'broadcasts',
    title: '11. Broadcasts & Campaigns',
    items: [
      { q: 'How do I send a broadcast?', a: [
        'Campaigns → Broadcast. Choose an audience (segment or tag), pick the message (an approved template on WhatsApp API), schedule or send now, and track delivered/read/replied in the report.' ] },
      { q: 'What are the rules for broadcasts?', a: [
        'On WhatsApp API, broadcasts to users outside the 24-hour window must use approved templates. Avoid mass-messaging unknown numbers on QR — that is the fastest way to get a number banned.' ] },
      { q: 'How do I see campaign performance?', a: [
        'Each broadcast/campaign has a report with sent/delivered/read/replied metrics; overall trends appear in Analytics.' ] },
    ],
  },
  {
    id: 'drip',
    title: '12. Drip & Preset Campaigns',
    items: [
      { q: 'What are Drip Campaigns?', a: [
        'Save Money → Drip: a pre-planned sequence of messages sent automatically over days/weeks (e.g. onboarding or nurture series).' ] },
      { q: 'What are Preset Campaigns?', a: [
        'Send your saved preset messages to a chosen audience — useful for offers and announcements on QR/Telegram without templates.' ] },
    ],
  },
  {
    id: 'contacts',
    title: '13. Contacts, Segments, Tags & Data',
    items: [
      { q: 'How do I manage contacts?', a: [
        'Contacts → Contact Directory lists everyone with their channels and history. Open a contact to see details, tags and conversations.' ] },
      { q: 'How do I import contacts?', a: [
        'Import via CSV; results and errors appear under Import Logs. Map columns to fields during import.' ] },
      { q: 'What are Tags, Segments and Data Fields?', a: [
        'Tags label contacts; Segments are dynamic groups built from rules (e.g. “paid customers”) for targeting; Data Fields are custom fields (e.g. city, plan) to store extra info per contact.' ] },
      { q: 'What are Badges?', a: [
        'Badges highlight special contact statuses (e.g. VIP) for quick recognition and filtering.' ] },
    ],
  },
  {
    id: 'pipeline',
    title: '14. Pipeline (CRM)',
    items: [
      { q: 'How does the Pipeline Board work?', a: [
        'Pipeline Board is a drag-and-drop sales board. Create stages (e.g. New → Contacted → Won), move deals/contacts between them, and track your funnel.' ] },
      { q: 'Do conversations link to the pipeline?', a: [
        'Yes — chats can auto-link to deals so context follows the customer through each stage.' ] },
    ],
  },
  {
    id: 'leads',
    title: '15. Lead Gen Forms & Facebook Leads',
    items: [
      { q: 'How do Lead Gen Forms work?', a: [
        'Leads & Commerce → Lead Gen Forms: build a form, share its link or embed it, and submissions become contacts automatically for follow-up.' ] },
      { q: 'What are Facebook Leads?', a: [
        'Facebook lead-ad submissions sync straight into {app} as contacts, so you can respond fast.' ] },
    ],
  },
  {
    id: 'commerce',
    title: '16. Product Catalogs & Orders',
    items: [
      { q: 'What are Product Catalogs?', a: [
        'List products (name, price, image, description) and share catalog items in chats and flows so customers can browse and buy.' ] },
      { q: 'How does Order Management work?', a: [
        'Track orders customers place, update their status, and connect them to payments and invoices.' ] },
    ],
  },
  {
    id: 'payments',
    title: '17. Payments & Payment Links',
    items: [
      { q: 'How do payment links work?', a: [
        'Click Pay in any chat to create a UPI or gateway payment link. The customer taps it to pay. Works on WhatsApp, QR, Telegram, Instagram and Facebook.' ] },
      { q: 'Which gateways are supported?', a: [
        'Payment gateways are configured by the admin (keys/secrets under Gateway Setup). UPI links can be sent directly where enabled.' ] },
      { q: 'How do I know a payment succeeded?', a: [
        'Payment status is tracked and reflected against the link/order; admins see all payments in the billing area.' ] },
    ],
  },
  {
    id: 'invoices',
    title: '18. Invoices & Quotations',
    items: [
      { q: 'How do I send an invoice or quotation?', a: [
        'Click the Invoice button in a chat, add line items, tax and notes, and choose Invoice or Quotation. {app} generates a branded PDF and sends it on the current channel.' ] },
      { q: 'Where do the company details and tax come from?', a: [
        'Company name, address, GSTIN/Tax ID, phone, billing email and footer come from the invoice settings (admin-controlled); the tax rate comes from the active default tax.' ] },
    ],
  },
  {
    id: 'appointments',
    title: '19. Appointments & Events',
    items: [
      { q: 'How do Appointments work?', a: [
        'Automation/Appointments lets customers book time slots (via a flow or link); bookings are tracked and can trigger reminders.' ] },
      { q: 'What are Events?', a: [
        'Events let you schedule and manage time-based activities and can be used inside automations.' ] },
    ],
  },
  {
    id: 'tickets',
    title: '20. Tickets & Customer Support',
    items: [
      { q: 'How do support Tickets work (client side)?', a: [
        'Create and track tickets for customer issues, set priority and status (open / awaiting reply / answered / closed), and keep the conversation threaded.' ] },
      { q: 'How do I contact platform support?', a: [
        'Open a Support ticket from the sidebar or email {email}. Include a clear description and screenshots for a faster resolution.' ] },
    ],
  },
  {
    id: 'shortlinks-media-ads',
    title: '21. Short Links, Media Library & CTWA Ads',
    items: [
      { q: 'What are Short Links?', a: [
        'Create trackable short links to share in messages so you can measure clicks and engagement.' ] },
      { q: 'What is the Media Library?', a: [
        'A central place to store and reuse images, videos and documents across chats, presets and campaigns.' ] },
      { q: 'What are CTWA Ads?', a: [
        'Click-to-WhatsApp Ads bring ad clicks straight into your WhatsApp inbox as conversations, so ad leads land where your team can reply and automate.' ] },
    ],
  },
  {
    id: 'analytics',
    title: '22. Dashboard & Analytics',
    items: [
      { q: 'What does the Dashboard show?', a: [
        'A live overview of your activity — recent conversations, unread counts, campaign status and key numbers at a glance.' ] },
      { q: 'What is in Analytics?', a: [
        'Deeper reporting on messages sent/delivered/read, response times, campaign performance and growth trends to guide decisions.' ] },
    ],
  },
  {
    id: 'team',
    title: '23. Team, Agents & Permissions',
    items: [
      { q: 'How do I add team members / agents?', a: [
        'Invite agents from the team/agents area. Each agent logs in with their own account and works from the shared inbox.' ] },
      { q: 'How do permissions work?', a: [
        'Granular permissions control which sections and actions each agent can access, so staff only see what they should.' ] },
    ],
  },
  {
    id: 'billing',
    title: '24. Account, Billing, Wallet & Subscriptions',
    items: [
      { q: 'What is the wallet balance?', a: [
        'The wallet funds usage-based charges (certain messages/AI, depending on plan). Top it up from billing; low-balance reminders keep you informed.' ] },
      { q: 'Where do I see my plan and invoices?', a: [
        'Your subscription, plan limits and billing history are in the billing/account area. Upgrade there if a feature is locked.' ] },
      { q: 'How do I upgrade or renew?', a: [
        'Choose a plan in billing and pay via the enabled gateway; coupons apply at checkout. Renewal reminders are sent before expiry.' ] },
    ],
  },
  {
    id: 'mobile',
    title: '25. Mobile App (PWA) & Notifications',
    items: [
      { q: 'Can I install {app} as an app?', a: [
        'Yes. Use “Install App” in the top bar (or the browser Install icon) to add {app} to your phone/desktop as a PWA — it opens like a native app with faster access.' ] },
      { q: 'How do notifications work?', a: [
        'Enable browser/PWA notifications to get alerted on new messages so you never miss a customer.' ] },
    ],
  },
  {
    id: 'api',
    title: '26. API, Developers & Integrations',
    items: [
      { q: 'Is there an API?', a: [
        'Yes. API & Developers documents endpoints and webhooks to integrate {app} with your own systems (send messages, manage contacts, receive events).' ] },
      { q: 'What integrations are available?', a: [
        'Integrations connect {app} to external tools and webhooks; availability depends on your plan and admin configuration.' ] },
    ],
  },
  {
    id: 'antiban',
    title: '27. Anti-Ban & Safety (WhatsApp QR)',
    items: [
      { q: 'What protections are built in?', a: [
        'Gradual warm-up (Day 1 ≈ 25 messages, rising over ~2 weeks), human-like random delays (5–15s), typing indicator, per-number daily caps, and auto-pause if a ban/logout is detected. A custom daily limit override is available at your own risk.' ] },
      { q: 'How do I avoid getting banned?', a: [
        'Use a secondary number, don’t bulk-message unknown numbers, don’t repeat identical text, keep replying to real conversations, and respect the warm-up limits. For large-scale or template sending, use the official WhatsApp API instead.' ] },
      { q: 'What is the warm-up limit and can I change it?', a: [
        'The daily safe limit rises automatically over ~2 weeks. You can set a custom daily limit override in the QR card, but higher limits on a fresh number increase ban risk.' ] },
    ],
  },
  {
    id: 'technical',
    title: '28. Technical & Troubleshooting',
    items: [
      { q: 'Messages not arriving on WhatsApp QR.', a: [
        'Keep the linked phone online. Use Channels → WhatsApp by QR → “Sync Messages”. If still stuck, Disconnect → Connect → re-scan to refresh the session (this also re-imports recent history).' ] },
      { q: '“Waiting for this message” on the recipient’s phone.', a: [
        'An encryption-sync issue on QR. It auto-recovers now; if an old message is stuck, Disconnect → Connect → re-scan to reset the encryption session.' ] },
      { q: 'Tappable buttons not showing on QR.', a: [
        'WhatsApp blocks unofficial buttons on newer versions, so QR uses numbered options that deliver reliably everywhere. For guaranteed buttons use the official WhatsApp API.' ] },
      { q: 'Old chat history did not import.', a: [
        'Full history imports only at QR scan time. Do Disconnect → Connect → re-scan to import recent chats.' ] },
      { q: 'Can I make WhatsApp voice/video calls from the panel?', a: [
        'No. WhatsApp’s calling protocol is not available to any third-party tool. Call / AI Call place a normal phone call through the configured voice provider, not a WhatsApp call.' ] },
      { q: 'A feature is locked or missing.', a: [
        'It is not in your current plan, or your agent role lacks permission. Upgrade the plan or ask your admin to enable it.' ] },
      { q: 'Branding changes are not visible.', a: [
        'Hard-refresh (Ctrl+Shift+R) or use Clear Cache. Branding is cached per device and refreshes on reload.' ] },
      { q: 'A contact shows a number/ID instead of a name.', a: [
        'Names resolve as the contact map syncs; on QR, use Sync Messages or re-scan so the name mapping loads.' ] },
    ],
  },
  {
    id: 'faq',
    title: '29. Common Customer Queries (FAQ)',
    items: [
      { q: 'Is my number safe on QR?', a: [
        'QR is unofficial, so a small risk always exists, but the Anti-Ban engine (warm-up, delays, caps, auto-pause) keeps it low when used sensibly. Official WhatsApp API has zero ban risk.' ] },
      { q: 'Do QR/Telegram messages cost per message?', a: [
        'No per-message charge on QR/Telegram/Personal Telegram. WhatsApp API template/conversation pricing follows Meta’s rates.' ] },
      { q: 'Can I use the same number on WhatsApp API and QR?', a: [
        'They are separate connections; each channel keeps its own inbox. A number active on the official API cannot also run on WhatsApp Web/QR.' ] },
      { q: 'Can the bot message a customer first?', a: [
        'A Telegram bot cannot initiate — the customer must start. Personal Telegram and WhatsApp can message first (respecting WhatsApp’s 24-hour/template rules).' ] },
      { q: 'How many agents/channels can I add?', a: [
        'Depends on your plan limits. Check billing or ask your admin to raise limits.' ] },
      { q: 'How do I get help?', a: [
        'Open a Support ticket from the sidebar or contact {email}. Include a clear description and screenshots.' ] },
    ],
  },
];

export function getGuideSections(biz: Biz): GSection[] {
  return RAW.map((s) => ({
    id: s.id,
    title: fill(s.title, biz),
    items: s.items.map((it) => ({ q: fill(it.q, biz), a: it.a.map((p) => fill(p, biz)) })),
  }));
}

// Full plain-text version for copy-to-AI.
export function buildPlainText(biz: Biz): string {
  const lines: string[] = [];
  lines.push(`${biz.name} — COMPLETE PLATFORM GUIDE (for AI assistant training)`);
  if (biz.tagline) lines.push(biz.tagline);
  const contact = [biz.email, biz.url, biz.phone, biz.address].filter(Boolean).join(' · ');
  if (contact) lines.push(contact);
  lines.push('');
  lines.push('Instruction to the AI: Use ONLY the information below to answer questions about ' + biz.name + ' — its sales, setup, features, technical issues and support. Answer clearly and helpfully.');
  lines.push('');
  for (const s of getGuideSections(biz)) {
    lines.push('==== ' + s.title + ' ====');
    for (const it of s.items) {
      lines.push('Q: ' + it.q);
      for (const p of it.a) lines.push('A: ' + p);
      lines.push('');
    }
  }
  return lines.join('\n');
}
