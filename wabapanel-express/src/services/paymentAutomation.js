// Sends the configured success/failure follow-up for a payment link
// (e.g. deliver an ebook after a Razorpay payment succeeds).
const PaymentLink = require('../models/PaymentLink');
const Workspace = require('../models/Workspace');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const WhatsAppService = require('./whatsappService');

const guessDocName = (url) => {
  try { return decodeURIComponent(url.split('/').pop().split('?')[0]) || 'file'; } catch { return 'file'; }
};

const deliverPaymentOutcome = async (plId, outcome, io) => {
  try {
    const pl = await PaymentLink.findById(plId);
    if (!pl) return;
    const cfg = outcome === 'success' ? pl.onSuccess : pl.onFailure;
    if (!cfg || (!(cfg.text || '').trim() && !(cfg.fileUrl || '').trim())) return;
    if (outcome === 'success' && pl.successDeliveredAt) return;
    if (outcome === 'failure' && pl.failureNotifiedAt) return;

    const workspace = await Workspace.findById(pl.workspace);
    const contact = await Contact.findById(pl.contact);
    if (!workspace || !contact) return;
    let conversation = pl.conversation ? await Conversation.findById(pl.conversation) : null;
    if (!conversation) conversation = await Conversation.findOne({ workspace: workspace._id, contact: contact._id });

    const altChannel = conversation && ['whatsapp_qr', 'telegram', 'telegram_personal', 'facebook', 'instagram'].includes(conversation.channel);
    if (!altChannel && !workspace.whatsapp?.isConnected) return;
    const waService = altChannel
      ? require('./botFlowEngine').getSender(workspace, conversation)
      : new WhatsAppService(workspace.whatsapp.accessToken, (conversation && conversation.waNumberId) || workspace.whatsapp.phoneNumberId);

    const text = (cfg.text || '').trim();
    const fileUrl = (cfg.fileUrl || '').trim();
    let result;
    if (fileUrl) {
      if (text) { try { await waService.sendTextMessage(contact.phone, text); } catch { /* file still goes */ } }
      const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(fileUrl);
      result = await waService.sendMediaMessage(contact.phone, isImage ? 'image' : 'document', fileUrl, isImage ? '' : guessDocName(fileUrl));
    } else {
      result = await waService.sendTextMessage(contact.phone, text);
    }
    if (!result?.success) {
      console.error('[PaymentAutomation]', outcome, 'send failed:', JSON.stringify(result?.error || result).slice(0, 300));
      return;
    }

    if (outcome === 'success') pl.successDeliveredAt = new Date();
    else pl.failureNotifiedAt = new Date();
    await pl.save();

    if (conversation) {
      const message = await Message.create({
        workspace: workspace._id, conversation: conversation._id, contact: contact._id,
        direction: 'outbound', type: fileUrl ? 'document' : 'text',
        text: text || (fileUrl ? guessDocName(fileUrl) : ''),
        media: fileUrl ? { url: fileUrl } : undefined,
        waMessageId: result.data?.messages?.[0]?.id || '',
        status: 'sent',
        metadata: { source: 'payment_automation', paymentLinkId: pl._id, outcome },
      });
      conversation.lastMessage = { text: message.text, timestamp: new Date(), direction: 'outbound', type: message.type };
      await conversation.save();
      if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
    }
  } catch (e) {
    console.error('[PaymentAutomation] error:', e.message);
  }
};

module.exports = { deliverPaymentOutcome };
