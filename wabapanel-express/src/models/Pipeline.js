const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  value: { type: Number, default: 0 },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  contactName: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stage: { type: String, required: true },
  notes: { type: String, default: '' },
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  closedAt: { type: Date },
  status: { type: String, enum: ['open', 'won', 'lost'], default: 'open' },
}, { timestamps: true });

const pipelineSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  stages: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, default: '#3B82F6' },
    order: { type: Number, default: 0 },
  }],
  deals: [dealSchema],
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Pipeline', pipelineSchema);
