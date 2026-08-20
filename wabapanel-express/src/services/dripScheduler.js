const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Template = require('../models/Template');
const Workspace = require('../models/Workspace');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const WhatsAppService = require('./whatsappService');

class DripScheduler {
  constructor(io) {
    this.io = io;
    this.activeDrips = new Map(); // campaignId -> timeouts
  }

  start() {
    // Run every minute to check for scheduled campaigns and drip steps
    cron.schedule('* * * * *', () => this._processScheduledCampaigns());
    cron.schedule('* * * * *', () => this._processDripSteps());
    // Continue Web WhatsApp (QR) campaigns that auto-paused on the daily limit
    cron.schedule('*/5 * * * *', () => require('./qrCampaign').resumePending().catch((e) => console.error('QR campaign resume error:', e.message)));
    console.log('Drip scheduler started');
  }

  async _processScheduledCampaigns() {
    try {
      const now = new Date();
      const campaigns = await Campaign.find({
        status: 'scheduled',
        scheduledAt: { $lte: now },
      }).populate('template');

      for (const campaign of campaigns) {
        if (campaign.type === 'broadcast') {
          await this._executeBroadcast(campaign);
        } else if (campaign.type === 'drip') {
          await this._startDrip(campaign);
        }
      }
    } catch (error) {
      console.error('Scheduled campaign processing error:', error.message);
    }
  }

  async _processDripSteps() {
    try {
      const campaigns = await Campaign.find({
        type: 'drip',
        status: 'running',
        'dripSteps.0': { $exists: true },
      });

      for (const campaign of campaigns) {
        await this._processNextDripStep(campaign);
      }
    } catch (error) {
      console.error('Drip step processing error:', error.message);
    }
  }

  async _executeBroadcast(campaign) {
    try {
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace?.whatsapp?.isConnected) {
        campaign.status = 'failed';
        await campaign.save();
        return;
      }

      const contacts = await this._getTargetContacts(campaign);
      campaign.status = 'running';
      campaign.startedAt = new Date();
      campaign.stats.totalRecipients = contacts.length;
      await campaign.save();

      const waService = new WhatsAppService(
        workspace.whatsapp.accessToken,
        workspace.whatsapp.phoneNumberId
      );

      const template = await Template.findById(campaign.template);

      for (const contact of contacts) {
        try {
          const result = await waService.sendTemplateMessage(
            contact.phone,
            template.name,
            template.language || 'en',
            this._templateComponents(template, contact)
          );
          if (result.success) {
            campaign.stats.sent++;
            await this._saveOutboundMessage(workspace, contact, 'template', template.name, result, campaign._id);
          } else {
            campaign.stats.failed++;
          }
        } catch {
          campaign.stats.failed++;
        }
        // Rate limiting: 80 messages per second (Meta limit)
        await this._delay(50);
      }

      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();
    } catch (error) {
      console.error('Broadcast execution error:', error.message);
      campaign.status = 'failed';
      await campaign.save();
    }
  }

  async _startDrip(campaign) {
    try {
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace?.whatsapp?.isConnected) {
        campaign.status = 'failed';
        await campaign.save();
        return;
      }

      const contacts = await this._getTargetContacts(campaign);
      campaign.status = 'running';
      campaign.startedAt = new Date();
      campaign.stats.totalRecipients = contacts.length;

      // Initialize drip tracking
      if (!campaign.variables) campaign.variables = {};
      campaign.variables.currentStep = 0;
      campaign.variables.contactIds = contacts.map(c => c._id.toString());
      campaign.variables.stepSentAt = new Date().toISOString();
      await campaign.save();

      // Execute first step immediately
      await this._executeDripStep(campaign, workspace, contacts, 0);
    } catch (error) {
      console.error('Drip start error:', error.message);
      campaign.status = 'failed';
      await campaign.save();
    }
  }

  async _processNextDripStep(campaign) {
    try {
      if (!campaign.variables || !campaign.dripSteps || campaign.dripSteps.length === 0) return;

      const currentStep = campaign.variables.currentStep || 0;
      const nextStep = currentStep + 1;

      if (nextStep >= campaign.dripSteps.length) {
        // All steps completed
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        return;
      }

      const stepConfig = campaign.dripSteps[nextStep];
      if (!stepConfig) return;

      // Calculate delay
      const lastSentAt = new Date(campaign.variables.stepSentAt);
      const delayMs = this._stepDelayMs(stepConfig);
      const nextRunAt = new Date(lastSentAt.getTime() + delayMs);

      if (new Date() < nextRunAt) return; // Not time yet

      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace?.whatsapp?.isConnected) return;

      const contactIds = campaign.variables.contactIds || [];
      const contacts = await Contact.find({ _id: { $in: contactIds }, status: 'active' });

      await this._executeDripStep(campaign, workspace, contacts, nextStep);
    } catch (error) {
      console.error('Drip step processing error:', error.message);
    }
  }

  async _executeDripStep(campaign, workspace, contacts, stepIndex) {
    const step = campaign.dripSteps[stepIndex];
    if (!step) return;

    const waService = new WhatsAppService(
      workspace.whatsapp.accessToken,
      workspace.whatsapp.phoneNumberId
    );

    let template = null;
    if (step.template) {
      template = await Template.findById(step.template);
    }
    let preset = null;
    if (step.presetMessage) {
      const PresetMessage = require('../models/PresetMessage');
      preset = await PresetMessage.findById(step.presetMessage);
    }

    for (const contact of contacts) {
      try {
        let result;
        if (preset) {
          // Free-form preset: only when the 24h customer window is open.
          // If the window is closed and a paid template is assigned, fall through to it.
          const windowConv = await Conversation.findOne({ workspace: workspace._id, contact: contact._id, windowExpiresAt: { $gt: new Date() } });
          const windowOpen = !!windowConv;
          if (!windowOpen && !template) {
            campaign.stats.skipped = (campaign.stats.skipped || 0) + 1;
            continue;
          }
          if (windowOpen) {
          const { sendPreset } = require('./presetSend');
          const sent = await sendPreset(waService, contact.phone, preset, contact);
          result = sent.result;
          if (result?.success) {
            campaign.stats.sent++;
            await this._saveOutboundMessage(workspace, contact, sent.msgType || 'text', sent.renderedText || preset.body, result, campaign._id);
          } else {
            campaign.stats.failed++;
          }
          await this._delay(50);
          continue;
          }
        }
        if (template) {
          result = await waService.sendTemplateMessage(
            contact.phone,
            template.name,
            template.language || 'en',
            this._templateComponents(template, contact)
          );
        } else if (step.message) {
          result = await waService.sendTextMessage(contact.phone, step.message);
        }

        if (result?.success) {
          campaign.stats.sent++;
          const text = template ? template.name : step.message;
          await this._saveOutboundMessage(workspace, contact, template ? 'template' : 'text', text, result, campaign._id);
        } else {
          campaign.stats.failed++;
        }
      } catch {
        campaign.stats.failed++;
      }
      await this._delay(50);
    }

    campaign.variables = Object.assign({}, campaign.variables, { currentStep: stepIndex, stepSentAt: new Date().toISOString() });
    campaign.markModified('variables');
    await campaign.save();
  }

  // Header media, carousel and body variables ({{1}} = contact name) so
  // templates with parameters are accepted by the WhatsApp API.
  _templateComponents(template, contact) {
    const components = [];
    const header = template.header;
    if (header && ['image', 'video', 'document'].includes(header.type) && header.mediaUrl) {
      components.push({ type: 'header', parameters: [{ type: header.type, [header.type]: { link: header.mediaUrl } }] });
    }
    if (template.carousel && template.carousel.cards && template.carousel.cards.length) {
      components.push(require('../utils/carousel').buildCarouselComponent(template.carousel.cards));
    }
    const name = (contact && (contact.name || contact.profileName || '').toString().trim()) || 'ji';
    const varMatches = (template.body || '').match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length) {
      components.push({ type: 'body', parameters: varMatches.map((m) => ({ type: 'text', text: m === '{{1}}' ? name : '-' })) });
    }
    // Text-header variable(s): WhatsApp expects a header parameter for each {{n}} in a text header.
    if (header && header.type === 'text') {
      const hdrMatches = (header.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length) {
        components.push({ type: 'header', parameters: hdrMatches.map((m) => ({ type: 'text', text: (m === '{{1}}' ? name : '-').replace(/[\n\t]+/g, ' ').slice(0, 60) })) });
      }
    }
    // Dynamic URL button(s): supply the variable value so Meta does not reject with (#131008).
    const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(template.buttons, () => name);
    if (_ubComps.length) components.push(..._ubComps);
    return components;
  }

  _stepDelayMs(step) {
    const d = parseInt(step.delayDays) || 0;
    const h = parseInt(step.delayHours) || 0;
    const m = parseInt(step.delayMinutes) || 0;
    if (d || h || m) return ((d * 24 + h) * 60 + m) * 60 * 1000;
    return this._getDelayMs(step.delayValue || 0, step.delayType);
  }

  _getDelayMs(value, type) {
    const v = parseInt(value) || 0;
    switch (type) {
      case 'minutes': return v * 60 * 1000;
      case 'hours': return v * 60 * 60 * 1000;
      case 'days': return v * 24 * 60 * 60 * 1000;
      default: return v * 60 * 1000; // default minutes
    }
  }

  async _getTargetContacts(campaign) {
    const query = { workspace: campaign.workspace, status: 'active' };
    if (campaign.targetType === 'segment') {
      query.segments = { $in: campaign.targetSegments };
    } else if (campaign.targetType === 'tag') {
      query.tags = { $in: campaign.targetTags };
    } else if (campaign.targetType === 'contacts') {
      query._id = { $in: campaign.targetContacts };
    } else if (campaign.targetType === 'numbers') {
      query.$or = (campaign.targetNumbers || []).map((n) => ({ phone: new RegExp(String(n).replace(/\D/g, '') + '$') }));
      if (!query.$or.length) return [];
    }
    return Contact.find(query);
  }

  async _saveOutboundMessage(workspace, contact, type, text, result, campaignId) {
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: workspace._id, contact: contact._id },
      {
        workspace: workspace._id,
        contact: contact._id,
        status: 'active',
        lastMessage: {
          text: text || `[${type}]`,
          timestamp: new Date(),
          direction: 'outbound',
          type,
        },
      },
      { upsert: true, new: true }
    );

    await Message.create({
      workspace: workspace._id,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type,
      text: text || '',
      waMessageId: result?.data?.messages?.[0]?.id || '',
      status: result?.success ? 'sent' : 'failed',
      metadata: campaignId ? { source: 'drip_campaign', campaignId } : undefined,
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DripScheduler;
