const QuickReply = require("../models/QuickReply");

exports.getAll = async (req, res) => {
  try {
    const replies = await QuickReply.find({
      $or: [
        { workspace: req.workspace._id, createdBy: req.user._id },
        { isGlobal: true },
      ],
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: replies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, message, stickerUrl, shortcut } = req.body;
    const reply = await QuickReply.create({
      title, message, stickerUrl, shortcut,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: reply });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { title, message, stickerUrl, shortcut } = req.body;
    const reply = await QuickReply.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, createdBy: req.user._id },
      { title, message, stickerUrl, shortcut },
      { new: true }
    );
    if (!reply) return res.status(404).json({ success: false, message: "Quick reply not found" });
    res.json({ success: true, data: reply });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const reply = await QuickReply.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id, createdBy: req.user._id });
    if (!reply) return res.status(404).json({ success: false, message: "Quick reply not found" });
    res.json({ success: true, message: "Quick reply deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
