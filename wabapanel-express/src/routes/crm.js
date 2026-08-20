const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ContactNote = require('../models/ContactNote');
const Pipeline = require('../models/Pipeline');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const CallSession = require('../models/CallSession');
const ScheduledCall = require('../models/ScheduledCall');
const Tag = require('../models/Tag');
const Stage = require('../models/Stage');
const AISettings = require('../models/AISettings');
const WhatsAppService = require('../services/whatsappService');
const aiService = require('../services/aiService');
const { resolveAiCreds } = require('../services/aiResolver');
const AIAssistRun = require('../models/AIAssistRun');
const AIAssistSchedule = require('../models/AIAssistSchedule');
const aiAssist = require('../services/aiAssistService');

router.use(protect, workspaceAccess);

const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// GET /api/crm/summary — top cards for the CRM dashboard
router.get('/summary', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 864e5);

    const [contacts, pipelines, dueToday, overdue, callsWeek, upcomingAppts, ordersWeek] = await Promise.all([
      Contact.countDocuments({ workspace: ws }),
      Pipeline.find({ workspace: ws, status: 'active' }).select('deals currency').lean(),
      ContactNote.countDocuments({ workspace: ws, contacted: false, remindAt: { $gte: dayStart, $lte: dayEnd } }),
      ContactNote.countDocuments({ workspace: ws, contacted: false, remindAt: { $lt: dayStart } }),
      CallSession.countDocuments({ workspace: ws, createdAt: { $gte: weekAgo } }),
      Appointment.countDocuments({ workspace: ws, date: { $gte: now }, status: { $in: ['scheduled', 'confirmed'] } }),
      Order.countDocuments({ workspace: ws, createdAt: { $gte: weekAgo } }),
    ]);

    let openDeals = 0, openValue = 0, wonDeals = 0, wonValue = 0;
    for (const p of pipelines) {
      for (const d of (p.deals || [])) {
        if (d.status === 'open') { openDeals++; openValue += d.value || 0; }
        else if (d.status === 'won') { wonDeals++; wonValue += d.value || 0; }
      }
    }

    res.json({ success: true, data: { contacts, openDeals, openValue, wonDeals, wonValue, dueToday, overdue, callsWeek, upcomingAppts, ordersWeek } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/contacts?search=&page= — contact list with last activity
router.get('/contacts', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const q = { workspace: ws };
    const search = (req.query.search || '').trim();
    if (search) {
      q.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search.replace(/\D/g, '') || search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      Contact.find(q).sort('-updatedAt').skip((page - 1) * limit).limit(limit)
        .select('name phone email tags source createdAt updatedAt').populate('tags', 'name color').lean(),
      Contact.countDocuments(q),
    ]);
    const ids = items.map(c => c._id);
    const convs = await Conversation.find({ workspace: ws, contact: { $in: ids } })
      .select('contact lastMessage.timestamp lastMessage.text unreadCount').lean();
    const byContact = {};
    for (const c of convs) {
      const k = String(c.contact);
      const t = c.lastMessage?.timestamp ? new Date(c.lastMessage.timestamp).getTime() : 0;
      if (!byContact[k] || t > byContact[k].t) byContact[k] = { t, text: c.lastMessage?.text || '', unread: c.unreadCount || 0 };
    }
    res.json({
      success: true,
      data: items.map(c => ({ ...c, lastActivity: byContact[String(c._id)] || null })),
      pagination: { page, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/leads — sheet of contacts who messaged, with stage & next action
router.get('/leads', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const q = { workspace: ws, contact: { $ne: null } };
    const restricted = !!(req.user && req.user.role === 'agent' && req.user.inboxScope === 'assigned');
    const toId = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; } };
    if (restricted) {
      // Assigned-scope agents can only ever see their own leads; the agent filter is ignored.
      q.assignedAgent = req.user._id;
    } else if (req.query.agent) {
      const parts = String(req.query.agent).split(',').filter(Boolean);
      const wantNone = parts.includes('__none__');
      const aids = parts.map(v => toId(v)).filter(Boolean);
      const ors = [];
      if (aids.length) ors.push({ assignedAgent: { $in: aids } });
      if (wantNone) ors.push({ assignedAgent: null });
      if (ors.length === 1) Object.assign(q, ors[0]);
      else if (ors.length > 1) q.$or = ors;
    }
    if (req.query.from || req.query.to) {
      q['lastMessage.timestamp'] = {};
      if (req.query.from) q['lastMessage.timestamp'].$gte = new Date(req.query.from);
      if (req.query.to) { const t = new Date(req.query.to); t.setHours(23, 59, 59, 999); q['lastMessage.timestamp'].$lte = t; }
    }

    // Contact-level filters (search, tag, closed/open). A lead is "closed" when
    // leadClosed is set AND no newer inbound message arrived (lastMessageAt <= leadClosedAt).
    const search = (req.query.search || '').trim();
    const and = [];
    if (search) {
      and.push({ $or: [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search.replace(/\D/g, '') || search } },
      ] });
    }
    if (req.query.tag) and.push({ tags: req.query.tag });
    if (req.query.stage) {
      and.push(req.query.stage === '__none__'
        ? { $and: [{ $or: [{ stage: null }, { stage: { $exists: false } }] }, { $or: [{ stages: { $exists: false } }, { stages: { $size: 0 } }] }] }
        : { $or: [{ stage: req.query.stage }, { stages: req.query.stage }] });
    }
    const closedExpr = { $expr: { $or: [{ $eq: ['$lastMessageAt', null] }, { $lte: ['$lastMessageAt', '$leadClosedAt'] }] } };
    if (req.query.closed === 'true') {
      and.push({ leadClosed: true }, closedExpr);
    } else {
      and.push({ $or: [{ leadClosed: { $ne: true } }, { $expr: { $gt: ['$lastMessageAt', '$leadClosedAt'] } }] });
    }
    if (req.query.callStatus === 'not_called') and.push({ $or: [{ callStatus: { $in: ['', 'not_called'] } }, { callStatus: { $exists: false } }] });
    else if (req.query.callStatus === 'called') and.push({ callStatus: 'called' });
    else if (req.query.callStatus === 'callback') and.push({ callStatus: 'callback' });
    if (req.query.aging) {
      const agingDays = Math.max(1, parseInt(req.query.aging) || 2);
      and.push({ $or: [{ callStatus: { $in: ['', 'not_called'] } }, { callStatus: { $exists: false } }] });
      and.push({ createdAt: { $lte: new Date(Date.now() - agingDays * 86400000) } });
    }
    const cFilter = { workspace: ws, isGroup: { $ne: true } };
    if (and.length) cFilter.$and = and;

    // Optional deal-value range filter — needs each contact's open deal value.
    const vMin = req.query.valueMin ? Number(req.query.valueMin) : null;
    const vMax = req.query.valueMax ? Number(req.query.valueMax) : null;
    let valueIds = null;
    if (vMin != null || vMax != null) {
      // Effective value = manual override (crmValue) else total of the contact's orders.
      const [ordVals, overrides] = await Promise.all([
        Order.aggregate([
          { $match: { workspace: ws, contact: { $ne: null }, status: { $nin: ['cancelled', 'refunded'] } } },
          { $group: { _id: '$contact', value: { $sum: '$totalAmount' } } },
        ]),
        Contact.find({ workspace: ws, crmValue: { $ne: null } }).select('crmValue').lean(),
      ]);
      const valBy = {};
      for (const o of ordVals) valBy[String(o._id)] = o.value || 0;
      for (const c of overrides) valBy[String(c._id)] = c.crmValue;
      valueIds = Object.keys(valBy).filter(k => (vMin == null || valBy[k] >= vMin) && (vMax == null || valBy[k] <= vMax));
    }

    // Optional reminder filter — contacts with a pending / overdue reminder.
    let reminderIds = null;
    if (req.query.reminder === 'pending' || req.query.reminder === 'overdue') {
      const rq = { workspace: ws, contacted: { $ne: true }, remindAt: { $ne: null } };
      if (req.query.reminder === 'overdue') rq.remindAt = { $lt: new Date() };
      const rn = await ContactNote.find(rq).select('contact').lean();
      reminderIds = [...new Set(rn.map(n => String(n.contact)))];
    }

    // Resolve contact-level constraints into an id set applied to the conversation query.
    // (Always applied — the open/closed condition alone requires it.)
    let cIds = (await Contact.find(cFilter).select('_id').lean()).map(c => String(c._id));
    if (valueIds) cIds = cIds.filter(i => valueIds.includes(i));
    if (reminderIds) cIds = cIds.filter(i => reminderIds.includes(i));
    // Aggregation $match does not auto-cast, so use ObjectId values here.
    q.contact = { $in: cIds.map(id => new mongoose.Types.ObjectId(id)) };

    // One row per contact: a contact may have several conversations (channels),
    // so collapse to the most recent conversation and sum unread across them.
    // Column-based sorting for the leads sheet (correct across all pages).
    // Heavy lookups are added only for the column actually being sorted.
    const sortBy = req.query.sortBy || '';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    const pre = [];
    let sortSpec;
    if (req.query.sort === 'attention') {
      sortSpec = { unreadCount: -1, lastAt: -1 };
    } else if (req.query.sort === 'queue') {
      pre.push(
        { $lookup: { from: 'contacts', localField: '_id', foreignField: '_id', as: '_c' } },
        { $addFields: { _c: { $first: '$_c' } } },
        { $lookup: {
          from: 'contactnotes',
          let: { cid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$contact', '$$cid'] }, { $eq: ['$workspace', ws] }] }, contacted: { $ne: true }, remindAt: { $ne: null, $lte: new Date() } } },
            { $limit: 1 },
          ],
          as: '_ov',
        } },
        { $lookup: {
          from: 'orders',
          let: { cid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$contact', '$$cid'] }, { $eq: ['$workspace', ws] }] }, status: { $nin: ['cancelled', 'refunded'] } } },
            { $group: { _id: null, v: { $sum: '$totalAmount' } } },
          ],
          as: '_o',
        } },
        { $addFields: {
          _overdue: { $cond: [{ $gt: [{ $size: '$_ov' }, 0] }, 1, 0] },
          _uncalled: { $cond: [{ $in: [{ $ifNull: ['$_c.callStatus', ''] }, ['', 'not_called']] }, 1, 0] },
          _sortValue: { $ifNull: ['$_c.crmValue', { $ifNull: [{ $first: '$_o.v' }, 0] }] },
        } },
      );
      sortSpec = { _overdue: -1, _uncalled: -1, _sortValue: -1, lastAt: -1 };
    } else if (sortBy === 'name' || sortBy === 'received' || sortBy === 'phone') {
      pre.push(
        { $lookup: { from: 'contacts', localField: '_id', foreignField: '_id', as: '_c' } },
        { $addFields: { _c: { $first: '$_c' } } },
      );
      const f = sortBy === 'name' ? '_c.name' : sortBy === 'phone' ? '_c.phone' : '_c.createdAt';
      sortSpec = { [f]: sortDir, lastAt: -1 };
    } else if (sortBy === 'agent') {
      pre.push(
        { $lookup: { from: 'users', localField: 'assignedAgent', foreignField: '_id', as: '_a' } },
        { $addFields: { _agentName: { $ifNull: [{ $first: '$_a.name' }, ''] } } },
      );
      sortSpec = { _agentName: sortDir, lastAt: -1 };
    } else if (sortBy === 'value') {
      pre.push(
        { $lookup: { from: 'contacts', localField: '_id', foreignField: '_id', as: '_c' } },
        { $addFields: { _c: { $first: '$_c' } } },
        { $lookup: {
          from: 'orders',
          let: { cid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$contact', '$$cid'] }, { $eq: ['$workspace', ws] }] }, status: { $nin: ['cancelled', 'refunded'] } } },
            { $group: { _id: null, v: { $sum: '$totalAmount' } } },
          ],
          as: '_o',
        } },
        { $addFields: { _sortValue: { $ifNull: ['$_c.crmValue', { $ifNull: [{ $first: '$_o.v' }, 0] }] } } },
      );
      sortSpec = { _sortValue: sortDir, lastAt: -1 };
    } else {
      sortSpec = { lastAt: req.query.dir === 'asc' ? 1 : -1 };
    }
    const sortStage = { $sort: sortSpec };
    const grouped = [
      { $match: q },
      { $sort: { 'lastMessage.timestamp': -1 } },
      { $group: {
        _id: '$contact',
        convId: { $first: '$_id' },
        lastMessage: { $first: '$lastMessage' },
        assignedAgent: { $first: '$assignedAgent' },
        unreadCount: { $sum: { $ifNull: ['$unreadCount', 0] } },
        lastAt: { $first: '$lastMessage.timestamp' },
      } },
    ];
    const [rows, totalArr] = await Promise.all([
      Conversation.aggregate([...grouped, ...pre, sortStage, { $skip: (page - 1) * limit }, { $limit: limit }]),
      Conversation.aggregate([{ $match: q }, { $group: { _id: '$contact' } }, { $count: 'n' }]),
    ]);
    const total = totalArr[0]?.n || 0;
    const ids = rows.map(r => String(r._id));

    // Populate contacts (with tags) and agents in one round-trip each.
    const [contactDocs, agentDocs] = await Promise.all([
      Contact.find({ _id: { $in: ids } })
        .select('name phone email tags stage stages crmComment crmValue crmItems crmAiSummary leadClosed leadClosedAt leadCloseReason lastMessageAt createdAt callStatus lastCalledAt lastDisposition')
        .populate({ path: 'tags', select: 'name color' })
        .populate({ path: 'stage', select: 'name color' })
        .populate({ path: 'stages', select: 'name color' }).lean(),
      User.find({ _id: { $in: rows.map(r => r.assignedAgent).filter(Boolean) } }).select('name email').lean(),
    ]);
    const contactBy = {}; for (const c of contactDocs) contactBy[String(c._id)] = c;
    const agentBy = {}; for (const a of agentDocs) agentBy[String(a._id)] = a;
    const convs = rows.map(r => ({
      _id: r.convId,
      contact: contactBy[String(r._id)] || null,
      lastMessage: r.lastMessage || {},
      unreadCount: r.unreadCount || 0,
      assignedAgent: r.assignedAgent ? agentBy[String(r.assignedAgent)] || null : null,
    })).filter(c => c.contact);

    const [pipelines, fuNotes, orderAgg] = await Promise.all([
      Pipeline.find({ workspace: ws, status: 'active', 'deals.contact': { $in: ids } })
        .select('name stages deals').lean(),
      ContactNote.find({ workspace: ws, contact: { $in: ids }, remindAt: { $ne: null } })
        .sort('-remindAt').select('contact text remindAt contacted contactedRemark').lean(),
      Order.aggregate([
        { $match: { workspace: ws, contact: { $in: rows.map(r => r._id) }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: '$contact', value: { $sum: '$totalAmount' }, items: { $sum: { $sum: '$items.quantity' } }, orders: { $sum: 1 } } },
      ]),
    ]);
    const orderBy = {};
    for (const o of orderAgg) orderBy[String(o._id)] = { value: o.value || 0, items: o.items || 0, orders: o.orders || 0 };
    const dealBy = {};
    for (const p of pipelines) {
      const stageName = {};
      for (const s of (p.stages || [])) stageName[s.id] = s.name;
      for (const d of (p.deals || [])) {
        const k = String(d.contact || '');
        if (!k || !ids.includes(k)) continue;
        if (!dealBy[k] || d.status === 'open') {
          dealBy[k] = { pipeline: p.name, stage: stageName[d.stage] || d.stage, status: d.status, value: d.value || 0, title: d.title };
        }
      }
    }
    const fuBy = {};
    for (const n of fuNotes) {
      const k = String(n.contact);
      // prefer the earliest pending reminder; else keep most recent one
      if (!fuBy[k] || (!n.contacted && (fuBy[k].contacted || new Date(n.remindAt) < new Date(fuBy[k].at)))) {
        fuBy[k] = { _id: n._id, at: n.remindAt, text: n.text, contacted: !!n.contacted, remark: n.contactedRemark || '' };
      }
    }
    const data = convs.filter(c => c.contact).map(c => {
      const k = String(c.contact._id);
      const ct = c.contact;
      const closed = !!ct.leadClosed && (!ct.lastMessageAt || new Date(ct.lastMessageAt) <= new Date(ct.leadClosedAt));
      const auto = orderBy[k] || { value: 0, items: 0, orders: 0 };
      return {
        conversationId: c._id,
        contact: ct,
        agent: c.assignedAgent ? { _id: c.assignedAgent._id, name: c.assignedAgent.name || c.assignedAgent.email } : null,
        lastMessage: { text: c.lastMessage?.text || '', at: c.lastMessage?.timestamp || null, direction: c.lastMessage?.direction || '' },
        unread: c.unreadCount || 0,
        stage: ct.stage || null,
        sales: {
          value: ct.crmValue != null ? ct.crmValue : auto.value,
          items: ct.crmItems != null ? ct.crmItems : auto.items,
          autoValue: auto.value, autoItems: auto.items, orders: auto.orders,
          valueOverridden: ct.crmValue != null, itemsOverridden: ct.crmItems != null,
        },
        aiSummary: ct.crmAiSummary && ct.crmAiSummary.text ? { score: ct.crmAiSummary.score, at: ct.crmAiSummary.at } : null,
        deal: dealBy[k] || null,
        followUp: fuBy[k] || null,
        receivedAt: ct.createdAt || null,
        callStatus: ct.callStatus || '',
        lastCalledAt: ct.lastCalledAt || null,
        disposition: ct.lastDisposition || '',
        closed,
        closeReason: closed ? (ct.leadCloseReason || '') : '',
      };
    });
    res.json({ success: true, data, pagination: { page, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/leads/stats — top cards for the leads sheet
router.get('/lead-agents', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const ids = await Conversation.distinct('assignedAgent', { workspace: ws, assignedAgent: { $ne: null } });
    const users = await User.find({ _id: { $in: ids } }).select('name email').lean();
    res.json({ success: true, data: users.map(u => ({ _id: u._id, name: u.name || u.email, email: u.email })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/leads/stats', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const q = { workspace: ws, contact: { $ne: null } };
    if (req.user && req.user.role === 'agent' && req.user.inboxScope === 'assigned') {
      q.assignedAgent = req.user._id;
    }
    // Count distinct contacts (a contact may have multiple conversations).
    const [totalArr, todayArr, pendingReminders, overdueReminders, pipelines, ordVals, overrides, stageAgg, stages] = await Promise.all([
      Conversation.aggregate([{ $match: q }, { $group: { _id: '$contact' } }, { $count: 'n' }]),
      Conversation.aggregate([{ $match: { ...q, 'lastMessage.timestamp': { $gte: dayStart } } }, { $group: { _id: '$contact' } }, { $count: 'n' }]),
      ContactNote.countDocuments({ workspace: ws, contacted: false, remindAt: { $gte: dayStart } }),
      ContactNote.countDocuments({ workspace: ws, contacted: false, remindAt: { $lt: dayStart, $ne: null } }),
      Pipeline.find({ workspace: ws, status: 'active' }).select('deals').lean(),
      Order.aggregate([
        { $match: { workspace: ws, contact: { $ne: null }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: '$contact', value: { $sum: '$totalAmount' }, items: { $sum: { $sum: '$items.quantity' } } } },
      ]),
      Contact.find({ workspace: ws, $or: [{ crmValue: { $ne: null } }, { crmItems: { $ne: null } }] }).select('crmValue crmItems').lean(),
      Contact.aggregate([
        { $match: { workspace: ws, isGroup: { $ne: true }, stage: { $ne: null } } },
        { $group: { _id: '$stage', n: { $sum: 1 } } },
      ]),
      Stage.find({ workspace: ws }).sort('order createdAt').select('name color').lean(),
    ]);
    const total = totalArr[0]?.n || 0;
    const today = todayArr[0]?.n || 0;
    let openDeals = 0, openValue = 0;
    for (const p of pipelines) {
      for (const d of (p.deals || [])) {
        if (d.status === 'open') { openDeals++; openValue += d.value || 0; }
      }
    }
    // Sales value/items: per-contact orders total, replaced by manual overrides where set.
    const effVal = {}, effItems = {};
    for (const o of ordVals) { const k = String(o._id); effVal[k] = o.value || 0; effItems[k] = o.items || 0; }
    for (const c of overrides) {
      const k = String(c._id);
      if (c.crmValue != null) effVal[k] = c.crmValue;
      if (c.crmItems != null) effItems[k] = c.crmItems;
    }
    const salesValue = Object.values(effVal).reduce((a, b) => a + b, 0);
    const salesItems = Object.values(effItems).reduce((a, b) => a + b, 0);
    const stageCountBy = {}; for (const s of stageAgg) stageCountBy[String(s._id)] = s.n;
    const stageBreakdown = stages.map(s => ({ _id: s._id, name: s.name, color: s.color, count: stageCountBy[String(s._id)] || 0 }));
    res.json({ success: true, data: { total, today, pendingReminders, overdueReminders, openDeals, openValue, salesValue, salesItems, stageBreakdown } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/dashboard — manager overview with time-range filter + breakdowns.
router.get('/dashboard', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const parseDate = (s, end) => {
      if (!s) return null;
      const d = new Date(s + (end ? 'T23:59:59.999' : 'T00:00:00.000'));
      return isNaN(d.getTime()) ? null : d;
    };
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    const hasRange = !!(from || to);

    const cMatch = { workspace: ws, isGroup: { $ne: true } };
    if (hasRange) cMatch.createdAt = range;

    const [totalLeads, stageAgg, labelAgg, ordVals, contacts, closedAgg, msgAgg, agentAgg, dayAgg, stages, tags] = await Promise.all([
      Contact.countDocuments(cMatch),
      Contact.aggregate([
        { $match: cMatch },
        { $project: { s: { $setUnion: [{ $ifNull: ['$stages', []] }, { $cond: [{ $ne: ['$stage', null] }, ['$stage'], []] }] } } },
        { $unwind: '$s' },
        { $group: { _id: '$s', n: { $sum: 1 } } },
      ]),
      Contact.aggregate([{ $match: { ...cMatch, tags: { $ne: [] } } }, { $unwind: '$tags' }, { $group: { _id: '$tags', n: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { workspace: ws, contact: { $ne: null }, status: { $nin: ['cancelled', 'refunded'] }, ...(hasRange ? { createdAt: range } : {}) } },
        { $group: { _id: '$contact', value: { $sum: '$totalAmount' }, items: { $sum: { $sum: '$items.quantity' } } } },
      ]),
      Contact.find({ ...cMatch, $or: [{ crmValue: { $ne: null } }, { crmItems: { $ne: null } }] }).select('crmValue crmItems').lean(),
      Contact.aggregate([{ $match: { ...cMatch, leadClosed: true } }, { $group: { _id: '$leadCloseReason', n: { $sum: 1 } } }]),
      Message.aggregate([{ $match: { workspace: ws, ...(hasRange ? { createdAt: range } : {}) } }, { $group: { _id: '$direction', n: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: { workspace: ws, assignedAgent: { $ne: null }, ...(hasRange ? { createdAt: range } : {}) } }, { $group: { _id: '$assignedAgent', n: { $sum: 1 } } }]),
      Contact.aggregate([{ $match: cMatch }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Stage.find({ workspace: ws }).sort('order createdAt').select('name color').lean(),
      Tag.find({ workspace: ws }).select('name color').lean(),
    ]);

    const stageName = {}; for (const s of stages) stageName[String(s._id)] = s;
    const stageCountBy = {}; for (const s of stageAgg) stageCountBy[String(s._id)] = s.n;
    const stageBreakdown = stages.map(s => ({ _id: s._id, name: s.name, color: s.color, count: stageCountBy[String(s._id)] || 0 }));

    const tagName = {}; for (const t of tags) tagName[String(t._id)] = t;
    const labelBreakdown = labelAgg
      .map(l => ({ _id: l._id, name: tagName[String(l._id)] ? tagName[String(l._id)].name : null, color: tagName[String(l._id)] ? tagName[String(l._id)].color : '#6366F1', count: l.n }))
      .filter(l => l.name)
      .sort((a, b) => b.count - a.count);

    const effVal = {}, effItems = {};
    for (const o of ordVals) { const k = String(o._id); effVal[k] = o.value || 0; effItems[k] = o.items || 0; }
    for (const c of contacts) { const k = String(c._id); if (c.crmValue != null) effVal[k] = c.crmValue; if (c.crmItems != null) effItems[k] = c.crmItems; }
    const totalValue = Object.values(effVal).reduce((a, b) => a + b, 0);
    const totalItems = Object.values(effItems).reduce((a, b) => a + b, 0);

    const closeReasons = closedAgg.map(c => ({ reason: c._id || 'other', count: c.n }));
    const closedTotal = closedAgg.reduce((a, b) => a + b.n, 0);
    const wonCount = (closedAgg.find(c => c._id === 'won') || {}).n || 0;

    let msgIn = 0, msgOut = 0;
    for (const m of msgAgg) { if (m._id === 'inbound') msgIn = m.n; else if (m._id === 'outbound') msgOut = m.n; }

    const agentIds = agentAgg.map(a => a._id).filter(Boolean);
    const agentUsers = await User.find({ _id: { $in: agentIds } }).select('name email').lean();
    const agentName = {}; for (const u of agentUsers) agentName[String(u._id)] = u.name || u.email;
    const agentBreakdown = agentAgg
      .map(a => ({ _id: a._id, name: agentName[String(a._id)] || 'Unknown', count: a.n }))
      .sort((a, b) => b.count - a.count);
    const unassigned = await Conversation.countDocuments({ workspace: ws, assignedAgent: null, ...(hasRange ? { createdAt: range } : {}) });

    const series = dayAgg.map(d => ({ date: d._id, count: d.n }));

    res.json({ success: true, data: {
      totalLeads, closedTotal, wonCount, openLeads: totalLeads - closedTotal,
      totalValue, totalItems, msgIn, msgOut,
      stageBreakdown, labelBreakdown, agentBreakdown, unassigned, closeReasons, series,
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---- Stages: simple lead stages (independent of pipelines), assigned from chat / call-center ----
router.get('/stages', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const [stages, counts] = await Promise.all([
      Stage.find({ workspace: ws }).sort('order createdAt').lean(),
      Contact.aggregate([
        { $match: { workspace: ws, isGroup: { $ne: true } } },
        { $project: { s: { $setUnion: [{ $ifNull: ['$stages', []] }, { $cond: [{ $ne: ['$stage', null] }, ['$stage'], []] }] } } },
        { $unwind: '$s' },
        { $group: { _id: '$s', n: { $sum: 1 } } },
      ]),
    ]);
    const countBy = {}; for (const c of counts) countBy[String(c._id)] = c.n;
    res.json({ success: true, data: stages.map(s => ({ ...s, contactCount: countBy[String(s._id)] || 0 })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/stages', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const count = await Stage.countDocuments({ workspace: req.workspace._id });
    const stage = await Stage.create({
      workspace: req.workspace._id, name,
      color: req.body.color || '#8B5CF6', order: count,
    });
    res.json({ success: true, data: stage });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Stage already exists' });
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/stages/:id', async (req, res) => {
  try {
    const set = {};
    if (req.body.name !== undefined) set.name = String(req.body.name).trim().slice(0, 60);
    if (req.body.color !== undefined) set.color = String(req.body.color);
    if (req.body.order !== undefined) set.order = Number(req.body.order) || 0;
    const stage = await Stage.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id }, { $set: set }, { new: true }).lean();
    if (!stage) return res.status(404).json({ success: false, message: 'Stage not found' });
    res.json({ success: true, data: stage });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Stage already exists' });
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/stages/:id', async (req, res) => {
  try {
    const stage = await Stage.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!stage) return res.status(404).json({ success: false, message: 'Stage not found' });
    await Contact.updateMany({ workspace: req.workspace._id, stage: stage._id }, { $set: { stage: null } });
    await Contact.updateMany({ workspace: req.workspace._id, stages: stage._id }, { $pull: { stages: stage._id } });
    // Re-promote a remaining stage to primary where the primary got cleared.
    await Contact.updateMany(
      { workspace: req.workspace._id, stage: null, 'stages.0': { $exists: true } },
      [{ $set: { stage: { $arrayElemAt: ['$stages', 0] } } }]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/stage — assign / clear a lead's stage(s).
// Accepts either { stage } (single, legacy) or { stages: [...] } (multi-select).
// A contact can be in several stages at once; stages[0] is kept as the primary `stage`.
router.patch('/leads/:contactId/stage', async (req, res) => {
  try {
    let ids = Array.isArray(req.body.stages)
      ? req.body.stages.filter(Boolean).map(String)
      : (req.body.stage ? [String(req.body.stage)] : []);
    ids = [...new Set(ids)];
    if (ids.length) {
      const valid = await Stage.find({ _id: { $in: ids }, workspace: req.workspace._id }).select('_id').lean();
      if (valid.length !== ids.length) return res.status(404).json({ success: false, message: 'Stage not found' });
    }
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, workspace: req.workspace._id },
      { $set: { stage: ids[0] || null, stages: ids } }, { new: true }
    ).select('stage stages').populate('stage stages', 'name color').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/value — manual override of order value / item count (null = back to auto)
router.patch('/leads/:contactId/value', async (req, res) => {
  try {
    const set = {};
    if (req.body.value !== undefined) set.crmValue = req.body.value === null ? null : Math.max(0, Number(req.body.value) || 0);
    if (req.body.items !== undefined) set.crmItems = req.body.items === null ? null : Math.max(0, Math.round(Number(req.body.items) || 0));
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, workspace: req.workspace._id },
      { $set: set }, { new: true }
    ).select('crmValue crmItems').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/crm/leads/:contactId/summary — AI chat summary + lead score (cached until a newer message arrives)
router.post('/leads/:contactId/summary', async (req, res) => {
  try {
    const ws = req.workspace;
    const wsId = ws._id;
    const contact = await Contact.findOne({ _id: req.params.contactId, workspace: wsId })
      .select('name phone lastMessageAt crmAiSummary');
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const cached = contact.crmAiSummary;
    const fresh = cached && cached.text && cached.at &&
      (!contact.lastMessageAt || new Date(cached.at) >= new Date(contact.lastMessageAt));
    if (fresh && req.body.force !== true) {
      return res.json({ success: true, data: { summary: cached.text, score: cached.score, at: cached.at, cached: true } });
    }

    const ai = await AISettings.findOne({ workspace: wsId }).lean();
    const creds = await resolveAiCreds(ws, ai);
    if (!creds || !creds.apiKey) return res.status(400).json({ success: false, message: 'AI is not configured for this workspace. Set it up in AI Settings.' });

    const cv = await Conversation.findOne({ workspace: wsId, contact: contact._id })
      .sort({ 'lastMessage.timestamp': -1 }).select('_id').lean();
    let transcript = '(no messages)';
    if (cv) {
      const msgs = await Message.find({ conversation: cv._id }).sort({ createdAt: -1 }).limit(60)
        .select('direction text body type').lean();
      msgs.reverse();
      transcript = msgs.map((m) => {
        const who = m.direction === 'outbound' ? 'Business' : 'Customer';
        let t = (m.text || m.body || '').replace(/\s+/g, ' ').trim();
        if (!t && m.type) t = `[${m.type}]`;
        return `${who}: ${t}`.slice(0, 300);
      }).join('\n');
    }

    const sys = `You are a sales-CRM assistant for a WhatsApp business panel. Summarise the conversation and score the lead.
Return STRICT JSON: {"summary":"<short summary of the whole conversation: who the customer is, what they want, key points, current status — 4 to 8 short lines>","score":<integer 0-100, the probability this lead converts into a sale>,"score_reason":"<max 15 words why>"}
"Business" = our messages, "Customer" = the lead. Write the summary in the same language mix the chat uses.`;
    const opts = {
      model: creds.azureDeployment || creds.model,
      azureEndpoint: creds.azureEndpoint, azureDeployment: creds.azureDeployment,
      azureApiVersion: creds.azureApiVersion, temperature: 0.2, maxTokens: 800,
      extra: { response_format: { type: 'json_object' } },
    };
    let parsed = null;
    for (let a = 0; a < 3 && !parsed; a++) {
      try {
        const r = await aiService.chat(creds.provider, creds.apiKey, [
          { role: 'system', content: sys },
          { role: 'user', content: `Lead: ${contact.name || 'NA'} (${contact.phone || ''})\n\nCHAT:\n${transcript}` },
        ], opts);
        parsed = JSON.parse(r.content);
      } catch (e) { if (a === 2) throw e; await new Promise((rr) => setTimeout(rr, 1500)); }
    }
    const summary = String(parsed.summary || '').slice(0, 4000);
    let score = Math.round(Number(parsed.score));
    if (!Number.isFinite(score)) score = 0;
    score = Math.min(100, Math.max(0, score));
    const at = new Date();
    contact.crmAiSummary = { text: summary, score, at };
    await contact.save();
    res.json({ success: true, data: { summary, score, scoreReason: parsed.score_reason || '', at, cached: false } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/comment — agent comment on a lead
router.patch('/leads/:contactId/comment', async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, workspace: req.workspace._id },
      { $set: { crmComment: String(req.body.comment || '').slice(0, 1000) } },
      { new: true }
    ).select('crmComment').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/call — log a manual call + set call status/disposition
router.patch('/leads/:contactId/call', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const { status, disposition, note, callbackAt } = req.body || {};
    const contact = await Contact.findOne({ _id: req.params.contactId, workspace: ws });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    const st = ['not_called', 'called', 'callback'].includes(status) ? status : 'called';
    contact.callStatus = st;
    contact.lastDisposition = (disposition || '').slice(0, 60);
    if (st !== 'not_called') contact.lastCalledAt = new Date();
    await contact.save();
    const logText = '📞 ' + (disposition || st) + (note ? ': ' + note : '');
    await ContactNote.create({ workspace: ws, contact: contact._id, text: logText, contacted: true, contactedRemark: note || disposition || '', createdBy: req.user._id });
    if (callbackAt) {
      await ContactNote.create({ workspace: ws, contact: contact._id, text: note || 'Callback', remindAt: new Date(callbackAt), contacted: false, createdBy: req.user._id });
    }
    // Did-Not-Pick / no-answer outcome: start the workspace's DNP recovery flow, if configured.
    const disp = (disposition || '').toLowerCase();
    if (/dnp|no.?answer|did.?not.?pick|not.?pick|no.?response|unreachable|busy|switched.?off/.test(disp)) {
      require('../services/botFlowEngine')
        .triggerFlowByEvent({ workspaceId: ws, contactId: contact._id, eventKey: 'dnp', io: req.app.get('io') })
        .catch(() => {});
    }
    res.json({ success: true, data: { callStatus: contact.callStatus, lastCalledAt: contact.lastCalledAt, disposition: contact.lastDisposition } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/close — close a lead with a reason
router.patch('/leads/:contactId/close', async (req, res) => {
  try {
    const reasons = ['won', 'lost', 'not_interested', 'spam'];
    const reason = reasons.includes(req.body.reason) ? req.body.reason : 'lost';
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, workspace: req.workspace._id },
      { $set: { leadClosed: true, leadClosedAt: new Date(), leadCloseReason: reason } },
      { new: true }
    ).select('leadClosed leadClosedAt leadCloseReason').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/leads/:contactId/reopen — move a closed lead back to the sheet
router.patch('/leads/:contactId/reopen', async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, workspace: req.workspace._id },
      { $set: { leadClosed: false, leadCloseReason: '' }, $unset: { leadClosedAt: 1 } },
      { new: true }
    ).select('leadClosed').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/followups/:id — record what happened after the reminder
router.patch('/followups/:id', async (req, res) => {
  try {
    const set = {};
    if (req.body.contactedRemark !== undefined) {
      set.contactedRemark = String(req.body.contactedRemark).slice(0, 1000);
      set.contacted = true;
    }
    if (req.body.contacted !== undefined) set.contacted = !!req.body.contacted;
    const note = await ContactNote.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { $set: set }, { new: true }
    ).lean();
    if (!note) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/timeline/:contactId — unified 360° activity timeline
router.get('/timeline/:contactId', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const contact = await Contact.findOne({ _id: req.params.contactId, workspace: ws })
      .populate('tags', 'name color').lean();
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const phoneKey = normPhone(contact.phone);
    const phoneRegex = phoneKey ? new RegExp(phoneKey + '$') : null;
    const msgQuery = { workspace: ws, contact: contact._id };
    if (req.query.msgBefore) msgQuery.createdAt = { $lt: new Date(req.query.msgBefore) };

    const [messages, notes, appointments, orders, scheduledCalls, callSessions, pipelines] = await Promise.all([
      Message.find(msgQuery).sort('-createdAt').limit(200)
        .select('direction type text template.name createdAt').lean(),
      ContactNote.find({ workspace: ws, contact: contact._id }).sort('-createdAt').limit(100)
        .populate('createdBy', 'name').lean(),
      Appointment.find({ workspace: ws, $or: [{ contact: contact._id }, ...(phoneRegex ? [{ contactPhone: phoneRegex }] : [])] })
        .sort('-date').limit(50).select('title date startTime status notes').lean(),
      Order.find({ workspace: ws, contact: contact._id }).sort('-createdAt').limit(50)
        .select('orderNumber totalAmount status createdAt').lean(),
      phoneRegex ? ScheduledCall.find({ workspace: ws, phone: phoneRegex }).sort('-at').limit(50).lean() : [],
      phoneRegex ? CallSession.find({ workspace: ws, $or: [{ to: phoneRegex }, { from: phoneRegex }] })
        .sort('-createdAt').limit(50).select('direction status duration recordingUrl startTime createdAt').lean() : [],
      Pipeline.find({ workspace: ws, 'deals.contact': contact._id }).select('name stages deals currency').lean(),
    ]);

    const events = [];
    for (const m of messages) events.push({ kind: 'message', at: m.createdAt, data: { direction: m.direction, type: m.type, text: m.text || m.template?.name || '' } });
    for (const n of notes) events.push({ kind: 'note', at: n.createdAt, data: { text: n.text, remindAt: n.remindAt, contacted: n.contacted, by: n.createdBy?.name || '' } });
    for (const a of appointments) events.push({ kind: 'appointment', at: a.date, data: { title: a.title, startTime: a.startTime, status: a.status, notes: a.notes || '' } });
    for (const o of orders) events.push({ kind: 'order', at: o.createdAt, data: { orderNumber: o.orderNumber, totalAmount: o.totalAmount, status: o.status } });
    for (const s of scheduledCalls) events.push({ kind: 'scheduled_call', at: s.at || s.createdAt, data: { status: s.status } });
    for (const c of callSessions) events.push({ kind: 'call', at: c.startTime || c.createdAt, data: { direction: c.direction, status: c.status, duration: c.duration, recordingUrl: c.recordingUrl || '' } });

    const deals = [];
    for (const p of pipelines) {
      for (const d of (p.deals || [])) {
        if (String(d.contact) !== String(contact._id)) continue;
        const stage = (p.stages || []).find(s => s.id === d.stage);
        deals.push({ _id: d._id, pipeline: p.name, pipelineId: p._id, title: d.title, value: d.value, status: d.status, stage: stage?.name || d.stage, currency: p.currency, createdAt: d.createdAt });
        events.push({ kind: 'deal', at: d.createdAt, data: { title: d.title, value: d.value, status: d.status, stage: stage?.name || d.stage, pipeline: p.name } });
      }
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    const conversation = await Conversation.findOne({ workspace: ws, contact: contact._id }).sort('-lastMessage.timestamp').select('_id').lean();
    const totalMessages = await Message.countDocuments({ workspace: ws, contact: contact._id });
    const oldestLoaded = messages.length ? messages[messages.length - 1].createdAt : null;
    const hasMoreMessages = oldestLoaded ? !!(await Message.exists({ workspace: ws, contact: contact._id, createdAt: { $lt: oldestLoaded } })) : false;

    res.json({
      success: true,
      data: {
        contact,
        conversationId: conversation?._id || null,
        deals,
        hasMoreMessages,
        oldestMessageAt: oldestLoaded,
        stats: {
          messages: totalMessages, notes: notes.length,
          calls: callSessions.length + scheduledCalls.length,
          appointments: appointments.length, orders: orders.length, deals: deals.length,
        },
        events,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/followups — reminder list (due / upcoming / done) from contact notes
router.get('/followups', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const items = await ContactNote.find({ workspace: ws, remindAt: { $ne: null } })
      .sort('remindAt').limit(300)
      .populate('contact', 'name phone').populate('createdBy', 'name').lean();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/calls — call-center table (all calls with contact info + filters)
router.get('/calls', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const q = { workspace: ws };
    if (req.query.status) q.status = req.query.status === 'scheduled' ? '__none__' : req.query.status;
    if (req.query.disposition) q.disposition = req.query.disposition;
    if (req.query.direction) q.direction = req.query.direction;
    if (req.query.from || req.query.to) {
      q.createdAt = {};
      if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) { const t = new Date(req.query.to); t.setHours(23, 59, 59, 999); q.createdAt.$lte = t; }
    }
    const search = (req.query.search || '').trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      const or = [];
      if (digits) or.push({ to: { $regex: digits } }, { from: { $regex: digits } });
      const named = await Contact.find({ workspace: ws, name: { $regex: search, $options: 'i' } }).select('phone').limit(50).lean();
      for (const c of named) {
        const pk = normPhone(c.phone);
        if (pk) or.push({ to: { $regex: pk + '$' } }, { from: { $regex: pk + '$' } });
      }
      if (or.length) q.$or = or; else q.$or = [{ to: search }];
    }
    // scheduled/callback calls query (mirror filters where fields exist)
    const sq = { workspace: ws };
    if (req.query.disposition) sq.disposition = req.query.disposition;
    if (q.createdAt) sq.at = q.createdAt;
    if (req.query.status) {
      const map = { completed: 'done', failed: 'failed', scheduled: 'pending' };
      sq.status = map[req.query.status] || '__none__';
    }
    if (q.$or) sq.$or = q.$or.filter(o => o.to || o.from).map(o => ({ phone: (o.to || o.from) }));
    const includeScheduled = !req.query.direction && (!sq.$or || sq.$or.length > 0) && sq.status !== '__none__';

    const [sessions, scheduled] = await Promise.all([
      CallSession.find(q).sort('-createdAt').limit(1000)
        .select('to from direction status duration recordingUrl disposition note followUpAt startTime createdAt agent errorMessage')
        .populate('agent', 'name').lean(),
      includeScheduled
        ? ScheduledCall.find(sq).sort('-at').limit(1000)
          .select('phone at reason type status error disposition note followUpAt createdAt').lean()
        : [],
    ]);

    const all = [
      ...sessions.map(i => ({
        ...i,
        source: 'session',
        phone: i.direction === 'USER_INITIATED' ? i.from : i.to,
        sortAt: i.startTime || i.createdAt,
      })),
      ...scheduled.map(i => ({
        _id: i._id,
        source: 'scheduled',
        phone: i.phone,
        direction: 'BUSINESS_INITIATED',
        status: i.status === 'done' ? 'completed' : i.status === 'failed' ? 'failed' : 'scheduled',
        duration: 0,
        recordingUrl: '',
        disposition: i.disposition || '',
        note: i.note || i.reason || '',
        followUpAt: i.followUpAt,
        startTime: i.at,
        createdAt: i.createdAt,
        errorMessage: i.error || '',
        agent: null,
        scheduledType: i.type,
        sortAt: i.at || i.createdAt,
      })),
    ].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));

    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);

    // attach contact name by phone suffix
    const keys = [...new Set(items.map(i => normPhone(i.phone)).filter(Boolean))];
    const contacts = keys.length ? await Contact.find({ workspace: ws, phone: { $regex: `(${keys.join('|')})$` } }).select('name phone').lean() : [];
    const byKey = {};
    for (const c of contacts) { const k = normPhone(c.phone); if (k) byKey[k] = { _id: c._id, name: c.name }; }
    const data = items.map(i => ({ ...i, contact: byKey[normPhone(i.phone)] || null }));
    res.json({ success: true, data, pagination: { page, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/crm/calls/stats — call-center summary counters
router.get('/calls/stats', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const [sTotal, sToday, sCompleted, sFailed, agg, cTotal, cToday, cDone, cFailed] = await Promise.all([
      CallSession.countDocuments({ workspace: ws }),
      CallSession.countDocuments({ workspace: ws, createdAt: { $gte: dayStart } }),
      CallSession.countDocuments({ workspace: ws, status: 'completed' }),
      CallSession.countDocuments({ workspace: ws, status: { $in: ['failed', 'rejected', 'terminated'] } }),
      CallSession.aggregate([
        { $match: { workspace: ws, duration: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$duration' }, totalDur: { $sum: '$duration' } } },
      ]),
      ScheduledCall.countDocuments({ workspace: ws }),
      ScheduledCall.countDocuments({ workspace: ws, at: { $gte: dayStart } }),
      ScheduledCall.countDocuments({ workspace: ws, status: 'done' }),
      ScheduledCall.countDocuments({ workspace: ws, status: 'failed' }),
    ]);
    res.json({
      success: true,
      data: {
        total: sTotal + cTotal, today: sToday + cToday,
        completed: sCompleted + cDone, failed: sFailed + cFailed,
        avgDuration: Math.round(agg[0]?.avg || 0), totalDuration: agg[0]?.totalDur || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/crm/calls/:id — set disposition / note / follow-up on a call
router.patch('/calls/:id', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const set = {};
    if (req.body.disposition !== undefined) set.disposition = String(req.body.disposition).slice(0, 50);
    if (req.body.note !== undefined) set.note = String(req.body.note).slice(0, 1000);
    if (req.body.followUpAt !== undefined) set.followUpAt = req.body.followUpAt ? new Date(req.body.followUpAt) : null;
    const Model = req.query.source === 'scheduled' ? ScheduledCall : CallSession;
    const call = await Model.findOneAndUpdate({ _id: req.params.id, workspace: ws }, { $set: set }, { new: true }).lean();
    if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
    // mirror follow-up into contact notes so it shows in CRM follow-ups
    if (set.followUpAt) {
      const pk = normPhone(call.phone || (call.direction === 'USER_INITIATED' ? call.from : call.to));
      const contact = pk ? await Contact.findOne({ workspace: ws, phone: { $regex: pk + '$' } }).select('_id').lean() : null;
      if (contact) {
        await ContactNote.create({
          workspace: ws, contact: contact._id,
          text: set.note || `Call follow-up${set.disposition ? ` (${set.disposition})` : ''}`,
          remindAt: set.followUpAt, createdBy: req.user._id,
        });
      }
    }
    res.json({ success: true, data: call });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/crm/leads/ai-assist — AI reads each lead's chat and performs the
// user's instruction. dryRun (default) returns the proposed plan; apply writes
// it. On apply the client sends the previewed `plan` so what you see is exactly
// what is applied. Messages are only sent when allowSend is true.
router.post('/leads/ai-assist', async (req, res) => {
  try {
    const ws = req.workspace;
    const instruction = String(req.body.instruction || '').trim();
    if (!instruction) return res.status(400).json({ success: false, message: 'Instruction required' });
    const dryRun = req.body.dryRun !== false;
    const allowSend = req.body.allowSend === true;

    if (dryRun) {
      const plan = await aiAssist.buildPlan(ws, { instruction, contactIds: req.body.contactIds });
      return res.json({ success: true, data: { plan, applied: false, allowSend } });
    }

    // Apply: prefer the previewed plan the client sends (deterministic). Fall
    // back to building a fresh plan for older clients that don't send one.
    let plan = Array.isArray(req.body.plan) ? req.body.plan : null;
    if (!plan) plan = await aiAssist.buildPlan(ws, { instruction, contactIds: req.body.contactIds });
    const summary = await aiAssist.applyPlan(ws, {
      instruction, plan, allowSend, userId: req.user._id, io: req.app.get('io'), source: 'manual',
    });
    res.json({ success: true, data: { plan, applied: true, summary } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ---- AI Assist prompt history ----
router.get('/ai-assist/history', async (req, res) => {
  try {
    const ws = req.workspace._id;
    const runs = await AIAssistRun.find({ workspace: ws }).sort({ createdAt: -1 }).limit(100)
      .populate('createdBy', 'name email').lean();
    res.json({ success: true, data: runs });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ---- AI Assist schedules (auto-run a prompt on a schedule) ----
router.get('/ai-assist/schedules', async (req, res) => {
  try {
    const list = await AIAssistSchedule.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/ai-assist/schedules', async (req, res) => {
  try {
    const b = req.body || {};
    const instruction = String(b.instruction || '').trim();
    if (!instruction) return res.status(400).json({ success: false, message: 'Instruction required' });
    const sch = new AIAssistSchedule({
      workspace: req.workspace._id, createdBy: req.user._id,
      name: String(b.name || '').slice(0, 120), instruction,
      allowSend: b.allowSend === true,
      scope: b.scope === 'all' ? 'all' : 'recent',
      mode: b.mode === 'daily' ? 'daily' : 'interval',
      intervalMinutes: Math.max(1, parseInt(b.intervalMinutes, 10) || 1440),
      dailyTime: /^\d{1,2}:\d{2}$/.test(b.dailyTime || '') ? b.dailyTime : '09:00',
      active: b.active !== false,
    });
    sch.nextRunAt = sch.computeNextRun(new Date());
    await sch.save();
    res.json({ success: true, data: sch });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/ai-assist/schedules/:id', async (req, res) => {
  try {
    const sch = await AIAssistSchedule.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!sch) return res.status(404).json({ success: false, message: 'Schedule not found' });
    const b = req.body || {};
    if (b.name != null) sch.name = String(b.name).slice(0, 120);
    if (b.instruction != null && String(b.instruction).trim()) sch.instruction = String(b.instruction).trim();
    if (b.allowSend != null) sch.allowSend = b.allowSend === true;
    if (b.scope != null) sch.scope = b.scope === 'all' ? 'all' : 'recent';
    if (b.mode != null) sch.mode = b.mode === 'daily' ? 'daily' : 'interval';
    if (b.intervalMinutes != null) sch.intervalMinutes = Math.max(1, parseInt(b.intervalMinutes, 10) || 1440);
    if (b.dailyTime != null && /^\d{1,2}:\d{2}$/.test(b.dailyTime)) sch.dailyTime = b.dailyTime;
    if (b.active != null) sch.active = b.active === true;
    sch.nextRunAt = sch.active ? sch.computeNextRun(new Date()) : null;
    await sch.save();
    res.json({ success: true, data: sch });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.delete('/ai-assist/schedules/:id', async (req, res) => {
  try {
    await AIAssistSchedule.deleteOne({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Run a saved schedule immediately.
router.post('/ai-assist/schedules/:id/run', async (req, res) => {
  try {
    const sch = await AIAssistSchedule.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!sch) return res.status(404).json({ success: false, message: 'Schedule not found' });
    const ws = req.workspace;
    const plan = await aiAssist.buildPlan(ws, { instruction: sch.instruction, contactIds: null });
    const summary = await aiAssist.applyPlan(ws, {
      instruction: sch.instruction, plan, allowSend: sch.allowSend, userId: req.user._id,
      io: req.app.get('io'), source: 'schedule', scheduleId: sch._id,
    });
    sch.lastRunAt = new Date();
    sch.lastSummary = { leads: summary.leads, changed: summary.changed, sent: summary.sent };
    if (sch.active) sch.nextRunAt = sch.computeNextRun(new Date());
    await sch.save();
    res.json({ success: true, data: { summary } });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
});

module.exports = router;
