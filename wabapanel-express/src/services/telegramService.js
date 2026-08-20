const axios = require('axios');

// Telegram Bot API channel: inbound via webhook, outbound via bot token.
const API = (token) => `https://api.telegram.org/bot${token}`;

async function setWebhook(token, workspaceId) {
  const base = process.env.API_BASE_URL || process.env.BACKEND_URL || process.env.API_URL || 'https://api.wabapanel.com';
  const url = `${base.replace(/\/$/, '')}/api/webhook/telegram/${workspaceId}`;
  const r = await axios.post(`${API(token)}/setWebhook`, { url });
  return r.data;
}

async function getMe(token) {
  const r = await axios.get(`${API(token)}/getMe`);
  return r.data?.result;
}

async function sendMessage(token, chatId, text) {
  const r = await axios.post(`${API(token)}/sendMessage`, { chat_id: chatId, text });
  return r.data?.result;
}

async function sendMedia(token, chatId, type, url, caption) {
  const method = { image: 'sendPhoto', video: 'sendVideo', audio: 'sendAudio', document: 'sendDocument' }[type] || 'sendDocument';
  const field = { image: 'photo', video: 'video', audio: 'audio', document: 'document' }[type] || 'document';
  const r = await axios.post(`${API(token)}/${method}`, { chat_id: chatId, [field]: url, caption: caption || '' });
  return r.data?.result;
}

// Handles an inbound Telegram update for a workspace
async function handleUpdate(workspace, update, io) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');

  const chatId = String(msg.chat.id);
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || `Telegram ${chatId}`;

  const contact = await Contact.findOneAndUpdate(
    { workspace: workspace._id, phone: chatId },
    { workspace: workspace._id, phone: chatId, name, source: 'telegram', channel: 'telegram', lastMessageAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: 'telegram' },
    {
      workspace: workspace._id, contact: contact._id, channel: 'telegram',
      lastMessage: msg.text || '[media]', lastMessageAt: new Date(), status: 'active',
      $inc: { unreadCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const message = await Message.create({
    workspace: workspace._id, conversation: conversation._id, contact: contact._id,
    direction: 'inbound', type: 'text', text: msg.text || '[unsupported message type]',
    waMessageId: `tg_${msg.message_id}`, status: 'delivered',
    metadata: { source: 'telegram' },
  });

  if (io) {
    const populated = await Conversation.findById(conversation._id)
      .populate({ path: 'contact', select: 'name phone avatar profileName' });
    io.to(`workspace:${workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
    io.to(`workspace:${workspace._id}`).emit('conversation_updated', populated || conversation);
  }
  if (msg.text) {
    require('./qrAutomation')
      .processIncoming({ workspace, conversation, contact, phone: chatId, text: msg.text })
      .catch((e) => console.error('[telegram] automation error:', e.message));
  }
  require('./apiWebhookDispatcher').dispatch(workspace, 'message.received', {
    conversation_id: conversation._id, contact_id: contact._id, channel: 'telegram', text: msg.text || '',
  }).catch(() => {});
}

module.exports = { setWebhook, getMe, sendMessage, sendMedia, handleUpdate };
