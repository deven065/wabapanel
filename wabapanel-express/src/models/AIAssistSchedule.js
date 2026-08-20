const mongoose = require('mongoose');

// A saved AI Assist prompt that runs automatically on a schedule.
const aiAssistScheduleSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, default: '' },
  instruction: { type: String, required: true },
  allowSend: { type: Boolean, default: false },
  // scope of leads the prompt runs on
  scope: { type: String, enum: ['recent', 'all'], default: 'recent' },
  // 'interval' => run every intervalMinutes; 'daily' => run once a day at dailyTime
  mode: { type: String, enum: ['interval', 'daily'], default: 'interval' },
  intervalMinutes: { type: Number, default: 1440 }, // 60=hourly, 1440=daily, 10080=weekly, 1=every minute
  dailyTime: { type: String, default: '09:00' }, // HH:mm (server local time)
  active: { type: Boolean, default: true },
  lastRunAt: { type: Date, default: null },
  nextRunAt: { type: Date, default: null, index: true },
  lastSummary: {
    leads: { type: Number, default: 0 },
    changed: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Compute the next fire time from now based on mode.
aiAssistScheduleSchema.methods.computeNextRun = function computeNextRun(from = new Date()) {
  if (this.mode === 'daily') {
    const [h, m] = String(this.dailyTime || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setHours(h, m, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  const mins = Math.max(1, this.intervalMinutes || 1440);
  return new Date(from.getTime() + mins * 60 * 1000);
};

module.exports = mongoose.model('AIAssistSchedule', aiAssistScheduleSchema);
