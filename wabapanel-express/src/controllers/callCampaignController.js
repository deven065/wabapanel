const CallCampaign = require('../models/CallCampaign');
const Contact = require('../models/Contact');

const normalizePhone = (p) => (p || '').replace(/[^0-9]/g, '');

// @GET /api/ai-calling/campaigns
const getCallCampaigns = async (req, res) => {
  try {
    const campaigns = await CallCampaign.find({ workspace: req.workspace._id })
      .select('-targets')
      .populate('agent', 'name')
      .sort('-createdAt');
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/ai-calling/campaigns/:id
const getCallCampaign = async (req, res) => {
  try {
    const campaign = await CallCampaign.findOne({ _id: req.params.id, workspace: req.workspace._id })
      .populate('agent', 'name');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/campaigns
// body: { name, agentId, phones: [], tagId, contactIds: [], callingHours, dailyLimit }
const createCallCampaign = async (req, res) => {
  try {
    const { name, agentId, phones, tagId, contactIds, callingHours, dailyLimit } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const targets = [];
    const seen = new Set();
    const addTarget = (phone, contactName, contactId) => {
      const p = normalizePhone(phone);
      if (!p || p.length < 8 || seen.has(p)) return;
      seen.add(p);
      targets.push({ phone: p, name: contactName || '', contact: contactId || undefined });
    };

    for (const p of (Array.isArray(phones) ? phones : [])) addTarget(p);

    if (tagId) {
      const contacts = await Contact.find({ workspace: req.workspace._id, tags: tagId, status: 'active' })
        .select('phone name');
      for (const c of contacts) addTarget(c.phone, c.name, c._id);
    }

    if (Array.isArray(contactIds) && contactIds.length) {
      const contacts = await Contact.find({ workspace: req.workspace._id, _id: { $in: contactIds }, status: 'active' })
        .select('phone name');
      for (const c of contacts) addTarget(c.phone, c.name, c._id);
    }

    if (!targets.length) return res.status(400).json({ success: false, message: 'No valid phone numbers found' });

    const campaign = await CallCampaign.create({
      workspace: req.workspace._id,
      name,
      agent: agentId || undefined,
      targets,
      callingHours: {
        start: callingHours?.start || '10:00',
        end: callingHours?.end || '19:00',
      },
      dailyLimit: Math.max(1, Math.min(Number(dailyLimit) || 50, 1000)),
      stats: { total: targets.length, done: 0, failed: 0, permissionRequested: 0 },
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/campaigns/:id/start
const startCallCampaign = async (req, res) => {
  try {
    const campaign = await CallCampaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status === 'completed') return res.status(400).json({ success: false, message: 'Campaign is already completed' });
    campaign.status = 'running';
    await campaign.save();
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/campaigns/:id/pause
const pauseCallCampaign = async (req, res) => {
  try {
    const campaign = await CallCampaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    campaign.status = 'paused';
    await campaign.save();
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/ai-calling/campaigns/:id
const deleteCallCampaign = async (req, res) => {
  try {
    const campaign = await CallCampaign.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCallCampaigns, getCallCampaign, createCallCampaign,
  startCallCampaign, pauseCallCampaign, deleteCallCampaign,
};
