const Automation = require('../models/Automation');
const { sendPaginated } = require('../utils/apiResponse');

// @GET /api/automations
const getAutomations = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { workspace: req.workspace._id };
    if (status) query.status = status;

    const total = await Automation.countDocuments(query);
    const automations = await Automation.find(query)
      .select('-nodes -edges')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, automations, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/automations
const createAutomation = async (req, res) => {
  try {
    const automation = await Automation.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/automations/:id
const getAutomation = async (req, res) => {
  try {
    const automation = await Automation.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }

    res.json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/automations/:id
const updateAutomation = async (req, res) => {
  try {
    const automation = await Automation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );

    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }

    res.json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/automations/:id
const deleteAutomation = async (req, res) => {
  try {
    const automation = await Automation.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }

    res.json({ success: true, message: 'Automation deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/automations/:id/toggle
const toggleAutomation = async (req, res) => {
  try {
    const automation = await Automation.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }

    automation.status = automation.status === 'active' ? 'inactive' : 'active';
    await automation.save();

    res.json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const AutomationSettings = require('../models/AutomationSettings');

// @GET /api/automations/settings
const getAutomationSettings = async (req, res) => {
  try {
    let settings = await AutomationSettings.findOne({ workspace: req.workspace._id });
    if (!settings) settings = await AutomationSettings.create({ workspace: req.workspace._id });
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/automations/settings
const updateAutomationSettings = async (req, res) => {
  try {
    const allowed = {};
    for (const k of ['welcome', 'outOfOffice', 'feedback', 'autoAssignRules', 'icebreakers', 'wishes', 'missedCall', 'winback', 'cartRecovery', 'dailySummary', 'ownerAlerts', 'optOut']) {
      if (req.body[k] !== undefined) allowed[k] = req.body[k];
    }
    if (allowed.icebreakers) allowed.icebreakers = allowed.icebreakers.filter(Boolean).slice(0, 4);
    const settings = await AutomationSettings.findOneAndUpdate(
      { workspace: req.workspace._id },
      { $set: allowed },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/automations/settings/icebreakers/sync — push ice breakers to WhatsApp via Meta API
const syncIcebreakers = async (req, res) => {
  try {
    const axios = require('axios');
    const settings = await AutomationSettings.findOne({ workspace: req.workspace._id });
    const prompts = (settings && settings.icebreakers || []).filter(Boolean).slice(0, 4);
    const wa = req.workspace.whatsapp || {};
    if (!wa.accessToken || !wa.phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp is not connected' });
    }
    await axios.post(
      `https://graph.facebook.com/v18.0/${wa.phoneNumberId}/conversational_automation`,
      { prompts },
      { headers: { Authorization: `Bearer ${wa.accessToken}` } }
    );
    res.json({ success: true, message: 'Ice breakers synced to WhatsApp' });
  } catch (error) {
    const msg = error.response && error.response.data && error.response.data.error && error.response.data.error.message || error.message;
    res.status(500).json({ success: false, message: msg });
  }
};

module.exports = {
  getAutomationSettings, updateAutomationSettings, syncIcebreakers,
  getAutomations, createAutomation, getAutomation,
  updateAutomation, deleteAutomation, toggleAutomation,
};
