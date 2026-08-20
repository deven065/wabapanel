'use client';
import React from 'react';
import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '') + '/api/v1';

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied'); }}
        className="absolute top-2 right-2 p-1 bg-gray-700 rounded opacity-0 group-hover:opacity-100 text-gray-300"><Copy className="w-3.5 h-3.5" /></button>
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-emerald-100 text-emerald-700',
  PUT: 'bg-purple-100 text-purple-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

function Endpoint({ method, path, desc, curl, response }: { method: string; path: string; desc: string; curl: string; response?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${METHOD_COLORS[method] || 'bg-gray-100 text-gray-700'}`}>{method}</span>
        <code className="text-sm font-mono text-gray-800">{path}</code>
      </div>
      <p className="text-xs text-gray-500">{desc}</p>
      <CodeBlock code={curl} />
      {response && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Sample response</summary>
          <pre className="mt-1 bg-gray-50 border border-gray-100 rounded-lg p-2 overflow-x-auto text-gray-600">{response}</pre>
        </details>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1.5">{title}</h2>
      {children}
    </div>
  );
}

export default function AllEndpoints({ KEY }: { KEY: string }) {
  return (
    <>
      <Section title="Authentication">
        <Endpoint method="GET" path="/me" desc="Verify your API key — returns workspace info."
          curl={`curl ${BASE}/me -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": {"id": "...", "name": "My Business"}}`} />
      </Section>

      <Section title="Messages">
        <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-2"><b>Open-session vs template:</b> free-form messages (text, media, interactive buttons/list below) can only be sent inside the 24-hour customer-service window — i.e. after the customer messaged you within the last 24 hours. To message a customer outside that window, use an approved <b>template</b> message.</p>
        <Endpoint method="POST" path="/messages/send" desc="Send a text message to a customer (within the 24hr window). For a new number, the contact and conversation are created automatically."
          curl={`curl -X POST ${BASE}/messages/send \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "message": "Hello from API!"}'`}
          response={`{"success": true, "data": {"message_id": "...", "wa_message_id": "wamid...."}}`} />
        <Endpoint method="POST" path="/messages/template" desc="Send an approved template (works outside the 24hr window too). variables = values for the body's {{1}}, {{2}} placeholders, in order. Optional: header_variables (header {{1}}) and button_variables for dynamic buttons — each { index, sub_type: url | quick_reply | copy_code, text }."
          curl={`curl -X POST ${BASE}/messages/template \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "template_name": "hello_world", "language": "en_US", "variables": ["Raj"]}'`} />
        <Endpoint method="POST" path="/messages/template (with button variable)" desc="Same endpoint. Example for a template that has a dynamic URL button — button_variables adds the value for that button. sub_type = url (URL button), quick_reply (payload) or copy_code (coupon). index = button position (0 = first)."
          curl={`curl -X POST ${BASE}/messages/template \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "template_name": "order_update", "language": "en_US", "variables": ["Raj"], "button_variables": [{"index": 0, "sub_type": "url", "text": "ORDER123"}]}'`} />
        <Endpoint method="POST" path="/messages/media" desc="Send an image / video / document / audio from a public URL. media_type: image | video | document | audio. caption optional."
          curl={`curl -X POST ${BASE}/messages/media \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "media_type": "image", "url": "https://example.com/offer.jpg", "caption": "Diwali Offer!"}'`} />
        <Endpoint method="POST" path="/messages/interactive/buttons" desc="Interactive reply buttons (max 3). Must be sent inside an open 24hr session. body required; buttons = array of titles (or objects {id, title}); header & footer optional. The customer's tap returns as an inbound message carrying the button title/id."
          curl={`curl -X POST ${BASE}/messages/interactive/buttons \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "body": "Confirm your booking?", "buttons": ["Yes", "No", "Talk to agent"], "footer": "Fenex Tours"}'`}
          response={`{"success": true, "data": {"message_id": "...", "wa_message_id": "wamid...."}}`} />
        <Endpoint method="POST" path="/messages/interactive/list" desc="Interactive list / menu message. Must be sent inside an open 24hr session. body & sections[] required; each section has a title and rows[] of {id, title, description?}. button = label of the list-open button (default Menu); header & footer optional. Limits: row title 24 chars, description 72 chars."
          curl={`curl -X POST ${BASE}/messages/interactive/list \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "body": "Please choose a category", "button": "View menu", "sections": [{"title": "Tours", "rows": [{"id": "tour_enquiry", "title": "Tour Enquiry", "description": "Plan a new trip"}, {"id": "corporate", "title": "Corporate Tours"}]}]}'`}
          response={`{"success": true, "data": {"message_id": "...", "wa_message_id": "wamid...."}}`} />
        <Endpoint method="GET" path="/messages" desc="Messages of a conversation (oldest to newest). conversation_id required (from GET /conversations), limit optional (max 200)."
          curl={`curl "${BASE}/messages?conversation_id=CONVERSATION_ID&limit=50" -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"direction": "inbound", "type": "text", "text": "Hi", "status": "read", "createdAt": "..."}]}`} />
      </Section>

      <Section title="Contacts">
        <Endpoint method="GET" path="/contacts" desc="List contacts — optional search (name/phone/email), page, limit params. Includes lead score, birthday, and custom fields."
          curl={`curl "${BASE}/contacts?search=raj&page=1&limit=50" -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [...], "pagination": {"page": 1, "limit": 50, "total": 120}}`} />
        <Endpoint method="GET" path="/contacts/:id" desc="Full detail of a contact (tags, custom fields, lead score, and more)."
          curl={`curl ${BASE}/contacts/CONTACT_ID -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/contacts" desc="Create a new contact (if the phone already exists, name/email are updated)."
          curl={`curl -X POST ${BASE}/contacts \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Raj Kumar", "phone": "919876543210", "email": "raj@example.com"}'`} />
        <Endpoint method="PUT" path="/contacts/:id" desc="Update a contact — name, email, and custom_fields (object of key/value pairs)."
          curl={`curl -X PUT ${BASE}/contacts/CONTACT_ID \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Raj Kumar", "email": "raj@example.com", "custom_fields": {"city": "Jaipur"}}'`} />
        <Endpoint method="DELETE" path="/contacts/:id" desc="Delete a contact permanently."
          curl={`curl -X DELETE ${BASE}/contacts/CONTACT_ID -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/contacts/:id/tags" desc="Add tags to a contact by name — tags are created automatically if they don't exist."
          curl={`curl -X POST ${BASE}/contacts/CONTACT_ID/tags \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"tags": ["vip", "lead"]}'`} />
      </Section>

      <Section title="Tags & Segments">
        <Endpoint method="GET" path="/tags" desc="List all tags of the workspace (name + color)."
          curl={`curl ${BASE}/tags -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="GET" path="/segments" desc="List all contact segments (name, description, contact count)."
          curl={`curl ${BASE}/segments -H "X-API-Key: ${KEY}"`} />
      </Section>

      <Section title="Conversations">
        <Endpoint method="GET" path="/conversations" desc="Recent conversations — with contact, status, last message, unread count, and sentiment. limit optional (max 100)."
          curl={`curl "${BASE}/conversations?limit=50" -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/conversations/:id/assign" desc="Assign a conversation to an agent by email."
          curl={`curl -X POST ${BASE}/conversations/CONVERSATION_ID/assign \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"agent_email": "agent@example.com"}'`} />
        <Endpoint method="POST" path="/conversations/:id/close" desc="Mark a conversation as resolved/closed."
          curl={`curl -X POST ${BASE}/conversations/CONVERSATION_ID/close -H "X-API-Key: ${KEY}"`} />
      </Section>

      <Section title="Broadcasts">
        <Endpoint method="GET" path="/broadcasts" desc="List broadcasts with status and delivery stats (sent/delivered/read/failed)."
          curl={`curl ${BASE}/broadcasts -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/broadcasts" desc="Create & start a template broadcast to a list of numbers. name, template_name and phones[] required; language optional (default en)."
          curl={`curl -X POST ${BASE}/broadcasts \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Diwali Offer", "template_name": "diwali_offer", "language": "en", "phones": ["919876543210", "919876543211"]}'`}
          response={`{"success": true, "data": {"broadcast_id": "...", "status": "scheduled", "recipients": 2}}`} />
        <Endpoint method="GET" path="/broadcasts/:id" desc="Detail of one broadcast with live stats."
          curl={`curl ${BASE}/broadcasts/BROADCAST_ID -H "X-API-Key: ${KEY}"`} />
      </Section>

      <Section title="Orders">
        <Endpoint method="GET" path="/orders" desc="List orders (with contact name/phone). status param optional."
          curl={`curl "${BASE}/orders?status=pending" -H "X-API-Key: ${KEY}"`} />
      </Section>

      <Section title="Templates">
        <Endpoint method="GET" path="/templates" desc="List WhatsApp templates (including carousel cards). status param optional: approved | pending | rejected."
          curl={`curl "${BASE}/templates?status=approved" -H "X-API-Key: ${KEY}"`} />
      </Section>

      <Section title="Appointments">
        <Endpoint method="GET" path="/appointments" desc="Appointments list. Optional params: status (scheduled/confirmed/completed/cancelled), from & to (YYYY-MM-DD)."
          curl={`curl "${BASE}/appointments?from=2026-06-01&to=2026-06-30&status=scheduled" -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/appointments" desc="Create a new appointment. title, date (YYYY-MM-DD), start_time (HH:MM) required; providing a phone links/creates the contact; duration in minutes (default 30)."
          curl={`curl -X POST ${BASE}/appointments \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "name": "Raj", "title": "Demo Call", "date": "2026-07-01", "start_time": "15:00", "duration": 30, "notes": "Website se aaya lead"}'`} />
      </Section>

      <Section title="Tickets (Support)">
        <Endpoint method="GET" path="/tickets" desc="List support tickets (with contact name/phone). status param optional: open | closed."
          curl={`curl "${BASE}/tickets?status=open" -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="PATCH" path="/tickets/:id" desc="Close or reopen a ticket. status: open | closed."
          curl={`curl -X PATCH ${BASE}/tickets/TICKET_ID \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status": "closed"}'`} />
      </Section>

      <Section title="Payment Links">
        <Endpoint method="GET" path="/payment-links" desc="List payment links with status (created/paid/cancelled). Optional params: status, limit (max 200)."
          curl={`curl "${BASE}/payment-links?status=paid&limit=50" -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "amount": 499, "currency": "INR", "method": "razorpay", "status": "paid", "link": "https://rzp.io/i/..."}]}`} />
        <Endpoint method="POST" path="/payment-links" desc="Create a payment link and (by default) send it to the customer on WhatsApp. method: razorpay (default) | upi | stripe | cashfree | paypal | paystack | phonepe | paytm — the gateway must be connected on the Integrations page. For method=upi pass upi_id. Set send=false to only create without sending."
          curl={`curl -X POST ${BASE}/payment-links \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "919876543210", "amount": 499, "method": "razorpay", "description": "Order #1234"}'`}
          response={`{"success": true, "data": {"id": "...", "link": "https://rzp.io/i/abc", "amount": 499, "currency": "INR", "method": "razorpay", "status": "created"}}`} />
      </Section>

      <Section title="Wallet">
        <Endpoint method="GET" path="/wallet" desc="Current wallet balance of the workspace."
          curl={`curl ${BASE}/wallet -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": {"balance": 1250.5, "currency": "INR"}}`} />
        <Endpoint method="GET" path="/wallet/transactions" desc="Recent wallet ledger — credits (topups) and debits (message costs). limit optional (max 200)."
          curl={`curl "${BASE}/wallet/transactions?limit=50" -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "type": "debit", "amount": 0.8, "balance_after": 1249.7, "category": "message_cost", "created_at": "..."}]}`} />
      </Section>

      <Section title="CRM / Pipeline">
        <Endpoint method="GET" path="/pipelines" desc="List your CRM pipelines with their stages and deal counts. Use a stage id when creating/moving deals."
          curl={`curl ${BASE}/pipelines -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "name": "Sales", "stages": [{"id": "new", "name": "New Lead"}, {"id": "won", "name": "Won"}], "deal_count": 12}]}`} />
        <Endpoint method="GET" path="/deals" desc="List deals across all pipelines. Optional params: status (open/won/lost), stage (stage id), limit (max 300)."
          curl={`curl "${BASE}/deals?status=open&limit=100" -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "pipeline": "Sales", "title": "Website lead", "value": 25000, "stage": "new", "status": "open", "contact": {"name": "Raj", "phone": "919876543210"}}]}`} />
        <Endpoint method="POST" path="/deals" desc="Create a deal. title required; value, notes optional. Pass phone to link/create a contact. pipeline_id + stage optional (defaults to first pipeline & first stage)."
          curl={`curl -X POST ${BASE}/deals \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Enterprise deal", "value": 50000, "phone": "919876543210", "notes": "Referred by partner"}'`} />
        <Endpoint method="PATCH" path="/deals/:id" desc="Move a deal to another stage or mark it won/lost. Any of stage, status (open/won/lost), value, notes."
          curl={`curl -X PATCH ${BASE}/deals/DEAL_ID \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"stage": "won", "status": "won"}'`} />
      </Section>

      <Section title="Bot Flows">
        <Endpoint method="GET" path="/bot-flows" desc="List your bot flows with active status and run count."
          curl={`curl ${BASE}/bot-flows -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "name": "Welcome Flow", "active": true, "runs": 340, "match_type": "contains"}]}`} />
        <Endpoint method="POST" path="/bot-flows/:id/toggle" desc="Turn a bot flow ON or OFF. active: true | false (default true)."
          curl={`curl -X POST ${BASE}/bot-flows/FLOW_ID/toggle \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"active": true}'`} />
      </Section>

      <Section title="Quick Replies">
        <Endpoint method="GET" path="/quick-replies" desc="List saved quick replies (title, message, shortcut)."
          curl={`curl ${BASE}/quick-replies -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "title": "Greeting", "message": "Hi! How can we help?", "shortcut": "/hi"}]}`} />
      </Section>

      <Section title="Agents">
        <Endpoint method="GET" path="/agents" desc="List agents of your workspace (name, email, role)."
          curl={`curl ${BASE}/agents -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "name": "Priya", "email": "priya@example.com", "role": "agent"}]}`} />
        <Endpoint method="GET" path="/agents/performance" desc="Per-agent performance: assigned chats, resolved chats (30d), messages sent (30d)."
          curl={`curl ${BASE}/agents/performance -H "X-API-Key: ${KEY}"`}
          response={`{"success": true, "data": [{"id": "...", "name": "Priya", "assigned_chats": 42, "resolved_chats_30d": 30, "messages_sent_30d": 512}]}`} />
      </Section>

      <Section title="Webhooks (receive events)">
        <Endpoint method="GET" path="/webhooks" desc="List your registered webhook subscriptions."
          curl={`curl ${BASE}/webhooks -H "X-API-Key: ${KEY}"`} />
        <Endpoint method="POST" path="/webhooks" desc="Register a webhook URL. events: message.received | message.status | contact.created. Your URL will receive a JSON POST on every event."
          curl={`curl -X POST ${BASE}/webhooks \\\n  -H "X-API-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "https://example.com/my-webhook", "events": ["message.received", "message.status"]}'`} />
        <Endpoint method="DELETE" path="/webhooks/:id" desc="Remove a webhook subscription."
          curl={`curl -X DELETE ${BASE}/webhooks/WEBHOOK_ID -H "X-API-Key: ${KEY}"`} />
      </Section>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="font-bold">Notes:</p>
        <p>• All responses are JSON: {'{"success": true, "data": ...}'} — on error {'{"success": false, "message": "..."}'}</p>
        <p>• Phone numbers include the country code, without + (e.g. 919876543210)</p>
        <p>• 401 for auth failures, 400 for invalid input, 404 when not found</p>
        <p>• If your key leaks, regenerate it immediately — the old key stops working right away</p>
      </div>
    </>
  );
}

