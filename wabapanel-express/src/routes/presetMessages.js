const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const PresetMessage = require('../models/PresetMessage');
const Conversation = require('../models/Conversation');

router.use(protect, workspaceAccess);

router.get('/', async (req, res) => {
  try {
    // Backfill legacy presets (created before per-creator scoping) to the workspace owner
    // so the person who set them up keeps them and they stop leaking to other members.
    await PresetMessage.updateMany(
      { workspace: req.workspace._id, createdBy: { $exists: false } },
      { $set: { createdBy: req.workspace.owner } }
    );
    const items = await PresetMessage.find({ workspace: req.workspace._id, createdBy: req.user._id }).sort('-createdAt');
    res.json({ success: true, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// How many contacts currently have an open 24h window (free-form eligible).
router.get('/eligible-count', async (req, res) => {
  try {
    const count = await Conversation.countDocuments({ workspace: req.workspace._id, windowExpiresAt: { $gt: new Date() } });
    res.json({ success: true, data: { count } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const item = await PresetMessage.create({ name: req.body.name, body: req.body.body, mediaUrl: req.body.mediaUrl || '', headerType: req.body.headerType || 'none', headerText: req.body.headerText || '', footer: req.body.footer || '', buttons: req.body.buttons || [], listButtonText: req.body.listButtonText || '', listItems: req.body.listItems || [], cards: req.body.cards || [], carouselTemplate: req.body.carouselTemplate || '', productIds: req.body.productIds || [], workspace: req.workspace._id, createdBy: req.user._id });
    res.status(201).json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await PresetMessage.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, createdBy: req.user._id },
      { name: req.body.name, body: req.body.body, mediaUrl: req.body.mediaUrl || '', headerType: req.body.headerType || 'none', headerText: req.body.headerText || '', footer: req.body.footer || '', buttons: req.body.buttons || [], listButtonText: req.body.listButtonText || '', listItems: req.body.listItems || [], cards: req.body.cards || [], carouselTemplate: req.body.carouselTemplate || '', productIds: req.body.productIds || [] },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await PresetMessage.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id, createdBy: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Send a preset to a conversation from the inbox (24h window required).
router.post('/:id/send', async (req, res) => {
  try {
    const preset = await PresetMessage.findOne({ _id: req.params.id, workspace: req.workspace._id, createdBy: req.user._id });
    if (!preset) return res.status(404).json({ success: false, message: 'Preset not found' });
    const conversation = await Conversation.findOne({ _id: req.body.conversationId, workspace: req.workspace._id }).populate('contact');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const altChannel = ['whatsapp_qr', 'telegram', 'telegram_personal', 'facebook', 'instagram'].includes(conversation.channel);
    if (!altChannel && (!conversation.windowExpiresAt || conversation.windowExpiresAt <= new Date())) {
      return res.status(400).json({ success: false, message: '24-hr window is closed — send an approved template to this customer' });
    }
    if (!altChannel && !req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }
    const WhatsAppService = require('../services/whatsappService');
    const { sendPreset } = require('../services/presetSend');
    const Message = require('../models/Message');
    const waService = altChannel
      ? require('../services/botFlowEngine').getSender(req.workspace, conversation)
      : new WhatsAppService(req.workspace.whatsapp.accessToken, conversation.waNumberId || req.workspace.whatsapp.phoneNumberId);
    let { result, msgType, renderedText, interactive } = await sendPreset(waService, conversation.contact.phone, preset, conversation.contact);
    if (altChannel && waService.lastSentText) renderedText = waService.lastSentText;
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error?.message || 'Send failed' });
    }
    const message = await Message.create({
      workspace: req.workspace._id,
      conversation: conversation._id,
      contact: conversation.contact._id,
      direction: 'outbound',
      type: msgType,
      text: renderedText || preset.body,
      media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
      interactive: interactive || undefined,
      waMessageId: result.data?.messages?.[0]?.id || '',
      status: 'sent',
      sentBy: req.user._id,
      metadata: { source: 'preset', presetId: preset._id },
    });
    conversation.lastMessage = { text: renderedText || preset.body, timestamp: new Date(), direction: 'outbound', type: msgType };
    await conversation.save();
    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
    res.status(201).json({ success: true, data: message });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
