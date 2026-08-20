const PredefinedAction = require("../models/PredefinedAction");

// Manually run an action against a contact (by phone or contactId)
exports.run = async (req, res) => {
  try {
    const Contact = require("../models/Contact");
    const Conversation = require("../models/Conversation");
    const actionRunner = require("../services/actionRunner");
    const { phone, contactId } = req.body || {};
    let contact = null;
    if (contactId) contact = await Contact.findOne({ _id: contactId, workspace: req.workspace._id });
    else if (phone) {
      const digits = String(phone).replace(/[^0-9]/g, "");
      contact = await Contact.findOne({ workspace: req.workspace._id, phone: { $regex: digits.slice(-10) + "$" } });
    }
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found for that phone number" });
    const conversation = await Conversation.findOne({ workspace: req.workspace._id, contact: contact._id, channel: "whatsapp" });
    const rule = await actionRunner.runPredefinedById(req.params.id, { workspace: req.workspace, contact, conversation, io: req.app.get("io") });
    res.json({ success: true, message: `\"${rule.name}\" executed for ${contact.name || contact.phone}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const actions = await PredefinedAction.find({ workspace: req.workspace._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: actions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const action = await PredefinedAction.create({ ...req.body, workspace: req.workspace._id, createdBy: req.user._id });
    res.status(201).json({ success: true, data: action });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const action = await PredefinedAction.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    if (!action) return res.status(404).json({ success: false, message: "Action not found" });
    res.json({ success: true, data: action });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const action = await PredefinedAction.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!action) return res.status(404).json({ success: false, message: "Action not found" });
    res.json({ success: true, message: "Action deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
