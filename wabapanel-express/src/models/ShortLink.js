const mongoose = require('mongoose');

const shortLinkSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true, trim: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true },
  clicks: { type: Number, default: 0 },
  clickDetails: [{
    ip: { type: String },
    userAgent: { type: String },
    referrer: { type: String },
    country: { type: String },
    clickedAt: { type: Date, default: Date.now },
  }],
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date },
  isAdmin: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('ShortLink', shortLinkSchema);
