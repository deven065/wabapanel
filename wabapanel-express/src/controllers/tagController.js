const Tag = require('../models/Tag');
const { checkPlanLimit } = require('../utils/planLimits');

const getTags = async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const tags = await Tag.find({ workspace: req.workspace._id }).sort('name').lean();
    const counts = await Contact.aggregate([
      { $match: { workspace: req.workspace._id } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const data = tags.map((t) => ({ ...t, contactCount: countMap.get(String(t._id)) || 0 }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createTag = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'tags', 'Tag');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const tag = await Tag.create({ ...req.body, workspace: req.workspace._id });
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Tag already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateTag = async (req, res) => {
  try {
    const tag = await Tag.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!tag) return res.status(404).json({ success: false, message: 'Tag not found' });
    res.json({ success: true, data: tag });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTag = async (req, res) => {
  try {
    await Tag.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getTags, createTag, updateTag, deleteTag };
