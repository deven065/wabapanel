const Team = require('../models/Team');
const { checkPlanLimit } = require('../utils/planLimits');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find({ workspace: req.workspace._id })
      .populate('members', 'name email avatar')
      .populate('lead', 'name email');
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'teams', 'Team');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const team = await Team.create({ ...req.body, workspace: req.workspace._id });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateTeam = async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTeam = async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, workspace: req.workspace._id })
      .populate('members', 'name email avatar')
      .populate('lead', 'name email');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listAgents = async (req, res) => {
  try {
    // Only this workspace's people: current user, owner and members
    const ids = new Set();
    ids.add(String(req.user._id));
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) {
      if (m.user) ids.add(String(m.user));
    }
    // Legacy agents created before workspace linking existed: they belong to
    // no workspace at all, so surface them here for cleanup/re-creation.
    const candidates = await User.find({ role: { $in: ['agent', 'user'] }, status: 'active' }).select('_id');
    const candidateIds = candidates.map(c => c._id);
    if (candidateIds.length) {
      const Workspace = require('../models/Workspace');
      const linked = await Workspace.find({
        $or: [{ 'members.user': { $in: candidateIds } }, { owner: { $in: candidateIds } }],
      }).select('members.user owner');
      const linkedSet = new Set();
      for (const w of linked) {
        linkedSet.add(String(w.owner));
        for (const m of (w.members || [])) if (m.user) linkedSet.add(String(m.user));
      }
      for (const c of candidateIds) if (!linkedSet.has(String(c))) ids.add(String(c));
    }
    const users = await User.find({ _id: { $in: Array.from(ids) } }).select('name email avatar role permissions allowedChannels inboxScope');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addAgent = async (req, res) => {
  try {
    const agentMsg = await checkPlanLimit(req, 'agents', 'User', { role: { $in: ['agent', 'user'] }, status: 'active' });
    if (agentMsg) return res.status(403).json({ success: false, message: agentMsg });
    const { userId, teamId, name, email, password, role, permissions, allowedChannels, inboxScope } = req.body;

    // Create a new agent user when name/email/password provided
    if (!userId && email && password) {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ success: false, message: 'A user with this email already exists' });
      const user = await User.create({
        name, email: email.toLowerCase(), password,
        role: 'agent', // vendors can only create agents; platform admin role is never assignable here
        status: 'active',
        permissions: Array.isArray(permissions) ? permissions : [],
        allowedChannels: Array.isArray(allowedChannels) ? allowedChannels : [],
        inboxScope: inboxScope === 'assigned' ? 'assigned' : 'all',
        currentWorkspace: req.workspace._id,
      });
      // Add the agent as a workspace member so they log into this vendor's
      // workspace and see its WhatsApp number, templates, contacts etc.
      const Workspace = require('../models/Workspace');
      await Workspace.updateOne(
        { _id: req.workspace._id, 'members.user': { $ne: user._id } },
        { $push: { members: { user: user._id, role: 'agent' } } }
      );
      if (teamId) {
        const t = await Team.findOne({ _id: teamId, workspace: req.workspace._id });
        if (t && !t.members.includes(user._id)) { t.members.push(user._id); await t.save(); }
      }
      return res.status(201).json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    const team = await Team.findOne({ _id: teamId || req.params.id, workspace: req.workspace._id });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    if (!team.members.includes(userId)) {
      team.members.push(userId);
      await team.save();
    }

    const populated = await Team.findById(team._id)
      .populate('members', 'name email avatar');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const removeAgent = async (req, res) => {
  try {
    const { teamId } = req.query;
    if (teamId || req.params.teamId) {
      const team = await Team.findOne({ _id: teamId || req.params.teamId, workspace: req.workspace._id });
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
      team.members = team.members.filter(m => m.toString() !== req.params.id);
      await team.save();
      return res.json({ success: true, message: 'Agent removed from team' });
    }

    // No team specified: delete the agent account itself.
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Agent not found' });
    if (!['agent', 'user'].includes(target.role) || String(req.workspace.owner) === String(target._id)) {
      return res.status(403).json({ success: false, message: 'Only agent accounts can be deleted here' });
    }
    await Team.updateMany({ workspace: req.workspace._id }, { $pull: { members: target._id } });
    await User.findByIdAndDelete(target._id);
    res.json({ success: true, message: 'Agent deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/teams/agents/:id/login-as — vendor logs into an agent's account
const loginAsAgent = async (req, res) => {
  try {
    if (req.user.role === 'agent') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    const target = await User.findOne({ _id: req.params.id, role: { $in: ['agent', 'user'] } });
    if (!target) return res.status(404).json({ success: false, message: 'Agent not found' });
    const token = jwt.sign({ id: target._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
    target.lastLogin = new Date();
    await target.save();
    const userData = target.toObject();
    delete userData.password;
    res.json({ success: true, data: { token, user: userData } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    await Team.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/teams/performance — per-agent stats (last 30 days)
const agentPerformance = async (req, res) => {
  try {
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ws = req.workspace._id;

    // Scope agents to THIS workspace only (same logic as listAgents), so one
    // vendor's performance table never shows another vendor's agents.
    const ids = new Set();
    ids.add(String(req.user._id));
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) {
      if (m.user) ids.add(String(m.user));
    }
    const candidates = await User.find({ role: { $in: ['agent', 'user'] }, status: 'active' }).select('_id');
    const candidateIds = candidates.map(c => c._id);
    if (candidateIds.length) {
      const Workspace = require('../models/Workspace');
      const linked = await Workspace.find({
        $or: [{ 'members.user': { $in: candidateIds } }, { owner: { $in: candidateIds } }],
      }).select('members.user owner');
      const linkedSet = new Set();
      for (const w of linked) {
        linkedSet.add(String(w.owner));
        for (const m of (w.members || [])) if (m.user) linkedSet.add(String(m.user));
      }
      for (const c of candidateIds) if (!linkedSet.has(String(c))) ids.add(String(c));
    }
    const agents = await User.find({ _id: { $in: Array.from(ids) }, status: 'active' }).select('name email avatar role').lean();

    const [assigned, resolved, sent, responseAgg] = await Promise.all([
      Conversation.aggregate([
        { $match: { workspace: ws, assignedAgent: { $ne: null } } },
        { $group: { _id: '$assignedAgent', count: { $sum: 1 } } },
      ]),
      Conversation.aggregate([
        { $match: { workspace: ws, isResolved: true, resolvedBy: { $ne: null }, resolvedAt: { $gte: since } } },
        { $group: { _id: '$resolvedBy', count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { workspace: ws, direction: 'outbound', sentBy: { $ne: null }, createdAt: { $gte: since } } },
        { $group: { _id: '$sentBy', count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { workspace: ws, createdAt: { $gte: since } } },
        { $sort: { conversation: 1, createdAt: 1 } },
        { $project: { conversation: 1, direction: 1, createdAt: 1, sentBy: 1 } },
      ]),
    ]);

    // avg response time per agent: inbound followed by that agent's outbound
    const respTotals = {};
    let lastInbound = {};
    for (const m of responseAgg) {
      const convId = String(m.conversation);
      if (m.direction === 'inbound') {
        lastInbound[convId] = new Date(m.createdAt).getTime();
      } else if (m.sentBy && lastInbound[convId]) {
        const key = String(m.sentBy);
        const diff = new Date(m.createdAt).getTime() - lastInbound[convId];
        if (diff > 0 && diff < 24 * 36e5) {
          if (!respTotals[key]) respTotals[key] = { sum: 0, n: 0 };
          respTotals[key].sum += diff; respTotals[key].n += 1;
        }
        delete lastInbound[convId];
      }
    }

    const toMap = (arr) => Object.fromEntries(arr.map(a => [String(a._id), a.count]));
    const assignedMap = toMap(assigned), resolvedMap = toMap(resolved), sentMap = toMap(sent);

    res.json({
      success: true,
      data: agents.map(a => {
        const id = String(a._id);
        const rt = respTotals[id];
        return {
          ...a,
          assignedChats: assignedMap[id] || 0,
          resolvedChats: resolvedMap[id] || 0,
          messagesSent: sentMap[id] || 0,
          avgResponseMins: rt ? Math.round(rt.sum / rt.n / 60000 * 10) / 10 : null,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  agentPerformance,
  getTeams, getTeam, createTeam, updateTeam, deleteTeam,
  listAgents, addAgent, removeAgent, updateAgent, loginAsAgent,
};

// @PUT /api/teams/agents/:id — update an agent's role and module permissions
async function updateAgent(req, res) {
  try {
    const { role, permissions, allowedChannels, inboxScope } = req.body;
    const update = {};
    if (Array.isArray(permissions)) update.permissions = permissions;
    if (Array.isArray(allowedChannels)) update.allowedChannels = allowedChannels;
    if (inboxScope === 'all' || inboxScope === 'assigned') update.inboxScope = inboxScope;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ['agent', 'admin', 'user'] } },
      update, { new: true }
    ).select('name email role permissions allowedChannels inboxScope');
    if (!user) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
