const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  orderNumber: { type: String, required: true },
  items: [orderItemSchema],
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  shippingAddress: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
  },
  notes: { type: String, default: '' },
  source: { type: String, enum: ['whatsapp', 'manual', 'api'], default: 'whatsapp' },
  metaOrderId: { type: String, default: '' },
  cartReminderAt: { type: Date, default: null },
  // True for online-checkout orders awaiting payment: the "new order" owner alert
  // is held back until the payment completes.
  paymentPending: { type: Boolean, default: false },
}, { timestamps: true });

orderSchema.index({ workspace: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ workspace: 1, contact: 1 });

orderSchema.pre('save', function () {
  this.$locals.wasNew = this.isNew;
  this.$locals.paidNow = !this.isNew && this.isModified('paymentStatus') && this.paymentStatus === 'paid';
  this.$locals.cancelledNow = !this.isNew && this.isModified('status') && this.status === 'cancelled';
  this.$locals.pendingPayment = this.paymentPending === true;
});

orderSchema.post('save', function (doc) {
  if (!doc.$locals?.wasNew && !doc.$locals?.paidNow && !doc.$locals?.cancelledNow) return;
  const wasNew = doc.$locals.wasNew;
  const paidNow = doc.$locals.paidNow;
  const pendingPayment = doc.$locals.pendingPayment;
  // Fire the "new order" alert immediately for normal orders, but for online-checkout
  // orders (paymentPending) hold it until payment actually completes.
  const announceOrder = (wasNew && !pendingPayment) || (paidNow && pendingPayment);
  setImmediate(async () => {
    try {
      const ownerNotify = require('../services/ownerNotify');
      let name = '';
      if (doc.contact) {
        const c = await mongoose.model('Contact').findById(doc.contact).select('name profileName phone').lean();
        if (c) name = `${c.name || c.profileName || 'Customer'} (${c.phone || ''})`;
      }
      if (announceOrder) {
        await ownerNotify.orderPlaced(doc, name);
        await ownerNotify.checkSalesTarget(doc.workspace);
      }
      if (paidNow) await ownerNotify.paymentReceived(doc, name);
      if (doc.$locals?.cancelledNow) await ownerNotify.orderCancelled(doc, name);
    } catch (e) { console.error('[OwnerAlert] order hook:', e.message); }
    try {
      const actionRunner = require('../services/actionRunner');
      const contact = doc.contact ? await mongoose.model('Contact').findById(doc.contact) : null;
      const ctx = { workspace: doc.workspace, contact };
      if (announceOrder) {
        await actionRunner.runPredefined('on_order', ctx);
        await actionRunner.fireEvent(doc.workspace, 'order_placed', ctx);
      }
      if (paidNow) {
        await actionRunner.runPredefined('on_payment', ctx);
        await actionRunner.fireEvent(doc.workspace, 'payment_received', ctx);
      }
    } catch (e) { console.error('[ActionRunner] order hook:', e.message); }
  });
});

module.exports = mongoose.model('Order', orderSchema);
