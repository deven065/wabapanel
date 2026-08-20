// Sends preset campaigns over the WhatsApp QR (Baileys) channel.
// Uses the QR sender adapter (numbered-option buttons, media, lists) and the
// QR warm-up/daily-limit engine; when the daily cap is hit the campaign
// auto-pauses and resumes when quota is available again.
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Workspace = require('../models/Workspace');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const LIMIT_ERR = /Daily safety limit reached/i;

async function sendToContact(workspace, campaign, preset, contact, io) {
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
    { workspace: workspace._id, contact: contact._id, channel: 'whatsapp_qr', status: 'active' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const sender = require('./botFlowEngine').getSender(workspace, conversation);
  const { sendPreset } = require('./presetSend');
  const { result, msgType, renderedText } = await sendPreset(sender, contact.phone, preset, contact);
  if (!result?.success) {
    if (LIMIT_ERR.test(result?.error?.message || '')) {
      const err = new Error(result.error.message);
      err.qrLimit = true;
      throw err;
    }
    return false;
  }
  const text = renderedText || preset.body || `[${msgType}]`;
  const msg = await Message.create({
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: msgType || 'text',
    text,
    media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
    waMessageId: result.data?.messages?.[0]?.id || '',
    status: 'sent',
    metadata: { source: 'qr_campaign', campaignId: campaign._id, channel: 'whatsapp_qr' },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: msgType || 'text' },
    lastMessageAt: new Date(),
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  return true;
}

// Runs (or continues) a QR preset campaign over the given contacts.
async function execute(campaign, workspace, contacts, io) {
  const preset = campaign.presetMessage;
  if (!preset) {
    campaign.status = 'failed';
    await campaign.save();
    return;
  }
  for (let i = 0; i < contacts.length; i++) {
    let contact = contacts[i];
    try {
      // Honor pause/stop requested from the UI while running.
      const fresh = await Campaign.findById(campaign._id).select('status').lean();
      if (!fresh || fresh.status === 'paused' || fresh.status === 'failed') {
        await Campaign.findByIdAndUpdate(campaign._id, { stats: campaign.stats });
        return;
      }
      if (!contact._id) {
        const phone = String(contact.phone || '').replace(/\D/g, '');
        if (!phone) { campaign.stats.skipped++; continue; }
        contact =
          (await Contact.findOne({ workspace: workspace._id, phone: new RegExp(phone + '$') })) ||
          (await Contact.create({ workspace: workspace._id, phone, name: 'WA ' + phone, channel: 'whatsapp_qr' }));
      }
      const ok = await sendToContact(workspace, campaign, preset, contact, io);
      if (ok) campaign.stats.sent++;
      else campaign.stats.failed++;
    } catch (e) {
      if (e.qrLimit) {
        // Daily cap reached: pause and remember who is still pending.
        const remaining = contacts.slice(i)
          .map((c) => (c._id ? String(c._id) : String(c.phone || '')))
          .filter(Boolean);
        campaign.status = 'paused';
        campaign.variables = Object.assign({}, campaign.variables, { qrPending: remaining, qrAutoPaused: true });
        campaign.markModified('variables');
        await campaign.save();
        return;
      }
      campaign.stats.failed++;
    }
  }
  campaign.status = 'completed';
  campaign.completedAt = new Date();
  campaign.variables = Object.assign({}, campaign.variables, { qrPending: [], qrAutoPaused: false });
  campaign.markModified('variables');
  await campaign.save();
  require('./ownerNotify').broadcastDone(campaign).catch(() => {});
}

// Cron hook: continue auto-paused QR campaigns once quota/connection allows.
async function resumePending() {
  const campaigns = await Campaign.find({
    sendChannel: 'whatsapp_qr',
    status: 'paused',
    'variables.qrAutoPaused': true,
  }).populate('presetMessage');
  for (const campaign of campaigns) {
    try {
      const waQr = require('./waQrService');
      const st = await waQr.getStatus(campaign.workspace);
      if (st.status !== 'connected' || st.sentToday >= st.todayCap) continue;
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace) continue;
      const pending = (campaign.variables && campaign.variables.qrPending) || [];
      if (!pending.length) {
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        campaign.variables = Object.assign({}, campaign.variables, { qrAutoPaused: false });
        campaign.markModified('variables');
        await campaign.save();
        continue;
      }
      const ids = pending.filter((p) => /^[0-9a-f]{24}$/i.test(p));
      const phones = pending.filter((p) => !/^[0-9a-f]{24}$/i.test(p));
      const contacts = [
        ...(await Contact.find({ _id: { $in: ids }, workspace: workspace._id })),
        ...phones.map((p) => ({ _id: null, phone: p })),
      ];
      campaign.status = 'running';
      campaign.variables = Object.assign({}, campaign.variables, { qrAutoPaused: false });
      campaign.markModified('variables');
      await campaign.save();
      execute(campaign, workspace, contacts, global.io).catch((e) =>
        console.error('[QRCampaign] resume error:', e.message)
      );
    } catch (e) {
      console.error('[QRCampaign] resumePending error:', e.message);
    }
  }
}

module.exports = { execute, resumePending };
