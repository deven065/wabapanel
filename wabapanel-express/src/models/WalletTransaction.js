const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  description: { type: String, default: '' },
  category: { type: String, enum: ['topup', 'message_cost', 'refund', 'admin_adjustment', 'subscription', 'bonus'], default: 'topup' },
  reference: { type: String, default: '' }, // payment ID, message ID, etc.
  metadata: {
    messageType: { type: String, default: '' },
    countryCode: { type: String, default: '' },
    templateCategory: { type: String, default: '' },
    rate: { type: Number, default: 0 },
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Frontend reads `balance`; persisted field is `balanceAfter`.
walletTransactionSchema.virtual('balance').get(function () { return this.balanceAfter; });

walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
