const DataField = require("../models/DataField");

exports.getAll = async (req, res) => {
  try {
    const fields = await DataField.find({ workspace: req.workspace._id }).sort({ order: 1 });
    res.json({ success: true, data: fields });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, label, type, options, required, defaultValue } = req.body;
    const count = await DataField.countDocuments({ workspace: req.workspace._id });
    const field = await DataField.create({
      workspace: req.workspace._id,
      name: name || label.toLowerCase().replace(/\s+/g, "_"),
      label,
      type: type || "text",
      options: options || [],
      required: required || false,
      defaultValue: defaultValue || "",
      order: count,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: field });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "Field name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const field = await DataField.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!field) return res.status(404).json({ success: false, message: "Field not found" });
    res.json({ success: true, data: field });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const field = await DataField.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!field) return res.status(404).json({ success: false, message: "Field not found" });
    res.json({ success: true, message: "Field deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
