const mongoose = require('mongoose');

const keywordSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  keyword: { type: String, required: true, trim: true },
  matchType: { type: String, enum: ['exact', 'contains', 'starts_with', 'regex'], default: 'contains' },
  responseType: { type: String, enum: ['text', 'template', 'media', 'interactive', 'automation'], default: 'text' },
  responseText: { type: String, default: '' },
  responseTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  responseMedia: {
    type: { type: String, enum: ['image', 'video', 'audio', 'document', 'sticker', ''], default: '' },
    url: { type: String, default: '' },
    caption: { type: String, default: '' },
  },
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
  priority: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  stats: {
    triggered: { type: Number, default: 0 },
    lastTriggeredAt: { type: Date },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

keywordSchema.index({ workspace: 1, keyword: 1 });

module.exports = mongoose.model('Keyword', keywordSchema);
