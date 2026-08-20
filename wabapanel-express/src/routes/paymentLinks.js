const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const { protect, workspaceAccess } = require('../middleware/auth');
const PaymentLink = require('../models/PaymentLink');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Integration = require('../models/Integration');
const WhatsAppService = require('../services/whatsappService');
const { createGatewayLink } = require('../services/gatewayLinks');

const GATEWAY_METHODS = ['stripe', 'paypal', 'cashfree', 'payu', 'paystack', 'mercadopago', 'phonepe', 'paytm'];
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', NGN: '₦', BRL: 'R$', AED: 'AED ', ZAR: 'R', MXN: 'MX$' };

// Public: payment page data (no auth)
router.get('/:id/public', async (req, res) => {
  try {
    const pl = await PaymentLink.findById(req.params.id).populate('workspace', 'name');
    if (!pl) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: {
      amount: pl.amount, description: pl.description, method: pl.method,
      link: pl.link, upiId: pl.upiId, status: pl.status,
      businessName: pl.workspace?.name || '',
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.use(protect, workspaceAccess);

// GET /api/payment-links?conversation=<id>
router.get('/', async (req, res) => {
  try {
    const query = { workspace: req.workspace._id };
    if (req.query.conversation) query.conversation = req.query.conversation;
    const links = await PaymentLink.find(query).sort('-createdAt').limit(100).populate('contact', 'name phone');
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/payment-links — create link + send in chat
router.post('/', async (req, res) => {
  try {
    const { conversationId, amount, description, method, upiId, currency, onSuccessText, onSuccessFileUrl, onFailureText } = req.body;
    const plDocId = new (require('mongoose').Types.ObjectId)();
    if (!conversationId || !amount || amount <= 0) return res.status(400).json({ success: false, message: 'Amount required' });

    const conversation = await Conversation.findOne({ _id: conversationId, workspace: req.workspace._id }).populate('contact');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

    let link = '';
    let razorpayLinkId = '';
    let externalId = '';

    if (GATEWAY_METHODS.includes(method)) {
      const integ = await Integration.findOne({ workspace: req.workspace._id, type: method, connected: true });
      if (!integ) {
        return res.status(400).json({ success: false, message: `Connect ${method} first on the Integrations page` });
      }
      const result = await createGatewayLink(method, integ.config, {
        amount, currency, description,
        customer: { name: conversation.contact.name, phone: conversation.contact.phone, email: conversation.contact.email },
      });
      link = result.link;
      externalId = result.externalId || '';
    } else if (method === 'razorpay') {
      const integ = await Integration.findOne({ workspace: req.workspace._id, type: 'razorpay', connected: true });
      if (!integ?.config?.apiKey || !integ?.config?.apiSecret) {
        return res.status(400).json({ success: false, message: 'Connect Razorpay first (Integrations page — add Key ID & Secret)' });
      }
      const rzp = new Razorpay({ key_id: integ.config.apiKey, key_secret: integ.config.apiSecret });
      const plink = await rzp.paymentLink.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        description: description || `Payment of Rs.${amount}`,
        customer: { name: conversation.contact.name || 'Customer', contact: `+${String(conversation.contact.phone).replace(/^\+/, '')}` },
        notify: { sms: false, email: false },
        notes: { workspace: String(req.workspace._id), plId: String(plDocId) },
      });
      link = plink.short_url;
      razorpayLinkId = plink.id;
    } else if (method === 'whatsapp_pay') {
      if (conversation.channel && conversation.channel !== 'whatsapp') {
        return res.status(400).json({ success: false, message: 'WhatsApp Pay works only in WhatsApp (Cloud API) chats' });
      }
      if (!req.workspace.whatsapp?.isConnected) {
        return res.status(400).json({ success: false, message: 'WhatsApp is not connected' });
      }
      if (!req.workspace.whatsapp?.paymentConfiguration) {
        return res.status(400).json({ success: false, message: 'Set your WhatsApp payment configuration name first (WhatsApp Settings page)' });
      }
    } else if (method === 'upi') {
      if (!upiId) return res.status(400).json({ success: false, message: 'UPI ID required' });
      const pn = encodeURIComponent(req.workspace.name || 'Business');
      link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${pn}&am=${amount}&cu=INR${description ? '&tn=' + encodeURIComponent(description) : ''}`;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid method' });
    }

    const pl = await PaymentLink.create({
      _id: plDocId,
      workspace: req.workspace._id, contact: conversation.contact._id, conversation: conversation._id,
      amount, description: description || '', method, link, upiId: upiId || '', razorpayLinkId, externalId, currency: currency || 'INR', createdBy: req.user._id,
      onSuccess: { text: onSuccessText || '', fileUrl: onSuccessFileUrl || '' },
      onFailure: { text: onFailureText || '' },
    });

    // Send in chat
    const sym = CURRENCY_SYMBOLS[currency || 'INR'] || (currency ? currency + ' ' : '₹');
    const text = method === 'whatsapp_pay'
      ? `💳 Payment Request: ${sym}${amount}${description ? '\n' + description : ''}\n\nPay directly in WhatsApp — tap Review and Pay.`
      : method === 'upi'
      ? `💳 Payment Request: ${sym}${amount}${description ? '\n' + description : ''}\n\nPay via UPI: ${upiId}\nTap to pay: ${process.env.FRONTEND_URL || 'https://app.wabapanel.com'}/pay/${pl._id}`
      : `💳 Payment Request: ${sym}${amount}${description ? '\n' + description : ''}\n\nPay securely here: ${link}`;

    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: conversation.contact._id,
      direction: 'outbound', type: method === 'whatsapp_pay' ? 'interactive' : 'text', text, sentBy: req.user._id, status: 'pending',
    });

    const altChannel = ['whatsapp_qr', 'telegram', 'telegram_personal', 'facebook', 'instagram'].includes(conversation.channel);
    if (altChannel || req.workspace.whatsapp?.isConnected) {
      const waService = altChannel
        ? require('../services/botFlowEngine').getSender(req.workspace, conversation)
        : new WhatsAppService(req.workspace.whatsapp.accessToken, conversation.waNumberId || req.workspace.whatsapp.phoneNumberId);
      const result = method === 'whatsapp_pay'
        ? await waService.sendOrderDetails(conversation.contact.phone, {
            referenceId: String(pl._id),
            amount,
            description: description || `Payment of ₹${amount}`,
            paymentConfiguration: req.workspace.whatsapp.paymentConfiguration,
          })
        : await waService.sendTextMessage(conversation.contact.phone, text);
      if (result.success) { message.status = 'sent'; message.waMessageId = result.data?.messages?.[0]?.id || ''; }
      else { message.status = 'failed'; message.errorMessage = result.error?.message || 'Send failed'; }
      await message.save();

      // For native WhatsApp Pay, surface the real Meta reason (e.g. account not eligible for P2M)
      if (method === 'whatsapp_pay' && !result.success) {
        const e = result.error || {};
        const detail = e.error_data?.details || e.error_user_msg || e.message || 'WhatsApp could not deliver the payment message';
        await PaymentLink.deleteOne({ _id: pl._id });
        return res.status(400).json({ success: false, message: `WhatsApp Pay failed: ${detail}` });
      }
    }

    conversation.lastMessage = { text, timestamp: new Date(), direction: 'outbound', type: 'text' };
    await conversation.save();

    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });

    res.status(201).json({ success: true, data: pl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.error?.description || error.error_data?.details || error.message });
  }
});

// PUT /api/payment-links/:id/mark-paid — manual (for UPI)
router.put('/:id/mark-paid', async (req, res) => {
  try {
    const pl = await PaymentLink.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { status: 'paid', paidAt: new Date() },
      { new: true }
    );
    if (!pl) return res.status(404).json({ success: false, message: 'Not found' });
    require('../services/paymentAutomation').deliverPaymentOutcome(pl._id, 'success', req.app.get('io'));
    res.json({ success: true, data: pl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/payment-links/:id — cancel
router.delete('/:id', async (req, res) => {
  try {
    const pl = await PaymentLink.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { status: 'cancelled' },
      { new: true }
    );
    if (!pl) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: pl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
