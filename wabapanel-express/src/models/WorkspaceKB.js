const mongoose = require("mongoose");
const wkbSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, default: "" },
  category: { type: String, default: "general" },
  status: { type: String, enum: ["active", "archived"], default: "active" },
}, { timestamps: true });
wkbSchema.index({ workspace: 1, status: 1 });
module.exports = mongoose.model("WorkspaceKB", wkbSchema);
