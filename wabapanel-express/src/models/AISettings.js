const mongoose = require('mongoose');

const aiSettingsSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  provider: { type: String, enum: ['openai', 'deepseek', 'xai', 'gemini', 'anthropic', 'azure'], default: 'openai' },
  apiKey: { type: String, default: '' },
  model: { type: String, default: 'gpt-4o' },
  // Azure OpenAI (used when provider === 'azure')
  azureEndpoint: { type: String, default: '' },        // e.g. https://your-resource.openai.azure.com
  azureDeployment: { type: String, default: '' },      // deployment name created in Azure
  azureApiVersion: { type: String, default: '2024-02-15-preview' },
  // Azure realtime voice (used for AI Calling). The realtime model usually lives
  // in its own Azure resource, so it has its own endpoint/key (falls back to the
  // chat endpoint/key when left blank).
  azureRealtimeEndpoint: { type: String, default: '' },
  azureRealtimeKey: { type: String, default: '' },
  azureRealtimeDeployment: { type: String, default: '' },
  azureRealtimeApiVersion: { type: String, default: '2024-10-01-preview' },
  systemPrompt: { type: String, default: 'You are a helpful WhatsApp business assistant. Be concise, friendly, and helpful.' },
  knowledgeBase: { type: String, default: '' },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 500 },
  language: { type: String, default: 'auto' },
  tone: { type: String, enum: ['professional', 'friendly', 'formal', 'casual'], default: 'friendly' },
  features: {
    voiceToText: { type: Boolean, default: false },
    voiceReplyVoice: { type: String, enum: ['openai', 'calling_agent'], default: 'openai' },
    leadScoring: { type: Boolean, default: false },
    autoSummary: { type: Boolean, default: false },
    sentiment: { type: Boolean, default: false },
    autoTranslate: { type: Boolean, default: false },
    autoTicket: { type: Boolean, default: false },
    ticketKeywords: { type: [String], default: ['complaint', 'refund', 'problem', 'issue', 'not working'] },
  },
  targetingRules: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    // Channels the AI auto-reply is active on. Empty array = all channels.
    channels: { type: [String], default: [] },
    targets: [{
      type: { type: String, enum: ['all', 'new_leads', 'unassigned', 'no_response', 'specific_tags', 'specific_segments', 'off_hours'] },
      value: { type: String, default: '' },
    }],
    excludeTags: [{ type: String }],
    excludeAssigned: { type: Boolean, default: false },
    excludeActiveConversation: { type: Boolean, default: true },
  },
  callRecording: {
    enabled: { type: Boolean, default: true },
    autoDeleteDays: { type: Number, default: 0 }, // 0 = never delete
  },
  callTargeting: {
    mode: { type: String, enum: ['manual', 'all', 'tags', 'saved'], default: 'manual' },
    tags: [{ type: String }],
    excludeTags: [{ type: String }],
  },
  handoffRules: {
    keywords: { type: [String], default: ['agent', 'human', 'person', 'operator', 'help', 'complaint', 'refund'] },
    maxUnknownReplies: { type: Number, default: 3 },
    detectFrustration: { type: Boolean, default: true },
    autoHandoffMessage: { type: String, default: 'I\'m connecting you with a human agent. Please hold on.' },
  },
  workingHours: {
    enabled: { type: Boolean, default: false },
    onlyOffHours: { type: Boolean, default: false },
    timezone: { type: String, default: 'Asia/Kolkata' },
  },
  stats: {
    totalReplies: { type: Number, default: 0 },
    totalHandoffs: { type: Number, default: 0 },
    totalTokensUsed: { type: Number, default: 0 },
    lastActiveAt: { type: Date },
  },
}, { timestamps: true });

module.exports = mongoose.model('AISettings', aiSettingsSchema);
