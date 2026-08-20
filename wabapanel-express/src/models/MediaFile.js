const mongoose = require("mongoose");

const mediaFileSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  name: { type: String, required: true, trim: true },
  originalName: { type: String, default: "" },
  url: { type: String, required: true },
  type: { type: String, enum: ["image", "video", "document", "audio"], default: "image" },
  mimeType: { type: String, default: "" },
  size: { type: Number, default: 0 },
  folder: { type: String, default: "general" },
  tags: [{ type: String }],
  usageCount: { type: Number, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

mediaFileSchema.index({ workspace: 1, type: 1 });

module.exports = mongoose.model("MediaFile", mediaFileSchema);
