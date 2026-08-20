const mongoose = require('mongoose');

const autoAssignRuleSchema = new mongoose.Schema({
  keyword: { type: String, required: true, trim: true },
  matchType: { type: String, enum: ['exact', 'contains', 'starts_with'], default: 'contains' },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tag: { type: String, default: '' },
}, { _id: false });

const winbackStepSchema = new mongoose.Schema({
  delayValue: { type: Number, default: 1 },
  delayUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'hours' },
  message: { type: String, default: '' },
}, { _id: false });

const automationSettingsSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  welcome: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    stickerUrl: { type: String, default: '' },
  },
  outOfOffice: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    stickerUrl: { type: String, default: '' },
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '18:00' },
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // working days, 0=Sunday
  },
  feedback: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    stickerUrl: { type: String, default: '' },
  },
  winback: {
    enabled: { type: Boolean, default: false },
    days: { type: Number, default: 15 },
    amount: { type: Number, default: 15 },
    unit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'days' },
    templateName: { type: String, default: '' },
    templateLanguage: { type: String, default: 'en' },
    presetName: { type: String, default: '' },
    customMessage: { type: String, default: '' },
    sendHour: { type: Number, default: 11 },
    steps: { type: [winbackStepSchema], default: [] }, // multi-step manual follow-ups (max 5)
    aiEnabled: { type: Boolean, default: false },
    aiPrompt: { type: String, default: '' },
    aiMaxFollowups: { type: Number, default: 3 },
    aiGapValue: { type: Number, default: 1 },
    aiGapUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'days' },
    sendWindowMode: { type: String, enum: ['24x7', 'window'], default: '24x7' },
    sendStart: { type: String, default: '09:00' },
    sendEnd: { type: String, default: '18:00' },
  },
  missedCall: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    stickerUrl: { type: String, default: '' },
  },
  wishes: {
    birthdayEnabled: { type: Boolean, default: false },
    birthdayMessage: { type: String, default: '' },
    birthdayStickerUrl: { type: String, default: '' },
    anniversaryEnabled: { type: Boolean, default: false },
    anniversaryMessage: { type: String, default: '' },
    anniversaryStickerUrl: { type: String, default: '' },
  },
  roundRobin: {
    enabled: { type: Boolean, default: false },
    excludeAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  cartRecovery: {
    enabled: { type: Boolean, default: false },
    hours: { type: Number, default: 2 },
    message: { type: String, default: '' },
    stickerUrl: { type: String, default: '' },
  },
  ownerAlerts: {
    enabled: { type: Boolean, default: false },
    phone: { type: String, default: '' },
    onHumanRequest: { type: Boolean, default: true },
    onAppointment: { type: Boolean, default: true },
    onReminder: { type: Boolean, default: true },
    onOrder: { type: Boolean, default: true },
    bigOrderAmount: { type: Number, default: 0 },
    onPayment: { type: Boolean, default: true },
    onHotLead: { type: Boolean, default: true },
    onComplaint: { type: Boolean, default: true },
    onTicket: { type: Boolean, default: true },
    onMissedCall: { type: Boolean, default: true },
    onDisconnect: { type: Boolean, default: true },
    onUnanswered: { type: Boolean, default: false },
    unansweredMins: { type: Number, default: 15 },
    onNoReply: { type: Boolean, default: true },
    noReplyHours: { type: Number, default: 24 },
    onApptChange: { type: Boolean, default: true },
    onCallSummary: { type: Boolean, default: true },
    onBadRating: { type: Boolean, default: true },
    onRepeatCustomer: { type: Boolean, default: false },
    onBroadcastDone: { type: Boolean, default: true },
    onMsgFail: { type: Boolean, default: true },
    onLeadSource: { type: Boolean, default: false },
    onLowStock: { type: Boolean, default: true },
    onAgentLogin: { type: Boolean, default: false },
    weeklyReport: { type: Boolean, default: false },
    weeklyLastSent: { type: String, default: '' },
    salesTarget: { type: Number, default: 0 },
    salesTargetNotifiedMonth: { type: String, default: '' },
    waCommands: { type: Boolean, default: false },
    lastHumanReqPhone: { type: String, default: '' },
    onCartAbandon: { type: Boolean, default: false },
    onLeadStage: { type: Boolean, default: false },
    highValueAmount: { type: Number, default: 0 },
    onTagChange: { type: Boolean, default: false },
    onTemplateReject: { type: Boolean, default: false },
    onDailyUnread: { type: Boolean, default: false },
    alertKeywords: { type: String, default: '' },
    onNoAppts: { type: Boolean, default: false },
    onFirstMsg: { type: Boolean, default: false },
    onHourlyPulse: { type: Boolean, default: false },
    onNewDevice: { type: Boolean, default: false },
    onBulkDelete: { type: Boolean, default: false },
    onSentimentScore: { type: Boolean, default: false },
    onAiSuggestion: { type: Boolean, default: false },
    onAiCallFailed: { type: Boolean, default: false },
    onAgentIdle: { type: Boolean, default: false },
    agentIdleMins: { type: Number, default: 30 },
    onChatReassign: { type: Boolean, default: false },
    onAgentOffline: { type: Boolean, default: false },
    agentOfflineHours: { type: Number, default: 4 },
    onAfterHours: { type: Boolean, default: false },
    monthlyReport: { type: Boolean, default: false },
    monthlyLastSent: { type: String, default: '' },
    onSlaBreach: { type: Boolean, default: false },
    slaHours: { type: Number, default: 24 },
    onRevenueMilestone: { type: Boolean, default: false },
    revenueMilestone: { type: Number, default: 0 },
    revenueMilestoneDate: { type: String, default: '' },
    onRevenueDrop: { type: Boolean, default: false },
    onOrderCancelled: { type: Boolean, default: true },
    firstMsgSentDate: { type: String, default: '' },
  },
  dailySummary: {
    enabled: { type: Boolean, default: false },
    hour: { type: Number, default: 9 },
    phone: { type: String, default: '' },
    lastSentDate: { type: String, default: '' },
  },
  autoAssignRules: [{ mode: { type: String, enum: ['round_robin', 'manual', 'load_balance'], default: 'manual' }, enabled: { type: Boolean, default: false }, teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }] }],
  icebreakers: { type: [String], default: [] }, // max 4
  optOut: {
    enabled: { type: Boolean, default: true },
    sendConfirmation: { type: Boolean, default: true },
    stopKeywords: { type: [String], default: [] },  // empty => built-in defaults
    startKeywords: { type: [String], default: [] }, // empty => built-in defaults
    stopReply: { type: String, default: '' },       // empty => built-in default
    startReply: { type: String, default: '' },      // empty => built-in default
    appendToBroadcasts: { type: Boolean, default: true }, // add opt-out line to free-text campaigns
    broadcastFooter: { type: String, default: '' },       // empty => built-in default line
  },
}, { timestamps: true });

module.exports = mongoose.model('AutomationSettings', automationSettingsSchema);
