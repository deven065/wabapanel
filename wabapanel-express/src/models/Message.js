const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  type: { type: String, enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker', 'template', 'interactive', 'reaction', 'list', 'button'], default: 'text' },
  text: { type: String, default: '' },
  media: {
    url: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    caption: { type: String, default: '' },
    filename: { type: String, default: '' },
    sha256: { type: String, default: '' },
  },
  template: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    name: { type: String, default: '' },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  interactive: {
    type: { type: String, enum: ['button', 'list', 'product', 'product_list', 'cta_url', ''], default: '' },
    body: { type: String, default: '' },
    ctaText: { type: String, default: '' },
    ctaUrl: { type: String, default: '' },
    buttons: [{ id: String, title: String }],
    sections: [{ title: String, rows: [{ id: String, title: String, description: String }] }],
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    name: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  context: {
    messageId: { type: String, default: '' },
    text: { type: String, default: '' },
    from: { type: String, default: '' },
  },
  reactions: [{
    emoji: { type: String, default: '' },
    from: { type: String, default: '' },
  }],
  status: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' },
  waMessageId: { type: String, default: '' },
  errorCode: { type: Number },
  errorMessage: { type: String, default: '' },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isAutomated: { type: Boolean, default: false },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  cost: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ workspace: 1, waMessageId: 1 });
messageSchema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
