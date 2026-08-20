const Campaign = require('../models/Campaign');
const { checkPlanLimit } = require('../utils/planLimits');
const Contact = require('../models/Contact');
const Template = require('../models/Template');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');

// Substitute {contact_name} / {phone} / {email} and any custom data field {fieldName}
// with the recipient's actual values so template variables auto-fill per contact.
const applyContactVars = (text, contact) => {
  const fullName = String(contact.name || contact.profileName || '').trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  let out = String(text == null ? '' : text)
    .replace(/\{contact_name\}/g, contact.name || contact.profileName || contact.phone || '')
    .replace(/\{name\}/g, contact.name || contact.profileName || contact.phone || '')
    .replace(/\{first_name\}/g, nameParts[0] || contact.profileName || '')
    .replace(/\{last_name\}/g, nameParts.slice(1).join(' ') || '')
    .replace(/\{profile_name\}/g, contact.profileName || contact.name || '')
    .replace(/\{country_code\}/g, contact.countryCode || '')
    .replace(/\{phone\}/g, contact.phone || '')
    .replace(/\{email\}/g, contact.email || '');
  const cf = contact.customFields;
  if (cf) {
    const keys = cf instanceof Map ? Array.from(cf.keys()) : Object.keys(cf);
    for (const k of keys) {
      const val = cf instanceof Map ? cf.get(k) : cf[k];
      out = out.replace(new RegExp('\\{' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g'), val == null ? '' : String(val));
    }
  }
  return out;
};

// @GET /api/campaigns
const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, sendChannel } = req.query;
    const query = { workspace: req.workspace._id };
    if (type) query.type = type;
    if (status) query.status = status;
    if (sendChannel === 'whatsapp_qr') query.sendChannel = 'whatsapp_qr';
    else if (sendChannel === 'cloud') query.sendChannel = { $ne: 'whatsapp_qr' };

    const total = await Campaign.countDocuments(query);
    let campaigns = await Campaign.find(query)
      .populate('template', 'name category status')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Live stats: derive delivered/read/failed from the actual per-recipient
    // message statuses (updated by delivery webhooks) so the table is accurate.
    try {
      const campIds = campaigns.map(c => c._id);
      if (campIds.length) {
        const agg = await Message.aggregate([
          { $match: { workspace: req.workspace._id, 'metadata.campaignId': { $in: campIds } } },
          { $group: { _id: { c: '$metadata.campaignId', s: '$status' }, n: { $sum: 1 } } },
        ]);
        const byCamp = {};
        for (const r of agg) {
          const cid = String(r._id.c); const s = r._id.s || 'sent';
          byCamp[cid] = byCamp[cid] || { sent: 0, delivered: 0, read: 0, failed: 0 };
          if (s === 'read') byCamp[cid].read += r.n;
          else if (s === 'delivered') byCamp[cid].delivered += r.n;
          else if (s === 'failed') byCamp[cid].failed += r.n;
          else byCamp[cid].sent += r.n;
        }
        campaigns = campaigns.map(c => {
          const live = byCamp[String(c._id)];
          if (!live) return c;
          const obj = c.toObject();
          const deliveredTotal = live.delivered + live.read;
          const sentTotal = live.sent + live.delivered + live.read;
          obj.stats = { ...obj.stats, sent: sentTotal || obj.stats.sent, delivered: deliveredTotal, read: live.read, failed: live.failed };
          return obj;
        });
      }
    } catch (e) { /* fall back to stored stats */ }

    sendPaginated(res, campaigns, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns
const mapAudience = (body) => {
  const a = body.audience;
  if (!a) return body;
  const { audience, ...rest } = body;
  return {
    ...rest,
    targetType: a.type || 'all',
    targetChannel: a.channel || '',
    targetSegments: a.segments || [],
    targetTags: a.tags || [],
    targetContacts: a.contacts || [],
    targetNumbers: Array.from(new Set((a.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(n => n.length >= 10))),
    targetPipeline: a.pipeline || undefined,
    targetStage: a.stage || '',
  };
};

const createCampaign = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'campaigns', 'Campaign');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const campaign = await Campaign.create({
      ...mapAudience(req.body),
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id
const getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('template')
      .populate('createdBy', 'name email');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/campaigns/:id
const updateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      mapAudience(req.body),
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/campaigns/:id
const deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/start
const nextRunDate = (rec) => {
  const d = new Date();
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
};

const finishCampaign = async (campaign) => {
  if (campaign.recurrence && campaign.recurrence !== 'none') {
    campaign.status = 'scheduled';
    campaign.scheduledAt = nextRunDate(campaign.recurrence);
  } else {
    campaign.status = 'completed';
    campaign.completedAt = new Date();
  }
  await campaign.save();
  if (campaign.status === 'completed') {
    require('../services/ownerNotify').broadcastDone(campaign).catch(() => {});
  }
};

// Runs a (non-drip) campaign: resolves audience and sends in background.
const runCampaignCore = async (campaign, workspace, io) => {
    // Get target contacts
    let contacts;
    if (campaign.targetType === 'all') {
      contacts = await Contact.find({ workspace: workspace._id, status: 'active', isGroup: { $ne: true } });
    } else if (campaign.targetType === 'segment') {
      // Resolve dynamic segments (field rules + broadcast retargeting rules)
      const Segment = require('../models/Segment');
      const { resolveSegmentContacts } = require('./segmentController');
      const segs = await Segment.find({ _id: { $in: campaign.targetSegments }, workspace: workspace._id });
      const seen = new Set();
      contacts = [];
      for (const seg of segs) {
        const segContacts = await resolveSegmentContacts(workspace._id, seg);
        for (const c of segContacts) {
          if (c.status !== 'active') continue;
          const id = c._id.toString();
          if (!seen.has(id)) { seen.add(id); contacts.push(c); }
        }
      }
    } else if (campaign.targetType === 'tag') {
      contacts = await Contact.find({ workspace: workspace._id, tags: { $in: campaign.targetTags }, status: 'active', isGroup: { $ne: true } });
    } else if (campaign.targetType === 'numbers') {
      contacts = (campaign.targetNumbers || []).map((p) => ({ _id: null, phone: p }));
    } else if (campaign.targetType === 'pipeline') {
      const Pipeline = require('../models/Pipeline');
      const pipeline = await Pipeline.findOne({ _id: campaign.targetPipeline, workspace: workspace._id });
      const deals = (pipeline?.deals || []).filter((d) => !campaign.targetStage || d.stage === campaign.targetStage);
      const ids = Array.from(new Set(deals.map((d) => String(d.contact)).filter(Boolean)));
      contacts = await Contact.find({ _id: { $in: ids }, workspace: workspace._id, status: 'active' });
    } else {
      contacts = await Contact.find({ _id: { $in: campaign.targetContacts }, status: 'active' });
    }

    // Restrict to a single platform if a channel filter is set (numbers list has no channel).
    if (campaign.targetChannel && campaign.targetType !== 'numbers') {
      contacts = contacts.filter((c) => (c.channel || 'whatsapp') === campaign.targetChannel);
    }

    // Opt-out guard: never message unsubscribed contacts (also covers the manual-numbers path,
    // which is built from raw phone strings and skips the status:'active' filter above).
    try {
      const optedOut = await Contact.find({ workspace: workspace._id, status: 'opted_out' }).select('phone').lean();
      if (optedOut.length) {
        const norm = (p) => String(p || '').replace(/\D/g, '').slice(-10);
        const blocked = new Set(optedOut.map((c) => norm(c.phone)));
        contacts = contacts.filter((c) => !blocked.has(norm(c.phone)));
      }
    } catch (e) { console.error('[Campaign] opt-out guard:', e.message); }

    // Resume-safe: drop recipients already messaged for this campaign so a
    // restart/crash continues from where it stopped instead of re-sending, and
    // reconcile prior progress into the stats.
    try {
      const prior = await Message.find({ workspace: workspace._id, 'metadata.campaignId': campaign._id, direction: 'outbound' }).select('contact status').lean();
      if (prior.length) {
        const done = new Set(prior.map((p) => String(p.contact)).filter(Boolean));
        contacts = contacts.filter((c) => !(c._id && done.has(String(c._id))));
        campaign.stats.sent = Math.max(campaign.stats.sent || 0, prior.filter((p) => p.status !== 'failed').length);
        campaign.stats.failed = Math.max(campaign.stats.failed || 0, prior.filter((p) => p.status === 'failed').length);
      }
    } catch (e) { console.error('[Campaign] resume dedupe:', e.message); }

    campaign.status = 'running';
    campaign.startedAt = campaign.startedAt || new Date();
    campaign.stats.totalRecipients = (campaign.stats.sent || 0) + (campaign.stats.failed || 0) + contacts.length;
    await campaign.save();

    // Free-text / preset (non-template) broadcasts must offer an opt-out so
    // recipients unsubscribe instead of blocking. Approved templates carry
    // their own opt-out (added in the template builder), so they are skipped.
    if (campaign.presetMessage && String(campaign.presetMessage.body || '').trim()) {
      try {
        const AutomationSettings = require('../models/AutomationSettings');
        const asx = await AutomationSettings.findOne({ workspace: workspace._id }).lean();
        const oo = (asx && asx.optOut) || {};
        if (oo.enabled !== false && oo.appendToBroadcasts !== false) {
          const { DEFAULT_BROADCAST_FOOTER } = require('../services/optOut');
          const line = (oo.broadcastFooter && oo.broadcastFooter.trim()) || DEFAULT_BROADCAST_FOOTER;
          if (line && !String(campaign.presetMessage.body).includes(line)) {
            campaign.presetMessage.body = String(campaign.presetMessage.body).trimEnd() + '\n\n' + line;
          }
        }
      } catch (e) { console.error('[Campaign] opt-out footer:', e.message); }
    }

    // Web WhatsApp (QR) campaigns go through the QR socket with its
    // warm-up/daily-limit engine — no Cloud API, no 24h-window restriction.
    if (campaign.sendChannel === 'whatsapp_qr' && campaign.presetMessage) {
      const qrCampaign = require('../services/qrCampaign');
      setImmediate(() => {
        qrCampaign.execute(campaign, workspace, contacts, io).catch((e) =>
          console.error('[QRCampaign] execute error:', e.message)
        );
      });
      return;
    }

    // Send messages asynchronously — from the campaign's selected number if it
    // belongs to this workspace, otherwise the default number.
    const validSenderIds = [
      workspace.whatsapp.phoneNumberId,
      ...(workspace.whatsapp.extraNumbers || []).map((n) => n.phoneNumberId),
    ].filter(Boolean);
    const senderId = campaign.senderNumberId && validSenderIds.includes(campaign.senderNumberId)
      ? campaign.senderNumberId
      : workspace.whatsapp.phoneNumberId;
    const _cCreds = require('../utils/waSender').resolveWaCreds(workspace.whatsapp, senderId);
    const waService = new WhatsAppService(_cCreds.accessToken, _cCreds.phoneNumberId);

    const workspaceId = workspace._id;

    // Save Money campaign: free-form preset message, only to contacts whose
    // 24h customer-service window is open (no template charge).
    if (campaign.presetMessage) {
      const preset = campaign.presetMessage;
      // Campaign-time media override (in-memory only; the saved preset is untouched)
      const presetMediaOverride = campaign.variables && campaign.variables._headerMediaUrl;
      if (presetMediaOverride) preset.mediaUrl = presetMediaOverride;
      setImmediate(async () => {
        for (let contact of contacts) {
          try {
            if (!contact._id) {
              const found = await Contact.findOne({ workspace: workspaceId, phone: new RegExp(contact.phone + '$') });
              if (!found) { campaign.stats.skipped++; continue; }
              contact = found;
            }
            const conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id, windowExpiresAt: { $gt: new Date() } });
            if (!conversation) {
              campaign.stats.skipped++;
              continue;
            }
            const { sendPreset } = require('../services/presetSend');
            const { result, msgType, renderedText } = await sendPreset(waService, contact.phone, preset, contact);
            if (result.success) {
              campaign.stats.sent++;
              const cMsg = await Message.create({
                workspace: workspaceId,
                conversation: conversation._id,
                contact: contact._id,
                direction: 'outbound',
                type: msgType,
                text: renderedText || preset.body,
                media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
                waMessageId: result.data?.messages?.[0]?.id || '',
                status: 'sent',
                metadata: { source: 'preset_campaign', campaignId: campaign._id },
              });
              await Conversation.findByIdAndUpdate(conversation._id, {
                lastMessage: { text: renderedText || preset.body, timestamp: new Date(), direction: 'outbound', type: 'text' },
              });
              if (io) {
                io.to(`workspace:${workspaceId}`).emit('new_message', { message: cMsg, conversationId: conversation._id });
              }
            } else {
              campaign.stats.failed++;
            }
          } catch {
            campaign.stats.failed++;
          }
        }
        await finishCampaign(campaign);
      });
      return;
    }

    const tmplName = campaign.template.name;
    const tplComponents = [];
    const tplHeader = campaign.template.header;
    if (tplHeader && ['image', 'video', 'document'].includes(tplHeader.type)) {
      // Campaign-time media override takes priority; else the template's own media;
      // else pull the approved header sample from Meta so old approved templates
      // with no locally-stored media still send.
      let headerLink = (campaign.variables && campaign.variables._headerMediaUrl) || tplHeader.mediaUrl || '';
      if (!headerLink) {
        try { headerLink = await require('./templateController').ensureTemplateHeaderMedia(campaign.template, workspace); } catch (e) { /* noop */ }
      }
      if (headerLink) {
        tplComponents.push({ type: 'header', parameters: [{ type: tplHeader.type, [tplHeader.type]: { link: headerLink } }] });
      }
    }
    try {
      const carTpl = await Template.findOne({ name: campaign.template.name, workspace: workspaceId });
      if (carTpl?.carousel?.cards?.length) {
        // Per-campaign card media override: Meta approves the template text, not the
        // media, so a different image/video can be sent without re-approval.
        const cards = carTpl.carousel.cards.map((c, i) => {
          const override = campaign.variables && campaign.variables['_carouselMedia' + i];
          if (!override) return c;
          const plain = typeof c.toObject === 'function' ? c.toObject() : c;
          return { ...plain, mediaUrl: override };
        });
        tplComponents.push(require('../utils/carousel').buildCarouselComponent(cards));
      }
      if (carTpl?.buttons?.some((b) => b.type === 'catalog')) {
        tplComponents.push({ type: 'button', sub_type: 'catalog', index: 0, parameters: [{ type: 'action', action: {} }] });
      }
    } catch (e) { /* noop */ }
    // Build body parameters from campaign.variables
    const vars = campaign.variables || {};
    const bodyText = campaign.template.body || '';
    const varMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length > 0) {
      const bodyParams = varMatches.map((m) => {
        const num = m.replace(/[{}]/g, '');
        const val = vars[num] || vars['var' + num] || '';
        return { type: 'text', text: val || '-' };
      });
      tplComponents.push({ type: 'body', parameters: bodyParams });
    }
    // Text-header variable(s): WhatsApp expects a header parameter for each {{n}} in a text header.
    if (tplHeader && tplHeader.type === 'text') {
      const hdrMatches = (tplHeader.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length > 0) {
        tplComponents.push({ type: 'header', parameters: hdrMatches.map((m) => {
          const num = m.replace(/[{}]/g, '');
          return { type: 'text', text: vars['h' + num] || vars['header' + num] || '{contact_name}' };
        }) });
      }
    }

    // Dynamic URL button(s): Meta rejects the send (#131008) unless the variable value is supplied.
    try {
      const _btnTpl = await Template.findOne({ name: campaign.template.name, workspace: workspaceId });
      const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(_btnTpl && _btnTpl.buttons, (b) => {
        const num = ((b.value || '').match(/\{\{(\d+)\}\}/) || [])[1] || '1';
        return vars['btn' + num] || vars['button' + num] || vars['url' + num] || '{contact_name}';
      });
      if (_ubComps.length) tplComponents.push(..._ubComps);
    } catch (e) { /* noop */ }

    // A/B test: preload template B
    let abTemplateB = null;
    if (campaign.abTest?.enabled && campaign.abTest?.templateB) {
      try { abTemplateB = await require('../models/Template').findById(campaign.abTest.templateB); } catch (e) { /* noop */ }
    }
    const abSplit = Math.min(100, Math.max(0, campaign.abTest?.splitPercent || 50));

    setImmediate(async () => {
      let contactIndex = -1;
      for (let contact of contacts) {
        contactIndex++;
        // Honor pause/stop requested while the campaign is running.
        if (contactIndex % 5 === 0) {
          const live = await Campaign.findById(campaign._id).select('status').lean();
          if (live && live.status !== 'running') { campaign.status = live.status; await campaign.save(); return; }
          // Persist progress so a mid-run restart resumes with correct counts.
          try { await Campaign.updateOne({ _id: campaign._id }, { $set: { 'stats.sent': campaign.stats.sent, 'stats.failed': campaign.stats.failed, 'stats.skipped': campaign.stats.skipped } }); } catch (e) { /* noop */ }
        }
        const abVariant = abTemplateB ? ((contactIndex % 100) < abSplit ? 'A' : 'B') : null;
        const useTemplate = abVariant === 'B' ? abTemplateB : campaign.template;
        try {
          const toPhone = toWaNumber(contact.phone);
          if (!toPhone) {
            campaign.stats.failed++;
            await recordFailedRecipient(workspaceId, campaign, contact, String(contact.phone || ''), useTemplate, abVariant, 'Invalid phone number');
            continue;
          }

          // Per-contact substitution in body params
          const contactComponents = JSON.parse(JSON.stringify(tplComponents));
          const bodyComp = contactComponents.find(c => c.type === 'body');
          if (bodyComp) {
            bodyComp.parameters = bodyComp.parameters.map(p => ({
              ...p,
              text: applyContactVars(p.text, contact),
            }));
          }
          const headerComp = contactComponents.find(c => c.type === 'header' && Array.isArray(c.parameters) && c.parameters.some(p => p.type === 'text'));
          if (headerComp) {
            headerComp.parameters = headerComp.parameters.map(p => (p.type === 'text' ? {
              ...p,
              text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 60),
            } : p));
          }

          contactComponents.filter(c => String(c.sub_type || '') === 'url' && Array.isArray(c.parameters)).forEach(bc => {
            bc.parameters = bc.parameters.map(p => (p.type === 'text' ? { ...p, text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 2000) } : p));
          });
          const result = await waService.sendTemplateMessage(
            toPhone,
            useTemplate.name,
            useTemplate.language,
            abVariant === 'B' ? [] : contactComponents
          );
          if (result.success) {
            campaign.stats.sent++;
            // For numbers-only targets, upsert a real contact so messages are tracked
            if (!contact._id) {
              const Contact = require('../models/Contact');
              const realContact = await Contact.findOneAndUpdate(
                { workspace: workspaceId, phone: toPhone },
                { workspace: workspaceId, phone: toPhone, source: 'manual', name: toPhone },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              contact = realContact;
            }
            // Persist to the contact's chat thread so the broadcast is visible
            const conversation = await Conversation.findOneAndUpdate(
              { workspace: workspaceId, contact: contact._id },
              {
                workspace: workspaceId,
                contact: contact._id,
                status: 'active',
                lastMessage: { text: `Template: ${tmplName}`, timestamp: new Date(), direction: 'outbound', type: 'template' },
              },
              { upsert: true, new: true }
            );
            const cMsg = await Message.create({
              workspace: workspaceId,
              conversation: conversation._id,
              contact: contact._id,
              direction: 'outbound',
              type: 'template',
              text: useTemplate.body || useTemplate.name,
              template: { name: useTemplate.name, language: useTemplate.language || 'en', components: [] },
              waMessageId: result.data?.messages?.[0]?.id || '',
              status: 'sent',
              metadata: { source: 'campaign', campaignId: campaign._id, ...(abVariant ? { abVariant } : {}) },
            });
            if (io) {
              io.to(`workspace:${workspaceId}`).emit('new_message', { message: cMsg, conversationId: conversation._id });
            }
          } else {
            campaign.stats.failed++;
            await recordFailedRecipient(workspaceId, campaign, contact, toPhone, useTemplate, abVariant,
              result && (result.error?.message || result.error?.error_user_msg || result.error) ? String(result.error?.message || result.error?.error_user_msg || result.error) : 'Send failed');
          }
        } catch (e) {
          campaign.stats.failed++;
          try {
            const tp = toWaNumber(contact.phone) || String(contact.phone || '');
            await recordFailedRecipient(workspaceId, campaign, contact, tp, useTemplate, abVariant, e.message || 'Send error');
          } catch { /* noop */ }
        }
      }
      await finishCampaign(campaign);
    });

};

// Persist a per-recipient FAILED message so it shows in the campaign report
// and can be re-sent later. Upserts the contact/conversation when needed.
// Normalise a stored number to WhatsApp digits (drops separators and the trunk
// prefix 0 that many saved numbers carry); returns '' when it is not a number.
const toWaNumber = (raw) => {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '').replace(/^0+/, '');
  const full = digits.length === 10 ? '91' + digits : digits;
  return full.length >= 11 && full.length <= 15 ? full : '';
};

const recordFailedRecipient = async (workspaceId, campaign, contact, toPhone, useTemplate, abVariant, errorMessage) => {
  if (!contact || !contact._id) {
    contact = await Contact.findOneAndUpdate(
      { workspace: workspaceId, phone: toPhone },
      { workspace: workspaceId, phone: toPhone, source: 'manual', name: toPhone },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id },
    { workspace: workspaceId, contact: contact._id, status: 'active' },
    { upsert: true, new: true }
  );
  await Message.create({
    workspace: workspaceId,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: 'template',
    text: useTemplate.body || useTemplate.name,
    template: { name: useTemplate.name },
    status: 'failed',
    errorMessage: errorMessage || 'Send failed',
    metadata: { source: 'campaign', campaignId: campaign._id, ...(abVariant ? { abVariant } : {}) },
  });
};

// @POST /api/campaigns/:id/start
const startCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('template').populate('presetMessage');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.sendChannel === 'whatsapp_qr') {
      const st = await require('../services/waQrService').getStatus(req.workspace._id);
      if (st.status !== 'connected') {
        return res.status(400).json({ success: false, message: 'WhatsApp by QR is not connected (scan the QR on the Channels page)' });
      }
    } else if (!req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }

    // Drip campaigns run step-by-step via the drip scheduler.
    if (campaign.type === 'drip') {
      if (!campaign.dripSteps || !campaign.dripSteps.length) {
        return res.status(400).json({ success: false, message: 'Drip campaign needs at least one step' });
      }
      campaign.status = 'scheduled';
      campaign.scheduledAt = new Date();
      await campaign.save();
      return res.json({ success: true, data: campaign });
    }

    await runCampaignCore(campaign, req.workspace, req.app.get('io'));
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/pause
const pauseCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, status: 'running' },
      { status: 'paused' },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found or not running' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/schedule
const scheduleCampaign = async (req, res) => {
  try {
    const { scheduledAt, recurrence } = req.body;
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.type === 'drip') return res.status(400).json({ success: false, message: 'Drip campaigns run via their own step schedule' });
    if (!scheduledAt) return res.status(400).json({ success: false, message: 'scheduledAt required' });
    campaign.scheduledAt = new Date(scheduledAt);
    campaign.recurrence = recurrence || 'none';
    campaign.status = 'scheduled';
    await campaign.save();
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id/ab-results — compare variant A vs B performance
const getAbResults = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const Message = require('../models/Message');
    const results = {};
    for (const variant of ['A', 'B']) {
      const msgs = await Message.find({
        workspace: req.workspace._id, 'metadata.campaignId': campaign._id, 'metadata.abVariant': variant,
      }).select('contact status createdAt').lean();
      const contactIds = msgs.map(m => m.contact).filter(Boolean);
      let replied = 0;
      if (contactIds.length > 0) {
        const replies = await Message.aggregate([
          { $match: { workspace: req.workspace._id, direction: 'inbound', contact: { $in: contactIds } } },
          { $group: { _id: '$contact', lastAt: { $max: '$createdAt' } } },
        ]);
        const sentAt = {};
        msgs.forEach(m => { if (m.contact) sentAt[m.contact.toString()] = m.createdAt; });
        replies.forEach(r => { const c = r._id.toString(); if (sentAt[c] && new Date(r.lastAt) > new Date(sentAt[c])) replied++; });
      }
      results[variant] = {
        sent: msgs.length,
        delivered: msgs.filter(m => ['delivered', 'read'].includes(m.status)).length,
        read: msgs.filter(m => m.status === 'read').length,
        failed: msgs.filter(m => m.status === 'failed').length,
        replied,
      };
    }
    res.json({ success: true, data: { abTest: campaign.abTest, results } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id/report — per-recipient delivery report
const getCampaignReport = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('template', 'name');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const msgs = await Message.find({ workspace: req.workspace._id, 'metadata.campaignId': campaign._id })
      .populate('contact', 'name phone')
      .select('contact status errorMessage createdAt conversation')
      .sort({ createdAt: -1 })
      .lean();

    const counts = { total: msgs.length, sent: 0, delivered: 0, read: 0, failed: 0 };
    // contactId -> earliest campaign send time, plus name/phone for click attribution
    const sendInfo = {};
    const recipients = msgs.map(m => {
      const s = m.status || 'sent';
      if (s === 'read') counts.read++;
      else if (s === 'delivered') counts.delivered++;
      else if (s === 'failed') counts.failed++;
      else counts.sent++;
      const cid = m.contact?._id ? String(m.contact._id) : '';
      if (cid) {
        const at = new Date(m.createdAt).getTime();
        if (!sendInfo[cid] || at < sendInfo[cid].at) {
          sendInfo[cid] = { at, name: m.contact?.name || '', phone: m.contact?.phone || '' };
        }
      }
      return {
        phone: m.contact?.phone || '',
        name: m.contact?.name || '',
        status: s,
        error: m.errorMessage || '',
        at: m.createdAt,
        chatId: m.conversation ? String(m.conversation) : '',
        _cid: cid,
      };
    });
    // delivered/read are progressive: a read message was also delivered
    counts.deliveredTotal = counts.delivered + counts.read;
    counts.sentTotal = counts.sent + counts.delivered + counts.read;

    // Replies & button clicks: inbound messages from these recipients AFTER their campaign send.
    // Quick-reply / interactive button taps come back as inbound messages whose text is the button label.
    const contactIds = Object.keys(sendInfo);
    const repliedSet = new Set();
    const buttonMap = {}; // label -> { label, count, seen:Set<cid>, contacts:[{name,phone}] }
    if (contactIds.length) {
      const inbound = await Message.find({
        workspace: req.workspace._id,
        contact: { $in: contactIds },
        direction: 'inbound',
      }).select('contact type text createdAt').sort({ createdAt: 1 }).lean();
      for (const m of inbound) {
        const cid = m.contact ? String(m.contact) : '';
        const info = sendInfo[cid];
        if (!info) continue;
        if (new Date(m.createdAt).getTime() < info.at) continue; // before this recipient got the campaign
        repliedSet.add(cid);
        if ((m.type === 'button' || m.type === 'interactive') && (m.text || '').trim()) {
          const label = m.text.trim();
          if (!buttonMap[label]) buttonMap[label] = { label, count: 0, seen: new Set(), contacts: [] };
          const b = buttonMap[label];
          if (!b.seen.has(cid)) {
            b.seen.add(cid);
            b.count++;
            b.contacts.push({ name: info.name, phone: info.phone });
          }
        }
      }
    }
    counts.replied = repliedSet.size;
    recipients.forEach(r => { r.replied = repliedSet.has(r._cid); delete r._cid; });
    const buttons = Object.values(buttonMap)
      .map(b => ({ label: b.label, count: b.count, contacts: b.contacts }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        campaign: { _id: campaign._id, name: campaign.name, status: campaign.status, template: campaign.template?.name || '', createdAt: campaign.createdAt },
        counts,
        recipients,
        buttons,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/resend-failed — re-send the template to recipients of a
// chosen category (failed by default; also sent / delivered / read / all for retargeting).
const resendFailed = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('template');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!req.workspace.whatsapp?.isConnected) return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    // Optionally resend using a different chosen template; default = campaign's own template
    let tpl = campaign.template;
    if (req.body && req.body.templateId) {
      tpl = await Template.findOne({ _id: req.body.templateId, workspace: req.workspace._id });
      if (!tpl) return res.status(400).json({ success: false, message: 'Selected template not found' });
      if (tpl.status !== 'approved') return res.status(400).json({ success: false, message: 'Selected template is not approved yet' });
    }
    if (!tpl) return res.status(400).json({ success: false, message: 'No template to resend — select an approved template' });

    // Which category to (re)send to. 'failed' keeps the old delete-and-replace behaviour;
    // the others are retargeting — a fresh message is sent without touching the original record.
    const audienceMap = {
      failed: ['failed'],
      sent: ['sent'],
      delivered: ['delivered', 'read'],
      read: ['read'],
      all: ['sent', 'delivered', 'read', 'failed'],
    };
    const audience = String((req.body && req.body.audience) || 'failed').toLowerCase();
    const statuses = audienceMap[audience] || audienceMap.failed;
    const isFailedResend = audience === 'failed';

    const matched = await Message.find({ workspace: req.workspace._id, 'metadata.campaignId': campaign._id, status: { $in: statuses } })
      .populate('contact', 'name phone profileName email customFields')
      .lean();
    // Dedupe by contact so a recipient with several campaign messages is targeted once.
    const seenContacts = new Set();
    const failedMsgs = [];
    for (const m of matched) {
      const cid = m.contact?._id ? String(m.contact._id) : '';
      if (!cid || seenContacts.has(cid)) continue;
      seenContacts.add(cid);
      failedMsgs.push(m);
    }
    if (!failedMsgs.length) return res.json({ success: true, data: { resent: 0, failed: 0, message: 'No recipients to resend' } });

    const validSenderIds = [
      req.workspace.whatsapp.phoneNumberId,
      ...(req.workspace.whatsapp.extraNumbers || []).map((n) => n.phoneNumberId),
    ].filter(Boolean);
    const senderId = campaign.senderNumberId && validSenderIds.includes(campaign.senderNumberId)
      ? campaign.senderNumberId : req.workspace.whatsapp.phoneNumberId;
    const _rCreds = require('../utils/waSender').resolveWaCreds(req.workspace.whatsapp, senderId);
    const waService = new WhatsAppService(_rCreds.accessToken, _rCreds.phoneNumberId);
    const workspaceId = req.workspace._id;

    // Rebuild template components (header media + body variables)
    const tplComponents = [];
    const tplHeader = tpl.header;
    if (tplHeader && ['image', 'video', 'document'].includes(tplHeader.type)) {
      let headerLink = (campaign.variables && campaign.variables._headerMediaUrl) || tplHeader.mediaUrl || '';
      if (!headerLink) {
        try { headerLink = await require('./templateController').ensureTemplateHeaderMedia(tpl, req.workspace); } catch (e) { /* noop */ }
      }
      if (headerLink) {
        tplComponents.push({ type: 'header', parameters: [{ type: tplHeader.type, [tplHeader.type]: { link: headerLink } }] });
      }
    }
    // Carousel cards must be rebuilt too, otherwise a resend delivers the body without any card.
    // The campaign's per-card media overrides only apply when resending its own template.
    try {
      if (tpl.carousel?.cards?.length) {
        const ownTemplate = !(req.body && req.body.templateId);
        const cards = tpl.carousel.cards.map((c, i) => {
          const override = ownTemplate && campaign.variables && campaign.variables['_carouselMedia' + i];
          if (!override) return c;
          const plain = typeof c.toObject === 'function' ? c.toObject() : c;
          return { ...plain, mediaUrl: override };
        });
        tplComponents.push(require('../utils/carousel').buildCarouselComponent(cards));
      }
      if (tpl.buttons?.some((b) => b.type === 'catalog')) {
        tplComponents.push({ type: 'button', sub_type: 'catalog', index: 0, parameters: [{ type: 'action', action: {} }] });
      }
    } catch (e) { /* noop */ }
    const vars = campaign.variables || {};
    const varMatches = (tpl.body || '').match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length > 0) {
      tplComponents.push({ type: 'body', parameters: varMatches.map((m) => {
        const num = m.replace(/[{}]/g, '');
        return { type: 'text', text: vars[num] || vars['var' + num] || '-' };
      }) });
    }
    if (tplHeader && tplHeader.type === 'text') {
      const hdrMatches = (tplHeader.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length > 0) {
        tplComponents.push({ type: 'header', parameters: hdrMatches.map((m) => {
          const num = m.replace(/[{}]/g, '');
          return { type: 'text', text: vars['h' + num] || vars['header' + num] || '{contact_name}' };
        }) });
      }
    }

    try {
      const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(tpl.buttons, (b) => {
        const num = ((b.value || '').match(/\{\{(\d+)\}\}/) || [])[1] || '1';
        return vars['btn' + num] || vars['button' + num] || vars['url' + num] || '{contact_name}';
      });
      if (_ubComps.length) tplComponents.push(..._ubComps);
    } catch (e) { /* noop */ }

    let resent = 0, stillFailed = 0;
    res.json({ success: true, data: { started: failedMsgs.length, message: `Resending to ${failedMsgs.length} ${audience} recipient(s)...` } });

    setImmediate(async () => {
      const io = req.app.get('io');
      for (const fm of failedMsgs) {
        const contact = fm.contact;
        const toPhone = toWaNumber(contact?.phone);
        if (!toPhone) { stillFailed++; continue; }
        try {
          const comps = JSON.parse(JSON.stringify(tplComponents));
          const bodyComp = comps.find(c => c.type === 'body');
          if (bodyComp) {
            bodyComp.parameters = bodyComp.parameters.map(p => ({
              ...p,
              text: applyContactVars(p.text, contact),
            }));
          }
          const headerComp = comps.find(c => c.type === 'header' && Array.isArray(c.parameters) && c.parameters.some(p => p.type === 'text'));
          if (headerComp) {
            headerComp.parameters = headerComp.parameters.map(p => (p.type === 'text' ? {
              ...p,
              text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 60),
            } : p));
          }
          comps.filter(c => String(c.sub_type || '') === 'url' && Array.isArray(c.parameters)).forEach(bc => {
            bc.parameters = bc.parameters.map(p => (p.type === 'text' ? { ...p, text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 2000) } : p));
          });
          const result = await waService.sendTemplateMessage(toPhone, tpl.name, tpl.language, comps);
          if (result.success) {
            resent++;
            // Failed resend replaces the old failed record; retargeting keeps the original
            // record intact and just logs a fresh outbound message.
            if (isFailedResend) await Message.deleteOne({ _id: fm._id });
            const conversation = await Conversation.findOneAndUpdate(
              { workspace: workspaceId, contact: contact._id },
              { workspace: workspaceId, contact: contact._id, status: 'active', lastMessage: { text: `Template: ${tpl.name}`, timestamp: new Date(), direction: 'outbound', type: 'template' } },
              { upsert: true, new: true }
            );
            const cMsg = await Message.create({
              workspace: workspaceId, conversation: conversation._id, contact: contact._id,
              direction: 'outbound', type: 'template', text: tpl.body || tpl.name,
              template: { name: tpl.name },
              waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent',
              metadata: { source: 'campaign', campaignId: campaign._id },
            });
            if (io) io.to(`workspace:${workspaceId}`).emit('new_message', { message: cMsg, conversationId: conversation._id });
          } else {
            stillFailed++;
            if (isFailedResend) await Message.updateOne({ _id: fm._id }, { errorMessage: String(result.error?.message || result.error || 'Send failed'), createdAt: new Date() });
          }
        } catch (e) { stillFailed++; }
      }
      console.log(`[Campaign resend] ${campaign.name}: resent=${resent}, stillFailed=${stillFailed}`);
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// On boot, resume any campaign left "running" by a previous restart/crash so it
// finishes sending to the remaining recipients (already-sent contacts skipped
// by the resume-safe dedupe inside runCampaignCore).
const resumeRunningCampaigns = async (io) => {
  try {
    const Workspace = require('../models/Workspace');
    const running = await Campaign.find({ status: 'running' }).populate('template').populate('presetMessage');
    let n = 0;
    for (const campaign of running) {
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace) continue;
      n++;
      runCampaignCore(campaign, workspace, io).catch((e) => console.error('[Campaign] resume run error:', e.message));
    }
    if (n) console.log(`[Campaign] resuming ${n} running campaign(s) after restart`);
  } catch (e) { console.error('[Campaign] resume scan error:', e.message); }
};

module.exports = {
  getCampaigns, createCampaign, getCampaign, updateCampaign,
  deleteCampaign, startCampaign, pauseCampaign, scheduleCampaign, runCampaignCore, getAbResults,
  getCampaignReport, resendFailed, resumeRunningCampaigns,
};
