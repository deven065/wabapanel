const router = require('express').Router();

// Public REST API (v1) — auth via X-API-Key header (workspace API key).
async function apiKeyAuth(req, res, next) {
  try {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key) return res.status(401).json({ success: false, message: 'X-API-Key header missing' });
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findOne({ apiKey: key });
    if (!workspace) return res.status(401).json({ success: false, message: 'Invalid API key' });
    req.workspace = workspace;
    next();
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

router.use(apiKeyAuth);

router.get('/me', (req, res) => {
  res.json({ success: true, data: { id: req.workspace._id, name: req.workspace.name } });
});

async function upsertContactAndConversation(workspace, phone, name) {
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const clean = String(phone).replace(/[^0-9]/g, '');
  let contact = await Contact.findOne({ workspace: workspace._id, phone: clean });
  if (!contact) contact = await Contact.create({ workspace: workspace._id, phone: clean, name: name || '', source: 'api' });
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id },
    { workspace: workspace._id, contact: contact._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { contact, conversation };
}

// POST /v1/messages/send { phone, message }
router.post('/messages/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ success: false, message: 'phone and message are required' });
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const WhatsAppService = require('../services/whatsappService');
    const Message = require('../models/Message');
    const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    const result = await wa.sendTextMessage(contact.phone, message);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'Send failed' });
    const msgDoc = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'text', text: message,
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
    });
    if (global.io) global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message: msgDoc, conversationId: conversation._id });
    res.json({ success: true, data: { message_id: msgDoc._id, wa_message_id: msgDoc.waMessageId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/messages/template { phone, template_name, language, variables, header_variables, button_variables }
router.post('/messages/template', async (req, res) => {
  try {
    const { phone, template_name, language = 'en', variables = [], header_variables = [], button_variables = [], header_media = null } = req.body;
    if (!phone || !template_name) return res.status(400).json({ success: false, message: 'phone and template_name are required' });
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const WhatsAppService = require('../services/whatsappService');
    const Message = require('../models/Message');
    const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    const Template = require('../models/Template');
    const tpl = await Template.findOne({ workspace: req.workspace._id, name: template_name }).lean();
    const components = [];
    const hdrType = tpl && tpl.header ? tpl.header.type : 'none';
    const mediaTypes = ['image', 'video', 'document'];
    if (header_media && header_media.link && mediaTypes.includes(header_media.type || hdrType)) {
      const t = header_media.type || hdrType;
      const mediaObj = { link: String(header_media.link) };
      if (t === 'document' && header_media.filename) mediaObj.filename = String(header_media.filename);
      components.push({ type: 'header', parameters: [{ type: t, [t]: mediaObj }] });
    } else if (mediaTypes.includes(hdrType) && tpl.header.mediaUrl) {
      components.push({ type: 'header', parameters: [{ type: hdrType, [hdrType]: { link: tpl.header.mediaUrl } }] });
    } else if (Array.isArray(header_variables) && header_variables.length) {
      components.push({ type: 'header', parameters: header_variables.map((v) => ({ type: 'text', text: String(v) })) });
    }
    if (Array.isArray(variables) && variables.length) {
      components.push({ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v) })) });
    }
    // Dynamic button parameters (e.g. a URL button with a variable, or a copy-code/quick-reply button).
    if (Array.isArray(button_variables)) {
      button_variables.forEach((b) => {
        if (!b || b.text === undefined || b.text === null) return;
        components.push({
          type: 'button',
          sub_type: b.sub_type || 'url',
          index: String(b.index != null ? b.index : 0),
          parameters: [{ type: b.sub_type === 'copy_code' ? 'coupon_code' : 'text', text: String(b.text) }],
        });
      });
    }
    const result = await wa.sendTemplateMessage(contact.phone, template_name, language, components);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'Send failed' });
    const msgDoc = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'template', text: `Template: ${template_name}`,
      template: { name: template_name },
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
    });
    if (global.io) global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message: msgDoc, conversationId: conversation._id });
    res.json({ success: true, data: { message_id: msgDoc._id, wa_message_id: msgDoc.waMessageId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/contacts?search=&page=&limit=
router.get('/contacts', async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const filter = { workspace: req.workspace._id };
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
    }
    const [contacts, total] = await Promise.all([
      Contact.find(filter).select('name phone email leadScore birthday anniversary customFields createdAt').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      Contact.countDocuments(filter),
    ]);
    res.json({ success: true, data: contacts, pagination: { page, limit, total } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/contacts { name, phone, email }
router.post('/contacts', async (req, res) => {
  try {
    const { name = '', phone, email = '' } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const Contact = require('../models/Contact');
    const clean = String(phone).replace(/[^0-9]/g, '');
    const contact = await Contact.findOneAndUpdate(
      { workspace: req.workspace._id, phone: clean },
      { $set: { ...(name ? { name } : {}), ...(email ? { email } : {}) }, $setOnInsert: { workspace: req.workspace._id, phone: clean, source: 'api' } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: contact });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/conversations — recent conversations
router.get('/conversations', async (req, res) => {
  try {
    const Conversation = require('../models/Conversation');
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const convs = await Conversation.find({ workspace: req.workspace._id })
      .populate('contact', 'name phone')
      .sort('-updatedAt').limit(limit)
      .select('contact status lastMessage unreadCount sentiment updatedAt').lean();
    res.json({ success: true, data: convs });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/messages/media { phone, media_type, url, caption }
router.post('/messages/media', async (req, res) => {
  try {
    const { phone, media_type, url, caption = '' } = req.body;
    if (!phone || !media_type || !url) return res.status(400).json({ success: false, message: 'phone, media_type and url are required' });
    if (!['image', 'video', 'document', 'audio'].includes(media_type)) return res.status(400).json({ success: false, message: 'media_type must be image, video, document or audio' });
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const WhatsAppService = require('../services/whatsappService');
    const Message = require('../models/Message');
    const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    const result = await wa.sendMediaMessage(contact.phone, media_type, url, caption);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'Send failed' });
    const msgDoc = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: media_type, text: caption, media: { url },
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
    });
    if (global.io) global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message: msgDoc, conversationId: conversation._id });
    res.json({ success: true, data: { message_id: msgDoc._id, wa_message_id: msgDoc.waMessageId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/messages/interactive/buttons { phone, body, buttons:[{id,title}|"title"], header, footer }
// Reply-buttons message (max 3). Must be sent inside an open 24hr session.
router.post('/messages/interactive/buttons', async (req, res) => {
  try {
    const { phone, body, buttons = [], header = '', footer = '' } = req.body;
    if (!phone || !body || !Array.isArray(buttons) || buttons.length === 0) {
      return res.status(400).json({ success: false, message: 'phone, body and buttons[] are required' });
    }
    if (buttons.length > 3) return res.status(400).json({ success: false, message: 'A maximum of 3 buttons is allowed' });
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const WhatsAppService = require('../services/whatsappService');
    const Message = require('../models/Message');
    const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    const replyButtons = buttons.map((b, i) => {
      const title = String((b && typeof b === 'object') ? b.title : b).slice(0, 20);
      const id = String((b && typeof b === 'object' && b.id) ? b.id : `btn_${i + 1}`).slice(0, 256);
      return { type: 'reply', reply: { id, title } };
    });
    const interactive = { type: 'button', body: { text: String(body) }, action: { buttons: replyButtons } };
    if (footer) interactive.footer = { text: String(footer) };
    if (header) interactive.header = { type: 'text', text: String(header) };
    const result = await wa.sendInteractiveMessage(contact.phone, interactive);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'Send failed' });
    const msgDoc = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'interactive', text: String(body),
      interactive: { type: 'button', body: String(body), buttons: replyButtons.map((b) => ({ id: b.reply.id, title: b.reply.title })) },
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
    });
    if (global.io) global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message: msgDoc, conversationId: conversation._id });
    res.json({ success: true, data: { message_id: msgDoc._id, wa_message_id: msgDoc.waMessageId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/messages/interactive/list { phone, body, button, sections:[{title, rows:[{id,title,description}]}], header, footer }
// Interactive list (menu) message. Must be sent inside an open 24hr session.
router.post('/messages/interactive/list', async (req, res) => {
  try {
    const { phone, body, button = 'Menu', sections = [], header = '', footer = '' } = req.body;
    if (!phone || !body || !Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ success: false, message: 'phone, body and sections[] are required' });
    }
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const WhatsAppService = require('../services/whatsappService');
    const Message = require('../models/Message');
    const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    let rowIdx = 0;
    const outSections = sections.map((s) => ({
      title: String((s && s.title) || '').slice(0, 24),
      rows: ((s && Array.isArray(s.rows)) ? s.rows : []).map((r) => {
        rowIdx += 1;
        const row = {
          id: String((r && r.id) || `row_${rowIdx}`).slice(0, 200),
          title: String((r && r.title) || '').slice(0, 24),
        };
        if (r && r.description) row.description = String(r.description).slice(0, 72);
        return row;
      }),
    }));
    const interactive = {
      type: 'list',
      body: { text: String(body) },
      action: { button: String(button).slice(0, 20), sections: outSections },
    };
    if (footer) interactive.footer = { text: String(footer) };
    if (header) interactive.header = { type: 'text', text: String(header) };
    const result = await wa.sendInteractiveMessage(contact.phone, interactive);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'Send failed' });
    const msgDoc = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'interactive', text: String(body),
      interactive: { type: 'list', body: String(body), ctaText: String(button).slice(0, 20), sections: outSections },
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
    });
    if (global.io) global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message: msgDoc, conversationId: conversation._id });
    res.json({ success: true, data: { message_id: msgDoc._id, wa_message_id: msgDoc.waMessageId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/messages?conversation_id=&limit=
router.get('/messages', async (req, res) => {
  try {
    if (!req.query.conversation_id) return res.status(400).json({ success: false, message: 'conversation_id query param is required' });
    const Message = require('../models/Message');
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const msgs = await Message.find({ workspace: req.workspace._id, conversation: req.query.conversation_id })
      .sort('-createdAt').limit(limit)
      .select('direction type text media status waMessageId createdAt').lean();
    res.json({ success: true, data: msgs.reverse() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/contacts/:id
router.get('/contacts/:id', async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const contact = await Contact.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/templates?status=
router.get('/templates', async (req, res) => {
  try {
    const Template = require('../models/Template');
    const filter = { workspace: req.workspace._id };
    if (req.query.status) filter.status = String(req.query.status).toLowerCase();
    const tpls = await Template.find(filter).select('name category language status body header footer buttons variables carousel createdAt').sort('-createdAt').limit(200).lean();
    res.json({ success: true, data: tpls });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/appointments?status=&from=&to=
router.get('/appointments', async (req, res) => {
  try {
    const Appointment = require('../models/Appointment');
    const filter = { workspace: req.workspace._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to + 'T23:59:59');
    }
    const appts = await Appointment.find(filter).sort('date startTime').limit(200)
      .select('title contactName contactPhone date startTime endTime duration status notes').lean();
    res.json({ success: true, data: appts });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/appointments { phone, name, title, date, start_time, duration, notes }
router.post('/appointments', async (req, res) => {
  try {
    const { phone, name = '', title, date, start_time, duration = 30, notes = '' } = req.body;
    if (!title || !date || !start_time) return res.status(400).json({ success: false, message: 'title, date (YYYY-MM-DD) and start_time (HH:MM) are required' });
    const Appointment = require('../models/Appointment');
    let contact = null;
    if (phone) ({ contact } = await upsertContactAndConversation(req.workspace, phone, name));
    const [h, m] = String(start_time).split(':').map(Number);
    const endMin = h * 60 + m + (parseInt(duration) || 30);
    const endTime = String(Math.floor(endMin / 60) % 24).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
    const appt = await Appointment.create({
      workspace: req.workspace._id, title, date: new Date(date), startTime: start_time, endTime,
      duration: parseInt(duration) || 30, notes,
      contact: contact?._id, contactName: contact?.name || name, contactPhone: contact?.phone || String(phone || ''),
      metadata: { source: 'api' },
    });
    res.json({ success: true, data: appt });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/tickets?status=
router.get('/tickets', async (req, res) => {
  try {
    const Ticket = require('../models/Ticket');
    const filter = { workspace: req.workspace._id };
    if (req.query.status) filter.status = req.query.status;
    const tickets = await Ticket.find(filter).populate('contact', 'name phone').sort('-createdAt').limit(200).lean();
    res.json({ success: true, data: tickets });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /v1/tickets/:id { status: open|closed }
router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ success: false, message: 'status must be open or closed' });
    const Ticket = require('../models/Ticket');
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { status, ...(status === 'closed' ? { closedAt: new Date() } : {}) },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /v1/contacts/:id { name, email, custom_fields }
router.put('/contacts/:id', async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const { name, email, custom_fields } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (custom_fields && typeof custom_fields === 'object') {
      Object.entries(custom_fields).forEach(([k, v]) => { updates[`customFields.${k}`] = v; });
    }
    const contact = await Contact.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, { $set: updates }, { new: true });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /v1/contacts/:id
router.delete('/contacts/:id', async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, message: 'Contact deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/contacts/:id/tags { tags: ["vip", "lead"] } — add tags by name (created if missing)
router.post('/contacts/:id/tags', async (req, res) => {
  try {
    const { tags = [] } = req.body;
    if (!Array.isArray(tags) || tags.length === 0) return res.status(400).json({ success: false, message: 'tags array is required' });
    const Contact = require('../models/Contact');
    const Tag = require('../models/Tag');
    const contact = await Contact.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    const tagIds = [];
    for (const name of tags) {
      const tag = await Tag.findOneAndUpdate(
        { workspace: req.workspace._id, name: String(name).trim() },
        { $setOnInsert: { workspace: req.workspace._id, name: String(name).trim() } },
        { upsert: true, new: true }
      );
      tagIds.push(tag._id);
    }
    await Contact.updateOne({ _id: contact._id }, { $addToSet: { tags: { $each: tagIds } } });
    res.json({ success: true, message: 'Tags added' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/tags
router.get('/tags', async (req, res) => {
  try {
    const Tag = require('../models/Tag');
    const tags = await Tag.find({ workspace: req.workspace._id }).select('name color').lean();
    res.json({ success: true, data: tags });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/segments
router.get('/segments', async (req, res) => {
  try {
    const Segment = require('../models/Segment');
    const segments = await Segment.find({ workspace: req.workspace._id }).select('name description contactCount').lean();
    res.json({ success: true, data: segments });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/conversations/:id/assign { agent_email } — assign chat to an agent
router.post('/conversations/:id/assign', async (req, res) => {
  try {
    const { agent_email } = req.body;
    if (!agent_email) return res.status(400).json({ success: false, message: 'agent_email is required' });
    const User = require('../models/User');
    const Conversation = require('../models/Conversation');
    const agent = await User.findOne({ email: String(agent_email).toLowerCase() });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { assignedAgent: agent._id },
      { new: true }
    );
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, data: { conversation_id: conv._id, assigned_to: agent.email } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/conversations/:id/close
router.post('/conversations/:id/close', async (req, res) => {
  try {
    const Conversation = require('../models/Conversation');
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { isResolved: true, resolvedAt: new Date(), status: 'closed' },
      { new: true }
    );
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, message: 'Conversation closed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/broadcasts — list broadcasts with stats
router.get('/broadcasts', async (req, res) => {
  try {
    const Campaign = require('../models/Campaign');
    const campaigns = await Campaign.find({ workspace: req.workspace._id, type: 'broadcast' })
      .select('name status stats scheduledAt startedAt completedAt createdAt').sort('-createdAt').limit(100).lean();
    res.json({ success: true, data: campaigns });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/broadcasts { name, template_name, language, phones: [] } — create & start a template broadcast
router.post('/broadcasts', async (req, res) => {
  try {
    const { name, template_name, language = 'en', phones = [] } = req.body;
    if (!name || !template_name || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, message: 'name, template_name and phones[] are required' });
    }
    if (!req.workspace.whatsapp?.accessToken) return res.status(400).json({ success: false, message: 'WhatsApp not connected on this workspace' });
    const Template = require('../models/Template');
    const Campaign = require('../models/Campaign');
    const template = await Template.findOne({ workspace: req.workspace._id, name: template_name });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    const campaign = await Campaign.create({
      workspace: req.workspace._id, name, type: 'broadcast', template: template._id,
      targetType: 'numbers', targetNumbers: phones.map(p => String(p).replace(/[^0-9]/g, '')),
      status: 'scheduled', scheduledAt: new Date(), variables: { language },
    });
    res.json({ success: true, data: { broadcast_id: campaign._id, status: campaign.status, recipients: phones.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/broadcasts/:id — broadcast detail with stats
router.get('/broadcasts/:id', async (req, res) => {
  try {
    const Campaign = require('../models/Campaign');
    const c = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id })
      .select('name status stats scheduledAt startedAt completedAt').lean();
    if (!c) return res.status(404).json({ success: false, message: 'Broadcast not found' });
    res.json({ success: true, data: c });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/orders?status=
router.get('/orders', async (req, res) => {
  try {
    const Order = require('../models/Order');
    const filter = { workspace: req.workspace._id };
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).populate('contact', 'name phone').sort('-createdAt').limit(200).lean();
    res.json({ success: true, data: orders });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/webhooks — list registered webhook subscriptions
// POST /v1/webhooks { url, events: ["message.received","message.status","contact.created"] }
// DELETE /v1/webhooks/:id
router.get('/webhooks', async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const ws = await Workspace.findById(req.workspace._id).select('apiWebhooks').lean();
    res.json({ success: true, data: ws.apiWebhooks || [] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/webhooks', async (req, res) => {
  try {
    const { url, events = ['message.received'] } = req.body;
    if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ success: false, message: 'A valid url is required' });
    const Workspace = require('../models/Workspace');
    const mongoose = require('mongoose');
    const hook = { _id: new mongoose.Types.ObjectId(), url, events, createdAt: new Date() };
    await Workspace.updateOne({ _id: req.workspace._id }, { $push: { apiWebhooks: hook } });
    res.json({ success: true, data: hook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    await Workspace.updateOne({ _id: req.workspace._id }, { $pull: { apiWebhooks: { _id: req.params.id } } });
    res.json({ success: true, message: 'Webhook removed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ============================================================================
// Extended v1 endpoints — Payment Links, Wallet, CRM/Pipeline, Bot Flows,
// Quick Replies, Agents. All workspace-scoped via X-API-Key.
// ============================================================================

// ---------------- Payment Links ----------------
// GET /v1/payment-links?status=paid&limit=50
router.get('/payment-links', async (req, res) => {
  try {
    const PaymentLink = require('../models/PaymentLink');
    const q = { workspace: req.workspace._id };
    if (req.query.status) q.status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const links = await PaymentLink.find(q).sort('-createdAt').limit(limit).populate('contact', 'name phone').lean();
    res.json({
      success: true,
      data: links.map((l) => ({
        id: l._id, amount: l.amount, currency: l.currency, method: l.method, status: l.status,
        link: l.link, description: l.description,
        contact: l.contact ? { name: l.contact.name, phone: l.contact.phone } : null,
        paid_at: l.paidAt || null, created_at: l.createdAt,
      })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/payment-links { phone, amount, method?, description?, currency?, upi_id?, send? }
router.post('/payment-links', async (req, res) => {
  try {
    const { phone, amount, method = 'razorpay', description = '', currency = 'INR', upi_id: upiIdIn, send = true } = req.body;
    if (!phone || !amount) return res.status(400).json({ success: false, message: 'phone and amount are required' });
    const PaymentLink = require('../models/PaymentLink');
    const Integration = require('../models/Integration');
    const { contact, conversation } = await upsertContactAndConversation(req.workspace, phone);
    let link = '', externalId = '', razorpayLinkId = '', upiId = '';

    if (method === 'upi') {
      upiId = upiIdIn || '';
      if (!upiId) return res.status(400).json({ success: false, message: 'upi_id is required for method=upi' });
      const pn = encodeURIComponent(req.workspace.name || 'Business');
      link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${pn}&am=${amount}&cu=INR${description ? '&tn=' + encodeURIComponent(description) : ''}`;
    } else if (method === 'razorpay') {
      const integ = await Integration.findOne({ workspace: req.workspace._id, type: 'razorpay', connected: true });
      if (!integ?.config?.apiKey || !integ?.config?.apiSecret) {
        return res.status(400).json({ success: false, message: 'Connect Razorpay first on the Integrations page (Key ID & Secret)' });
      }
      const Razorpay = require('razorpay');
      const rzp = new Razorpay({ key_id: integ.config.apiKey, key_secret: integ.config.apiSecret });
      const plink = await rzp.paymentLink.create({
        amount: Math.round(Number(amount) * 100), currency: 'INR',
        description: description || `Payment of Rs.${amount}`,
        customer: { name: contact.name || 'Customer', contact: `+${String(contact.phone).replace(/^\+/, '')}` },
        notify: { sms: false, email: false }, notes: { workspace: String(req.workspace._id) },
      });
      link = plink.short_url; razorpayLinkId = plink.id; externalId = plink.id;
    } else {
      const integ = await Integration.findOne({ workspace: req.workspace._id, type: method, connected: true });
      if (!integ?.config) return res.status(400).json({ success: false, message: `Connect ${method} first on the Integrations page` });
      const { createGatewayLink } = require('../services/gatewayLinks');
      const result = await createGatewayLink(method, integ.config, {
        amount: Number(amount), currency, description,
        customer: { name: contact.name, phone: contact.phone, email: contact.email },
      });
      link = result.link; externalId = result.externalId || '';
    }

    const pl = await PaymentLink.create({
      workspace: req.workspace._id, contact: contact._id, conversation: conversation._id,
      amount: Number(amount), description, method, currency, link, upiId, externalId, razorpayLinkId,
      createdBy: req.workspace.owner,
    });

    if (send && link && req.workspace.whatsapp?.accessToken) {
      try {
        const WhatsAppService = require('../services/whatsappService');
        const Message = require('../models/Message');
        const sym = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[currency] || (currency + ' ');
        const body = `${description ? description + '\n' : ''}${sym}${amount}\nPay here: ${link}`;
        const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
        const r = await wa.sendTextMessage(contact.phone, body);
        await Message.create({
          workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
          direction: 'outbound', type: 'text', text: body,
          waMessageId: r?.data?.messages?.[0]?.id || '', status: 'sent', metadata: { source: 'api' },
        });
      } catch (e) { /* link created; delivery is best-effort */ }
    }

    res.json({ success: true, data: { id: pl._id, link, amount: pl.amount, currency, method, status: pl.status } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------------- Wallet ----------------
// GET /v1/wallet — current balance of the workspace owner
router.get('/wallet', async (req, res) => {
  try {
    const User = require('../models/User');
    const owner = await User.findById(req.workspace.owner).select('walletBalance').lean();
    res.json({ success: true, data: { balance: owner?.walletBalance || 0, currency: 'INR' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/wallet/transactions?limit=50 — recent wallet ledger entries
router.get('/wallet/transactions', async (req, res) => {
  try {
    const WalletTransaction = require('../models/WalletTransaction');
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const txns = await WalletTransaction.find({ workspace: req.workspace._id }).sort('-createdAt').limit(limit).lean();
    res.json({
      success: true,
      data: txns.map((t) => ({
        id: t._id, type: t.type, amount: t.amount, balance_after: t.balanceAfter,
        category: t.category, description: t.description, created_at: t.createdAt,
      })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------------- CRM / Pipeline ----------------
// GET /v1/pipelines — pipelines with their stages
router.get('/pipelines', async (req, res) => {
  try {
    const Pipeline = require('../models/Pipeline');
    const pipelines = await Pipeline.find({ workspace: req.workspace._id, status: 'active' }).select('name stages currency deals').lean();
    res.json({
      success: true,
      data: pipelines.map((p) => ({
        id: p._id, name: p.name, currency: p.currency,
        stages: (p.stages || []).map((s) => ({ id: s.id, name: s.name })),
        deal_count: (p.deals || []).length,
      })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/deals?status=open&stage=xxx&limit=100 — deals across all pipelines
router.get('/deals', async (req, res) => {
  try {
    const Pipeline = require('../models/Pipeline');
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
    const pipelines = await Pipeline.find({ workspace: req.workspace._id, status: 'active' })
      .populate('deals.contact', 'name phone').lean();
    let deals = [];
    for (const p of pipelines) {
      for (const d of (p.deals || [])) {
        if (req.query.status && d.status !== req.query.status) continue;
        if (req.query.stage && d.stage !== req.query.stage) continue;
        deals.push({
          id: d._id, pipeline_id: p._id, pipeline: p.name, title: d.title, value: d.value,
          stage: d.stage, status: d.status,
          contact: d.contact ? { name: d.contact.name, phone: d.contact.phone } : null,
          notes: d.notes, created_at: d.createdAt, updated_at: d.updatedAt,
        });
      }
    }
    deals.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    res.json({ success: true, data: deals.slice(0, limit) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/deals { title, value?, phone?, stage?, pipeline_id?, notes? }
router.post('/deals', async (req, res) => {
  try {
    const { title, value = 0, phone, stage, pipeline_id: pipelineId, notes = '' } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });
    const Pipeline = require('../models/Pipeline');
    const pipeline = pipelineId
      ? await Pipeline.findOne({ _id: pipelineId, workspace: req.workspace._id })
      : await Pipeline.findOne({ workspace: req.workspace._id, status: 'active' }).sort('createdAt');
    if (!pipeline) return res.status(400).json({ success: false, message: 'No pipeline found — create one in the Pipeline Board first' });
    const stageId = stage || (pipeline.stages[0] && pipeline.stages[0].id);
    if (!stageId) return res.status(400).json({ success: false, message: 'Pipeline has no stages' });
    let contactId;
    if (phone) { const { contact } = await upsertContactAndConversation(req.workspace, phone); contactId = contact._id; }
    const deal = { title, value: Number(value) || 0, stage: stageId, notes, status: 'open', contact: contactId };
    pipeline.deals.push(deal);
    await pipeline.save();
    const created = pipeline.deals[pipeline.deals.length - 1];
    res.json({ success: true, data: { id: created._id, pipeline_id: pipeline._id, title: created.title, value: created.value, stage: created.stage, status: created.status } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /v1/deals/:id { stage?, status?, value?, notes? }
router.patch('/deals/:id', async (req, res) => {
  try {
    const Pipeline = require('../models/Pipeline');
    const pipeline = await Pipeline.findOne({ workspace: req.workspace._id, 'deals._id': req.params.id });
    if (!pipeline) return res.status(404).json({ success: false, message: 'Deal not found' });
    const deal = pipeline.deals.id(req.params.id);
    if (req.body.stage !== undefined) deal.stage = req.body.stage;
    if (req.body.value !== undefined) deal.value = Number(req.body.value) || 0;
    if (req.body.notes !== undefined) deal.notes = req.body.notes;
    if (req.body.status !== undefined) {
      deal.status = req.body.status;
      if (req.body.status === 'won' || req.body.status === 'lost') deal.closedAt = new Date();
    }
    await pipeline.save();
    res.json({ success: true, data: { id: deal._id, stage: deal.stage, status: deal.status, value: deal.value } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------------- Bot Flows ----------------
// GET /v1/bot-flows — list flows
router.get('/bot-flows', async (req, res) => {
  try {
    const BotFlow = require('../models/BotFlow');
    const flows = await BotFlow.find({ workspace: req.workspace._id }).select('name isActive runs matchType keywords').lean();
    res.json({
      success: true,
      data: flows.map((f) => ({ id: f._id, name: f.name, active: !!f.isActive, runs: f.runs || 0, match_type: f.matchType })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /v1/bot-flows/:id/toggle { active }
router.post('/bot-flows/:id/toggle', async (req, res) => {
  try {
    const BotFlow = require('../models/BotFlow');
    const active = req.body.active !== undefined ? !!req.body.active : true;
    const flow = await BotFlow.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { isActive: active }, { new: true }
    ).select('name isActive');
    if (!flow) return res.status(404).json({ success: false, message: 'Bot flow not found' });
    res.json({ success: true, data: { id: flow._id, name: flow.name, active: flow.isActive } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------------- Quick Replies ----------------
// GET /v1/quick-replies — list saved quick replies
router.get('/quick-replies', async (req, res) => {
  try {
    const QuickReply = require('../models/QuickReply');
    const qrs = await QuickReply.find({ $or: [{ workspace: req.workspace._id }, { isGlobal: true }] }).select('title message shortcut isGlobal').lean();
    res.json({
      success: true,
      data: qrs.map((q) => ({ id: q._id, title: q.title, message: q.message, shortcut: q.shortcut, global: !!q.isGlobal })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------------- Agents ----------------
// GET /v1/agents — workspace agents (owner + members)
router.get('/agents', async (req, res) => {
  try {
    const User = require('../models/User');
    const ids = new Set();
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) if (m.user) ids.add(String(m.user));
    const users = await User.find({ _id: { $in: Array.from(ids) } }).select('name email role').lean();
    res.json({ success: true, data: users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /v1/agents/performance — assigned/resolved chats + messages sent (last 30 days)
router.get('/agents/performance', async (req, res) => {
  try {
    const User = require('../models/User');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const ws = req.workspace._id;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ids = new Set();
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) if (m.user) ids.add(String(m.user));
    const agents = await User.find({ _id: { $in: Array.from(ids) } }).select('name email role').lean();
    const [assigned, resolved, sent] = await Promise.all([
      Conversation.aggregate([{ $match: { workspace: ws, assignedAgent: { $ne: null } } }, { $group: { _id: '$assignedAgent', count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: { workspace: ws, isResolved: true, resolvedBy: { $ne: null }, resolvedAt: { $gte: since } } }, { $group: { _id: '$resolvedBy', count: { $sum: 1 } } }]),
      Message.aggregate([{ $match: { workspace: ws, direction: 'outbound', sentBy: { $ne: null }, createdAt: { $gte: since } } }, { $group: { _id: '$sentBy', count: { $sum: 1 } } }]),
    ]);
    const toMap = (arr) => Object.fromEntries(arr.map((a) => [String(a._id), a.count]));
    const aMap = toMap(assigned), rMap = toMap(resolved), sMap = toMap(sent);
    res.json({
      success: true,
      data: agents.map((a) => ({
        id: a._id, name: a.name, email: a.email, role: a.role,
        assigned_chats: aMap[String(a._id)] || 0,
        resolved_chats_30d: rMap[String(a._id)] || 0,
        messages_sent_30d: sMap[String(a._id)] || 0,
      })),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
