const router = require('express').Router();
const { verifyWebhook, handleWhatsAppWebhook, handleRazorpayWebhook, handleStripeWebhook } = require('../controllers/webhookController');
const { verifyFacebookLeadWebhook, handleFacebookLeadWebhook } = require('../controllers/facebookLeadController');

router.get('/whatsapp', verifyWebhook);
router.post('/whatsapp', handleWhatsAppWebhook);
router.post('/razorpay', handleRazorpayWebhook);
router.post('/stripe', handleStripeWebhook);
router.get('/facebook-leads', verifyFacebookLeadWebhook);
router.post('/facebook-leads', handleFacebookLeadWebhook);

// Telegram bot webhook (public, one per workspace)
router.post('/telegram/:workspaceId', async (req, res) => {
  res.sendStatus(200);
  try {
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findById(req.params.workspaceId);
    if (!workspace || !workspace.telegram?.enabled || !workspace.telegram?.botToken) return;
    const io = req.app.get('io') || global.io;
    await require('../services/telegramService').handleUpdate(workspace, req.body, io);
  } catch (e) {
    console.error('[Telegram] webhook error:', e.message);
  }
});

module.exports = router;
