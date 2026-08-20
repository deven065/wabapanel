const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  category: { type: String, default: '' },
  sku: { type: String, default: '' },
  images: [{ type: String }],
  retailerId: { type: String, default: '' },
  url: { type: String, default: '' },
  availability: { type: String, enum: ['in_stock', 'out_of_stock', 'preorder'], default: 'in_stock' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  metaCatalogId: { type: String, default: '' },
  metaProductId: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productSchema.index({ workspace: 1, sku: 1 });

productSchema.pre('save', function () {
  this.$locals.wentOOS = !this.isNew && this.isModified('availability') && this.availability === 'out_of_stock';
});

productSchema.post('save', function (doc) {
  if (!doc.$locals?.wentOOS) return;
  setImmediate(() => require('../services/ownerNotify').lowStock(doc).catch(() => {}));
});

module.exports = mongoose.model('Product', productSchema);
