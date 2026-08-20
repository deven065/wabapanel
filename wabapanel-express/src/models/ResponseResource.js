const mongoose = require("mongoose");

const responseResourceSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: ["greeting", "faq", "closing", "promotion", "support", "custom"], default: "custom" },
  content: { type: String, required: true },
  mediaUrl: { type: String, default: "" },
  mediaType: { type: String, enum: ["none", "image", "video", "document"], default: "none" },
  shortcut: { type: String, default: "" },
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("ResponseResource", responseResourceSchema);
