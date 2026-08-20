const Badge = require("../models/Badge");
const Contact = require("../models/Contact");

exports.getAll = async (req, res) => {
  try {
    const badges = await Badge.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }).lean();
    await Promise.all(badges.map(async (b) => {
      b.contactCount = await Contact.countDocuments({ workspace: req.workspace._id, badges: b._id });
    }));
    res.json({ success: true, data: badges });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const badge = await Badge.create({ ...req.body, workspace: req.workspace._id, createdBy: req.user._id });
    res.status(201).json({ success: true, data: badge });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const badge = await Badge.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });
    res.json({ success: true, data: badge });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const badge = await Badge.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });
    res.json({ success: true, message: "Badge deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Evaluate a badge auto-assign criteria and assign it to matching contacts
exports.run = async (req, res) => {
  try {
    const badge = await Badge.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });
    const wsId = req.workspace._id;
    const type = badge.criteria && badge.criteria.type;
    const value = Number((badge.criteria && badge.criteria.value) || 0);
    let contactIds = [];
    if (type === "days_active") {
      const cutoff = new Date(Date.now() - value * 86400000);
      const rows = await Contact.find({ workspace: wsId, createdAt: { $lte: cutoff } }).select("_id");
      contactIds = rows.map((c) => c._id);
    } else if (type === "messages_count") {
      const Message = require("../models/Message");
      const agg = await Message.aggregate([
        { $match: { workspace: wsId } },
        { $group: { _id: "$contact", n: { $sum: 1 } } },
        { $match: { n: { $gte: value } } },
      ]);
      contactIds = agg.map((r) => r._id).filter(Boolean);
    } else if (type === "purchase_amount") {
      const Order = require("../models/Order");
      const agg = await Order.aggregate([
        { $match: { workspace: wsId, contact: { $ne: null } } },
        { $group: { _id: "$contact", total: { $sum: "$totalAmount" } } },
        { $match: { total: { $gte: value } } },
      ]);
      contactIds = agg.map((r) => r._id).filter(Boolean);
    } else {
      return res.status(400).json({ success: false, message: "This badge is manual — set an auto-assign criteria (messages/purchase/days) first." });
    }
    if (contactIds.length) {
      await Contact.updateMany({ workspace: wsId, _id: { $in: contactIds } }, { $addToSet: { badges: badge._id } });
    }
    const contactCount = await Contact.countDocuments({ workspace: wsId, badges: badge._id });
    await Badge.updateOne({ _id: badge._id }, { contactCount });
    res.json({ success: true, assigned: contactIds.length, contactCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
