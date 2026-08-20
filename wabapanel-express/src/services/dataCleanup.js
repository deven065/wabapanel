const cron = require('node-cron');

const CATEGORY_MODELS = {
  messages: { model: 'Message', label: 'Messages' },
  callSessions: { model: 'CallSession', label: 'Call Sessions' },
  auditLogs: { model: 'AuditLog', label: 'Audit Logs' },
  scheduledCalls: { model: 'ScheduledCall', label: 'Scheduled Calls' },
  facebookLeads: { model: 'FacebookLead', label: 'Facebook Leads' },
  media: { model: 'MediaFile', label: 'Media Files (images/videos/docs)' },
};

// Deletes old records per the admin's dataCleanup settings. Returns a summary string.
async function runCleanup(options = {}) {
  const { workspaceId, force } = options;
  const mongoose = require('mongoose');
  const SystemSettings = require('../models/SystemSettings');
  const settings = await SystemSettings.findOne();
  const cfg = settings?.dataCleanup;
  if (!cfg || (!cfg.enabled && !force)) return 'Cleanup disabled';

  const parts = [];
  for (const [key, def] of Object.entries(CATEGORY_MODELS)) {
    const cat = cfg.categories?.[key];
    if (!cat || !cat.enabled) continue;
    const days = Math.max(1, Number(cat.days) || 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = { createdAt: { $lt: cutoff } };
    if (workspaceId) filter.workspace = workspaceId;
    try {
      require(`../models/${def.model}`);
      const Model = mongoose.model(def.model);
      if (key === 'media') {
        const fs = require('fs');
        const path = require('path');
        const files = await Model.find(filter).select('url').lean();
        for (const f of files) {
          try {
            const fp = path.join(__dirname, '../../uploads', path.basename(f.url || ''));
            if (f.url && fs.existsSync(fp)) fs.unlinkSync(fp);
          } catch { /* file already gone */ }
        }
        const result = await Model.deleteMany({ _id: { $in: files.map((f) => f._id) } });
        parts.push(`${def.label}: ${result.deletedCount} deleted (>${days}d)`);
      } else {
        const result = await Model.deleteMany(filter);
        parts.push(`${def.label}: ${result.deletedCount} deleted (>${days}d)`);
      }
    } catch (e) {
      parts.push(`${def.label}: error - ${e.message}`);
    }
  }

  let summary = parts.length ? parts.join('; ') : 'No categories enabled';
  if (workspaceId) summary = `[client ${workspaceId}] ${summary}`;
  settings.dataCleanup.lastRun = new Date();
  settings.dataCleanup.lastRunSummary = summary;
  await settings.save();
  console.log('[DataCleanup]', summary);
  return summary;
}

// Runs cleanup once a day at the configured hour.
function start() {
  cron.schedule('0 * * * *', async () => {
    try {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const cfg = settings?.dataCleanup;
      if (!cfg || !cfg.enabled) return;
      const runHour = Number.isInteger(cfg.runHour) ? cfg.runHour : 3;
      if (new Date().getHours() !== runHour) return;
      await runCleanup();
    } catch (e) { console.error('[DataCleanup] cron error:', e.message); }
  });
}

module.exports = { start, runCleanup, CATEGORY_MODELS };
