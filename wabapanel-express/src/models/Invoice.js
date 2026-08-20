const mongoose = require("mongoose");
const invoiceSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
  invoiceNumber: { type: String, required: true },
  items: [{ name: String, quantity: { type: Number, default: 1 }, price: { type: Number, default: 0 } }],
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "pending", "paid", "cancelled"], default: "pending" },
  dueDate: Date,
  notes: { type: String, default: "" },
}, { timestamps: true });
invoiceSchema.index({ workspace: 1, createdAt: -1 });
module.exports = mongoose.model("Invoice", invoiceSchema);
