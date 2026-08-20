const mongoose = require('mongoose');

const aiKnowledgeDocSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  filename: { type: String, required: true },
  url: { type: String, default: '' },
  key: { type: String, default: '' },
  mimetype: { type: String, default: '' },
  size: { type: Number, default: 0 },
  extractedText: { type: String, default: '' },
  chars: { type: Number, default: 0 },
  status: { type: String, enum: ['ready', 'no_text', 'error'], default: 'ready' },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AIKnowledgeDoc', aiKnowledgeDocSchema);
