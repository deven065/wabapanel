const mongoose = require("mongoose");
const auditLogSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  resource: { type: String, default: "" },
  resourceId: { type: String, default: "" },
  details: { type: String, default: "" },
  ip: { type: String, default: "" },
}, { timestamps: true });
auditLogSchema.index({ workspace: 1, createdAt: -1 });
module.exports = mongoose.model("AuditLog", auditLogSchema);
