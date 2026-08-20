const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#3B82F6' },
  contactCount: { type: Number, default: 0 },
}, { timestamps: true });

tagSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', tagSchema);
