const mongoose = require('mongoose');

// Short-lived record of processed webhook events, used to drop duplicates.
const webhookEventSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, required: true },
  hash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

webhookEventSchema.index({ workspace: 1, hash: 1 }, { unique: true });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
