// Executes stored automation actions for Predefined Actions and Event Triggers.
const mongoose = require('mongoose');
const WhatsAppService = require('./whatsappService');

// 24h per contact+rule dedupe so on_message rules don't spam on every message
const recentRuns = new Map();
const DEDUPE_MS = 24 * 60 * 60 * 1000;
function isDuplicate(key) {
  const now = Date.now();
  const t = recentRuns.get(key);
  if (t && now - t < DEDUPE_MS) return true;
  recentRuns.set(key, now);
  if (recentRuns.size > 10000) {
    for (const [k, v] of recentRuns) { if (now - v > DEDUPE_MS) recentRuns.delete(k); }
  }
  return false;
}

async function getWorkspace(workspace) {
  if (workspace && workspace.whatsapp) return workspace;
  const Workspace = require('../models/Workspace');
  return Workspace.findById(workspace._id || workspace);
}

async function findOrCreateConversation(workspace, contact) {
  const Conversation = require('../models/Conversation');
  let conv = await Conversation.findOne({ workspace: workspace._id, contact: contact._id, channel: 'whatsapp' });
  if (!conv) conv = await Conversation.create({ workspace: workspace._id, contact: contact._id, channel: 'whatsapp' });
  return conv;
}

async function sendText(workspace, contact, conversation, text, io, source) {
  const Message = require('../models/Message');
  const Conversation = require('../models/Conversation');
  const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
  const result = await wa.sendTextMessage(contact.phone, text);
  try {
    const msg = await Message.create({
      workspace: workspace._id,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type: 'text',
      text,
      waMessageId: result?.data?.messages?.[0]?.id || '',
      status: result?.success === false ? 'failed' : 'sent',
      errorMessage: result?.error?.message || '',
      metadata: { source },
    });
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: 'text' },
    });
    if (io) io.to('workspace:' + workspace._id).emit('new_message', { message: msg, conversationId: conversation._id });
  } catch (e) { console.error('[ActionRunner] message log failed:', e.message); }
  return result;
}

async function addOrRemoveTag(workspace, contact, tagName, remove) {
  const Tag = require('../models/Tag');
  const Contact = require('../models/Contact');
  const name = String(tagName || '').trim();
  if (!name) return;
  let tag = await Tag.findOne({ workspace: workspace._id, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (!tag && !remove) tag = await Tag.create({ workspace: workspace._id, name });
  if (!tag) return;
  const op = remove ? { $pull: { tags: tag._id } } : { $addToSet: { tags: tag._id } };
  await Contact.findByIdAndUpdate(contact._id, op);
}

async function assignAgent(workspace, conversation, value) {
  const User = require('../models/User');
  const Conversation = require('../models/Conversation');
  const v = String(value || '').trim();
  if (!v || !conversation) return;
  const query = mongoose.isValidObjectId(v)
    ? { _id: v }
    : { $or: [{ email: v.toLowerCase() }, { name: { $regex: `^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }] };
  const user = await User.findOne(query).select('_id');
  if (user) await Conversation.findByIdAndUpdate(conversation._id, { assignedAgent: user._id });
}

// Execute one action. { type, value } — value is message text, template name, tag name or agent.
async function execOne(action, ctx) {
  const { workspace, contact, io, source } = ctx;
  let { conversation } = ctx;
  const type = action.type;
  const value = action.value !== undefined ? action.value : (action.config && (action.config.value || action.config.text || action.config.name)) || '';
  switch (type) {
    case 'send_message': {
      if (!value || !contact?.phone) return;
      if (!conversation) conversation = await findOrCreateConversation(workspace, contact);
      await sendText(workspace, contact, conversation, value, io, source);
      break;
    }
    case 'send_template': {
      if (!value || !contact?.phone) return;
      const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
      await wa.sendTemplateMessage(contact.phone, value, action.language || 'en', []);
      break;
    }
    case 'add_tag':
    case 'add_to_segment':
    case 'add_segment':
      if (contact) await addOrRemoveTag(workspace, contact, value, false);
      break;
    case 'remove_tag':
      if (contact) await addOrRemoveTag(workspace, contact, value, true);
      break;
    case 'assign_agent': {
      if (!conversation && contact) conversation = await findOrCreateConversation(workspace, contact);
      await assignAgent(workspace, conversation, value);
      break;
    }
    default:
      console.log('[ActionRunner] unsupported action type:', type);
  }
}

async function execActions(actions, ctx) {
  for (const action of actions || []) {
    const delayS = Math.min(Number(action.delay) || 0, 3600);
    if (delayS > 0) await new Promise((r) => setTimeout(r, delayS * 1000));
    try { await execOne(action, ctx); }
    catch (e) { console.error('[ActionRunner] action failed:', action.type, e.message); }
  }
}

// Predefined Actions — trigger: on_message | on_subscribe | on_order | on_payment | manual
async function runPredefined(trigger, ctx) {
  const PredefinedAction = require('../models/PredefinedAction');
  const workspace = await getWorkspace(ctx.workspace);
  if (!workspace) return;
  const rules = await PredefinedAction.find({ workspace: workspace._id, trigger, isActive: true });
  for (const rule of rules) {
    if (trigger === 'on_message' && ctx.contact && isDuplicate(`pa:${rule._id}:${ctx.contact._id}`)) continue;
    await execActions(rule.actions, { ...ctx, workspace, source: 'predefined_action' });
    PredefinedAction.updateOne({ _id: rule._id }, { $inc: { executionCount: 1 } }).catch(() => {});
    console.log('[ActionRunner] predefined action executed:', rule.name, 'trigger:', trigger);
  }
}

async function runPredefinedById(id, ctx) {
  const PredefinedAction = require('../models/PredefinedAction');
  const workspace = await getWorkspace(ctx.workspace);
  const rule = await PredefinedAction.findOne({ _id: id, workspace: workspace._id });
  if (!rule) throw new Error('Action not found');
  await execActions(rule.actions, { ...ctx, workspace, source: 'predefined_action' });
  await PredefinedAction.updateOne({ _id: rule._id }, { $inc: { executionCount: 1 } });
  return rule;
}

// Event Triggers — eventName: message_received | contact_created | order_placed | payment_received
async function fireEvent(workspaceRef, eventName, ctx = {}) {
  const Event = require('../models/Event');
  const workspace = await getWorkspace(workspaceRef);
  if (!workspace) return;
  const events = await Event.find({ workspace: workspace._id, status: 'active', 'triggerConfig.eventName': eventName });
  for (const ev of events) {
    if (eventName === 'message_received' && ctx.contact && isDuplicate(`ev:${ev._id}:${ctx.contact._id}`)) continue;
    await execActions(ev.actions, { ...ctx, workspace, source: 'event_trigger' });
    Event.updateOne({ _id: ev._id }, { $inc: { 'stats.triggered': 1 }, $set: { 'stats.lastTriggeredAt': new Date() } }).catch(() => {});
    console.log('[ActionRunner] event executed:', ev.name, 'on:', eventName);
  }
}

async function runEventById(event, ctx = {}) {
  const Event = require('../models/Event');
  const workspace = await getWorkspace(event.workspace);
  if (!workspace) throw new Error('Workspace not found');
  await execActions(event.actions, { ...ctx, workspace, source: 'event_trigger' });
  await Event.updateOne({ _id: event._id }, { $inc: { 'stats.triggered': 1 }, $set: { 'stats.lastTriggeredAt': new Date() } });
}

module.exports = { runPredefined, runPredefinedById, fireEvent, runEventById, execActions };
