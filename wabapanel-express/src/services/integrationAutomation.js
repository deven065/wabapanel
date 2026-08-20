const crypto = require('crypto');
const Integration = require('../models/Integration');
const WebhookEvent = require('../models/WebhookEvent');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Workspace = require('../models/Workspace');
const WhatsAppService = require('./whatsappService');
const Tag = require('../models/Tag');

// ---------------------------------------------------------------------------
// Lead-source integrations: each gets an inbound webhook URL, recommended
// pre-written utility templates (1-click submit to Meta) and per-event
// automation toggles (auto WhatsApp template send when an event arrives).
// ---------------------------------------------------------------------------

const LEAD_SOURCES = [
  'indiamart', 'justdial', 'tradeindia', 'exportersindia', '99acres',
  'magicbricks', 'housing', 'olx', 'tagmango', 'google-lead-forms',
  'wordpress-forms', 'google-forms', 'typeform', 'jotform', 'landing-pages',
  'flexifunnels', 'website', 'linkedin-ads', 'twitter-ads', 'leadsquared',
  'gohighlevel', 'facebook-leads',
];

const SOURCE_LABELS = {
  indiamart: 'IndiaMART', justdial: 'Justdial', tradeindia: 'TradeIndia',
  exportersindia: 'ExportersIndia', '99acres': '99acres', magicbricks: 'MagicBricks',
  housing: 'Housing.com', olx: 'OLX', tagmango: 'TagMango',
  'google-lead-forms': 'Google Lead Form Ads', 'wordpress-forms': 'WordPress Forms',
  'google-forms': 'Google Forms', typeform: 'Typeform', jotform: 'Jotform',
  'landing-pages': 'Landing Page', flexifunnels: 'FlexiFunnels', website: 'Website',
  'linkedin-ads': 'LinkedIn Lead Gen', 'twitter-ads': 'X (Twitter) Ads',
  leadsquared: 'LeadSquared', gohighlevel: 'GoHighLevel',
  'facebook-leads': 'Facebook Lead Ads', shopify: 'Shopify', shiprocket: 'Shiprocket',
  woocommerce: 'WooCommerce',
};

const tplName = (type, suffix) => `${type.replace(/[^a-z0-9]/g, '_')}_${suffix}`;

// Recommended template presets per integration type
function getPresets(type) {
  const label = SOURCE_LABELS[type] || type;
  if (type === 'shopify') {
    return [
      { key: 'order_created', event: 'order_created', eventLabel: 'New order placed', name: tplName(type, 'order_confirm'), label: 'Order Confirmation',
        body: 'Hi {{1}}, your order #{{2}} of {{3}} has been confirmed! We will notify you once it ships. Thank you for shopping with us.',
        variables: ['Customer name', 'Order number', 'Order amount'], example: ['Rahul', '1001', 'INR 999'] },
      { key: 'order_fulfilled', event: 'order_fulfilled', eventLabel: 'Order shipped/fulfilled', name: tplName(type, 'order_shipped'), label: 'Order Shipped',
        body: 'Hi {{1}}, great news! Your order #{{2}} has been shipped. Track it here: {{3}}',
        variables: ['Customer name', 'Order number', 'Tracking info'], example: ['Rahul', '1001', 'https://track.example.com/123'] },
      { key: 'order_refunded', event: 'order_refunded', eventLabel: 'Refund/return processed', name: tplName(type, 'order_refund'), label: 'Refund Update',
        body: 'Hi {{1}}, your refund for order #{{2}} of {{3}} has been processed. It should reflect in your account within 5-7 business days.',
        variables: ['Customer name', 'Order number', 'Refund amount'], example: ['Rahul', '1001', 'INR 999'] },
    ];
  }
  if (type === 'woocommerce') {
    return [
      { key: 'order_created', event: 'order_created', eventLabel: 'New order placed', name: tplName(type, 'order_confirm'), label: 'Order Confirmation',
        body: 'Hi {{1}}, your order #{{2}} of {{3}} has been confirmed! We will notify you once it ships. Thank you for shopping with us.',
        variables: ['Customer name', 'Order number', 'Order amount'], example: ['Rahul', '1001', 'INR 999'] },
      { key: 'order_completed', event: 'order_completed', eventLabel: 'Order completed/shipped', name: tplName(type, 'order_done'), label: 'Order Completed',
        body: 'Hi {{1}}, your order #{{2}} is complete. Thank you for shopping with us \u2014 we hope to see you again!',
        variables: ['Customer name', 'Order number'], example: ['Rahul', '1001'] },
      { key: 'order_refunded', event: 'order_refunded', eventLabel: 'Refund processed', name: tplName(type, 'order_refund'), label: 'Refund Update',
        body: 'Hi {{1}}, your refund for order #{{2}} of {{3}} has been processed. It should reflect in your account within 5-7 business days.',
        variables: ['Customer name', 'Order number', 'Refund amount'], example: ['Rahul', '1001', 'INR 999'] },
    ];
  }
  if (type === 'shiprocket') {
    return [
      { key: 'shipment_update', event: 'shipment_update', eventLabel: 'Shipment status update', name: tplName(type, 'shipment_update'), label: 'Shipment Update',
        body: 'Hi {{1}}, update on your order #{{2}}: {{3}}. AWB: {{4}}. Thank you for your patience!',
        variables: ['Customer name', 'Order ID', 'Status', 'AWB number'], example: ['Rahul', '1001', 'Out for delivery', 'AWB123456'] },
    ];
  }
  // Generic lead source
  return [
    { key: 'lead', event: 'lead', eventLabel: 'New lead received', name: tplName(type, 'lead_thanks'), label: 'Lead Thank You',
      body: 'Hi {{1}}, thank you for your enquiry via {{2}}! Our team has received your requirement and will get in touch with you shortly.',
      variables: ['Lead name', 'Source'], example: ['Rahul', label] },
  ];
}

// ---------------------------------------------------------------------------
// Payload mapping: normalize any lead payload to { phone, name, email, detail }
// ---------------------------------------------------------------------------

function flatten(obj, out = {}, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, out, depth + 1);
    else if (typeof v === 'string' || typeof v === 'number') out[k.toLowerCase()] = String(v);
  }
  return out;
}

function pick(flat, patterns) {
  for (const p of patterns) {
    for (const [k, v] of Object.entries(flat)) {
      if (p.test(k) && v && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}

function mapLeadPayload(source, payload) {
  // Google Ads lead form: user_column_data array
  if (Array.isArray(payload?.user_column_data)) {
    const cols = {};
    payload.user_column_data.forEach((c) => { if (c.column_id) cols[c.column_id] = c.string_value || ''; });
    return {
      phone: cols.PHONE_NUMBER || '',
      name: cols.FULL_NAME || [cols.FIRST_NAME, cols.LAST_NAME].filter(Boolean).join(' '),
      email: cols.EMAIL || '',
      detail: cols.CITY || '',
    };
  }
  const flat = flatten(payload || {});
  const phone = pick(flat, [/^(sender_)?mobile$/, /^(sender_)?phone(_number)?$/, /mobile/, /phone/, /whatsapp/, /contact_?no/]);
  const name = pick(flat, [/^(sender_)?name$/, /full_?name/, /first_?name/, /customer_?name/, /prospect_?name/, /name/]);
  const email = pick(flat, [/^(sender_)?email$/, /e-?mail/]);
  const detail = pick(flat, [/product/, /requirement/, /subject/, /message/, /enquiry/, /query/, /city/]);
  return { phone, name, email, detail };
}

// ---------------------------------------------------------------------------
// Core: send an approved template automatically for an integration event
// ---------------------------------------------------------------------------

// Returns true if this exact event was already processed recently (1h TTL)
async function isDuplicateEvent(workspaceId, parts) {
  try {
    const hash = crypto.createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex');
    await WebhookEvent.create({ workspace: workspaceId, hash });
    return false;
  } catch (err) {
    if (err.code === 11000) return true;
    return false;
  }
}

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = '91' + digits;
  return digits;
}

async function runAutomation({ workspaceId, type, event, phone, name, email, tags, vars }) {
  try {
    const integration = await Integration.findOne({ workspace: workspaceId, type, connected: true });
    if (!integration) return { ok: false, error: 'Integration not connected' };

    const digits = normalizePhone(phone);
    if (!digits) {
      integration.stats.lastError = `${event}: no phone number in payload`;
      await integration.save();
      return { ok: false, error: 'No phone number' };
    }

    // Always save/update the contact, even if auto-send is off
    // Resolve string tag names to Tag ObjectIds (Contact.tags expects ObjectId refs)
    const tagNames = ((tags && tags.length ? tags : [type]) || []).filter(Boolean);
    const tagIds = [];
    for (const tn of tagNames) {
      try {
        const t = await Tag.findOneAndUpdate(
          { workspace: workspaceId, name: String(tn) },
          { $setOnInsert: { workspace: workspaceId, name: String(tn) } },
          { upsert: true, new: true }
        );
        if (t && t._id) tagIds.push(t._id);
      } catch (e) {}
    }

    const contact = await Contact.findOneAndUpdate(
      { workspace: workspaceId, phone: { $in: [digits, digits.replace(/^91/, '')] } },
      { $setOnInsert: { workspace: workspaceId, phone: digits, status: 'active' },
        ...(name ? { name } : {}), ...(email ? { email } : {}),
        ...(tagIds.length ? { $addToSet: { tags: { $each: tagIds } } } : {}) },
      { upsert: true, new: true }
    );

    integration.stats.totalSynced += 1;
    integration.stats.lastSyncAt = new Date();

    const auto = (integration.automations || {})[event];
    if (!auto || !auto.enabled || !auto.templateName) {
      await integration.save();
      return { ok: true, sent: false, reason: 'Automation disabled for this event' };
    }

    const template = await Template.findOne({ workspace: workspaceId, name: auto.templateName, status: 'approved' });
    if (!template) {
      integration.stats.lastError = `${event}: template "${auto.templateName}" not approved yet`;
      await integration.save();
      return { ok: true, sent: false, reason: 'Template not approved yet' };
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace?.whatsapp?.isConnected || !workspace.whatsapp.accessToken) {
      integration.stats.lastError = `${event}: WhatsApp not connected`;
      await integration.save();
      return { ok: true, sent: false, reason: 'WhatsApp not connected' };
    }

    // Build body parameters matching the template's {{n}} variable count
    const matches = (template.body || '').match(/\{\{(\d+)\}\}/g) || [];
    const varCount = matches.length ? Math.max(...matches.map((m) => parseInt(m.replace(/\D/g, ''), 10))) : 0;
    const values = [];
    for (let i = 0; i < varCount; i++) values.push(String((vars || [])[i] || '-').slice(0, 500));
    const components = varCount ? [{ type: 'body', parameters: values.map((t) => ({ type: 'text', text: t })) }] : [];
    if (template.header?.type === 'image' && template.header.content) {
      components.unshift({ type: 'header', parameters: [{ type: 'image', image: { link: template.header.content } }] });
    } else if (template.header?.type === 'text') {
      const hdrMatches = (template.header.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length) {
        components.unshift({ type: 'header', parameters: hdrMatches.map((m, i) => ({ type: 'text', text: String((vars || [])[i] || '-').replace(/[\n\t]+/g, ' ').slice(0, 60) })) });
      }
    }

    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    // Dynamic URL button(s): supply the variable value so Meta does not reject with (#131008).
    const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(template.buttons, (b, idx) => (vars || [])[idx] || (vars || [])[0] || '-');
    if (_ubComps.length) components.push(..._ubComps);
    const result = await wa.sendTemplateMessage(digits, template.name, template.language || 'en', components);

    if (result.success === false) {
      integration.stats.lastError = `${event}: ${result.error?.message || 'send failed'}`;
      await integration.save();
      return { ok: true, sent: false, reason: result.error?.message || 'Send failed' };
    }

    let conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id });
    if (!conversation) conversation = await Conversation.create({ workspace: workspaceId, contact: contact._id, lastMessageAt: new Date() });

    let renderedText = template.body || '';
    values.forEach((v, i) => { renderedText = renderedText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v); });

    const msg = await Message.create({
      workspace: workspaceId,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type: 'template',
      text: renderedText,
      waMessageId: result?.data?.messages?.[0]?.id || '',
      status: 'sent',
      metadata: { source: 'integration_automation', integration: type, event },
    });
    conversation.lastMessageAt = new Date();
    await conversation.save();

    integration.stats.lastError = '';
    await integration.save();

    const io = require('../server').io;
    if (io) io.to(`workspace:${workspaceId}`).emit('new_message', { message: msg, conversationId: conversation._id });

    // Genuine single new lead from a connected source: start the Lead Nurturing flow if one is set up.
    if (event === 'lead') {
      require('./botFlowEngine').triggerFlowByEvent({ workspaceId, contactId: contact._id, eventKey: 'new_lead', io }).catch(() => {});
    }

    return { ok: true, sent: true };
  } catch (err) {
    console.error(`[IntegrationAuto] ${type}/${event} error:`, err.message);
    return { ok: false, error: err.message };
  }
}

// Example values matching a body's {{n}} variable count
function exampleFor(body, fallback) {
  const matches = (body || '').match(/\{\{(\d+)\}\}/g) || [];
  const count = matches.length ? Math.max(...matches.map((m) => parseInt(m.replace(/\D/g, ''), 10))) : 0;
  const out = [];
  for (let i = 0; i < count; i++) out.push((fallback || [])[i] || `Sample ${i + 1}`);
  return out;
}

// Presets merged with user edits (templateOverrides) + user-added customTemplates
function getEffectivePresets(type, integration) {
  const overrides = integration?.templateOverrides || {};
  const presets = getPresets(type).map((p) => {
    const o = overrides[p.key];
    if (!o) return p;
    return {
      ...p, label: o.label || p.label, body: o.body || p.body,
      example: exampleFor(o.body || p.body, p.example), edited: true,
      headerType: o.headerType || p.headerType, headerText: o.headerText || p.headerText,
      headerImage: o.headerImage || p.headerImage, buttons: o.buttons || p.buttons,
    };
  });
  const customs = (integration?.customTemplates || []).map((c) => ({ ...c, example: exampleFor(c.body, c.example), custom: true }));
  return [...presets, ...customs];
}

// Submit a preset template to Meta for approval (1-click)
async function submitPresetTemplate(workspace, preset) {
  let tpl = await Template.findOne({ workspace: workspace._id, name: preset.name });
  if (tpl && tpl.status === 'approved') return tpl;

  const header = preset.headerType === 'text' && preset.headerText
    ? { type: 'text', content: preset.headerText }
    : preset.headerType === 'image' && preset.headerImage
      ? { type: 'image', content: preset.headerImage }
      : { type: 'none', content: '' };
  const buttons = (preset.buttons || []).filter((b) => b && b.text).slice(0, 3)
    .map((b) => ({ type: b.type === 'url' ? 'url' : 'quick_reply', text: String(b.text).slice(0, 25), url: b.url || '' }));

  if (tpl) {
    if (tpl.body !== preset.body) tpl.body = preset.body;
    tpl.header = header;
    tpl.buttons = buttons;
  }

  if (!tpl) {
    tpl = await Template.create({
      workspace: workspace._id,
      name: preset.name,
      body: preset.body,
      header,
      buttons,
      category: 'utility',
      language: 'en',
      status: 'pending',
      variables: preset.example,
    });
  }

  if (!workspace.whatsapp?.isConnected || !workspace.whatsapp.accessToken) {
    tpl.rejectionReason = 'Connect WhatsApp first, then submit again';
    await tpl.save();
    return tpl;
  }

  const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
  const components = [];
  if (header.type === 'text') components.push({ type: 'HEADER', format: 'TEXT', text: header.content });
  else if (header.type === 'image') components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [header.content] } });
  components.push({ type: 'BODY', text: preset.body, example: { body_text: [preset.example] } });
  if (buttons.length) {
    components.push({ type: 'BUTTONS', buttons: buttons.map((b) => b.type === 'url'
      ? { type: 'URL', text: b.text, url: b.url }
      : { type: 'QUICK_REPLY', text: b.text }) });
  }
  const result = await wa.createTemplate(
    preset.name, 'UTILITY', 'en', components,
    workspace.whatsapp.wabaId || workspace.whatsapp.businessAccountId
  );

  if (result.success && result.data?.id) {
    tpl.metaTemplateId = result.data.id;
    tpl.status = result.data.status?.toLowerCase() || 'pending';
    tpl.rejectionReason = '';
  } else {
    tpl.rejectionReason = result.error?.error_user_msg || result.error?.message || 'Meta submission failed';
  }
  await tpl.save();
  return tpl;
}

module.exports = { LEAD_SOURCES, SOURCE_LABELS, getPresets, getEffectivePresets, exampleFor, mapLeadPayload, normalizePhone, runAutomation, submitPresetTemplate, isDuplicateEvent };
