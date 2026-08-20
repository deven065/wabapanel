const mongoose = require('mongoose');

const paymentLinkSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  amount: { type: Number, required: true },
  description: { type: String, default: '' },
  method: { type: String, enum: ['razorpay', 'upi', 'whatsapp_pay', 'stripe', 'paypal', 'cashfree', 'payu', 'paystack', 'mercadopago', 'phonepe', 'paytm'], required: true },
  currency: { type: String, default: 'INR' },
  externalId: { type: String, default: '', index: true },
  link: { type: String, default: '' },
  upiId: { type: String, default: '' },
  razorpayLinkId: { type: String, default: '', index: true },
  status: { type: String, enum: ['created', 'paid', 'cancelled'], default: 'created' },
  paidAt: { type: Date },
  onSuccess: {
    text: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
  },
  onFailure: {
    text: { type: String, default: '' },
  },
  successDeliveredAt: { type: Date },
  failureNotifiedAt: { type: Date },
  // Set when this link was created for a catalogue checkout order — so paying it marks the order paid.
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// When a checkout payment link becomes paid, mark its linked order paid too. Idempotent.
paymentLinkSchema.post('save', function (doc) {
  if (doc.status !== 'paid' || !doc.order) return;
  setImmediate(async () => {
    try {
      const Order = mongoose.model('Order');
      const order = await Order.findById(doc.order);
      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        if (order.status === 'pending') order.status = 'confirmed';
        await order.save();
      }
    } catch (e) { console.error('[PaymentLink] order-paid hook:', e.message); }
  });
});

module.exports = mongoose.model('PaymentLink', paymentLinkSchema);
