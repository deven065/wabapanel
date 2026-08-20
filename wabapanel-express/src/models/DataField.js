const mongoose = require("mongoose");

const dataFieldSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  name: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ["text", "number", "date", "dropdown", "checkbox", "url", "email", "phone"], default: "text" },
  options: [{ type: String }],
  required: { type: Boolean, default: false },
  defaultValue: { type: String, default: "" },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

dataFieldSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("DataField", dataFieldSchema);
