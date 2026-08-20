const mongoose = require('mongoose');

const metaPricingSchema = new mongoose.Schema({
  countryCode: { type: String, required: true },
  countryName: { type: String, required: true },
  category: { type: String, enum: ['marketing', 'utility', 'authentication', 'service'], required: true },
  baseRate: { type: Number, required: true },
  markup: { type: Number, default: 15 }, // percentage
  finalRate: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

metaPricingSchema.index({ countryCode: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('MetaPricing', metaPricingSchema);
