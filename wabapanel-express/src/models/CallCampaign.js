const mongoose = require('mongoose');

const callCampaignSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'AICallingAgent' },
  status: { type: String, enum: ['draft', 'running', 'paused', 'completed', 'stopped'], default: 'draft' },
  targets: [{
    phone: { type: String, required: true },
    name: { type: String, default: '' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    status: { type: String, enum: ['pending', 'calling', 'done', 'failed', 'permission_requested'], default: 'pending' },
    callId: { type: String, default: '' },
    error: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    calledAt: { type: Date },
  }],
  // Calls only placed between these times (24h HH:MM, workspace server time)
  callingHours: {
    start: { type: String, default: '10:00' },
    end: { type: String, default: '19:00' },
  },
  dailyLimit: { type: Number, default: 50 },
  callsToday: { type: Number, default: 0 },
  lastCallDate: { type: String, default: '' },
  retryFailed: { type: Boolean, default: false },
  stats: {
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    permissionRequested: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

callCampaignSchema.index({ workspace: 1, createdAt: -1 });
callCampaignSchema.index({ status: 1 });

module.exports = mongoose.model('CallCampaign', callCampaignSchema);
