const AuditLog = require("../models/AuditLog");

async function logAction(workspaceId, userId, action, resource, resourceId, details, ip) {
  try {
    await AuditLog.create({ workspace: workspaceId, user: userId, action, resource, resourceId: resourceId || "", details: details || "", ip: ip || "" });
  } catch (e) { console.error("[Audit]", e.message); }
}

module.exports = { logAction };
