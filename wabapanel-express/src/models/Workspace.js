const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['owner', 'admin', 'agent'], default: 'agent' },
    joinedAt: { type: Date, default: Date.now }
  }],
  whatsapp: {
    isConnected: { type: Boolean, default: false },
    connectionMethod: { type: String, enum: ['embedded', 'qr', 'manual', 'coexistence', ''], default: '' },
    wabaId: { type: String, default: '' },
    phoneNumberId: { type: String, default: '' },
    businessAccountId: { type: String, default: '' },
    accessToken: { type: String, default: '' },
    adsAccessToken: { type: String, default: '' },
    adsPageId: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    displayName: { type: String, default: '' },
    qualityRating: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
    paymentConfiguration: { type: String, default: '' },
    extraNumbers: [{
      phoneNumberId: { type: String, default: '' },
      phoneNumber: { type: String, default: '' },
      displayName: { type: String, default: '' },
      // Optional: for numbers that belong to a DIFFERENT WABA (different access token).
      // When empty, the number is treated as part of the main WABA (main token is used).
      accessToken: { type: String, default: '' },
      wabaId: { type: String, default: '' },
    }],
  },
  telegram: {
    botToken: { type: String, default: '' },
    botUsername: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
  },
  waQr: {
    enabled: { type: Boolean, default: false },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    warmupStartedAt: { type: Date },
    dailyLimit: { type: Number, default: 1000 },
    sentToday: { type: Number, default: 0 },
    sentDate: { type: String, default: '' },
  },
  tgPersonal: {
    enabled: { type: Boolean, default: false },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    username: { type: String, default: '' },
    session: { type: String, default: '' },
    apiId: { type: String, default: '' },
    apiHash: { type: String, default: '' },
  },
  emailChannel: {
    enabled: { type: Boolean, default: false },
    imapHost: { type: String, default: '' },
    imapPort: { type: Number, default: 993 },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    user: { type: String, default: '' },
    pass: { type: String, default: '' },
    fromName: { type: String, default: '' },
    lastPolledAt: { type: Date },
  },
  metaChat: {
    pageId: { type: String, default: '' },
    pageName: { type: String, default: '' },
    pageAccessToken: { type: String, default: '' },
    igAccountId: { type: String, default: '' },
    fbEnabled: { type: Boolean, default: false },
    igEnabled: { type: Boolean, default: false },
  },
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    language: { type: String, default: 'en' },
    autoReply: { type: Boolean, default: false },
    autoReplyMessage: { type: String, default: '' },
    businessHoursEnabled: { type: Boolean, default: false },
    businessHours: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  // Developer API webhook subscriptions (see /v1/webhooks)
  apiWebhooks: [{
    url: String,
    events: [String],
    createdAt: { type: Date, default: Date.now },
  }],
  apiKey: { type: String, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);
