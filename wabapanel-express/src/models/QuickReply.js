const mongoose = require('mongoose');

const quickReplySchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  title: { type: String, required: true, trim: true },
  message: { type: String, default: '' },
  stickerUrl: { type: String, default: '' },
  shortcut: { type: String, default: '' },
  isGlobal: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('QuickReply', quickReplySchema);
