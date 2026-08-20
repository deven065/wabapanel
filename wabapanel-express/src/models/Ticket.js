const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  subject: { type: String, default: '' },
  keyword: { type: String, default: '' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  source: { type: String, default: 'auto' },
  closedAt: { type: Date },
}, { timestamps: true });

ticketSchema.pre('save', function () {
  this.$locals.wasNew = this.isNew;
});

ticketSchema.post('save', function (doc) {
  if (!doc.$locals?.wasNew) return;
  setImmediate(() => require('../services/ownerNotify').ticketCreated(doc).catch(() => {}));
});

module.exports = mongoose.model('Ticket', ticketSchema);
