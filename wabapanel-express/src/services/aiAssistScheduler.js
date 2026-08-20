const cron = require('node-cron');
const AIAssistSchedule = require('../models/AIAssistSchedule');
const Workspace = require('../models/Workspace');
const { buildPlan, applyPlan } = require('./aiAssistService');

let io = null;
let running = false;

async function processDue() {
  if (running) return; // avoid overlap on long AI runs
  running = true;
  try {
    const now = new Date();
    const due = await AIAssistSchedule.find({ active: true, nextRunAt: { $ne: null, $lte: now } }).limit(20);
    for (const sch of due) {
      try {
        const ws = await Workspace.findById(sch.workspace);
        if (!ws) { sch.active = false; await sch.save(); continue; }
        const plan = await buildPlan(ws, { instruction: sch.instruction, contactIds: null });
        const summary = await applyPlan(ws, {
          instruction: sch.instruction, plan, allowSend: sch.allowSend,
          userId: sch.createdBy, io, source: 'schedule', scheduleId: sch._id,
        });
        sch.lastRunAt = now;
        sch.lastSummary = { leads: summary.leads, changed: summary.changed, sent: summary.sent };
      } catch (e) {
        console.error('[AIAssistScheduler] run failed for', String(sch._id), e.message);
      }
      sch.nextRunAt = sch.computeNextRun(new Date());
      await sch.save();
    }
  } catch (e) {
    console.error('[AIAssistScheduler]', e.message);
  } finally {
    running = false;
  }
}

function start(_io) {
  io = _io || global._io || null;
  cron.schedule('* * * * *', () => processDue());
  console.log('AI Assist scheduler started');
}

module.exports = { start, processDue };
