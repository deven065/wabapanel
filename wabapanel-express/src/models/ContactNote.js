const mongoose = require('mongoose');

const contactNoteSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  text: { type: String, required: true },
  remindAt: { type: Date },
  reminderSent: { type: Boolean, default: false },
  notifyCustomer: { type: Boolean, default: true },
  contacted: { type: Boolean, default: false },
  contactedRemark: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ContactNote', contactNoteSchema);
