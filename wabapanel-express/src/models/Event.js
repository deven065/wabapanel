const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['webhook', 'schedule', 'contact_event', 'message_event', 'system', 'custom'], default: 'custom' },
  triggerConfig: {
    webhookUrl: { type: String, default: '' },
    schedule: { type: String, default: '' },
    eventName: { type: String, default: '' },
  },
  actions: [{
    type: { type: String, enum: ['send_message', 'send_template', 'add_tag', 'remove_tag', 'add_segment', 'trigger_automation', 'webhook', 'email'], default: 'send_message' },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  }],
  filters: {
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
    segments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Segment' }],
    conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  stats: {
    triggered: { type: Number, default: 0 },
    lastTriggeredAt: { type: Date },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
