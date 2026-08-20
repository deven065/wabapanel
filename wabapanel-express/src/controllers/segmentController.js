const Segment = require('../models/Segment');
const { checkPlanLimit } = require('../utils/planLimits');
const Contact = require('../models/Contact');
const mongoose = require('mongoose');
const sanitizeSegmentBody = (body) => {
  const b = { ...body };
  if (Array.isArray(b.behaviorRules)) b.behaviorRules = b.behaviorRules.filter(r => r && mongoose.Types.ObjectId.isValid(r.campaign));
  return b;
};

const getSegments = async (req, res) => {
  try {
    const segments = await Segment.find({ workspace: req.workspace._id }).sort('-createdAt');
    res.json({ success: true, data: segments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSegment = async (req, res) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });
    res.json({ success: true, data: segment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createSegment = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'segments', 'Segment');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const segment = await Segment.create({ ...sanitizeSegmentBody(req.body), workspace: req.workspace._id });
    res.status(201).json({ success: true, data: segment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSegment = async (req, res) => {
  try {
    const segment = await Segment.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      sanitizeSegmentBody(req.body),
      { new: true }
    );
    if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });
    res.json({ success: true, data: segment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSegment = async (req, res) => {
  try {
    await Segment.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Segment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Resolve the contact list for a segment: static membership + field rules + broadcast behavior rules
const resolveSegmentContacts = async (workspaceId, segment) => {
  const Message = require('../models/Message');
  let contactIds = null; // null = no restriction yet

  // Field rules (equals/contains/etc.)
  if (segment.rules && segment.rules.length > 0) {
    const conds = segment.rules.map(r => {
      const f = r.field;
      const v = r.value;
      switch (r.operator) {
        case 'equals': return { [f]: v };
        case 'not_equals': return { [f]: { $ne: v } };
        case 'contains': return { [f]: { $regex: v, $options: 'i' } };
        case 'not_contains': return { [f]: { $not: { $regex: v, $options: 'i' } } };
        case 'starts_with': return { [f]: { $regex: '^' + v, $options: 'i' } };
        case 'ends_with': return { [f]: { $regex: v + '$', $options: 'i' } };
        case 'greater_than': return { [f]: { $gt: isNaN(Number(v)) ? v : Number(v) } };
        case 'less_than': return { [f]: { $lt: isNaN(Number(v)) ? v : Number(v) } };
        case 'is_empty': return { $or: [{ [f]: '' }, { [f]: null }, { [f]: { $exists: false } }] };
        case 'is_not_empty': return { [f]: { $nin: ['', null] } };
        default: return {};
      }
    });
    const useOr = segment.rules.some(r => r.conjunction === 'or');
    const query = { workspace: workspaceId, ...(useOr ? { $or: conds } : { $and: conds }) };
    const matched = await Contact.find(query).select('_id');
    contactIds = new Set(matched.map(c => c._id.toString()));
  }

  // Broadcast behavior rules (retargeting)
  if (segment.behaviorRules && segment.behaviorRules.length > 0) {
    for (const br of segment.behaviorRules) {
      if (!br.campaign) continue;
      const msgs = await Message.find({ workspace: workspaceId, campaignId: br.campaign, direction: 'outbound' })
        .select('contact status createdAt').lean();
      const byContact = {};
      msgs.forEach(m => { if (m.contact) byContact[m.contact.toString()] = m; });
      const targetIds = Object.keys(byContact);

      // Which of these contacts replied AFTER the campaign message?
      const repliedSet = new Set();
      if (targetIds.length > 0) {
        const replies = await Message.aggregate([
          { $match: { workspace: workspaceId, direction: 'inbound', contact: { $in: targetIds.map(id => new (require('mongoose').Types.ObjectId)(id)) } } },
          { $group: { _id: '$contact', lastAt: { $max: '$createdAt' } } },
        ]);
        replies.forEach(r => {
          const cid = r._id.toString();
          if (byContact[cid] && new Date(r.lastAt) > new Date(byContact[cid].createdAt)) repliedSet.add(cid);
        });
      }

      const matchSet = new Set();
      targetIds.forEach(cid => {
        const st = byContact[cid].status;
        switch (br.condition) {
          case 'sent': matchSet.add(cid); break;
          case 'delivered_not_replied': if (['delivered', 'read'].includes(st) && !repliedSet.has(cid)) matchSet.add(cid); break;
          case 'read_not_replied': if (st === 'read' && !repliedSet.has(cid)) matchSet.add(cid); break;
          case 'not_read': if (['sent', 'delivered'].includes(st)) matchSet.add(cid); break;
          case 'replied': if (repliedSet.has(cid)) matchSet.add(cid); break;
          case 'failed': if (st === 'failed') matchSet.add(cid); break;
        }
      });

      contactIds = contactIds === null ? matchSet : new Set([...contactIds].filter(id => matchSet.has(id)));
    }
  }

  if (contactIds === null) {
    // No dynamic rules: fall back to static membership
    return Contact.find({ workspace: workspaceId, segments: segment._id });
  }
  return Contact.find({ workspace: workspaceId, _id: { $in: [...contactIds] } });
};

const getSegmentContacts = async (req, res) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });

    const contacts = await resolveSegmentContacts(req.workspace._id, segment);

    // Keep contactCount fresh
    Segment.updateOne({ _id: segment._id }, { contactCount: contacts.length }).catch(() => {});

    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSegments, getSegment, createSegment, updateSegment, deleteSegment, getSegmentContacts, resolveSegmentContacts };
