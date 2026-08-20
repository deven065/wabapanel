const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');

const getDrips = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { workspace: req.workspace._id, type: 'drip' };
    if (status) query.status = status;

    const total = await Campaign.countDocuments(query);
    const drips = await Campaign.find(query)
      .populate('template', 'name category status')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, drips, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    })
      .populate('template')
      .populate('createdBy', 'name email');

    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createDrip = async (req, res) => {
  try {
    const drip = await Campaign.create({
      ...req.body,
      type: 'drip',
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: drip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, type: 'drip' },
      req.body,
      { new: true, runValidators: true }
    );
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    });
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, message: 'Drip campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const startDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    }).populate('template');

    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }

    if (!req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }

    if (!drip.dripSteps || drip.dripSteps.length === 0) {
      return res.status(400).json({ success: false, message: 'No drip steps configured' });
    }

    let contacts;
    if (drip.targetType === 'all') {
      contacts = await Contact.find({ workspace: req.workspace._id, status: 'active' });
    } else if (drip.targetType === 'segment') {
      contacts = await Contact.find({ workspace: req.workspace._id, segments: { $in: drip.targetSegments }, status: 'active' });
    } else if (drip.targetType === 'tag') {
      contacts = await Contact.find({ workspace: req.workspace._id, tags: { $in: drip.targetTags }, status: 'active' });
    } else {
      contacts = await Contact.find({ _id: { $in: drip.targetContacts }, status: 'active' });
    }

    drip.status = 'running';
    drip.startedAt = new Date();
    drip.stats.totalRecipients = contacts.length;
    await drip.save();

    res.json({ success: true, data: drip, message: 'Drip campaign started' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const pauseDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, type: 'drip' },
      { status: 'paused' },
      { new: true }
    );
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip, message: 'Drip campaign paused' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDrips, getDrip, createDrip, updateDrip, deleteDrip, startDrip, pauseDrip };
