const mongoose = require('mongoose');

const segmentSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  rules: [{
    field: { type: String, required: true },
    operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'], required: true },
    value: { type: String, default: '' },
    conjunction: { type: String, enum: ['and', 'or'], default: 'and' },
  }],
  // Broadcast retargeting rules: match contacts by their behavior on a past campaign
  behaviorRules: [{
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    condition: { type: String, enum: ['delivered_not_replied', 'read_not_replied', 'not_read', 'replied', 'failed', 'sent'], default: 'delivered_not_replied' },
  }],
  contactCount: { type: Number, default: 0 },
  isAutoUpdate: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Segment', segmentSchema);
