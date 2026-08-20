const axios = require('axios');
const IgAutoDm = require('../models/IgAutoDm');
const IgAutoDmLog = require('../models/IgAutoDmLog');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Workspace = require('../models/Workspace');

const GRAPH = 'https://graph.facebook.com/v21.0';
const PAYLOAD_PREFIX = 'IGAUTODM:'; // quick-reply payload marker -> deliver the automation payload
const FOLLOW_PREFIX = 'IGFOLLOW:'; // quick-reply payload marker -> user confirmed they follow
const RETRY_DELAYS_MIN = [2, 10, 30]; // backoff between delivery attempts
const MAX_ATTEMPTS = 3;
// Instagram only accepts a normal reply within 24h of the user's last message; after that a tag is required.
const WINDOW_MS = 24 * 60 * 60 * 1000;

// --- low level IG senders (use the Page access token of the connected IG account) ---
// Instagram DMs are sent through the connected Page node (the IG node rejects /messages).
async function igSend(igId, token, recipient, message, opts = {}) {
  const body = { recipient, message };
  if (opts.outsideWindow) {
    body.messaging_type = 'MESSAGE_TAG';
    body.tag = 'HUMAN_AGENT';
  } else {
    body.messaging_type = 'RESPONSE';
  }
  const { data } = await axios.post(`${GRAPH}/${igId}/messages`, body, {
    params: { access_token: token }, timeout: 15000,
  });
  return data;
}

// Mirror what the automation sent into the Instagram chat so agents see it in the inbox.
async function logOutbound(workspace, userId, username, text) {
  try {
    const contact = await Contact.findOneAndUpdate(
      { workspace: workspace._id, phone: String(userId) },
      {
        $setOnInsert: { workspace: workspace._id, phone: String(userId), source: 'instagram', channel: 'instagram', countryCode: '' },
        ...(username ? { $set: { name: username } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: workspace._id, contact: contact._id },
      {
        workspace: workspace._id, contact: contact._id, status: 'active', channel: 'instagram',
        lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: 'text' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const msg = await Message.create({
      workspace: workspace._id,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type: 'text',
      text,
      status: 'sent',
      metadata: { channel: 'instagram', source: 'instagram_auto_dm' },
    });
    if (global.io) global.io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  } catch (e) {
    console.error('[IgAutoDm] inbox log failed:', e.message);
  }
}

// true / false, or null when Instagram does not tell us (never block delivery on null).
async function isFollower(igId, token, userId) {
  try {
    const { data } = await axios.get(`${GRAPH}/${userId}`, {
      params: { fields: 'is_user_follow_business', access_token: token }, timeout: 10000,
    });
    return typeof data?.is_user_follow_business === 'boolean' ? data.is_user_follow_business : null;
  } catch (e) {
    console.error('[IgAutoDm] follow check failed:', e.response?.data?.error?.message || e.message);
    return null;
  }
}

async function publicReply(commentId, token, text) {
  await axios.post(`${GRAPH}/${commentId}/replies`, null, {
    params: { message: text, access_token: token }, timeout: 15000,
  });
}

function matchKeyword(auto, text) {
  const t = String(text || '').toLowerCase().trim();
  if (auto.keywordMode === 'any' || !auto.keywords || auto.keywords.length === 0) return true;
  const kws = auto.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (auto.keywordMode === 'exact') return kws.includes(t);
  return kws.some((k) => t.includes(k)); // contains
}

// Build the message object that carries the actual payload (media / buttons / text).
function buildPayloadMessage(p) {
  const buttons = (p.buttons || []).filter((b) => b && b.url && b.title)
    .slice(0, 3)
    .map((b) => ({ type: 'web_url', url: b.url, title: String(b.title).slice(0, 20) }));
  if (buttons.length) {
    return {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: (p.text || 'Here you go 🎁').slice(0, 80),
            image_url: p.mediaType === 'image' && p.mediaUrl ? p.mediaUrl : undefined,
            buttons,
          }],
        },
      },
    };
  }
  if ((p.mediaType === 'image' || p.mediaType === 'video') && p.mediaUrl) {
    return { attachment: { type: p.mediaType, payload: { url: p.mediaUrl, is_reusable: true } } };
  }
  return { text: p.text || 'Here you go 🎁' };
}

async function deliverPayload(igId, token, recipientId, auto, opts = {}) {
  const p = auto.payload || {};
  const hasButtons = (p.buttons || []).filter((b) => b && b.url && b.title).length > 0;
  // A button card already carries the text as its title; media attachments do not, so those
  // need the text as a separate line.
  if (p.text && p.mediaUrl && !hasButtons) {
    await igSend(igId, token, { id: recipientId }, { text: p.text }, opts).catch(() => {});
  }
  await igSend(igId, token, { id: recipientId }, buildPayloadMessage(p), opts);
}

function randomDelayMs(auto) {
  const min = Math.max(0, Number(auto.delayMinSec) || 0);
  const max = Math.max(min, Number(auto.delayMaxSec) || min);
  return (min + Math.random() * (max - min)) * 1000;
}

// A trigger fired: remember it and let the queue worker do the sending, so the
// per-hour cap, the human-like delay and retries all apply in one place.
// One DM per user per post per day, so a repeat commenter is answered again tomorrow
// without the automation spamming them for every comment on the same day.
function dedupeKey(ev) {
  const day = new Date().toISOString().slice(0, 10);
  if (ev.trigger === 'comment' || ev.trigger === 'mention') return `${ev.mediaId || ''}:${day}`;
  return `${ev.trigger}:${day}`;
}

async function enqueue(workspace, auto, ev) {
  const direct = ev.trigger !== 'comment' && ev.trigger !== 'mention';
  try {
    await IgAutoDmLog.create({
      workspace: workspace._id,
      automation: auto._id,
      trigger: ev.trigger || 'comment',
      mediaId: ev.mediaId || '',
      commentId: ev.commentId || '',
      igUserId: ev.fromId,
      username: ev.username || '',
      commentText: ev.text || '',
      dedupeKey: dedupeKey(ev),
      stage: 'queued',
      dueAt: new Date(Date.now() + randomDelayMs(auto)),
      lastInboundAt: direct ? new Date() : null,
    });
  } catch (e) {
    if (e && e.code === 11000) return false; // already handled this user for this trigger
    throw e;
  }
  await IgAutoDm.updateOne({ _id: auto._id }, { $inc: { 'stats.comments': 1 } });
  return true;
}

// Comment-only users have no chat yet: optionally save them as a contact with tags/stage.
async function saveContact(workspace, auto, ev) {
  if (!auto.createContact) return;
  try {
    const update = { $setOnInsert: { workspace: workspace._id, phone: String(ev.fromId), source: 'instagram', channel: 'instagram', countryCode: '' } };
    if (ev.username) update.$set = { name: ev.username };
    if (auto.stage) update.$set = { ...(update.$set || {}), stage: auto.stage };
    if (auto.tags && auto.tags.length) update.$addToSet = { tags: { $each: auto.tags } };
    await Contact.updateOne({ workspace: workspace._id, phone: String(ev.fromId) }, update, { upsert: true });
  } catch (e) {
    console.error('[IgAutoDm] contact save failed:', e.message);
  }
}

async function matchAutomations(workspace, ev) {
  const trigger = ev.trigger || 'comment';
  const autos = await IgAutoDm.find({ workspace: workspace._id, active: true });
  const out = [];
  for (const auto of autos) {
    if ((auto.trigger || 'comment') !== trigger) continue;
    if (trigger === 'comment' && auto.scope === 'specific' && String(auto.mediaId) !== String(ev.mediaId)) continue;
    if (!matchKeyword(auto, ev.text)) continue;
    out.push(auto);
  }
  return out;
}

// A new comment arrived on an IG media. `c` = { commentId, text, fromId, username, mediaId }
async function handleComment(workspace, c) {
  const mc = workspace.metaChat || {};
  if (!(mc.igAccountId || mc.pageId) || !mc.pageAccessToken) return false;
  let queued = false;
  let replied = false;
  for (const auto of await matchAutomations(workspace, { ...c, trigger: c.trigger || 'comment' })) {
    // The public reply goes out for every matching comment; only the DM is deduplicated.
    if (!replied && c.commentId && auto.publicReplies && auto.publicReplies.length) {
      const reply = auto.publicReplies[Math.floor(Math.random() * auto.publicReplies.length)];
      await publicReply(c.commentId, mc.pageAccessToken, reply)
        .then(() => { replied = true; })
        .catch((err) => console.error('[IgAutoDm] public reply failed:', err.response?.data?.error?.message || err.message));
    }
    if (await enqueue(workspace, auto, { ...c, trigger: c.trigger || 'comment' })) {
      queued = true;
      await saveContact(workspace, auto, c);
    }
  }
  return queued;
}

// A story reply or a DM keyword arrived. Returns true when an automation took the message,
// so the normal chat automation does not answer on top of it.
async function handleDirect(workspace, ev) {
  const mc = workspace.metaChat || {};
  if (!(mc.igAccountId || mc.pageId) || !mc.pageAccessToken) return false;
  let queued = false;
  for (const auto of await matchAutomations(workspace, ev)) {
    if (await enqueue(workspace, auto, ev)) {
      queued = true;
      await saveContact(workspace, auto, ev);
    }
  }
  return queued;
}

// Send one queued row: opening DM (+ payload when there is no button gate).
async function sendQueued(workspace, auto, row) {
  const mc = workspace.metaChat || {};
  const igId = mc.pageId || mc.igAccountId;
  const token = mc.pageAccessToken;
  const outsideWindow = row.trigger !== 'comment' && row.lastInboundAt
    ? Date.now() - new Date(row.lastInboundAt).getTime() > WINDOW_MS
    : false;

  const recipient = row.trigger === 'comment' && row.commentId ? { comment_id: row.commentId } : { id: row.igUserId };
  const opening = auto.openingText || 'Thanks for your comment! 🙌';

  // "Ask to follow" gate: ask first, then verify the follow when the user taps the button.
  if (auto.askFollow) {
    const followMsg = auto.followText || `${opening}\n\nFollow us first, then tap the button below 👇`;
    await igSend(igId, token, recipient, {
      text: followMsg,
      quick_replies: [{ content_type: 'text', title: String(auto.followButtonText || "I'm following").slice(0, 20), payload: FOLLOW_PREFIX + auto._id }],
    }, { outsideWindow });
    await logOutbound(workspace, row.igUserId, row.username, followMsg);
  } else if (auto.buttonText) {
    await igSend(igId, token, recipient, {
      text: opening,
      quick_replies: [{ content_type: 'text', title: String(auto.buttonText).slice(0, 20), payload: PAYLOAD_PREFIX + auto._id }],
    }, { outsideWindow });
    await logOutbound(workspace, row.igUserId, row.username, opening);
  } else {
    await igSend(igId, token, recipient, { text: opening }, { outsideWindow });
    await deliverPayload(igId, token, row.igUserId, auto, { outsideWindow });
    await logOutbound(workspace, row.igUserId, row.username, `${opening}\n${auto.payload?.text || '[media]'}`);
    await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'payload_sent' });
    await IgAutoDm.updateOne({ _id: auto._id }, { $inc: { 'stats.dmsSent': 1 } });
    return;
  }
  await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'dm_sent' });
  await IgAutoDm.updateOne({ _id: auto._id }, { $inc: { 'stats.dmsSent': 1 } });
}

// Queue worker: respects the per-automation hourly cap and retries failed sends.
async function processQueue() {
  const due = await IgAutoDmLog.find({ stage: { $in: ['queued', 'retry'] }, dueAt: { $lte: new Date() } })
    .sort('dueAt')
    .limit(200)
    .lean();
  if (!due.length) return;

  const workspaces = new Map();
  const autos = new Map();
  const sentThisHour = new Map();

  for (const row of due) {
    try {
      let auto = autos.get(String(row.automation));
      if (!auto) {
        auto = await IgAutoDm.findById(row.automation);
        if (!auto) { await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'failed', error: 'Automation deleted' }); continue; }
        autos.set(String(row.automation), auto);
      }
      if (!auto.active) { await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'failed', error: 'Automation is off' }); continue; }

      const cap = Math.max(1, Number(auto.hourlyCap) || 60);
      let used = sentThisHour.get(String(auto._id));
      if (used === undefined) {
        used = await IgAutoDmLog.countDocuments({
          automation: auto._id,
          stage: { $in: ['dm_sent', 'payload_sent', 'clicked'] },
          updatedAt: { $gte: new Date(Date.now() - 3600 * 1000) },
        });
      }
      if (used >= cap) {
        // Cap reached: push the rest into the next hour instead of dropping them.
        await IgAutoDmLog.updateOne({ _id: row._id }, { dueAt: new Date(Date.now() + 15 * 60 * 1000) });
        continue;
      }

      let workspace = workspaces.get(String(row.workspace));
      if (!workspace) {
        workspace = await Workspace.findById(row.workspace);
        if (!workspace) { await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'failed', error: 'Workspace missing' }); continue; }
        workspaces.set(String(row.workspace), workspace);
      }

      await sendQueued(workspace, auto, row);
      sentThisHour.set(String(auto._id), used + 1);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      const attempts = (row.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await IgAutoDmLog.updateOne({ _id: row._id }, { stage: 'failed', error: msg, attempts, lastAttemptAt: new Date() });
      } else {
        await IgAutoDmLog.updateOne({ _id: row._id }, {
          stage: 'retry', error: msg, attempts, lastAttemptAt: new Date(),
          dueAt: new Date(Date.now() + RETRY_DELAYS_MIN[attempts - 1] * 60 * 1000),
        });
      }
      console.error('[IgAutoDm] send failed:', msg);
    }
  }
}

// A quick-reply/postback arrived. Returns true if it was an Auto-DM button we handled.
async function handlePayloadTrigger(workspace, senderId, payload) {
  const p = String(payload || '');
  const isFollow = p.startsWith(FOLLOW_PREFIX);
  if (!isFollow && !p.startsWith(PAYLOAD_PREFIX)) return false;
  const id = p.slice((isFollow ? FOLLOW_PREFIX : PAYLOAD_PREFIX).length);
  const auto = await IgAutoDm.findOne({ _id: id, workspace: workspace._id });
  if (!auto) return true;
  const mc = workspace.metaChat || {};
  const igId = mc.pageId || mc.igAccountId;
  const token = mc.pageAccessToken;
  if (!igId || !token) return true;
  if (isFollow && (await isFollower(igId, token, senderId)) === false) {
    await igSend(igId, token, { id: senderId }, {
      text: 'We cannot see your follow yet. Please follow us and tap the button again 🙏',
      quick_replies: [{ content_type: 'text', title: String(auto.followButtonText || "I'm following").slice(0, 20), payload: FOLLOW_PREFIX + auto._id }],
    }).catch(() => {});
    return true;
  }
  // Claim the newest waiting row: Meta can redeliver the same tap, and the payload must go out once.
  const claim = await IgAutoDmLog.findOneAndUpdate(
    { workspace: workspace._id, automation: auto._id, igUserId: senderId, stage: 'dm_sent' },
    { stage: 'payload_sent' },
    { sort: { createdAt: -1 } }
  );
  if (!claim) return true;
  try {
    await deliverPayload(igId, token, senderId, auto);
    await logOutbound(workspace, senderId, '', auto.payload?.text || '[media]');
    await IgAutoDm.updateOne({ _id: auto._id }, { $inc: { 'stats.clicks': 1 } });
  } catch (err) {
    console.error('[IgAutoDm] payload delivery failed:', err.response?.data?.error?.message || err.message);
  }
  return true;
}

module.exports = { handleComment, handleDirect, handlePayloadTrigger, processQueue, PAYLOAD_PREFIX, FOLLOW_PREFIX };
