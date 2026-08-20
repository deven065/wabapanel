const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }, // null = global (admin)
  name: { type: String, required: true, trim: true },
  body: { type: String, default: '' },
  header: {
    type: { type: String, enum: ['none', 'text', 'image', 'video', 'document'], default: 'none' },
    content: { type: String, default: '' },
    mediaUrl: { type: String, default: '' },
  },
  footer: { type: String, default: '' },
  buttons: [{
    type: { type: String, enum: ['quick_reply', 'url', 'phone', 'copy_code', 'flow', 'catalog'], default: 'quick_reply' },
    text: { type: String, required: true },
    value: { type: String, default: '' },
    // Sample URL for a dynamic (variable) URL button — required by Meta when the url contains {{1}}
    example: { type: String, default: '' },
  }],
  category: { type: String, enum: ['marketing', 'utility', 'authentication', 'MARKETING', 'UTILITY', 'AUTHENTICATION'], default: 'utility', set: v => v ? v.toLowerCase() : 'utility' },
  waCategory: { type: String, default: '' },
  sector: { type: String, default: '' },
  language: { type: String, default: 'en' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'disabled'], default: 'pending' },
  rejectionReason: { type: String, default: '' },
  metaTemplateId: { type: String, default: '' },
  variables: [{ type: String }],
  carousel: {
    cards: [{
      mediaUrl: { type: String, default: '' },
      mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
      body: { type: String, default: '' },
      buttons: [{
        type: { type: String, enum: ['quick_reply', 'url', 'phone'], default: 'quick_reply' },
        text: { type: String, default: '' },
        value: { type: String, default: '' },
      }],
    }],
  },
  // Authentication (OTP) template config — Meta requires a fixed structure
  // (no BODY text; OTP button + optional code-expiration footer).
  authentication: {
    otpType: { type: String, default: 'COPY_CODE' },
    buttonText: { type: String, default: 'Copy Code' },
    codeExpirationMinutes: { type: Number, default: 0 },
    addSecurityRecommendation: { type: Boolean, default: true },
  },
  isGlobal: { type: Boolean, default: false },
  // Smart Broadcast: utility template whose body variables are filled with the
  // user's message at send time (advanced, admin-gated feature).
  smartBroadcast: { type: Boolean, default: false },
  smartVarCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);
