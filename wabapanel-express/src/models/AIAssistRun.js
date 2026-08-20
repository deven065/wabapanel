const mongoose = require('mongoose');

// History of AI Assist runs (manual or scheduled) so users can see which prompt
// ran when and what it changed.
const aiAssistRunSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  instruction: { type: String, required: true },
  source: { type: String, enum: ['manual', 'schedule'], default: 'manual' },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'AIAssistSchedule', default: null },
  allowSend: { type: Boolean, default: false },
  leads: { type: Number, default: 0 },
  changed: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  sendFailed: { type: Number, default: 0 },
  error: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

aiAssistRunSchema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('AIAssistRun', aiAssistRunSchema);
