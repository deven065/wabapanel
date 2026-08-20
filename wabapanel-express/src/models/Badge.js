const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  color: { type: String, default: "#10b981" },
  icon: { type: String, default: "award" },
  autoAssign: { type: Boolean, default: false },
  criteria: {
    type: { type: String, enum: ["manual", "messages_count", "purchase_amount", "days_active"], default: "manual" },
    value: { type: Number, default: 0 },
  },
  contactCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Badge", badgeSchema);
