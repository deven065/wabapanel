const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');

// @GET /api/dashboard (Client Dashboard)
const getClientDashboard = async (req, res) => {
  try {
    const workspaceId = req.workspace._id;
    const now = new Date();
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const thirtyDaysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalContacts,
      totalConversations,
      activeConversations,
      messageStats,
      recentMessages,
      recentConversations,
    ] = await Promise.all([
      Contact.countDocuments({ workspace: workspaceId }),
      Conversation.countDocuments({ workspace: workspaceId }),
      Conversation.countDocuments({ workspace: workspaceId, status: 'active' }),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
        }},
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          received: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      Conversation.find({ workspace: workspaceId })
        .populate('contact', 'name phone')
        .populate('lastMessage', 'text')
        .sort('-updatedAt')
        .limit(5)
        .lean(),
    ]);

    const stats = {};
    messageStats.forEach(s => { stats[s._id] = s.count; });

    const Template = require('../models/Template');
    const PresetMessage = require('../models/PresetMessage');
    const CallSession = require('../models/CallSession');
    const Appointment = require('../models/Appointment');
    const Order = require('../models/Order');
    const Keyword = require('../models/Keyword');
    const WalletTransaction = require('../models/WalletTransaction');

    const [
      campaignAgg, templateAgg, presetCount, callAgg, apptTotal, apptUpcoming,
      orderAgg, keywordCount, unreadAgg, newContacts, contactChart, spendAgg,
      todayMsgAgg, campaignRecent, callChart,
    ] = await Promise.all([
      Campaign.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: '$status', count: { $sum: 1 }, sent: { $sum: { $ifNull: ['$stats.sent', 0] } } } },
      ]),
      Template.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PresetMessage.countDocuments({ workspace: workspaceId }),
      CallSession.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: null, total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'rejected']] }, 1, 0] } },
          seconds: { $sum: { $ifNull: ['$duration', 0] } } } },
      ]),
      Appointment.countDocuments({ workspace: workspaceId }),
      Appointment.countDocuments({ workspace: workspaceId, date: { $gte: todayStart }, status: { $nin: ['cancelled'] } }),
      Order.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: null, total: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'refunded']] }, 0, { $ifNull: ['$totalAmount', 0] }] } } } },
      ]),
      Keyword.countDocuments({ workspace: workspaceId }),
      Conversation.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: null, unread: { $sum: { $ifNull: ['$unreadCount', 0] } } } },
      ]),
      Contact.countDocuments({ workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } }),
      Contact.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      WalletTransaction.aggregate([
        { $match: { user: req.user._id, type: 'debit', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: todayStart } } },
        { $group: { _id: '$direction', count: { $sum: 1 } } },
      ]),
      Campaign.find({ workspace: workspaceId }).select('name type status stats createdAt').sort('-createdAt').limit(5).lean(),
      CallSession.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, seconds: { $sum: { $ifNull: ['$duration', 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const campaignStats = { total: 0, running: 0, scheduled: 0, completed: 0, draft: 0, paused: 0, failed: 0, sentTotal: 0 };
    campaignAgg.forEach(c => { campaignStats.total += c.count; campaignStats.sentTotal += c.sent || 0; if (campaignStats[c._id] !== undefined) campaignStats[c._id] = c.count; });
    const templateStats = { total: 0, approved: 0, pending: 0, rejected: 0 };
    templateAgg.forEach(t => { templateStats.total += t.count; if (templateStats[t._id] !== undefined) templateStats[t._id] = t.count; });
    const calls = callAgg[0] || { total: 0, completed: 0, failed: 0, seconds: 0 };
    const [hourlyAgg, weekdayAgg, topCustomersAgg, campaignTable, typeAgg, respMsgs] = await Promise.all([
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%H', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%u', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$contact', total: { $sum: 1 },
          inbound: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
          outbound: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          lastAt: { $max: '$createdAt' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'contacts', localField: '_id', foreignField: '_id', as: 'contact' } },
        { $unwind: { path: '$contact', preserveNullAndEmptyArrays: true } },
        { $project: { total: 1, inbound: 1, outbound: 1, lastAt: 1, name: '$contact.name', phone: '$contact.phone' } },
      ]),
      Campaign.find({ workspace: workspaceId }).select('name type status stats createdAt').sort('-createdAt').limit(100).lean(),
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'outbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $ifNull: ['$metadata.source', { $cond: [{ $eq: ['$type', 'template'] }, 'template', 'manual'] }] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Message.find({ workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } })
        .select('conversation direction createdAt').sort('createdAt').limit(3000).lean(),
    ]);

    // Average response time: inbound followed by next outbound in same conversation
    const lastInbound = new Map();
    const respDiffs = [];
    for (const msg of respMsgs) {
      const key = String(msg.conversation);
      if (msg.direction === 'inbound') {
        lastInbound.set(key, msg.createdAt);
      } else if (lastInbound.has(key)) {
        const diff = (new Date(msg.createdAt) - new Date(lastInbound.get(key))) / 60000;
        if (diff >= 0 && diff <= 24 * 60) respDiffs.push(diff);
        lastInbound.delete(key);
      }
    }
    respDiffs.sort((a, b) => a - b);
    const avgResponseMin = respDiffs.length ? respDiffs.reduce((a, b) => a + b, 0) / respDiffs.length : 0;
    const medianResponseMin = respDiffs.length ? respDiffs[Math.floor(respDiffs.length / 2)] : 0;


    const ContactNote = require('../models/ContactNote');
    const BotFlow = require('../models/BotFlow');
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const [todayAppointments, dueReminders, resolvedCount, botFlowsActive] = await Promise.all([
      Appointment.find({ workspace: workspaceId, date: { $gte: todayStart, $lt: todayEnd }, status: { $nin: ['cancelled'] }, archived: { $ne: true } })
        .select('title contactName contactPhone startTime status').sort('startTime').limit(6).lean(),
      ContactNote.find({ workspace: workspaceId, remindAt: { $lte: todayEnd }, contacted: { $ne: true } })
        .populate('contact', 'name phone').select('text remindAt contact').sort('remindAt').limit(6).lean(),
      Conversation.countDocuments({ workspace: workspaceId, status: 'closed' }),
      BotFlow.countDocuments({ workspace: workspaceId, isActive: true }),
    ]);

    const todayMsgs = { sent: 0, received: 0 };
    todayMsgAgg.forEach(m => { if (m._id === 'outbound') todayMsgs.sent = m.count; if (m._id === 'inbound') todayMsgs.received = m.count; });

    res.json({
      success: true,
      data: {
        contacts: totalContacts,
        conversations: {
          total: totalConversations,
          active: activeConversations,
        },
        messages: {
          sent: stats.sent || 0,
          delivered: stats.delivered || 0,
          read: stats.read || 0,
          failed: stats.failed || 0,
          total: Object.values(stats).reduce((a, b) => a + b, 0),
        },
        messageChart: recentMessages,
        recentConversations,
        walletBalance: req.user.walletBalance || 0,
        rateCard: await (async () => {
          try {
            if (req.user.walletBillingExempt || req.user.showRateCard === false) return null;
            const rates = await require('../services/walletBilling').getRates();
            if (!rates) return null;
            const custom = req.user.walletTemplateRates || {};
            return {
              marketing: custom.marketing != null ? custom.marketing : rates.marketing,
              utility: custom.utility != null ? custom.utility : rates.utility,
              authentication: custom.authentication != null ? custom.authentication : rates.authentication,
              service: 0,
            };
          } catch { return null; }
        })(),
        whatsappConnected: req.workspace.whatsapp?.isConnected || false,
        plan: req.user.plan,
        campaigns: campaignStats,
        recentCampaigns: campaignRecent,
        templates: templateStats,
        presets: presetCount,
        aiCalls: { total: calls.total, completed: calls.completed, failed: calls.failed, minutes: Math.round((calls.seconds || 0) / 60) },
        callChart,
        appointments: { total: apptTotal, upcoming: apptUpcoming },
        orders: { total: orderAgg[0]?.total || 0, revenue: orderAgg[0]?.revenue || 0 },
        keywords: keywordCount,
        unreadCount: unreadAgg[0]?.unread || 0,
        newContacts,
        contactChart,
        spend: spendAgg[0]?.total || 0,
        today: todayMsgs,
        rangeDays: days,
        hourlyActivity: hourlyAgg.map(h => ({ hour: parseInt(h._id, 10), count: h.count })),
        weekdayActivity: weekdayAgg.map(w => ({ day: parseInt(w._id, 10), count: w.count })),
        topCustomers: topCustomersAgg,
        campaignTable,
        typeBreakdown: typeAgg.map(t => ({ source: t._id || 'manual', count: t.count })),
        responseTime: { avgMinutes: Math.round(avgResponseMin * 10) / 10, medianMinutes: Math.round(medianResponseMin * 10) / 10, samples: respDiffs.length },
        todayAppointments,
        dueReminders,
        resolvedCount,
        botFlowsActive,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/admin/dashboard (Admin Dashboard)
// @GET /api/admin/dashboard (Admin Dashboard)
const getAdminDashboard = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [
      totalUsers,
      activeUsers,
      totalPlans,
      totalRevenue,
      recentSignups,
      subscriptionStats,
      paymentStats,
      platformStats,
      todaySignups,
      expiringSoon,
      expiredUsers,
      recentPayments,
      todayRevenue,
      userGrowthChart,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'super_admin' } }),
      User.countDocuments({ role: { $ne: 'super_admin' }, status: 'active' }),
      Plan.countDocuments({ status: 'active' }),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      User.find({ role: { $ne: 'super_admin' } })
        .select('name email plan status createdAt lastLogin planExpiry')
        .populate('plan', 'name')
        .sort('-createdAt')
        .limit(10),
      User.aggregate([
        { $match: { plan: { $exists: true, $ne: null } } },
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        }},
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
      (async () => {
        const Workspace = require('../models/Workspace');
        const Message = require('../models/Message');
        const Campaign = require('../models/Campaign');
        const CallSession = require('../models/CallSession');
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const todayMsgs = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [workspaces, msgSent30, msgRecv30, campaigns, aiCalls30, walletAgg, msgToday] = await Promise.all([
          Workspace.countDocuments({}),
          Message.countDocuments({ direction: 'outbound', createdAt: { $gte: since } }),
          Message.countDocuments({ direction: 'inbound', createdAt: { $gte: since } }),
          Campaign.countDocuments({}),
          CallSession.countDocuments({ createdAt: { $gte: since } }),
          User.aggregate([{ $group: { _id: null, total: { $sum: '$walletBalance' } } }]),
          Message.countDocuments({ createdAt: { $gte: todayMsgs } }),
        ]);
        return { workspaces, msgSent30, msgRecv30, campaigns, aiCalls30, walletTotal: walletAgg[0]?.total || 0, msgToday };
      })(),
      User.countDocuments({ role: { $ne: 'super_admin' }, createdAt: { $gte: todayStart } }),
      User.find({ role: { $ne: 'super_admin' }, status: 'active', planExpiry: { $gte: now, $lte: sevenDaysFromNow } })
        .select('name email plan planExpiry')
        .populate('plan', 'name')
        .sort('planExpiry')
        .limit(10)
        .lean(),
      User.countDocuments({ role: { $ne: 'super_admin' }, planExpiry: { $lt: now } }),
      Payment.find({ status: 'completed' })
        .select('user amount description createdAt')
        .populate('user', 'name email')
        .sort('-createdAt')
        .limit(8)
        .lean(),
      Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { role: { $ne: 'super_admin' }, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const SupportTicket = require('../models/SupportTicket');
    const Inquiry = require('../models/Inquiry');
    const [pendingManualPayments, openTickets, newInquiries] = await Promise.all([
      Payment.countDocuments({ gateway: 'manual', status: 'pending' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'awaiting_reply'] } }),
      Inquiry.countDocuments({ status: 'new' }),
    ]);

    // Plan name lookup for subscription stats
    const planIds = subscriptionStats.map(s => s._id);
    const planDocs = await Plan.find({ _id: { $in: planIds } }).select('name').lean();
    const planMap = {};
    planDocs.forEach(p => { planMap[String(p._id)] = p.name; });
    const subsWithNames = subscriptionStats.map(s => ({ ...s, planName: planMap[String(s._id)] || 'Unknown' }));

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers },
        plans: totalPlans,
        revenue: totalRevenue[0]?.total || 0,
        recentSignups,
        subscriptionStats: subsWithNames,
        paymentStats,
        platform: platformStats,
        todaySignups,
        expiringSoon,
        expiredUsers,
        recentPayments,
        todayRevenue: { total: todayRevenue[0]?.total || 0, count: todayRevenue[0]?.count || 0 },
        userGrowthChart,
        pendingActions: { manualPayments: pendingManualPayments, openTickets, newInquiries },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClientDashboard, getAdminDashboard };
