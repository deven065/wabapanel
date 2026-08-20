const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true }, // trigger, message, delay, condition, action, api_call, ai_response, location, list_message, button_message, media, template, assign_agent, tag, segment
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  sourceHandle: { type: String, default: '' },
  targetHandle: { type: String, default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'smoothstep' },
}, { _id: false });

const automationSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  triggerType: { type: String, enum: ['keyword', 'event', 'webhook', 'schedule', 'contact_created', 'message_received', 'manual'], default: 'keyword' },
  triggerConfig: {
    keywords: [{ type: String }],
    matchType: { type: String, enum: ['exact', 'contains', 'starts_with', 'regex'], default: 'contains' },
    event: { type: String, default: '' },
    schedule: { type: String, default: '' },
  },
  nodes: [nodeSchema],
  edges: [edgeSchema],
  status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'draft' },
  stats: {
    triggered: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Automation', automationSchema);
