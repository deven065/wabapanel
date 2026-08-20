const ResponseResource = require("../models/ResponseResource");

exports.getAll = async (req, res) => {
  try {
    const filter = { workspace: req.workspace._id };
    if (req.query.category) filter.category = req.query.category;
    const resources = await ResponseResource.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: resources });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const resource = await ResponseResource.create({ ...req.body, workspace: req.workspace._id, createdBy: req.user._id });
    res.status(201).json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.use = async (req, res) => {
  try {
    const resource = await ResponseResource.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, { $inc: { usageCount: 1 } }, { new: true });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const resource = await ResponseResource.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const resource = await ResponseResource.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, message: "Resource deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
