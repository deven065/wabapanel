const mongoose = require('mongoose');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ContactNote = require('../models/ContactNote');
const Tag = require('../models/Tag');
const Stage = require('../models/Stage');
const User = require('../models/User');
const AISettings = require('../models/AISettings');
const AIAssistRun = require('../models/AIAssistRun');
const WhatsAppService = require('./whatsappService');
const aiService = require('./aiService');
const { resolveAiCreds } = require('./aiResolver');

const MAX = 200;
const RECENT_LIMIT = 60;

// People who can be assigned as an agent in this workspace.
async function workspaceAgents(ws) {
  const ids = new Set();
  if (ws.owner) ids.add(String(ws.owner));
  for (const m of (ws.members || [])) if (m.user) ids.add(String(m.user));
  const users = await User.find({ _id: { $in: Array.from(ids) } }).select('name email').lean();
  return users.map((u) => ({ _id: String(u._id), name: u.name || u.email, email: u.email || '' }));
}

// Build the proposed plan (runs the AI). Returns an array of per-lead actions.
async function buildPlan(ws, { instruction, contactIds }) {
  const wsId = ws._id;
  const toObjId = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; } };

  let ids = Array.isArray(contactIds) ? contactIds.map(toObjId).filter(Boolean).slice(0, MAX) : [];
  if (!ids.length) {
    const conv = await Conversation.aggregate([
      { $match: { workspace: wsId, contact: { $ne: null } } },
      { $sort: { 'lastMessage.timestamp': -1 } },
      { $group: { _id: '$contact' } },
      { $limit: RECENT_LIMIT },
    ]);
    ids = conv.map((c) => c._id);
  }
  const contacts = await Contact.find({ _id: { $in: ids }, workspace: wsId })
    .select('name phone tags crmComment stage crmValue crmItems')
    .populate('tags', 'name').populate('stage', 'name').lean();
  if (!contacts.length) return [];

  const ai = await AISettings.findOne({ workspace: wsId }).lean();
  const creds = await resolveAiCreds(ws, ai);
  if (!creds || !creds.apiKey) { const e = new Error('AI is not configured for this workspace. Set it up in AI Settings.'); e.statusCode = 400; throw e; }
  const opts = {
    model: creds.azureDeployment || creds.model,
    azureEndpoint: creds.azureEndpoint, azureDeployment: creds.azureDeployment,
    azureApiVersion: creds.azureApiVersion, temperature: 0.2, maxTokens: 2500,
    extra: { response_format: { type: 'json_object' } },
  };

  const [stages, agents, labels] = await Promise.all([
    Stage.find({ workspace: wsId }).select('name').lean(),
    workspaceAgents(ws),
    Tag.find({ workspace: wsId }).select('name').lean(),
  ]);
  const stageNames = stages.map((s) => s.name);
  const agentNames = agents.map((a) => a.name);
  const labelNames = labels.map((l) => l.name);

  const leads = [];
  for (const ct of contacts) {
    const cv = await Conversation.findOne({ workspace: wsId, contact: ct._id })
      .sort({ 'lastMessage.timestamp': -1 }).select('_id').lean();
    let transcript = '';
    if (cv) {
      const msgs = await Message.find({ conversation: cv._id }).sort({ createdAt: -1 }).limit(14)
        .select('direction text body type').lean();
      msgs.reverse();
      transcript = msgs.map((m) => {
        const who = m.direction === 'outbound' ? 'Business' : 'Customer';
        let t = (m.text || m.body || '').replace(/\s+/g, ' ').trim();
        if (!t && m.type) t = `[${m.type}]`;
        return `${who}: ${t}`.slice(0, 220);
      }).join('\n');
    }
    leads.push({
      contactId: String(ct._id), convId: cv ? String(cv._id) : null,
      name: ct.name || '', phone: ct.phone || '',
      tags: (ct.tags || []).map((t) => t.name),
      stage: ct.stage ? ct.stage.name : null,
      transcript,
    });
  }

  const sys = `You are a sales-CRM assistant for a WhatsApp business panel. Follow the USER INSTRUCTION and decide, per lead, what to do based on its chat transcript, current labels and current stage.
Return STRICT JSON: {"results":[{"i":<lead index>,"tags_add":[<label names>],"tags_remove":[<label names>],"stage":<stage name or null>,"value":<deal value number or null>,"items":<item count number or null>,"agent":<agent name or null>,"comment":<string or null>,"followup_days":<integer or null>,"followup_text":<string or null>,"close_reason":<"won"|"lost"|"not_interested"|"spam" or null>,"message":<string to send to the lead, or null>,"reason":<max 12 words>}]}
Available stages (pick exactly one name or null): ${stageNames.join(' | ') || 'none'}
Available labels/products: ${labelNames.join(' | ') || 'none'}
Available agents (pick exactly one name or null): ${agentNames.join(' | ') || 'none'}
Rules: only include actions the instruction asks for; leave every other field null/empty. "stage" must be one of the available stages or null. "agent" must be one of the available agents or null. Use existing label names when they fit; only create a new label name if the instruction clearly wants a new one. "message" must be a full ready-to-send WhatsApp text; null if the instruction does not ask to message. "Business" = our messages, "Customer" = the lead.`;

  const results = [];
  const BATCH = 6;
  for (let i = 0; i < leads.length; i += BATCH) {
    const chunk = leads.slice(i, i + BATCH);
    const user = `USER INSTRUCTION:\n${instruction}\n\nLEADS:\n` + chunk.map((l, idx) =>
      `--- Lead #${idx} (name: ${l.name || 'NA'}; current labels: ${l.tags.join(', ') || 'none'}; current stage: ${l.stage || 'none'}) ---\n${l.transcript || '(no messages)'}`).join('\n\n');
    let parsed = null;
    for (let a = 0; a < 3 && !parsed; a++) {
      try {
        const r = await aiService.chat(creds.provider, creds.apiKey, [
          { role: 'system', content: sys }, { role: 'user', content: user },
        ], opts);
        parsed = JSON.parse(r.content);
      } catch (e) { if (a === 2) throw e; await new Promise((rr) => setTimeout(rr, 1500)); }
    }
    const byIdx = {};
    for (const it of (parsed.results || [])) { if (typeof it.i === 'number') byIdx[it.i] = it; }
    chunk.forEach((l, idx) => {
      const it = byIdx[idx] || {};
      const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (v != null && !isNaN(Number(v)) ? Number(v) : null));
      results.push({
        contactId: l.contactId, convId: l.convId, name: l.name, phone: l.phone,
        currentTags: l.tags, currentStage: l.stage,
        tags_add: Array.isArray(it.tags_add) ? it.tags_add.filter(Boolean) : [],
        tags_remove: Array.isArray(it.tags_remove) ? it.tags_remove.filter(Boolean) : [],
        stage: it.stage ? String(it.stage) : null,
        value: num(it.value),
        items: num(it.items),
        agent: it.agent ? String(it.agent) : null,
        comment: it.comment || null,
        followup_days: Number.isInteger(it.followup_days) ? it.followup_days : null,
        followup_text: it.followup_text || null,
        close_reason: ['won', 'lost', 'not_interested', 'spam'].includes(it.close_reason) ? it.close_reason : null,
        message: it.message ? String(it.message) : null,
        reason: it.reason || '',
      });
    });
  }
  return results;
}

// Apply a plan (from preview or freshly built). Deterministic: uses the exact plan given.
async function applyPlan(ws, { instruction, plan, allowSend, userId, io, source = 'manual', scheduleId = null }) {
  const wsId = ws._id;
  const results = Array.isArray(plan) ? plan : [];

  const upsertTag = async (name) => Tag.findOneAndUpdate(
    { workspace: wsId, name: String(name).trim().slice(0, 60) },
    { $setOnInsert: { workspace: wsId, name: String(name).trim().slice(0, 60), color: '#6366F1' } },
    { new: true, upsert: true });
  const findOrCreateStage = async (name) => {
    const clean = String(name).trim().slice(0, 60);
    let s = await Stage.findOne({ workspace: wsId, name: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).select('_id');
    if (!s) s = await Stage.create({ workspace: wsId, name: clean });
    return s;
  };

  const agents = await workspaceAgents(ws);
  const findAgent = (name) => {
    const q = String(name).trim().toLowerCase();
    return agents.find((a) => (a.name || '').toLowerCase() === q || (a.email || '').toLowerCase() === q) || null;
  };

  let sent = 0, sendFailed = 0, changed = 0;
  const wa = (ws.whatsapp && ws.whatsapp.accessToken && ws.whatsapp.phoneNumberId)
    ? new WhatsAppService(ws.whatsapp.accessToken, ws.whatsapp.phoneNumberId) : null;

  for (const r of results) {
    const contact = await Contact.findOne({ _id: r.contactId, workspace: wsId }).select('tags crmComment stage crmValue crmItems');
    if (!contact) continue;
    let touched = false;

    if ((r.tags_add && r.tags_add.length) || (r.tags_remove && r.tags_remove.length)) {
      const addIds = [];
      for (const n of (r.tags_add || [])) { const t = await upsertTag(n); addIds.push(String(t._id)); }
      const removeTags = (r.tags_remove && r.tags_remove.length)
        ? await Tag.find({ workspace: wsId, name: { $in: r.tags_remove.map((n) => new RegExp('^' + String(n).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')) } }).select('_id').lean()
        : [];
      const removeIds = new Set(removeTags.map((t) => String(t._id)));
      let next = (contact.tags || []).map(String).filter((id) => !removeIds.has(id));
      for (const id of addIds) if (!next.includes(id)) next.push(id);
      contact.tags = next;
      touched = true;
    }
    if (r.stage) { const s = await findOrCreateStage(r.stage); contact.stage = s._id; touched = true; }
    if (r.value != null) { contact.crmValue = r.value; touched = true; }
    if (r.items != null) { contact.crmItems = r.items; touched = true; }
    if (r.comment) { contact.crmComment = String(r.comment).slice(0, 1000); touched = true; }
    if (touched) { await contact.save(); changed++; }

    // agent -> assign the lead's conversation (matches manual assign)
    if (r.agent) {
      const a = findAgent(r.agent);
      if (a && r.convId) await Conversation.updateOne({ _id: r.convId, workspace: wsId }, { $set: { assignedAgent: a._id } });
    }

    if (r.followup_days != null && userId) {
      const remindAt = new Date(Date.now() + r.followup_days * 864e5);
      await ContactNote.create({
        workspace: wsId, contact: r.contactId,
        text: (r.followup_text || `AI follow-up: ${r.reason || instruction}`).slice(0, 500),
        remindAt, createdBy: userId,
      });
    }
    if (r.close_reason) {
      await Contact.updateOne({ _id: r.contactId, workspace: wsId },
        { $set: { leadClosed: true, leadClosedAt: new Date(), leadCloseReason: r.close_reason } });
    }
    if (allowSend && r.message && wa && r.phone) {
      try {
        const result = await wa.sendTextMessage(r.phone, r.message);
        const ok = result && result.success !== false;
        if (ok) sent++; else sendFailed++;
        if (r.convId) {
          const msg = await Message.create({
            workspace: wsId, conversation: r.convId, contact: r.contactId,
            direction: 'outbound', type: 'text', text: r.message,
            waMessageId: (result && result.data && result.data.messages && result.data.messages[0] && result.data.messages[0].id) || '',
            status: ok ? 'sent' : 'failed', errorMessage: (result && result.error && result.error.message) || '',
            metadata: { source: 'ai-assist' },
          });
          await Conversation.findByIdAndUpdate(r.convId, {
            lastMessage: { text: r.message, timestamp: new Date(), direction: 'outbound', type: 'text' },
          });
          if (io) io.to('workspace:' + wsId).emit('new_message', { message: msg, conversationId: r.convId });
        }
      } catch (e) { sendFailed++; }
    }
  }

  // Refresh contactCount for touched tags.
  const touchedTagNames = [...new Set(results.flatMap((r) => [...(r.tags_add || []), ...(r.tags_remove || [])]))];
  for (const n of touchedTagNames) {
    const t = await Tag.findOne({ workspace: wsId, name: new RegExp('^' + String(n).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).select('_id');
    if (t) { const c = await Contact.countDocuments({ workspace: wsId, tags: t._id }); await Tag.updateOne({ _id: t._id }, { $set: { contactCount: c } }); }
  }

  const summary = { leads: results.length, changed, sent, sendFailed };
  try {
    await AIAssistRun.create({
      workspace: wsId, instruction, source, schedule: scheduleId, allowSend: !!allowSend,
      leads: summary.leads, changed: summary.changed, sent: summary.sent, sendFailed: summary.sendFailed,
      createdBy: userId || null,
    });
  } catch (e) { /* history is best-effort */ }
  return summary;
}

module.exports = { buildPlan, applyPlan, workspaceAgents };
