const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  fields: [{
    id: { type: String, required: true },
    type: { type: String, enum: ['text', 'number', 'email', 'phone', 'select', 'multi_select', 'date', 'textarea', 'file', 'checkbox', 'radio'], required: true },
    label: { type: String, required: true },
    placeholder: { type: String, default: '' },
    required: { type: Boolean, default: false },
    options: [{ type: String }],
    validation: { type: mongoose.Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
  }],
  submissions: [{
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    submittedAt: { type: Date, default: Date.now },
  }],
  autoCreateContact: { type: Boolean, default: true },
  autoAssignTag: { type: mongoose.Schema.Types.ObjectId, ref: 'Tag' },
  autoTriggerAutomation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  submissionCount: { type: Number, default: 0 },
  waFlow: {
    flowId: { type: String, default: '' },
    status: { type: String, enum: ['none', 'published', 'failed'], default: 'none' },
    error: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('Form', formSchema);
