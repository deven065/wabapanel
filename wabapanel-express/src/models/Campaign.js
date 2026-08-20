const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['broadcast', 'drip', 'preset'], required: true },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  presetMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'PresetMessage' },
  status: { type: String, enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'], default: 'draft' },

  // Target audience
  targetType: { type: String, enum: ['all', 'segment', 'tag', 'contacts', 'numbers', 'pipeline'], default: 'all' },
  targetChannel: { type: String, default: '' },
  // 'whatsapp_qr' sends via the QR (Baileys) socket instead of the Cloud API
  sendChannel: { type: String, enum: ['cloud', 'whatsapp_qr'], default: 'cloud' },
  // WhatsApp phone number ID to send from (empty = workspace default number)
  senderNumberId: { type: String, default: '' },
  targetSegments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Segment' }],
  targetTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  targetContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
  targetNumbers: [{ type: String }],
  targetPipeline: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline' },
  targetStage: { type: String, default: '' },

  // A/B testing: a share of recipients receives template B instead of A
  abTest: {
    enabled: { type: Boolean, default: false },
    templateB: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    splitPercent: { type: Number, default: 50 },
  },

  // Scheduling
  scheduledAt: { type: Date },
  recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
  startedAt: { type: Date },
  completedAt: { type: Date },

  // Drip specific
  dripSteps: [{
    order: { type: Number },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    presetMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'PresetMessage' },
    delayDays: { type: Number, default: 0 },
    delayHours: { type: Number, default: 0 },
    delayMinutes: { type: Number, default: 0 },
    delayType: { type: String, enum: ['minutes', 'hours', 'days'], default: 'minutes' },
    delayValue: { type: Number, default: 0 },
    message: { type: String, default: '' },
  }],

  // Stats
  stats: {
    totalRecipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
  },

  variables: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);
