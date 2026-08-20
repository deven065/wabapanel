const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getConversations, getConversation, getMessages, sendMessage, startConversationByPhone, startConversationByEmail,
  startConversation, assignConversation, resolveConversation, markAsRead, toggleAI,
} = require('../controllers/conversationController');

router.use(protect, workspaceAccess);
router.use(requireFeature('chat'));
router.get('/', getConversations);
router.get('/search-messages', require('../controllers/conversationController').searchMessages);
router.get('/unread-counts', require('../controllers/conversationController').getUnreadCounts);
router.get('/export-all', require('../controllers/conversationController').exportAllChats);
router.get('/:id/export', require('../controllers/conversationController').exportConversation);
router.post('/', startConversation);
router.post('/by-phone', startConversationByPhone);
router.post('/by-email', startConversationByEmail);
router.get('/stickers/library', async (req, res) => {
  try {
    const Message = require('../models/Message');
    const rows = await Message.find({
      workspace: req.workspace._id,
      type: 'sticker',
      'media.url': { $exists: true, $ne: '' },
    }).select('media createdAt direction').sort({ createdAt: -1 }).limit(300).lean();
    const seen = new Set();
    const stickers = [];
    for (const m of rows) {
      const url = m.media && m.media.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      stickers.push({ url, mimetype: (m.media && m.media.mimetype) || 'image/webp' });
      if (stickers.length >= 60) break;
    }
    res.json({ success: true, data: stickers });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
router.get('/:id', getConversation);
router.post('/:id/send-invoice', async (req, res) => {
  try {
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const WhatsAppService = require('../services/whatsappService');
    const conv = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('contact', 'name phone');
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const { docType = 'invoice', items = [], gstPercent = 0, notes = '' } = req.body;
    if (!items.length || !items.some((i) => i.name)) return res.status(400).json({ success: false, message: 'Add at least one item' });

    const { generateInvoicePdf } = require('../services/invoiceService');
    const { url, num, total } = await generateInvoicePdf({ workspace: req.workspace, contact: conv.contact, docType, items, gstPercent, notes });

    const wa = require('../services/botFlowEngine').getSender(req.workspace, conv);
    const caption = `${docType === 'quotation' ? 'Quotation' : 'Invoice'} ${num} — Total Rs. ${total.toFixed(2)}`;
    const result = await wa.sendMediaMessage(conv.contact.phone, 'document', url, caption);
    if (!result?.success) return res.status(400).json({ success: false, message: result?.error?.message || 'WhatsApp send failed' });

    const message = await Message.create({
      workspace: req.workspace._id,
      conversation: conv._id,
      contact: conv.contact._id,
      direction: 'outbound',
      type: 'document',
      text: caption,
      media: { url, caption, mimeType: 'application/pdf', filename: `${num}.pdf` },
      waMessageId: result.data?.messages?.[0]?.id || '',
      status: 'sent',
      metadata: { source: 'invoice' },
    });
    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conv._id });
    res.json({ success: true, data: { url, num } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/:id/ai-summary', async (req, res) => {
  try {
    const summary = await require('../services/aiFeatures').summarizeConversation({ workspaceId: req.workspace._id, conversationId: req.params.id });
    res.json({ success: true, data: { summary } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.post('/:id/react', require('../controllers/conversationController').reactMessage);
router.post('/:id/presence', require('../controllers/conversationController').subscribePresence);
router.patch('/:id/assign', assignConversation);
router.put('/:id/assign', assignConversation);
router.patch('/:id/resolve', resolveConversation);
router.put('/:id/resolve', resolveConversation);
router.put('/:id/read', markAsRead);

router.patch('/:id/ai-toggle', toggleAI);
router.patch('/:id/pin', require('../controllers/conversationController').pinConversation);
router.delete('/:id', require('../controllers/conversationController').deleteConversation);

// Schedule a message for later
router.post("/:id/schedule", async (req, res) => {
  try {
    const { text, scheduledAt } = req.body;
    if (!text || !scheduledAt) return res.status(400).json({ success: false, message: "text and scheduledAt required" });
    const conv = await require("../models").Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: "Conversation not found" });
    // Store scheduled message
    const ScheduledMsg = require("mongoose").model("ScheduledMessage", new require("mongoose").Schema({
      conversation: { type: require("mongoose").Schema.Types.ObjectId, ref: "Conversation" },
      workspace: { type: require("mongoose").Schema.Types.ObjectId, ref: "Workspace" },
      text: String,
      scheduledAt: Date,
      sent: { type: Boolean, default: false }
    }, { timestamps: true }), undefined, undefined);
    await ScheduledMsg.create({ conversation: conv._id, workspace: conv.workspace, text, scheduledAt: new Date(scheduledAt) });
    res.json({ success: true, message: "Message scheduled" });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
module.exports = router;
