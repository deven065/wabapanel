const AutomationSettings = require("../models/AutomationSettings");
const Team = require("../models/Team");
const User = require("../models/User");

let lastAssignedIdx = {};

async function roundRobinAssign(workspaceId, conversationId) {
  try {
    const st = await AutomationSettings.findOne({ workspace: workspaceId });
    if (!st) return null;

    // Check roundRobin settings
    if (!st.roundRobin || !st.roundRobin.enabled) return null;

    const excludeIds = (st.roundRobin.excludeAgents || []).map(id => id.toString());

    // Get agents for this workspace
    const team = await Team.findOne({ workspace: workspaceId });
    let agentIds = [];
    if (team && team.members && team.members.length > 0) {
      agentIds = team.members.map(m => m.user?.toString() || m.toString());
    }
    if (agentIds.length === 0) {
      const agents = await User.find({ role: { $in: ["agent", "admin"] }, workspaces: workspaceId }).select("_id");
      agentIds = agents.map(a => a._id.toString());
    }

    // Remove excluded agents
    agentIds = agentIds.filter(id => !excludeIds.includes(id));
    if (agentIds.length === 0) return null;

    const wsKey = workspaceId.toString();
    const idx = (lastAssignedIdx[wsKey] || 0) % agentIds.length;
    lastAssignedIdx[wsKey] = idx + 1;

    const Conversation = require("../models").Conversation;
    await Conversation.findByIdAndUpdate(conversationId, { assignedAgent: agentIds[idx] });
    return agentIds[idx];
  } catch (e) {
    console.error("[ChatRouter]", e.message);
    return null;
  }
}

module.exports = { roundRobinAssign };
