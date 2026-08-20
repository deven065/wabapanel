const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#8B5CF6' },
  order: { type: Number, default: 0 },
}, { timestamps: true });

stageSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Stage', stageSchema);
