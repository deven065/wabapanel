const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  gateway: { type: String, enum: ['stripe', 'razorpay', 'paypal', 'phonepe', 'cashfree', 'payu', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago', 'manual', 'wallet'], required: true },
  gatewayPaymentId: { type: String, default: '' },
  gatewayOrderId: { type: String, default: '' },
  gatewaySubscriptionId: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'], default: 'pending' },
  type: { type: String, enum: ['subscription', 'wallet_topup', 'one_time'], default: 'subscription' },
  description: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoiceUrl: { type: String, default: '' },
  refundAmount: { type: Number, default: 0 },
  refundedAt: { type: Date },
  manualReference: { type: String, default: '' },
  manualProofUrl: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  rejectionReason: { type: String, default: '' },
}, { timestamps: true });

paymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
