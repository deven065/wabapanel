const mongoose = require('mongoose');

const scheduledCallSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  phone: { type: String, required: true },
  at: { type: Date, required: true },
  reason: { type: String, default: '' },
  type: { type: String, enum: ['ai_callback', 'human_callback'], default: 'ai_callback' },
  status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
  error: { type: String, default: '' },
  disposition: { type: String, default: '' },
  note: { type: String, default: '' },
  followUpAt: { type: Date },
}, { timestamps: true });

scheduledCallSchema.index({ status: 1, at: 1 });

module.exports = mongoose.model('ScheduledCall', scheduledCallSchema);
