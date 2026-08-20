const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const waQr = require('../services/waQrService');

router.use(protect, workspaceAccess);
router.use(requireFeature('whatsappQr'));

// Start (or resume) a QR session for this workspace
router.post('/connect', async (req, res) => {
  try {
    await waQr.startSession(req.workspace._id);
    const status = await waQr.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Poll connection status + QR image
router.get('/status', async (req, res) => {
  try {
    const status = await waQr.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Restart the socket to pull messages received while offline
router.post('/sync', async (req, res) => {
  try {
    await waQr.syncSession(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Set a custom daily send limit (0 = automatic warm-up schedule)
router.post('/settings', async (req, res) => {
  try {
    const value = await waQr.setDailyLimit(req.workspace._id, req.body.dailyLimit);
    res.json({ success: true, data: { dailyLimit: value } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Send a free-form message to any number (no template needed)
router.post('/send-new', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const text = String(req.body.text || '').trim();
    if (!phone || phone.length < 7) return res.status(400).json({ success: false, message: 'Enter a valid phone number with country code' });
    if (!text) return res.status(400).json({ success: false, message: 'Message text is required' });

    await waQr.sendMessage(req.workspace._id, phone, { type: 'text', text });

    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const contact = await Contact.findOneAndUpdate(
      { workspace: req.workspace._id, phone },
      { $setOnInsert: { workspace: req.workspace._id, phone, name: req.body.name || `WA ${phone}`, source: 'whatsapp_qr' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: req.workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
      {
        $set: { lastMessage: text.slice(0, 200), lastMessageAt: new Date(), status: 'active' },
        $setOnInsert: { workspace: req.workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'text', text, status: 'sent',
      metadata: { source: 'whatsapp_qr' },
    });
    if (global.io) {
      global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
      global.io.to(`workspace:${req.workspace._id}`).emit('conversation_updated', conversation);
    }
    res.json({ success: true, data: { conversationId: conversation._id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Logout and remove the session
router.post('/disconnect', async (req, res) => {
  try {
    await waQr.disconnect(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
