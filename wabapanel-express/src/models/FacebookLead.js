const mongoose = require('mongoose');

const facebookLeadSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  leadId: { type: String, required: true, index: true },
  formId: { type: String, default: '' },
  formName: { type: String, default: '' },
  pageId: { type: String, default: '' },
  pageName: { type: String, default: '' },
  adId: { type: String, default: '' },
  adName: { type: String, default: '' },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  fieldData: { type: mongoose.Schema.Types.Mixed, default: {} },
  rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['new', 'contacted', 'qualified', 'converted', 'lost'], default: 'new' },
  syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

facebookLeadSchema.index({ workspace: 1, leadId: 1 }, { unique: true });

module.exports = mongoose.model('FacebookLead', facebookLeadSchema);
