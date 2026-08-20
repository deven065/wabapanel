const Template = require('../models/Template');
const Campaign = require('../models/Campaign');
const WhatsAppService = require('../services/whatsappService');
const { SMART_TEMPLATES, getSmartTemplate } = require('../config/smartTemplates');
const { runCampaignCore } = require('./campaignController');

// Count distinct {{n}} placeholders in a body.
const countVars = (body) => {
  const nums = new Set((body.match(/\{\{(\d+)\}\}/g) || []).map((m) => parseInt(m.replace(/\D/g, ''), 10)));
  return nums.size ? Math.max(...nums) : 0;
};

const sanitizeName = (name) => String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);

const normalizeButtons = (buttons) => (Array.isArray(buttons) ? buttons : [])
  .filter((b) => b && b.text && ['quick_reply', 'url', 'phone'].includes(b.type))
  .slice(0, 3)
  .map((b) => ({ type: b.type, text: String(b.text).slice(0, 25), value: b.value || '' }));

const normalizeHeader = (header) => {
  if (!header || !['text', 'image', 'video', 'document'].includes(header.type)) return { type: 'none', content: '', mediaUrl: '' };
  if (header.type === 'text') return { type: 'text', content: String(header.content || '').slice(0, 60), mediaUrl: '' };
  return { type: header.type, content: '', mediaUrl: header.mediaUrl || '' };
};

// Builds Meta components (header/body/footer/buttons) from a template doc.
const buildMetaComponents = (template) => {
  const components = [];
  if (template.header && template.header.type !== 'none') {
    const headerComponent = { type: 'HEADER', format: template.header.type.toUpperCase() };
    if (template.header.type === 'text') headerComponent.text = template.header.content || '';
    else if (template.header.mediaUrl) headerComponent.example = { header_handle: [template.header.mediaUrl] };
    components.push(headerComponent);
  }
  const varCount = template.smartVarCount;
  const sample = Array.from({ length: varCount }, (_, i) => `Sample ${i + 1}`);
  const bodyComponent = { type: 'BODY', text: template.body };
  if (varCount > 0) bodyComponent.example = { body_text: [sample] };
  components.push(bodyComponent);
  if (template.footer) components.push({ type: 'FOOTER', text: template.footer });
  if (template.buttons && template.buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: template.buttons.map((b) => {
        const btn = { type: b.type === 'quick_reply' ? 'QUICK_REPLY' : b.type === 'phone' ? 'PHONE_NUMBER' : 'URL', text: b.text };
        if (b.type === 'url') btn.url = b.value;
        if (b.type === 'phone') btn.phone_number = String(b.value).replace(/[^\d+]/g, '');
        return btn;
      }),
    });
  }
  return components;
};

// Submits a template to Meta and updates its status. Returns error message or null.
const submitToMeta = async (template, workspace) => {
  if (!workspace.whatsapp?.isConnected || !workspace.whatsapp?.accessToken) return null;
  try {
    const waService = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    const result = await waService.createTemplate(
      template.name, 'UTILITY', template.language, buildMetaComponents(template),
      workspace.whatsapp.wabaId || workspace.whatsapp.businessAccountId
    );
    if (result?.data?.id) {
      template.metaTemplateId = result.data.id;
      template.status = (result.data.status || 'PENDING').toLowerCase();
      template.rejectionReason = '';
      await template.save();
      return null;
    }
    if (result && result.success === false) {
      template.status = 'rejected';
      template.rejectionReason = result.error?.error_user_msg || result.error?.message || 'Meta rejected the submission';
      await template.save();
      return template.rejectionReason;
    }
    return null;
  } catch (e) {
    template.status = 'rejected';
    template.rejectionReason = e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;
    await template.save();
    return template.rejectionReason;
  }
};

const deleteFromMeta = async (template, workspace) => {
  if (!template.metaTemplateId || !workspace.whatsapp?.accessToken) return;
  try {
    const waService = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    await waService.deleteTemplate(template.name, workspace.whatsapp.wabaId || workspace.whatsapp.businessAccountId);
  } catch (e) {
    console.error('[SmartBroadcast] Meta delete failed:', template.name, e.response?.data?.error?.message || e.message);
  }
};

// @GET /api/smart-broadcast/templates
// Returns the pre-built catalog plus the workspace's own smart templates.
const getSmartTemplates = async (req, res) => {
  try {
    const mine = await Template.find({ workspace: req.workspace._id, smartBroadcast: true })
      .select('name body header footer buttons status metaTemplateId smartVarCount language category rejectionReason createdAt')
      .sort('-createdAt')
      .lean();
    res.json({ success: true, data: { catalog: SMART_TEMPLATES, templates: mine } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/smart-broadcast/templates
// body: { seedKey } OR { name, body }. Creates a UTILITY template and submits to Meta.
const createSmartTemplate = async (req, res) => {
  try {
    let { name, body } = req.body;
    const { seedKey } = req.body;
    if (seedKey) {
      const seed = getSmartTemplate(seedKey);
      if (!seed) return res.status(400).json({ success: false, message: 'Unknown template' });
      body = seed.body;
      name = name || `sb_${seed.key}_${Date.now().toString(36)}`;
    }
    if (!name || !body) return res.status(400).json({ success: false, message: 'Name and body are required' });

    // Meta template names: lowercase, alphanumeric + underscore only.
    name = sanitizeName(name);
    const varCount = countVars(body);

    const exists = await Template.findOne({ workspace: req.workspace._id, name });
    if (exists) return res.status(400).json({ success: false, message: 'A template with this name already exists' });

    const template = await Template.create({
      workspace: req.workspace._id,
      name,
      body,
      header: normalizeHeader(req.body.header),
      footer: String(req.body.footer || '').slice(0, 60),
      buttons: normalizeButtons(req.body.buttons),
      category: 'utility',
      language: req.body.language || 'en',
      status: 'pending',
      smartBroadcast: true,
      smartVarCount: varCount,
    });

    const err = await submitToMeta(template, req.workspace);
    if (err) return res.status(400).json({ success: false, message: err, data: template });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/smart-broadcast/templates/:id
// Edits a smart template (incl. rename) and resubmits it to Meta. Since Meta
// does not support editing, the old Meta template is deleted first.
const updateSmartTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({ _id: req.params.id, workspace: req.workspace._id, smartBroadcast: true });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const body = req.body.body || template.body;
    const varCount = countVars(body);

    let name = template.name;
    if (req.body.name && sanitizeName(req.body.name) !== template.name) {
      name = sanitizeName(req.body.name);
      const exists = await Template.findOne({ workspace: req.workspace._id, name, _id: { $ne: template._id } });
      if (exists) return res.status(400).json({ success: false, message: 'A template with this name already exists' });
    }

    // Remove the old version from Meta before resubmitting.
    await deleteFromMeta(template, req.workspace);

    template.name = name;
    template.body = body;
    if (req.body.header !== undefined) template.header = normalizeHeader(req.body.header);
    if (req.body.footer !== undefined) template.footer = String(req.body.footer || '').slice(0, 60);
    if (req.body.buttons !== undefined) template.buttons = normalizeButtons(req.body.buttons);
    if (req.body.language) template.language = req.body.language;
    template.smartVarCount = varCount;
    template.metaTemplateId = '';
    template.status = 'pending';
    template.rejectionReason = '';
    await template.save();

    const err = await submitToMeta(template, req.workspace);
    if (err) return res.status(400).json({ success: false, message: err, data: template });

    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/smart-broadcast/templates/:id
const deleteSmartTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id, smartBroadcast: true });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    await deleteFromMeta(template, req.workspace);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Splits the user's free-form message into the template's variable slots.
// Non-empty lines map to {{1}}..{{N}}; overflow lines fold into the last slot;
// unused slots get a single space (Meta rejects empty params). Meta also
// rejects params containing newlines/tabs or 4+ consecutive spaces.
const cleanParam = (s) => String(s).replace(/[\n\r\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || ' ';
const buildVariables = (message, varCount) => {
  if (!varCount || varCount < 1) return {};
  const lines = String(message || '').split('\n');
  const vars = {};
  for (let i = 1; i <= varCount; i++) {
    if (i < varCount) vars[i] = cleanParam(lines[i - 1] != null ? lines[i - 1] : ' ');
    else vars[i] = cleanParam(lines.slice(varCount - 1).join(' '));
  }
  return vars;
};

// @POST /api/smart-broadcast/send
const sendSmartBroadcast = async (req, res) => {
  try {
    const { templateId, message, name } = req.body;
    if (!templateId) return res.status(400).json({ success: false, message: 'Template is required' });
    if (!req.workspace.whatsapp?.isConnected) return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    const template = await Template.findOne({ _id: templateId, workspace: req.workspace._id, smartBroadcast: true });
    if (!template) return res.status(404).json({ success: false, message: 'Smart template not found' });
    if (template.smartVarCount > 0 && !message) return res.status(400).json({ success: false, message: 'Please write your message' });
    if (template.status !== 'approved') {
      return res.status(400).json({ success: false, message: `Template is "${template.status}". Only approved templates can be sent.` });
    }

    const variables = buildVariables(message || '', template.smartVarCount);

    // Meta limit: template body text with parameters filled must be <= 1024 chars.
    let filled = template.body;
    for (let i = 1; i <= template.smartVarCount; i++) filled = filled.split(`{{${i}}}`).join(variables[i]);
    if (filled.length > 1024) {
      return res.status(400).json({
        success: false,
        message: `Message too long: template text + your message is ${filled.length} characters, WhatsApp allows max 1024. Shorten your message by ${filled.length - 1024} characters.`,
      });
    }

    // Optional send-time header media override (media-header templates only).
    if (req.body.headerMediaUrl && ['image', 'video', 'document'].includes(template.header?.type)) {
      template.header.mediaUrl = req.body.headerMediaUrl;
    }

    const campaign = await Campaign.create({
      workspace: req.workspace._id,
      name: name || `Smart Broadcast ${new Date().toLocaleString()}`,
      type: 'broadcast',
      template: template._id,
      status: 'draft',
      targetType: req.body.targetType || 'all',
      targetChannel: req.body.targetChannel || '',
      senderNumberId: req.body.senderNumberId || '',
      targetSegments: req.body.targetSegments || [],
      targetTags: req.body.targetTags || [],
      targetContacts: req.body.targetContacts || [],
      targetNumbers: req.body.targetNumbers || [],
      variables,
      createdBy: req.user._id,
    });

    const populated = await Campaign.findById(campaign._id).populate('template');
    if (req.body.headerMediaUrl && ['image', 'video', 'document'].includes(populated.template?.header?.type)) {
      populated.template.header.mediaUrl = req.body.headerMediaUrl;
    }
    await runCampaignCore(populated, req.workspace, req.app.get('io'));
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/smart-broadcast/campaigns/:id/stop
const stopSmartCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, status: 'running' },
      { status: 'paused' },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found or not running' });
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/smart-broadcast/reports — recent smart broadcast campaigns.
const getSmartReports = async (req, res) => {
  try {
    const smartIds = await Template.find({ workspace: req.workspace._id, smartBroadcast: true }).distinct('_id');
    const campaigns = await Campaign.find({ workspace: req.workspace._id, type: 'broadcast', template: { $in: smartIds } })
      .populate('template', 'name')
      .sort('-createdAt')
      .limit(50)
      .lean();
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSmartTemplates, createSmartTemplate, updateSmartTemplate, deleteSmartTemplate, sendSmartBroadcast, stopSmartCampaign, getSmartReports };
