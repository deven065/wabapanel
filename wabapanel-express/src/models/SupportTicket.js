const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  category: { type: String, enum: ['billing', 'technical', 'feature_request', 'account', 'other'], default: 'other' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'awaiting_reply', 'answered', 'closed'], default: 'open' },
  messages: [{
    sender: { type: String, enum: ['user', 'admin'], required: true },
    senderName: { type: String, default: '' },
    text: { type: String, required: true },
    attachments: [{ name: String, url: String }],
    at: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

supportTicketSchema.pre('save', function () {
  if (!this.ticketNumber) {
    this.ticketNumber = 'TKT-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 100);
  }
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
