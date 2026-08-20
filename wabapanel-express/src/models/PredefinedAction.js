const mongoose = require("mongoose");

const predefinedActionSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  trigger: { type: String, enum: ["on_message", "on_subscribe", "on_order", "on_payment", "manual"], default: "manual" },
  actions: [{
    type: { type: String, enum: ["send_message", "add_tag", "remove_tag", "assign_agent", "add_to_segment", "send_template"], default: "send_message" },
    value: { type: String, default: "" },
    delay: { type: Number, default: 0 },
  }],
  isActive: { type: Boolean, default: true },
  executionCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("PredefinedAction", predefinedActionSchema);
