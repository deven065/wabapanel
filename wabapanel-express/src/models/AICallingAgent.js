const mongoose = require('mongoose');

const aiCallingAgentSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  voiceProvider: { type: String, enum: ['elevenlabs', 'google', 'azure', 'openai', 'sarvam', 'cartesia', 'groq_sarvam', 'custom'], default: 'openai' },
  voiceId: { type: String, default: '' },
  voiceConfig: {
    language: { type: String, default: 'en' },
    speed: { type: Number, default: 1.0 },
    pitch: { type: Number, default: 1.0 },
    stability: { type: Number, default: 0.5 },
    apiKey: { type: String, default: '' },
  },
  aiModel: { type: String, default: 'gpt-4o' },
  voiceApiKey: { type: String, default: "" },
  groqApiKey: { type: String, default: "" },
  systemPrompt: { type: String, default: '' },
  greeting: { type: String, default: 'Hello! How can I help you today?' },
  maxDuration: { type: Number, default: 300 },
  phoneNumber: { type: String, default: '' },
  webhookUrl: { type: String, default: '' },
  transferNumber: { type: String, default: '' },
  catalogUrl: { type: String, default: '' },
  followUpMessage: { type: String, default: '' },
  // Send the customer an AI-written WhatsApp summary after each call.
  callSummaryEnabled: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  isDefault: { type: Boolean, default: false },
  stats: {
    totalCalls: { type: Number, default: 0 },
    avgDuration: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
  },
  callLogs: [{
    contactPhone: { type: String },
    duration: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'missed', 'failed', 'transferred'], default: 'completed' },
    summary: { type: String, default: '' },
    recording: { type: String, default: '' },
    calledAt: { type: Date, default: Date.now },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('AICallingAgent', aiCallingAgentSchema);
