const Template = require('../models/Template');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HEADER_MEDIA_DIR = path.join(__dirname, '..', '..', 'uploads', 'tpl-headers');
const PUBLIC_BASE = process.env.BACKEND_URL || 'https://api.wabapanel.com';

async function cacheHeaderMedia(url, templateName, existingUrl) {
  if (!url) return existingUrl || '';
  if (url.startsWith(PUBLIC_BASE)) return url;
  try {
    fs.mkdirSync(HEADER_MEDIA_DIR, { recursive: true });
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    const ct = resp.headers['content-type'] || '';
    const ext = ct.includes('png') ? '.png' : ct.includes('pdf') ? '.pdf' : ct.includes('mp4') ? '.mp4' : '.jpg';
    const fname = templateName.replace(/[^a-z0-9_-]/gi, '_') + ext;
    const fpath = path.join(HEADER_MEDIA_DIR, fname);
    fs.writeFileSync(fpath, resp.data);
    if (ext !== '.pdf' && ext !== '.mp4' && resp.data.length > 4800000) {
      try { require('child_process').execFileSync('convert', [fpath, '-resize', '2000x2000>', '-quality', '82', fpath]); } catch { /* keep original */ }
    }
    return PUBLIC_BASE + '/api/uploads/tpl-headers/' + fname;
  } catch {
    return (existingUrl && existingUrl.startsWith(PUBLIC_BASE)) ? existingUrl : (existingUrl || url);
  }
}

// Meta rejects template bodies with 3+ consecutive newlines, or leading/trailing
// whitespace around the text. Clean the text so submissions don't bounce.
function sanitizeTemplateText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// If a media-header template has no local media (e.g. synced before media caching,
// or created directly on Meta), pull the header sample from Meta and cache it so
// campaign/manual sends still work.
async function ensureTemplateHeaderMedia(template, workspace) {
  try {
    if (!template || !template.header) return '';
    const hType = template.header.type;
    if (!['image', 'video', 'document'].includes(hType)) return '';
    if (template.header.mediaUrl) return template.header.mediaUrl;
    const wa = workspace && workspace.whatsapp;
    if (!wa || !wa.accessToken) return '';
    const waService = new WhatsAppService(wa.accessToken, wa.phoneNumberId);
    const result = await waService.getTemplates(100, wa.wabaId || wa.businessAccountId);
    const metaTpl = (result.data || []).find(t => t.name === template.name);
    const headerComp = metaTpl && (metaTpl.components || []).find(c => c.type === 'HEADER');
    const handleUrl = headerComp && headerComp.example && headerComp.example.header_handle && headerComp.example.header_handle[0];
    if (!handleUrl) return '';
    const cached = await cacheHeaderMedia(handleUrl, template.name, '');
    if (cached && cached.startsWith(PUBLIC_BASE)) {
      await Template.updateOne({ _id: template._id }, { $set: { 'header.mediaUrl': cached } });
      return cached;
    }
    return '';
  } catch (e) {
    console.error('[Template] ensureTemplateHeaderMedia failed:', template && template.name, e.response?.data?.error?.message || e.message);
    return '';
  }
}

// @GET /api/templates
const getTemplates = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, search, type } = req.query;
    const query = {};

    if (type === 'explore') {
      query.isGlobal = true;
    } else {
      query.workspace = req.workspace._id;
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Template.countDocuments(query);
    const templates = await Template.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, templates, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper: format phone number for Meta API (must be +CCXXXXXXXXXX)
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Already has + prefix - return as-is
  if (cleaned.startsWith('+')) return cleaned;
  // 10 digits = Indian mobile without country code
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return '+91' + cleaned;
  }
  // 12 digits starting with 91 = Indian mobile without +
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned;
  }
  // Otherwise just add + prefix
  return '+' + cleaned;
}

// Helper: extract variable count and generate sample values
function getBodyVariableExamples(bodyText) {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g);
  if (!matches || matches.length === 0) return null;
  // Get unique variable numbers and find max
  const numbers = [...new Set(matches.map(m => parseInt(m.replace(/\{|\}/g, ''))))];
  const maxVar = Math.max(...numbers);
  // Generate sample values for each variable position
  const sampleValues = [];
  for (let i = 1; i <= maxVar; i++) {
    sampleValues.push(`Sample_${i}`);
  }
  return [sampleValues]; // Meta expects [[value1, value2, ...]]
}

// @POST /api/templates
const createTemplate = async (req, res) => {
  try {
    const data = { ...req.body };
    // Extract body from components if not provided directly
    if (!data.body && data.components) {
      const bodyComp = data.components.find(c => c.type === 'BODY');
      if (bodyComp) data.body = bodyComp.text || '';
      const headerComp = data.components.find(c => c.type === 'HEADER');
      if (headerComp) {
        data.header = {
          type: headerComp.format?.toLowerCase() || 'text',
          content: headerComp.text || '',
          mediaUrl: headerComp.example?.header_handle?.[0] || '',
        };
      }
      const footerComp = data.components.find(c => c.type === 'FOOTER');
      if (footerComp) data.footer = footerComp.text || '';
      const buttonsComp = data.components.find(c => c.type === 'BUTTONS');
      if (buttonsComp?.buttons) {
        data.buttons = buttonsComp.buttons.map(b => ({
          type: b.type === 'QUICK_REPLY' ? 'quick_reply' : b.type === 'PHONE_NUMBER' ? 'phone' : b.type === 'CATALOG' ? 'catalog' : 'url',
          text: b.text || '',
          value: b.url || b.phone_number || '',
          example: Array.isArray(b.example) ? (b.example[0] || '') : (b.example || ''),
        }));
      }
    }
    // Normalize category to lowercase
    if (data.category) data.category = data.category.toLowerCase();
    // Authentication (OTP) templates: fixed structure, no custom body/header/footer/buttons.
    if (data.category === 'authentication') {
      const a = data.authentication || {};
      data.authentication = {
        otpType: String(a.otpType || 'COPY_CODE').toUpperCase(),
        buttonText: a.buttonText || 'Copy Code',
        codeExpirationMinutes: parseInt(a.codeExpirationMinutes, 10) || 0,
        addSecurityRecommendation: a.addSecurityRecommendation !== false,
      };
      if (!data.body) data.body = '{{1}} is your verification code.';
      data.header = { type: 'none', content: '', mediaUrl: '' };
      data.footer = '';
      data.buttons = [];
      data.carousel = undefined;
    }
    if (data.body) data.body = sanitizeTemplateText(data.body);
    if (data.footer) data.footer = sanitizeTemplateText(data.footer);
    if (data.header && data.header.type === 'text' && data.header.content) {
      data.header.content = sanitizeTemplateText(data.header.content).replace(/\n+/g, ' ');
    }

    const template = await Template.create({
      ...data,
      workspace: req.workspace._id,
      status: 'pending',
    });

    // Sync with WhatsApp API if connected
    if (req.workspace.whatsapp?.isConnected && req.workspace.whatsapp?.accessToken) {
      const waService = new WhatsAppService(
        req.workspace.whatsapp.accessToken,
        req.workspace.whatsapp.phoneNumberId
      );

      const components = [];
      const isAuth = template.category.toUpperCase() === 'AUTHENTICATION';

      if (isAuth) {
        // Authentication templates use a fixed structure — Meta rejects a BODY
        // with a `text` field; the OTP body text is auto-generated by Meta.
        const a = template.authentication || {};
        const bodyC = { type: 'BODY' };
        if (a.addSecurityRecommendation !== false) bodyC.add_security_recommendation = true;
        components.push(bodyC);
        const exp = parseInt(a.codeExpirationMinutes, 10);
        if (exp && exp >= 1 && exp <= 90) components.push({ type: 'FOOTER', code_expiration_minutes: exp });
        components.push({
          type: 'BUTTONS',
          buttons: [{ type: 'OTP', otp_type: (a.otpType || 'COPY_CODE').toUpperCase(), text: a.buttonText || 'Copy Code' }],
        });
      } else {
      // HEADER component
      if (template.header.type !== 'none') {
        const headerComponent = {
          type: 'HEADER',
          format: template.header.type.toUpperCase(),
        };
        if (template.header.type === 'text') {
          headerComponent.text = template.header.content || '';
        } else if (template.header.mediaUrl) {
          // Media URL will be uploaded to Meta in createTemplate()
          headerComponent.example = { header_handle: [template.header.mediaUrl] };
        }
        components.push(headerComponent);
      }
      
      // BODY component with variable examples
      const bodyComponent = { type: 'BODY', text: template.body };
      const bodyExamples = getBodyVariableExamples(template.body);
      if (bodyExamples) {
        bodyComponent.example = { body_text: bodyExamples };
      }
      components.push(bodyComponent);
      
      // FOOTER component
      if (template.footer) {
        components.push({ type: 'FOOTER', text: template.footer });
      }
      
      // BUTTONS component with proper phone number formatting
      if (template.buttons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: template.buttons.map(b => {
            const btn = { 
              type: b.type === 'quick_reply' ? 'QUICK_REPLY' : b.type === 'phone' ? 'PHONE_NUMBER' : b.type === 'catalog' ? 'CATALOG' : 'URL', 
              text: b.text 
            };
            if (b.type === 'url') {
              btn.url = b.value;
              // Dynamic URL button: Meta requires a sample when the url has a {{n}} variable
              if (/\{\{\d+\}\}/.test(b.value || '')) {
                btn.example = [b.example || (b.value || '').replace(/\{\{\d+\}\}/g, 'sample')];
              }
            }
            if (b.type === 'phone') btn.phone_number = formatPhoneNumber(b.value);
            return btn;
          }),
        });
      }

      if (template.carousel && template.carousel.cards && template.carousel.cards.length) {
        components.push({
          type: 'CAROUSEL',
          cards: template.carousel.cards.map((c) => {
            const cardComps = [
              { type: 'HEADER', format: (c.mediaType || 'image').toUpperCase(), example: { header_handle: [c.mediaUrl] } },
            ];
            if (c.body) cardComps.push({ type: 'BODY', text: c.body });
            if (c.buttons && c.buttons.length) {
              cardComps.push({
                type: 'BUTTONS',
                buttons: c.buttons.map((b) => {
                  const btn = { type: b.type === 'quick_reply' ? 'QUICK_REPLY' : b.type === 'phone' ? 'PHONE_NUMBER' : 'URL', text: b.text };
                  if (b.type === 'url') btn.url = b.value;
                  if (b.type === 'phone') btn.phone_number = formatPhoneNumber(b.value);
                  return btn;
                }),
              });
            }
            return { components: cardComps };
          }),
        });
      }
      } // end non-authentication component build

      console.log('[Template] Creating on Meta with components:', JSON.stringify(components, null, 2));

      const result = await waService.createTemplate(
        template.name,
        template.category.toUpperCase(),
        template.language,
        components,
        req.workspace.whatsapp.wabaId || req.workspace.whatsapp.businessAccountId
      );

      if (result.success && result.data?.id) {
        template.metaTemplateId = result.data.id;
        template.status = result.data.status?.toLowerCase() || 'pending';
        await template.save();
        console.log('[Template] Synced to Meta:', template.name, '-> ID:', result.data.id);
      } else {
        console.error('[Template] Meta sync failed:', template.name, result.error || result);
        const reason = result.error?.error_user_msg || result.error?.message || 'Meta sync failed';
        template.status = 'rejected';
        template.rejectionReason = reason;
        await template.save();
        require('../services/ownerNotify').templateReject(req.workspace._id, template.name, reason).catch(() => {});
        return res.status(400).json({ success: false, message: `WhatsApp rejected this template: ${reason}`, data: template });
      }
    }

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/templates/:id
const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/templates/:id
const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // Delete from WhatsApp API (best-effort — DB delete already done)
    if (template.metaTemplateId && req.workspace.whatsapp?.accessToken) {
      try {
        const waService = new WhatsAppService(
          req.workspace.whatsapp.accessToken,
          req.workspace.whatsapp.phoneNumberId
        );
        await waService.deleteTemplate(template.name, req.workspace.whatsapp.wabaId || req.workspace.whatsapp.businessAccountId);
      } catch (e) {
        console.error('[Template] Meta delete failed:', template.name, e.response?.data?.error?.message || e.message);
      }
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/templates/sync
const syncTemplates = async (req, res) => {
  try {
    if (!req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }

    const waService = new WhatsAppService(
      req.workspace.whatsapp.accessToken,
      req.workspace.whatsapp.phoneNumberId
    );

    const result = await waService.getTemplates(100, req.workspace.whatsapp.wabaId || req.workspace.whatsapp.businessAccountId);
    if (!result.data) {
      return res.status(400).json({ success: false, message: 'Failed to fetch templates' });
    }

    let synced = 0;
    for (const waTemplate of result.data) {
      const bodyComp = waTemplate.components?.find(c => c.type === 'BODY');
      const headerComp = waTemplate.components?.find(c => c.type === 'HEADER');
      const footerComp = waTemplate.components?.find(c => c.type === 'FOOTER');
      const buttonsComp = waTemplate.components?.find(c => c.type === 'BUTTONS');

      const updateData = {
        workspace: req.workspace._id,
        name: waTemplate.name,
        body: bodyComp?.text || '',
        category: waTemplate.category?.toLowerCase() || 'utility',
        waCategory: waTemplate.category || '',
        language: waTemplate.language || 'en',
        status: waTemplate.status?.toLowerCase() === 'approved' ? 'approved' : waTemplate.status?.toLowerCase() || 'pending',
        metaTemplateId: waTemplate.id,
      };

      if (headerComp) {
        const hType = headerComp.format?.toLowerCase() || 'text';
        let mediaUrl = headerComp.example?.header_handle?.[0] || '';
        if (mediaUrl && ['image', 'video', 'document'].includes(hType)) {
          const existing = await Template.findOne({ workspace: req.workspace._id, name: waTemplate.name }).lean();
          mediaUrl = await cacheHeaderMedia(mediaUrl, waTemplate.name, existing?.header?.mediaUrl);
        }
        updateData.header = {
          type: hType,
          content: headerComp.text || '',
          mediaUrl,
        };
      }

      if (footerComp) {
        updateData.footer = footerComp.text || '';
      }

      if (buttonsComp?.buttons) {
        updateData.buttons = buttonsComp.buttons.map(b => ({
          type: b.type?.toLowerCase() || 'quick_reply',
          text: b.text || '',
          value: b.url || b.phone_number || '',
        }));
      }

      if (bodyComp?.example?.body_text?.[0]) {
        updateData.variables = bodyComp.example.body_text[0];
      }

      const prev = await Template.findOne({ workspace: req.workspace._id, name: waTemplate.name }).select('status').lean();
      await Template.findOneAndUpdate(
        { workspace: req.workspace._id, name: waTemplate.name },
        updateData,
        { upsert: true, new: true }
      );
      if (updateData.status === 'rejected' && prev?.status !== 'rejected') {
        require('../services/ownerNotify')
          .templateReject(req.workspace._id, waTemplate.name, waTemplate.rejected_reason || 'Rejected by WhatsApp')
          .catch(() => {});
      }
      synced++;
    }

    // Delete local templates that were removed from Meta
    const metaTemplateNames = result.data.map(t => t.name);
    const deleted = await Template.deleteMany({
      workspace: req.workspace._id,
      metaTemplateId: { $ne: '' },
      name: { $nin: metaTemplateNames }
    });

    // Also mark templates without metaTemplateId that have same name as Meta ones
    // and delete orphans (templates that failed to sync and don't exist on Meta)
    const localOnlyPending = await Template.find({
      workspace: req.workspace._id,
      metaTemplateId: '',
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    let orphansDeleted = 0;
    for (const local of localOnlyPending) {
      // If Meta doesn't have this template name and it was a failed sync attempt, delete it
      if (!metaTemplateNames.includes(local.name)) {
        await Template.deleteOne({ _id: local._id });
        orphansDeleted++;
      }
    }

    const totalDeleted = (deleted.deletedCount || 0) + orphansDeleted;
    const msg = totalDeleted > 0 
      ? `${synced} templates synced, ${totalDeleted} deleted (not on Meta)`
      : `${synced} templates synced`;
    res.json({ success: true, message: msg });
  } catch (error) {
    const metaMsg = error.response?.data?.error?.message;
    res.status(500).json({ success: false, message: metaMsg ? `Sync failed: ${metaMsg}` : (error.message || 'Sync failed') });
  }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, syncTemplates, ensureTemplateHeaderMedia };
