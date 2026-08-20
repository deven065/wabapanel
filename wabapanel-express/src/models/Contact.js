const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, default: '' },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  countryCode: { type: String, default: '+91' },
  avatar: { type: String, default: '' },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Stage', default: null },
  stages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Stage' }],
  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
  segments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Segment' }],
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  leadScore: { type: String, enum: ['', 'hot', 'warm', 'cold'], default: '' },
  leadScoreAt: { type: Date },
  notes: { type: String, default: '' },
  crmComment: { type: String, default: '' },
  crmValue: { type: Number, default: null },
  crmItems: { type: Number, default: null },
  crmAiSummary: {
    text: { type: String, default: '' },
    score: { type: Number, default: null },
    at: { type: Date },
  },
  leadClosed: { type: Boolean, default: false },
  leadClosedAt: { type: Date },
  leadCloseReason: { type: String, enum: ['', 'won', 'lost', 'not_interested', 'spam'], default: '' },
  callStatus: { type: String, enum: ['', 'not_called', 'called', 'callback'], default: '' },
  lastCalledAt: { type: Date, default: null },
  lastDisposition: { type: String, default: '' },
  language: { type: String, default: '' },
  birthday: { type: Date },
  anniversary: { type: Date },
  lastBirthdayWish: { type: Number, default: 0 },
  lastAnniversaryWish: { type: Number, default: 0 },
  source: { type: String, enum: ['manual', 'import', 'whatsapp', 'form', 'facebook_lead', 'api', 'facebook', 'instagram', 'telegram', 'email'], default: 'manual' },
  status: { type: String, enum: ['active', 'blocked', 'opted_out'], default: 'active' },
  lastMessageAt: { type: Date },
  optInStatus: { type: Boolean, default: true },
  waId: { type: String, default: '' }, // WhatsApp ID
  isGroup: { type: Boolean, default: false }, // WhatsApp group chat (QR) - hidden from Contacts/CRM/broadcast
  channel: { type: String, enum: ['whatsapp', 'whatsapp_qr', 'facebook', 'instagram', 'telegram', 'telegram_personal', 'email'], default: 'whatsapp' },
  profileName: { type: String, default: '' },
}, { timestamps: true });

contactSchema.index({ workspace: 1, phone: 1 }, { unique: true });
contactSchema.index({ workspace: 1, name: 'text', phone: 'text', email: 'text' }, { language_override: 'searchLang' });

module.exports = mongoose.model('Contact', contactSchema);
