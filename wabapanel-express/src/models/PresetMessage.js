const mongoose = require('mongoose');

const presetMessageSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true, trim: true },
  body: { type: String, default: '' },
  carouselTemplate: { type: String, default: '' },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  cards: [{
    mediaUrl: { type: String, default: '' },
    body: { type: String, default: '' },
    buttons: [{ text: { type: String, default: '' } }],
  }],
  mediaUrl: { type: String, default: '' },
  headerType: { type: String, enum: ['none', 'text', 'image', 'video', 'document'], default: 'none' },
  headerText: { type: String, default: '' },
  footer: { type: String, default: '' },
  listButtonText: { type: String, default: '' },
  listItems: [{
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    value: { type: String, default: '' },
  }],
  buttons: [{
    text: { type: String, default: '' },
    type: { type: String, enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'], default: 'QUICK_REPLY' },
    url: { type: String, default: '' },
    phone: { type: String, default: '' },
    value: { type: String, default: '' },
  }],
}, { timestamps: true });

module.exports = mongoose.model('PresetMessage', presetMessageSchema);
