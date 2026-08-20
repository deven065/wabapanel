const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled', 'pending'], default: 'active' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  autoRenew: { type: Boolean, default: false },
  gatewaySubscriptionId: { type: String, default: '' },
  assignedBy: { type: String, enum: ['auto', 'manual'], default: 'manual' },
  notes: { type: String, default: '' },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
}, { timestamps: true });

subscriptionSchema.index({ vendor: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
