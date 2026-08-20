const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  rating: { type: Number, min: 1, max: 5, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
