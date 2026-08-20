const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  waNumberId: { type: String, default: '' },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  winbackAt: { type: Date },
  winbackStep: { type: Number, default: 0 },
  winbackAiCount: { type: Number, default: 0 },
  sentiment: { type: String, enum: ['', 'positive', 'neutral', 'negative'], default: '' },
  aiSummary: { type: String, default: '' },
  aiSummaryAt: { type: Date },
  assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  status: { type: String, enum: ['active', 'closed', 'pending', 'snoozed'], default: 'active' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  labels: [{ type: String }],
  lastMessage: {
    text: { type: String, default: '' },
    timestamp: { type: Date },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
    type: { type: String, default: 'text' },
  },
  unreadCount: { type: Number, default: 0 },
  pinnedAt: { type: Date },
  unansweredAlertAt: { type: Date },
  isResolved: { type: Boolean, default: false },
  lastSubject: { type: String, default: '' },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  windowExpiresAt: { type: Date }, // 24-hour window
  channel: { type: String, enum: ['whatsapp', 'whatsapp_qr', 'facebook', 'instagram', 'telegram', 'telegram_personal', 'email'], default: 'whatsapp' },
  snoozedUntil: { type: Date },
  aiEnabled: { type: Boolean, default: false },
  aiDisabled: { type: Boolean, default: false },
  aiCallEnabled: { type: Boolean, default: false },
  // Bot Flow question card: the flow pauses here until the contact's next free-text reply
  botFlowWait: {
    flowId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    expiresAt: { type: Date },
  },
  // Durable timed continuation of a flow (delay in minutes/hours/days); a scheduler resumes at runAt
  botFlowResume: {
    flowId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    runAt: { type: Date },
  },
}, { timestamps: true });

conversationSchema.index({ 'botFlowResume.runAt': 1 });
conversationSchema.index({ 'botFlowWait.expiresAt': 1 });

conversationSchema.index({ workspace: 1, contact: 1, channel: 1 }, { unique: true });
conversationSchema.index({ workspace: 1, status: 1 });
conversationSchema.index({ workspace: 1, assignedAgent: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
