const mongoose = require('mongoose');

const callSessionSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  callId: { type: String, index: true },
  to: { type: String },
  from: { type: String },
  direction: { type: String, enum: ['BUSINESS_INITIATED', 'USER_INITIATED'], default: 'BUSINESS_INITIATED' },
  // initiating -> connecting -> ringing -> accepted -> completed | failed | rejected | terminated
  status: { type: String, default: 'initiating' },
  offerSdp: { type: String, default: '' },
  answerSdp: { type: String, default: '' },
  answerDelivered: { type: Boolean, default: false },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'AICallingAgent' },
  errorMessage: { type: String, default: '' },
  duration: { type: Number, default: 0 },
  recordingUrl: { type: String, default: '' },
  disposition: { type: String, default: '' },
  note: { type: String, default: '' },
  followUpAt: { type: Date },
  startTime: { type: Date },
  endTime: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('CallSession', callSessionSchema);
