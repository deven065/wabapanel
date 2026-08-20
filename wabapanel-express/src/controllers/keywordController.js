const Keyword = require('../models/Keyword');

const getKeywords = async (req, res) => {
  try {
    const keywords = await Keyword.find({ workspace: req.workspace._id })
      .populate('responseTemplate', 'name category')
      .populate('automation', 'name')
      .sort('-createdAt');
    res.json({ success: true, data: keywords });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('responseTemplate')
      .populate('automation');

    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });
    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, message: 'Keyword deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getKeywords, getKeyword, createKeyword, updateKeyword, deleteKeyword };
