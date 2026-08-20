const axios = require('axios');
const Workspace = require('../models/Workspace');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Automation = require('../models/Automation');
const Keyword = require('../models/Keyword');
const SystemSettings = require('../models/SystemSettings');
const CallSession = require('../models/CallSession');
const AISettings = require('../models/AISettings');
const AICallingAgent = require('../models/AICallingAgent');
const aiCallBridge = require('../services/aiCallBridge');
const WhatsAppService = require('../services/whatsappService');
const { autoLinkToPipeline } = require('../services/pipelineAutoLink');
const fs = require('fs');

// In-memory guard against concurrent duplicate webhook deliveries (Meta retries)
const recentWamids = new Map();
function seenRecently(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of recentWamids) { if (now - t > 5 * 60 * 1000) recentWamids.delete(k); }
  if (recentWamids.has(id)) return true;
  recentWamids.set(id, now);
  return false;
}
const path = require('path');

// Downloads an inbound WhatsApp media file from Meta and saves it under
// /uploads/wa so it can be served to the panel (Meta media URLs are token-gated
// and short-lived, so they can't be used directly by the browser).
async function downloadInboundMedia(workspace, msg, messageData) {
  const mediaId = msg[msg.type]?.id;
  if (!mediaId || !workspace.whatsapp?.accessToken) return;
  if (messageData.media?.url) return;
  try {
    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    const url = await wa.getMediaUrl(mediaId);
    const buffer = Buffer.from(await wa.downloadMedia(url));
    const dir = path.join(__dirname, '..', '..', 'uploads', 'wa');
    fs.mkdirSync(dir, { recursive: true });
    const mime = msg[msg.type]?.mime_type || '';
    const ext = (mime.split('/')[1] || 'bin').split(';')[0];
    const filename = `${mediaId}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    messageData.media = messageData.media || {};
    // Serve via /api/uploads so media loads even on proxies that route bare /uploads to the frontend.
    messageData.media.url = `${process.env.BACKEND_URL || 'https://api.wabapanel.com'}/api/uploads/wa/${filename}`;
  } catch (e) {
    console.error('[WH-Media] download failed:', e.response?.data?.error?.message || e.message);
  }
}

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];

// Decide whether an inbound call should be answered by the AI voice agent.
// Returns the OpenAI config to use, or null if a human should answer.
async function resolveAiCallConfig(workspace, from) {
  const digits = (from || '').replace(/[^0-9]/g, '');
  let aiForContact = false;
  let contact = null;
  if (digits) {
    contact = await Contact.findOne({
      workspace: workspace._id,
      phone: { $in: [digits, digits.replace(/^91/, '')] },
    });
    if (contact) {
      const conv = await Conversation.findOne({ workspace: workspace._id, contact: contact._id });
      if (conv?.aiCallEnabled) aiForContact = true;
    }
  }
  const aiPre = await AISettings.findOne({ workspace: workspace._id });
  // Per-contact AI:ON always wins; otherwise apply workspace-level call targeting.
  if (!aiForContact) {
    const ct = aiPre?.callTargeting || {};
    const contactTags = (contact?.tags || []).map(t => String(t));
    if ((ct.excludeTags || []).some(t => contactTags.includes(String(t)))) return null;
    if (ct.mode === 'all') aiForContact = true;
    else if (ct.mode === 'saved') aiForContact = !!contact;
    else if (ct.mode === 'tags') aiForContact = (ct.tags || []).some(t => contactTags.includes(String(t)));
  }
  if (!aiForContact) return null;

  // Pick the agent for prompt/voice: default agent if set, else any active one.
  const agent = await AICallingAgent.findOne({ workspace: workspace._id, isDefault: true, status: 'active' })
    || await AICallingAgent.findOne({ workspace: workspace._id, status: 'active' });

  const ai = aiPre;
  // For groq_sarvam, no OpenAI key needed at all
  let apiKey;
  if (agent?.voiceProvider === 'groq_sarvam') {
    if (!agent?.groqApiKey) return null;
    apiKey = 'groq_mode';
  } else {
    apiKey = (agent?.voiceProvider === 'openai' && agent?.voiceApiKey && agent.voiceApiKey.startsWith('sk-')) ? agent.voiceApiKey : ai?.apiKey;
  }
  if (!apiKey) return null;

  const voice = (agent && agent.voiceProvider === 'openai' && OPENAI_VOICES.includes(agent.voiceId))
    ? agent.voiceId : 'alloy';
  return {
    apiKey,
    instructions: (agent?.systemPrompt) || ai?.systemPrompt || 'You are a helpful phone assistant. Keep replies short and natural.',
    greeting: agent?.greeting || 'Hello! How can I help you today?',
    voice,
    agent,
  };
}

// @GET /api/webhook/whatsapp - Verification
const oooSentCache = new Map();

// Send a text auto-reply and log it into the conversation so it shows in chat.
async function sendAndLog(wa, to, text, io, workspace, conversation, contact, source) {
  const result = await wa.sendTextMessage(to, text);
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
  } catch (e) { console.error('[Chat log] auto-reply save failed:', e.message); }
  return result;
}

async function sendStickerAndLog(wa, to, url, io, workspace, conversation, contact, source) {
  const result = await wa.sendMediaMessage(to, 'sticker', url, '');
  try {
    const msg = await Message.create({
      workspace: workspace._id,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type: 'sticker',
      media: { url },
      waMessageId: result?.data?.messages?.[0]?.id || '',
      status: result?.success === false ? 'failed' : 'sent',
      errorMessage: result?.error?.message || '',
      metadata: { source },
    });
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: { text: '[sticker]', timestamp: new Date(), direction: 'outbound', type: 'sticker' },
    });
    if (io) io.to('workspace:' + workspace._id).emit('new_message', { message: msg, conversationId: conversation._id });
  } catch (e) { console.error('[Chat log] auto sticker save failed:', e.message); }
  return result;
}


const verifyWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check against env var first, then SystemSettings
  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken || token !== verifyToken) {
    try {
      const settings = await SystemSettings.findOne();
      verifyToken = settings?.whatsapp?.webhookVerifyToken || verifyToken;
    } catch { /* use env var */ }
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ message: 'Verification failed' });
};

// Handle WhatsApp Calling webhooks: Call Connect (SDP answer), Call Status, Call Terminate
const handleCallsWebhook = async (value) => {
  try {
    const phoneNumberId = value.metadata?.phone_number_id;
    const workspace = await Workspace.findOne({ $or: [{ 'whatsapp.phoneNumberId': phoneNumberId }, { 'whatsapp.extraNumbers.phoneNumberId': phoneNumberId }] });
    if (workspace && workspace.whatsapp.phoneNumberId !== phoneNumberId) workspace.whatsapp.phoneNumberId = phoneNumberId;
    if (!workspace) return;

    // Call Connect / Terminate events arrive under value.calls[]
    for (const call of value.calls || []) {
      console.log('[Call webhook]', call.id, 'event=' + call.event, 'status=' + (call.status || ''), 'sdp_type=' + (call.session?.sdp_type || call.session?.type || 'none'), 'direction=' + (call.direction || ''));
      if (call.event === 'connect' && call.session?.sdp) {
        const existing = await CallSession.findOne({ callId: call.id, workspace: workspace._id });
        // An SDP answer is always the reply to our business-initiated offer
        // (e.g. a scheduled AI callback) — never an inbound call.
        const sdpType = call.session.sdp_type || call.session.type || '';
        const isInbound = sdpType !== 'answer' && (call.direction === 'USER_INITIATED' || (!existing));
        if (isInbound) {
          // If AI is assigned for this caller, let the server-side AI voice bridge
          // answer the call instead of waiting for a human in the browser.
          let aiHandled = false;
          try {
            const aiCfg = await resolveAiCallConfig(workspace, call.from);
            if (aiCfg) {
              const useGroq = aiCfg.agent?.voiceProvider === "groq_sarvam";
              if (useGroq) {
                await aiCallBridge.startInboundGroq({
                  callId: call.id,
                  offerSdp: call.session.sdp,
                  instructions: aiCfg.instructions,
                  greeting: aiCfg.greeting,
                  accessToken: workspace.whatsapp?.accessToken,
                  phoneNumberId: workspace.whatsapp?.phoneNumberId,
                  workspaceId: workspace._id,
                  from: call.from,
                  agent: aiCfg.agent,
                });
              } else {
              await aiCallBridge.startInbound({
                apiKey: aiCfg.apiKey,
                callId: call.id,
                offerSdp: call.session.sdp,
                instructions: aiCfg.instructions,
                greeting: aiCfg.greeting,
                voice: aiCfg.voice,
                accessToken: workspace.whatsapp?.accessToken,
                phoneNumberId: workspace.whatsapp?.phoneNumberId,
                workspaceId: workspace._id,
                from: call.from,
                agent: aiCfg.agent,
              });
              }
              aiHandled = true;
            }
          } catch (e) {
            console.error('AI call bridge failed, falling back to browser:', e.message);
          }
          // Customer-initiated call: their SDP offer arrives -> create a session.
          // If AI handled it, mark 'ai-connected' so the browser does not also answer.
          await CallSession.findOneAndUpdate(
            { callId: call.id, workspace: workspace._id },
            {
              workspace: workspace._id,
              callId: call.id,
              from: call.from || '',
              direction: 'USER_INITIATED',
              status: aiHandled ? 'ai-connected' : 'incoming',
              offerSdp: call.session.sdp,
              answerDelivered: aiHandled,
              startTime: new Date(),
            },
            { upsert: true, setDefaultsOnInsert: true }
          );
          continue;
        }
        // SDP answer from Meta (business-initiated). If an AI outbound bridge is
        // waiting on this call, complete it server-side (no browser involved).
        let aiOutbound = false;
        try { aiOutbound = await aiCallBridge.completeOutbound(call.id, call.session.sdp); }
        catch (e) { console.error('AI outbound complete failed:', e.message); }
        if (aiOutbound) {
          await CallSession.findOneAndUpdate(
            { callId: call.id, workspace: workspace._id },
            { answerSdp: call.session.sdp, answerDelivered: true, status: 'ai-connected' },
            { upsert: false }
          );
          continue;
        }
        // Otherwise relay the answer to the browser via polling.
        await CallSession.findOneAndUpdate(
          { callId: call.id, workspace: workspace._id },
          { answerSdp: call.session.sdp, answerDelivered: false, status: 'connecting' },
          { upsert: false }
        );
        continue;
      }

      const update = {};
      if (call.event === 'terminate') {
        aiCallBridge.stop(call.id);
        try {
          const sess = await CallSession.findOne({ callId: call.id, workspace: workspace._id });
          const answered = sess && ['accepted', 'ai-connected', 'connecting', 'completed'].includes(sess.status);
          if (sess && sess.direction === 'USER_INITIATED' && !answered && sess.from) {
            const AutomationSettings = require('../models/AutomationSettings');
            const auto = await AutomationSettings.findOne({ workspace: workspace._id }).lean();
            require('../services/ownerNotify').missedCall(workspace._id, sess.from).catch(() => {});
            if (auto?.missedCall?.enabled) {
              const Contact = require('../models/Contact');
              const Conversation = require('../models/Conversation');
              const last10 = String(sess.from).replace(/\D/g, '').slice(-10);
              const mcContact = await Contact.findOne({ workspace: workspace._id, phone: { $regex: last10 + '$' } });
              const name = mcContact?.name || mcContact?.profileName || '';
              const text = String(auto.missedCall.message || 'Sorry, we missed your call. Please send us a message here and we will reply right away 🙏')
                .replace(/\{first_name\}/g, (name.split(' ')[0] || ''))
                .replace(/\{full_name\}/g, name);
              const waMc = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
              const mcConv = mcContact ? await Conversation.findOne({ workspace: workspace._id, contact: mcContact._id }) : null;
              if (mcConv && mcContact) {
                await sendAndLog(waMc, sess.from, text, global.io, workspace, mcConv, mcContact, 'missed_call');
                if (auto.missedCall.stickerUrl) await sendStickerAndLog(waMc, sess.from, auto.missedCall.stickerUrl, global.io, workspace, mcConv, mcContact, 'missed_call');
              } else {
                await waMc.sendTextMessage(sess.from, text);
                if (auto.missedCall.stickerUrl) await waMc.sendMediaMessage(sess.from, 'sticker', auto.missedCall.stickerUrl, '');
              }
              console.log('[MissedCall] auto message sent to', sess.from);
            }
          }
        } catch (e) { console.error('[MissedCall] error:', e.message); }
        update.status = call.status === 'COMPLETED' ? 'completed' : 'failed';
        if (call.start_time) update.startTime = new Date(Number(call.start_time) * 1000);
        if (call.end_time) update.endTime = new Date(Number(call.end_time) * 1000);
        if (typeof call.duration === 'number') update.duration = call.duration;
      }
      if (value.errors?.length || call.errors?.length) {
        const err = (value.errors || call.errors || [])[0];
        if (err) update.errorMessage = `${err.code}: ${err.message}`;
      }
      if (Object.keys(update).length) {
        await CallSession.findOneAndUpdate(
          { callId: call.id, workspace: workspace._id },
          update,
          { upsert: false }
        );
      }
    }

    // Call Status events (RINGING / ACCEPTED / REJECTED) arrive under value.statuses[]
    for (const st of value.statuses || []) {
      if (st.type !== 'call') continue;
      const map = { RINGING: 'ringing', ACCEPTED: 'accepted', REJECTED: 'rejected' };
      const status = map[st.status];
      if (status) {
        await CallSession.findOneAndUpdate(
          { callId: st.id, workspace: workspace._id },
          { status }
        );
      }
    }
  } catch (err) {
    console.error('handleCallsWebhook error:', err.message);
  }
};

// Meta redelivers the same message event more than once; remember the ids we already handled.
const seenMetaMids = new Map();
const alreadyHandled = (mid) => {
  if (!mid) return false;
  const now = Date.now();
  for (const [k, t] of seenMetaMids) if (now - t > 10 * 60 * 1000) seenMetaMids.delete(k);
  if (seenMetaMids.has(mid)) return true;
  seenMetaMids.set(mid, now);
  return false;
};

// Facebook Messenger / Instagram DM webhooks (object: 'page' | 'instagram').
const handleMetaChatWebhook = async (body, io) => {
  try {
    const channel = body.object === 'instagram' ? 'instagram' : 'facebook';
    for (const entry of body.entry || []) {
      console.log(`[WH-META] object=${body.object} entry.id=${entry.id} messaging=${(entry.messaging||[]).length}`);
      const workspace = await Workspace.findOne(channel === 'instagram'
        ? { $or: [{ 'metaChat.igAccountId': String(entry.id) }, { 'metaChat.pageId': String(entry.id) }] }
        : { 'metaChat.pageId': String(entry.id) });
      if (!workspace) { console.log("[WH-SKIP] no workspace for meta entry.id:", entry.id, "channel:", channel); continue; }
      const mc = workspace.metaChat || {};
      if ((channel === 'facebook' && !mc.fbEnabled) || (channel === 'instagram' && !mc.igEnabled)) continue;
      for (const evt of entry.messaging || []) {
        const senderId = evt.sender?.id;
        if (!senderId || senderId === String(entry.id)) continue;
        if (alreadyHandled(evt.message?.mid)) continue;
        // Instagram Auto DM: a quick-reply / postback button tap delivers the configured payload.
        const __igTrig = (evt.message && evt.message.quick_reply && evt.message.quick_reply.payload) || (evt.postback && evt.postback.payload) || '';
        if (channel === 'instagram' && __igTrig) {
          try {
            const __handled = await require('../services/igAutoDmService').handlePayloadTrigger(workspace, senderId, __igTrig);
            if (__handled) continue;
          } catch (e) { console.error('[IgAutoDm] trigger error:', e.message); }
        }
        const msg = evt.message;
        if (!msg || msg.is_echo) continue;
        const __att = msg.attachments?.[0];
        const text = msg.text
          || (msg.reply_to?.story ? '[story reply]' : '')
          || (__att ? '[' + (__att.type || 'media') + ']' : '');
        const mediaUrl = __att?.payload?.url || '';
        if (!text && !mediaUrl) continue;

        let contact = await Contact.findOne({ workspace: workspace._id, phone: senderId });
        let name = '';
        if (!contact || !contact.name || contact.name === senderId) {
          try {
            const prof = await axios.get(`https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${mc.pageAccessToken}`);
            name = prof.data?.name || prof.data?.username || '';
          } catch (e) { console.log('[WH-META] profile lookup failed:', senderId, e.response?.data?.error?.message || e.message); }
        }
        if (contact && name && (!contact.name || contact.name === senderId)) {
          contact.name = name;
          await Contact.updateOne({ _id: contact._id }, { name });
        }
        if (!contact) {
          let __newLead = true;
          contact = await Contact.create({
            workspace: workspace._id, phone: senderId, name,
            source: channel, channel, countryCode: '',
          });
          if (__newLead) { try { require('../services/googleSheets').appendLead(workspace._id, contact); } catch (e) { console.error('[Sheets]', e.message); } }
        }
        const conversation = await Conversation.findOneAndUpdate(
          { workspace: workspace._id, contact: contact._id },
          {
            workspace: workspace._id, contact: contact._id, status: 'active', channel,
            lastMessage: { text: text || '[media]', timestamp: new Date(), direction: 'inbound', type: mediaUrl ? 'image' : 'text' },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const inMsg = await Message.create({
          workspace: workspace._id,
          conversation: conversation._id,
          contact: contact._id,
          direction: 'inbound',
          type: mediaUrl ? 'image' : 'text',
          text: text || '',
          mediaUrl: mediaUrl || undefined,
          waMessageId: msg.mid || '',
          status: 'delivered',
          metadata: { channel },
        });
        await Conversation.findByIdAndUpdate(conversation._id, { $inc: { unreadCount: 1 } });
        contact.lastMessageAt = new Date();
        // Auto-reopen a closed lead when the customer messages again.
        if (contact.leadClosed) { contact.leadClosed = false; contact.leadClosedAt = null; contact.leadCloseReason = ''; }
        await contact.save();
        if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: inMsg, conversationId: conversation._id });
        autoLinkToPipeline(workspace._id, contact._id, 'inbound');
        // Instagram story replies and DM keywords can run their own Auto DM automation.
        let __igTaken = false;
        if (channel === 'instagram' && text) {
          try {
            __igTaken = await require('../services/igAutoDmService').handleDirect(workspace, {
              trigger: msg.reply_to?.story ? 'story_reply' : 'dm_keyword',
              text: msg.text || text,
              fromId: senderId,
              username: contact.name || '',
              mediaId: msg.reply_to?.story?.id || '',
            });
          } catch (e) { console.error('[IgAutoDm] direct error:', e.message); }
        }
        if (text && !mediaUrl && !__igTaken) {
          require('../services/qrAutomation')
            .processIncoming({ workspace, conversation, contact, phone: senderId, text })
            .catch((e) => console.error(`[${channel}] automation error:`, e.message));
        }
        console.log(`[${channel} chat] message from`, senderId);
      }
      // Instagram comment webhooks -> Auto DM trigger.
      if (channel === 'instagram') {
        for (const change of entry.changes || []) {
          const isComment = change.field === 'comments' || change.field === 'live_comments';
          const isMention = change.field === 'mentions';
          if (!isComment && !isMention) continue;
          const v = change.value || {};
          const fromId = v.from?.id;
          if (!fromId || String(fromId) === String(mc.igAccountId)) continue;
          try {
            await require('../services/igAutoDmService').handleComment(workspace, {
              trigger: isMention ? 'mention' : 'comment',
              commentId: v.comment_id || v.id,
              text: v.text || '',
              fromId,
              username: v.from?.username || '',
              mediaId: (v.media && v.media.id) || v.media_id || '',
            });
          } catch (e) { console.error('[IgAutoDm] comment error:', e.message); }
        }
      }
    }
  } catch (err) {
    console.error('handleMetaChatWebhook error:', err.message);
  }
};

// Coexistence: persist a message coming from smb_message_echoes (business-app-sent) or the
// one-time history sync, so it shows up in the panel inbox. Deduped by WhatsApp message ID.
async function saveCoexistenceMessage(workspace, phoneNumberId, item, io) {
  const { waId, direction, msg, ts, historyImport, status } = item;
  const phone = String(waId || '').replace(/^\+/, '');
  if (!phone) return;
  if (msg.id) {
    const exists = await Message.findOne({ workspace: workspace._id, waMessageId: msg.id }).select('_id');
    if (exists) return;
  }
  const contact = await Contact.findOneAndUpdate(
    { workspace: workspace._id, phone },
    { $set: { workspace: workspace._id, phone, waId: phone, source: 'whatsapp', lastMessageAt: new Date(), leadClosed: false, leadClosedAt: null, leadCloseReason: '' }, $setOnInsert: { name: phone } },
    { upsert: true, new: true }
  );
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: { $in: ['whatsapp', null] } },
    { $set: { workspace: workspace._id, contact: contact._id, status: 'active', channel: 'whatsapp', waNumberId: phoneNumberId } },
    { upsert: true, new: true }
  );
  const rawType = msg.type || 'text';
  const type = ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'].includes(rawType) ? rawType : 'text';
  const text = type === 'text' ? (msg.text?.body || '') : '';
  const messageData = {
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction,
    type,
    text,
    waMessageId: msg.id || '',
    status: direction === 'outbound' ? (status ? String(status).toLowerCase() : 'sent') : 'delivered',
    metadata: { source: historyImport ? 'coexistence_history' : 'coexistence_echo' },
  };
  if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    messageData.media = { url: '', mimeType: msg[type]?.mime_type || '', caption: msg[type]?.caption || '', sha256: msg[type]?.sha256 || '' };
  }
  const created = await Message.create(messageData);
  const when = ts ? new Date(Number(ts) * 1000) : new Date();
  // Preserve original send time so imported history sorts correctly (can be up to 180 days old)
  if (ts) await Message.updateOne({ _id: created._id }, { $set: { createdAt: when } }, { timestamps: false });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text: text || `[${type}]`, timestamp: when, direction, type },
  });
  // Realtime only for live echoes; bulk history import must not flood the socket
  if (io && !historyImport) io.to('workspace:' + workspace._id).emit('new_message', { message: created, conversationId: conversation._id });
}

// Routes coexistence webhook fields to the inbox.
async function handleCoexistenceWebhook(change, io) {
  try {
    const value = change.value || {};
    const meta = value.metadata || {};
    const phoneNumberId = meta.phone_number_id;
    const businessPhone = String(meta.display_phone_number || '').replace(/\D/g, '');
    if (!phoneNumberId) return;

    const workspace = await Workspace.findOne({
      $or: [
        { 'whatsapp.phoneNumberId': phoneNumberId },
        { 'whatsapp.extraNumbers.phoneNumberId': phoneNumberId },
      ],
    });
    if (!workspace) return;

    if (change.field === 'smb_message_echoes') {
      for (const e of (value.message_echoes || [])) {
        await saveCoexistenceMessage(workspace, phoneNumberId, {
          waId: e.to || e.recipient_id, direction: 'outbound', msg: e, ts: e.timestamp,
        }, io).catch(err => console.error('[Coexistence] echo save:', err.message));
      }
    } else if (change.field === 'history') {
      let count = 0;
      for (const h of (value.history || [])) {
        for (const thread of (h.threads || [])) {
          const threadWaId = thread.id;
          for (const m of (thread.messages || [])) {
            if (m.type === 'media_placeholder') continue;
            // `to` present => business-sent (outbound); else compare `from` to the business number
            const fromDigits = String(m.from || '').replace(/\D/g, '');
            const outbound = !!m.to || (businessPhone && fromDigits === businessPhone);
            const waId = outbound ? (m.to || threadWaId) : (m.from || threadWaId);
            await saveCoexistenceMessage(workspace, phoneNumberId, {
              waId, direction: outbound ? 'outbound' : 'inbound', msg: m, ts: m.timestamp,
              historyImport: true, status: m.status,
            }, io).catch(err => console.error('[Coexistence] history save:', err.message));
            count++;
          }
        }
      }
      const hm = (value.history || [])[0]?.metadata || {};
      console.log(`[Coexistence] history imported ${count} msgs (phase ${hm.phase}, progress ${hm.progress})`);
    } else {
      // smb_app_state_sync (contact sync) — acknowledged; no inbox action required
      console.log('[Coexistence] received', change.field, '- acknowledged');
    }
  } catch (e) {
    console.error('[Coexistence] webhook error:', e.message);
  }
}

// @POST /api/webhook/whatsapp - Incoming messages
const handleWhatsAppWebhook = async (req, res) => {
  try {
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    console.log("[WH]", body.object, JSON.stringify(body.entry?.[0]?.changes?.map(c=>({f:c.field, msgs:c.value?.messages?.length||0, sts:c.value?.statuses?.length||0, pid:c.value?.metadata?.phone_number_id||""})) || []).slice(0,300));
    if (body.object === 'page' || body.object === 'instagram') {
      await handleMetaChatWebhook(body, req.app.get('io'));
      return;
    }
    if (!body.object || body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        // WhatsApp Calling webhooks (SDP answer + call status)
        if (change.field === 'calls') {
          await handleCallsWebhook(change.value);
          continue;
        }
        // Coexistence webhooks (WhatsApp Business app numbers onboarded to Cloud API)
        if (change.field === 'smb_message_echoes' || change.field === 'history' || change.field === 'smb_app_state_sync') {
          await handleCoexistenceWebhook(change, req.app.get('io'));
          continue;
        }
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;

        // Find workspace by phone number ID (primary or extra numbers)
        const workspace = await Workspace.findOne({
          $or: [
            { 'whatsapp.phoneNumberId': phoneNumberId },
            { 'whatsapp.extraNumbers.phoneNumberId': phoneNumberId },
          ],
        });
        if (!workspace) continue;
        // Route replies through the number the customer messaged (in-memory only).
        // If it is an extra number from a different WABA, also switch to its token
        // so auto-replies / bot flows send with the correct credentials.
        if (workspace.whatsapp.phoneNumberId !== phoneNumberId) {
          const _extra = (workspace.whatsapp.extraNumbers || []).find(n => n && n.phoneNumberId === phoneNumberId && n.accessToken);
          if (_extra) workspace.whatsapp.accessToken = _extra.accessToken;
          workspace.whatsapp.phoneNumberId = phoneNumberId;
        }

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            // WhatsApp Pay (order_details) payment updates
            if (status.type === 'payment' && status.payment?.reference_id) {
              try {
                const PaymentLink = require('../models/PaymentLink');
                const pl = await PaymentLink.findById(status.payment.reference_id);
                if (pl) {
                  if (['captured', 'success'].includes(status.status) && pl.status !== 'paid') {
                    pl.status = 'paid';
                    pl.paidAt = new Date();
                    await pl.save();
                    const io2 = req.app.get('io');
                    if (io2) io2.to(`workspace:${pl.workspace}`).emit('payment_link_paid', { id: String(pl._id), amount: pl.amount, contact: String(pl.contact) });
                    require('../services/paymentAutomation').deliverPaymentOutcome(pl._id, 'success', io2);
                  } else if (['failed', 'canceled'].includes(status.status) && pl.status !== 'paid') {
                    require('../services/paymentAutomation').deliverPaymentOutcome(pl._id, 'failure', req.app.get('io'));
                  }
                }
              } catch (e) { console.error('[WAPay]', e.message); }
              continue;
            }
            const statusUpdate = { status: status.status };
            if (status.errors?.length) {
              const e = status.errors[0];
              statusUpdate.errorMessage = `(${e.code}) ${e.title || e.message || ''}${e.error_data?.details ? ' - ' + e.error_data.details : ''}`;
              require('../services/ownerNotify').msgFail(workspace._id, statusUpdate.errorMessage).catch(() => {});
            }
            await Message.findOneAndUpdate(
              { workspace: workspace._id, waMessageId: status.id },
              statusUpdate
            );
            require('../services/apiWebhookDispatcher').dispatch(workspace, 'message.status', { wa_message_id: status.id, status: status.status, recipient: status.recipient_id }).catch(() => {});
          }
        }

        // Handle incoming messages
        if (value.messages) {
          for (const msg of value.messages) {
            // Meta retries webhook deliveries — skip messages already processed
            if (msg.id) {
              if (seenRecently(msg.id)) continue;
              const dup = await Message.findOne({ workspace: workspace._id, waMessageId: msg.id }).select('_id');
              if (dup) continue;
            }
            // Reaction: attach to the reacted message as a badge (no chat line).
            if (msg.type === 'reaction') {
              try {
                const targetId = msg.reaction && msg.reaction.message_id;
                const emoji = (msg.reaction && msg.reaction.emoji) || '';
                if (targetId) {
                  const target = await Message.findOne({ workspace: workspace._id, waMessageId: targetId });
                  if (target) {
                    const reactions = (target.reactions || []).filter((r) => r.from !== 'inbound');
                    if (emoji) reactions.push({ emoji, from: 'inbound' });
                    target.reactions = reactions;
                    await target.save();
                    const io = req.app.get('io');
                    if (io) io.to(`workspace:${workspace._id}`).emit('message_reaction', { messageId: target._id, conversationId: target.conversation, reactions: target.reactions });
                  }
                }
              } catch (e) { console.error('[WH-reaction]', e.message); }
              continue;
            }
            const from = msg.from;
            const contactProfile = value.contacts?.find(c => c.wa_id === from);

            // Upsert contact
            const profName = contactProfile?.profile?.name || '';
            const contact = await Contact.findOneAndUpdate(
              { workspace: workspace._id, phone: from },
              {
                $set: {
                  workspace: workspace._id,
                  phone: from,
                  waId: from,
                  lastMessageAt: new Date(),
                  source: 'whatsapp',
                  leadClosed: false,
                  leadClosedAt: null,
                  leadCloseReason: '',
                  ...(profName ? { profileName: profName } : {}),
                },
                $setOnInsert: { name: profName || from },
              },
              { upsert: true, new: true }
            );
            if (profName && (!contact.name || contact.name === contact.phone)) {
              contact.name = profName;
              await Contact.updateOne({ _id: contact._id }, { name: profName });
            }
            if (contact.createdAt && Date.now() - new Date(contact.createdAt).getTime() < 5000) {
              require('../services/apiWebhookDispatcher').dispatch(workspace, 'contact.created', { contact_id: contact._id, name: contact.name, phone: contact.phone }).catch(() => {});
              try { require('../services/googleSheets').appendLead(workspace._id, contact); } catch (e) { console.error('[Sheets]', e.message); }
            }
            try {
              if (msg.type === 'text' && msg.text?.body) {
                const lang = /[\u0900-\u097F]/.test(msg.text.body) ? 'hi' : 'en';
                if (contact.language !== lang) { contact.language = lang; await Contact.updateOne({ _id: contact._id }, { language: lang }); }
              }
            } catch (e) { /* noop */ }

            // Upsert conversation
            const conversation = await Conversation.findOneAndUpdate(
              { workspace: workspace._id, contact: contact._id, channel: { $in: ['whatsapp', null] } },
              {
                workspace: workspace._id,
                contact: contact._id,
                channel: 'whatsapp',
                status: 'active',
                lastMessage: {
                  text: msg.text?.body || `[${msg.type}]`,
                  timestamp: new Date(),
                  direction: 'inbound',
                  type: msg.type,
                },
                $inc: { unreadCount: 1 },
                windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                waNumberId: phoneNumberId,
              },
              { upsert: true, new: true }
            );

            // Save message
            const messageData = {
              workspace: workspace._id,
              conversation: conversation._id,
              contact: contact._id,
              direction: 'inbound',
              type: msg.type,
              waMessageId: msg.id,
              status: 'delivered',
            };

            if (msg.context && msg.context.id) {
              const q = await Message.findOne({ workspace: workspace._id, waMessageId: msg.context.id }).select('text type direction').lean();
              messageData.context = { messageId: msg.context.id, text: q ? String(q.text || `[${q.type}]`).slice(0, 240) : '', from: q ? q.direction : '' };
            }

            if (msg.type === 'text') {
              messageData.text = msg.text.body;
            } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type)) {
              messageData.media = {
                url: '',
                mimeType: msg[msg.type]?.mime_type || '',
                caption: msg[msg.type]?.caption || '',
                sha256: msg[msg.type]?.sha256 || '',
              };
              messageData.text = msg[msg.type]?.caption || '';
              if (msg.type === 'audio') {
                try { await require('../services/aiFeatures').transcribeInbound({ workspace, msg, messageData }); }
                catch (e) { console.error('[VoiceToText]', e.message); }
              }
              await downloadInboundMedia(workspace, msg, messageData);
            } else if (msg.type === 'location') {
              messageData.location = {
                latitude: msg.location.latitude,
                longitude: msg.location.longitude,
                name: msg.location.name || '',
                address: msg.location.address || '',
              };
            } else if (msg.type === 'contacts') {
              // Contact card(s): store a readable summary so the panel shows names + numbers.
              const cards = msg.contacts || [];
              const lines = cards.map((c) => {
                const nm = c.name?.formatted_name
                  || [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ')
                  || 'Contact';
                const phones = (c.phones || []).map((p) => p.phone).filter(Boolean).join(', ');
                return `\uD83D\uDC64 ${nm}${phones ? ' \u2014 ' + phones : ''}`;
              });
              messageData.type = 'contact';
              messageData.text = lines.join('\n') || '[Contact card]';
            } else if (msg.type === 'interactive') {
              if (msg.interactive?.nfm_reply) {
                try {
                  const respData = JSON.parse(msg.interactive.nfm_reply.response_json || '{}');
                  const flowToken = respData.flow_token || '';
                  delete respData.flow_token;
                  const Form = require('../models/Form');
                  const formId = flowToken.split(':')[0];
                  let formDoc = null;
                  if (formId) formDoc = await Form.findOne({ _id: formId, workspace: workspace._id }).catch(() => null);
                  const labelMap = {};
                  if (formDoc) {
                    const sorted = [...(formDoc.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
                    sorted.forEach((fld, idx) => {
                      const base = String(fld.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 25);
                      labelMap['f' + idx + (base ? '_' + base : '')] = fld.label;
                    });
                  }
                  const lines = Object.entries(respData).map(([k, v]) => `${labelMap[k] || k}: ${Array.isArray(v) ? v.join(', ') : v}`);
                  messageData.text = '📋 Form submitted' + (formDoc ? ` (${formDoc.name})` : '') + ':\n' + lines.join('\n');
                  if (formDoc) {
                    const named = {};
                    Object.entries(respData).forEach(([k, v]) => { named[labelMap[k] || k] = v; });
                    formDoc.submissions.push({ data: named, contact: contact._id, submittedAt: new Date() });
                    formDoc.submissionCount = (formDoc.submissionCount || 0) + 1;
                    await formDoc.save();
                  }
                } catch (nfmErr) {
                  messageData.text = '📋 Form submitted';
                  console.error('nfm_reply parse error:', nfmErr.message);
                }
              } else {
                messageData.text = msg.interactive?.button_reply?.title ||
                  msg.interactive?.list_reply?.title || '';
              }
            } else if (msg.type === 'button') {
              messageData.text = msg.button?.text || '';
            } else if (msg.type === 'reaction') {
              const emoji = msg.reaction?.emoji || '';
              messageData.text = emoji ? `${emoji} (reaction)` : '(reaction removed)';
              messageData.type = 'text';
            } else if (msg.type === 'order') {
              const items = msg.order?.product_items || [];
              const lines = items.map((it) => `\u2022 ${it.quantity} x ${it.product_retailer_id} (${[it.currency, it.item_price].filter(Boolean).join(' ')})`.trim());
              messageData.text = '\uD83D\uDED2 Order request:\n' + (lines.join('\n') || '(cart items)') + (msg.order?.text ? '\n' + msg.order.text : '');
              messageData.type = 'text';
            } else if (msg.type === 'system') {
              messageData.text = msg.system?.body || '[System notification]';
              messageData.type = 'text';
            } else if (msg.type === 'edit') {
              // Edited message: Meta nests the new content under edit.message. Surface the
              // updated text instead of showing it as an "unsupported" message.
              const edited = msg.edit?.message || {};
              const newText = edited.text?.body || edited.caption
                || edited.button?.text || (edited.type ? `[${edited.type}]` : '');
              messageData.text = '\u270F\uFE0F ' + (newText || '(edited message)');
              messageData.type = 'text';
            } else if (msg.type === 'revoke') {
              // Customer deleted a message. Meta only relays the revoke pointer (no content),
              // so show a clear "deleted" note instead of an "unsupported" placeholder.
              messageData.text = '\uD83D\uDDD1\uFE0F This message was deleted';
              messageData.type = 'text';
            }

            const knownTypes = ['text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'contacts', 'sticker', 'template', 'interactive', 'reaction', 'list', 'button'];
            let unsupportedInbound = false;
            if (!knownTypes.includes(messageData.type)) {
              console.log('[WH-UNSUPPORTED] raw msg:', JSON.stringify(msg));
              // Some types (e.g. an edited message) still carry readable text in a
              // container named after the type; surface it instead of a placeholder.
              const container = msg[msg.type];
              const extracted = typeof container === 'string'
                ? container
                : (container && (container.body || container.text || container.caption)) || '';
              // Meta relays some types with NO content (only an error code): view-once,
              // deleted, polls, and features newer than the Cloud API. Show a clear reason.
              const uErr = (Array.isArray(msg.errors) && msg.errors[0]) || {};
              let uPlaceholder;
              if (uErr.code === 131060) {
                uPlaceholder = '\uD83D\uDCF5 This message is unavailable (view-once or removed by sender) \u2014 open WhatsApp on your phone to view it';
              } else if (uErr.code === 131051) {
                uPlaceholder = '\uD83D\uDCF5 Unsupported message (e.g. poll, or a newer WhatsApp feature) \u2014 open WhatsApp on your phone to view it';
              } else {
                uPlaceholder = '\uD83D\uDCF5 Unsupported message \u2014 open WhatsApp on your phone to view it';
              }
              messageData.text = messageData.text || extracted || uPlaceholder;
              messageData.type = 'text';
              unsupportedInbound = true;
            }

            if (msg.type === 'text' && messageData.text) {
              try { await require('../services/aiFeatures').translateInbound({ workspace, messageData }); }
              catch (e) { console.error('[AutoTranslate]', e.message); }
            }

            const message = await Message.create(messageData);
            console.log("[WH-MSG] saved:", message._id, message.type, (message.text||"").slice(0,30));

            // Keep the conversation-list preview in sync with the finalized text.
            // The early upsert uses the raw WhatsApp type (e.g. "[unsupported]");
            // once we have readable content (reaction/order/system/placeholder),
            // reflect it so the inbox list is not stuck on "[unsupported]".
            if (conversation && messageData.text) {
              const preview = messageData.text.length > 120 ? messageData.text.slice(0, 120) : messageData.text;
              if (!conversation.lastMessage || conversation.lastMessage.text !== preview) {
                await Conversation.updateOne(
                  { _id: conversation._id },
                  { $set: { lastMessage: { text: preview, timestamp: new Date(), direction: 'inbound', type: messageData.type } } }
                );
              }
            }

            // Unsupported message type (poll/view-once/edited etc.): keep the inbound placeholder
            // visible in the panel but do NOT auto-reply to the customer.
            void unsupportedInbound;

            // Owner alerts: commands, complaint detection, repeat customer, lead source
            try {
              const ownerNotify = require('../services/ownerNotify');
              if (msg.type === 'text' && messageData.text) {
                const handled = await ownerNotify.handleOwnerCommand(workspace, from, messageData.text);
                if (!handled && /complaint|complain|refund|fraud|cheat|worst|bakwas|bekar|ghatiya|kharab|\u0936\u093f\u0915\u093e\u092f\u0924|\u0927\u094b\u0916\u093e|\u092c\u0915\u0935\u093e\u0938|\u092c\u0947\u0915\u093e\u0930|\u0918\u091f\u093f\u092f\u093e|\u0916\u0930\u093e\u092c/i.test(messageData.text)) {
                  ownerNotify.complaintDetected(workspace._id, contact, messageData.text).catch(() => {});
                }
                // Keyword alert
                try {
                  const AutomationSettings = require('../models/AutomationSettings');
                  const _st = await AutomationSettings.findOne({ workspace: workspace._id }).lean();
                  const kws = (_st?.ownerAlerts?.alertKeywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                  if (kws.length) {
                    const low = messageData.text.toLowerCase();
                    const matched = kws.find(k => low.includes(k));
                    if (matched) ownerNotify.keywordAlert(workspace._id, contact, matched, messageData.text).catch(() => {});
                  }
                  // After-hours message
                  if (_st?.ownerAlerts?.onAfterHours) {
                    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                    const h = nowIST.getHours();
                    if (h < 9 || h >= 18) ownerNotify.afterHoursMsg(workspace._id, contact).catch(() => {});
                  }
                  // First message of the day
                  if (_st?.ownerAlerts?.onFirstMsg) {
                    const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().slice(0, 10);
                    if (_st.ownerAlerts.firstMsgSentDate !== todayStr) {
                      await AutomationSettings.updateOne({ workspace: workspace._id }, { $set: { 'ownerAlerts.firstMsgSentDate': todayStr } });
                      ownerNotify.firstMsgOfDay(workspace._id, contact).catch(() => {});
                    }
                  }
                  // High-value customer
                  const hvAmt = Number(_st?.ownerAlerts?.highValueAmount) || 0;
                  if (hvAmt > 0) {
                    const Order = require('../models/Order');
                    const agg = await Order.aggregate([{ $match: { workspace: workspace._id, contact: contact._id } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
                    if ((agg[0]?.total || 0) >= hvAmt) ownerNotify.highValueMsg(workspace._id, contact, agg[0].total).catch(() => {});
                  }
                } catch (_e) { /* noop */ }
              }
              const isNewContact = contact.createdAt && Date.now() - new Date(contact.createdAt).getTime() < 5000;
              if (isNewContact) {
                const src = msg.referral?.headline ? `CTWA Ad: ${msg.referral.headline}` : (msg.referral?.source_url ? `Ad: ${msg.referral.source_url}` : 'WhatsApp direct');
                ownerNotify.leadSource(workspace._id, contact, src).catch(() => {});
              } else {
                const prev = await Message.find({ workspace: workspace._id, contact: contact._id }).sort({ createdAt: -1 }).skip(1).limit(1).select('createdAt').lean();
                const prevAt = prev[0]?.createdAt;
                if (prevAt && Date.now() - new Date(prevAt).getTime() > 30 * 24 * 60 * 60 * 1000) {
                  ownerNotify.repeatCustomer(workspace._id, contact, Math.round((Date.now() - new Date(prevAt).getTime()) / 86400000)).catch(() => {});
                }
              }
            } catch (e) { console.error('[OwnerAlert] inbound hooks:', e.message); }

            // Emit via socket
            const io = req.app.get('io');
            if (io) {
              io.to(`workspace:${workspace._id}`).emit('new_message', {
                message,
                conversationId: conversation._id,
              });
              try { require('./pushController').notifyWorkspace(workspace._id, { title: (contact && (contact.name || contact.phone)) || 'New message', body: ((message && message.text) || '').slice(0, 120) || 'New message', url: '/client/chat', tag: String(conversation._id) }); } catch (e) { /* noop */ }
              const populatedConv = await Conversation.findById(conversation._id).populate('contact', 'name phone avatar profileName leadScore');
              io.to(`workspace:${workspace._id}`).emit('conversation_updated', populatedConv);
              console.log('[WH-EMIT] emitted new_message to workspace:', workspace._id.toString());
              require('../services/apiWebhookDispatcher').dispatch(workspace, 'message.received', { conversation_id: conversation._id, contact_id: contact._id, phone: contact.phone, type: msg.type, text: messageData.text || '' }).catch(() => {});
            }
            // Predefined Actions (on_message) + Event Triggers (message_received / contact_created)
            try {
              const actionRunner = require('../services/actionRunner');
              const arCtx = { workspace, contact, conversation, io };
              actionRunner.runPredefined('on_message', arCtx).catch((e) => console.error('[ActionRunner] on_message:', e.message));
              actionRunner.fireEvent(workspace, 'message_received', arCtx).catch((e) => console.error('[ActionRunner] message_received:', e.message));
              if (contact.createdAt && Date.now() - new Date(contact.createdAt).getTime() < 5000) {
                actionRunner.fireEvent(workspace, 'contact_created', arCtx).catch((e) => console.error('[ActionRunner] contact_created:', e.message));
              }
            } catch (e) { console.error('[ActionRunner] inbound hooks:', e.message); }
            // Round-robin auto-assign if no agent assigned
            if (!conversation.assignedAgent) {
              try {
                const { roundRobinAssign } = require("../services/chatRouter");
                const assigned = await roundRobinAssign(workspace._id, conversation._id);
                if (assigned) console.log("[RoundRobin] assigned", conversation._id, "to", assigned);
              } catch (rrErr) { console.error("[RoundRobin]", rrErr.message); }
            }

            if (['text', 'audio', 'interactive', 'button'].includes(msg.type)) {
              try {
                const aiFeatures = require('../services/aiFeatures');
                aiFeatures.analyzeInbound({ workspace, conversation, contact, io }).catch(() => {});
                aiFeatures.maybeCreateTicket({ workspace, conversation, contact, text: messageData.text, io }).catch(() => {});
              } catch (e) { /* noop */ }
            }

            // Bot Flow: template quick-reply button tap -> matching branch
            let templateBtnHandled = false;
            const templateBtnText = msg.type === 'button' ? (msg.button?.text || '').toLowerCase().trim() : '';
            if (msg.type === 'button') {
              try {
                const botFlowEngine = require('../services/botFlowEngine');
                templateBtnHandled = (await botFlowEngine.handleTemplateButton({ workspace, conversation, contact, to: from, text: templateBtnText, io })) === true;
              } catch (e) { console.error('[BotFlow] template button error:', e.message); }
            }

            // Process keywords and automations on text messages
            // (interactive/template button taps are treated as their button title text)
            const buttonReplyText = msg.type === 'interactive'
              ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '')
              : '';
            const voiceText = (msg.type === 'audio' && messageData.metadata?.transcribed) ? (messageData.text || '') : '';
            if (msg.type === 'text' || buttonReplyText || voiceText || templateBtnText) {
              const incomingText = (msg.type === 'text' ? msg.text.body : (voiceText || buttonReplyText || templateBtnText)).toLowerCase().trim();
              let keywordMatched = templateBtnHandled;
              // Opt-out / opt-in (STOP / START) — runs before any automation, keyword reply or AI.
              // Unsubscribed contacts are auto-excluded from broadcasts to avoid WhatsApp blocks.
              try {
                const optOut = require('../services/optOut');
                const waOO = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                const oo = await optOut.handleInbound({ workspace, contact, text: incomingText, wa: waOO });
                if (oo.changed) {
                  keywordMatched = true;
                  if (io) {
                    const pcOO = await Conversation.findById(conversation._id).populate('contact', 'name phone avatar profileName leadScore status');
                    io.to(`workspace:${workspace._id}`).emit('conversation_updated', pcOO);
                  }
                  console.log('[optOut]', oo.type, 'for', from);
                  if (oo.type === 'in') {
                    require('../services/actionRunner').runPredefined('on_subscribe', { workspace, contact, conversation, io }).catch((e) => console.error('[ActionRunner] on_subscribe:', e.message));
                  }
                }
              } catch (e) { console.error('[optOut] inbound:', e.message); }
              // Is AI effectively ON for this chat? Mirrors the inbox "Chat AI" pill:
              // ON when the per-chat toggle is on OR global AI is enabled — unless muted.
              let aiOnForChat = conversation.aiEnabled === true;
              if (conversation.assignedAgent && !aiOnForChat) {
                try {
                  const AISettings = require('../models/AISettings');
                  const _ais = await AISettings.findOne({ workspace: workspace._id }).select('enabled');
                  aiOnForChat = conversation.aiDisabled !== true && !!(_ais && _ais.enabled);
                } catch (e) { /* ignore */ }
              }
              // Agent-assigned chats are handled by humans — skip bot flows & keyword replies,
              // but AI keeps replying whenever it is ON for this chat (assignment must not stop it).
              let aiEvalWhenAssigned = false;
              if (conversation.assignedAgent && conversation.aiEnabled !== true) {
                keywordMatched = true;
                aiEvalWhenAssigned = aiOnForChat;
              }
              // Bot Flow question card: a pending open question consumes this reply first
              if (!keywordMatched && (msg.type === 'text' || voiceText)) {
                try {
                  const botFlowEngine = require('../services/botFlowEngine');
                  const rawAnswer = msg.type === 'text' ? msg.text.body : voiceText;
                  if (await botFlowEngine.handleAwaitingAnswer({ workspace, conversation, contact, to: from, text: rawAnswer, io })) keywordMatched = true;
                } catch (e) { console.error('[BotFlow] question answer error:', e.message); }
              }
              // Automations (bot flows, keywords, automation builder) run first;
              // AI only replies when nothing matched (see keywordMatched gate below).
              const aiHandles = false;

              // 0. Check for Appointment reply commands (RESCHEDULE, CANCEL, date replies)
              const fromClean = from.replace(/[^0-9]/g, '');
              const fromLast10 = fromClean.slice(-10);

              // Preset quick-reply button tap -> send its configured value
              const presetBtnId = msg.type === 'interactive' ? (msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '') : '';
              const pbMatch = presetBtnId.match(/^preset_([0-9a-f]{24})_(\d+)$/);
              const plMatch = presetBtnId.match(/^plist_([0-9a-f]{24})_(\d+)$/);
              if (pbMatch || plMatch) {
                try {
                  const PresetMessage = require('../models/PresetMessage');
                  const pm = await PresetMessage.findById((pbMatch || plMatch)[1]);
                  let val = '';
                  if (pbMatch) {
                    const pbtn = pm?.buttons?.[parseInt(pbMatch[2], 10)];
                    val = pbtn?.value || (pbtn?.type === 'URL' ? pbtn.url : '') || (pbtn?.type === 'PHONE_NUMBER' ? pbtn.phone : '');
                  } else {
                    val = pm?.listItems?.[parseInt(plMatch[2], 10)]?.value || '';
                  }
                  if (val) {
                    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                    const vr = await wa.sendTextMessage(from, val);
                    if (vr?.success) {
                      const vMsg = await Message.create({
                        workspace: workspace._id,
                        conversation: conversation._id,
                        contact: contact._id,
                        direction: 'outbound',
                        type: 'text',
                        text: val,
                        waMessageId: vr.data?.messages?.[0]?.id || '',
                        status: 'sent',
                        metadata: { source: 'preset_button_value' },
                      });
                      if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: vMsg, conversationId: conversation._id });
                      keywordMatched = true;
                      console.log('[Preset] button value reply sent');
                    }
                  }
                } catch (e) { console.error('[Preset] button reply error:', e.message); }
              }

              // Bot Flow: interactive button tap -> linked node; text -> trigger keyword
              if (!keywordMatched) {
                try {
                  const botFlowEngine = require('../services/botFlowEngine');
                  const fbRate = presetBtnId.match(/^fbrate_([1-5])$/);
                  const bfProd = presetBtnId.match(/^bfprod_([0-9a-f]{24})_(.+)_([0-9a-f]{24})$/);
                  const prsProd = presetBtnId.match(/^prsprod_(?:[0-9a-f]{24}|x)_([0-9a-f]{24})$/);
                  const bfSlot = presetBtnId.match(/^bfslot_([0-9a-f]{24})_(.+)_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/);
                  const bfBtn = presetBtnId.match(/^bf_([0-9a-f]{24})_(.+)$/);
                  if (fbRate) {
                    const Feedback = require('../models/Feedback');
                    const rating = Number(fbRate[1]);
                    await Feedback.create({ workspace: workspace._id, contact: contact._id, conversation: conversation._id, rating });
                    if (rating <= 2) require('../services/ownerNotify').badRating(workspace._id, contact, rating).catch(() => {});
                    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                    const thanks = rating >= 4
                      ? 'Thank you for your feedback! 🙏⭐ Have a great day.'
                      : 'Thank you for your feedback 🙏 We will do our best to improve.';
                    await sendAndLog(wa, from, thanks, io, workspace, conversation, contact, 'feedback');
                    keywordMatched = true;
                  } else if (bfProd) {
                    if (await botFlowEngine.sendProductDetail({ flowId: bfProd[1], nodeId: bfProd[2], productId: bfProd[3], workspace, conversation, contact, to: from, io })) keywordMatched = true;
                  } else if (prsProd) {
                    if (await botFlowEngine.sendPresetProductDetail({ productId: prsProd[1], workspace, conversation, contact, to: from, io })) keywordMatched = true;
                  } else if (bfSlot) {
                    if (await botFlowEngine.bookChosenSlot({ flowId: bfSlot[1], nodeId: bfSlot[2], dateStr: bfSlot[3], timeStr: bfSlot[4], workspace, conversation, contact, to: from, io })) keywordMatched = true;
                  } else if (bfBtn) {
                    if (await botFlowEngine.sendFlowNode({ flowId: bfBtn[1], nodeId: bfBtn[2].replace(/_\d+$/, ''), workspace, conversation, contact, to: from, io })) keywordMatched = true;
                  } else if (msg.type === 'text' || voiceText || templateBtnText) {
                    if (await botFlowEngine.handleTrigger({ workspace, conversation, contact, to: from, text: incomingText, io })) keywordMatched = true;
                  }
                } catch (e) { console.error('[BotFlow] error:', e.message); }
              }
              
              if (incomingText === 'reschedule' || incomingText === 'cancel' || incomingText === 'confirm') {
                try {
                  const Appointment = require('../models/Appointment');
                  // Match phone with or without country code
                  const latestAppt = await Appointment.findOne({
                    workspace: workspace._id,
                    $or: [
                      { contactPhone: { $regex: fromLast10 + '$' } },
                      { contact: contact?._id },
                    ],
                    status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
                  }).sort('-createdAt');

                  if (latestAppt) {
                    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                    if (incomingText === 'confirm') {
                      latestAppt.status = 'confirmed';
                      await latestAppt.save();
                      const d = new Date(latestAppt.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
                      await sendAndLog(wa, from, 'Your appointment is confirmed: "' + latestAppt.title + '" — ' + d + ' at ' + latestAppt.startTime + '. Thank you!', io, workspace, conversation, contact, 'appointment');
                      keywordMatched = true;
                      console.log('[Appointment] Customer confirmed via reply:', latestAppt.title);
                    } else if (incomingText === 'cancel') {
                      latestAppt.status = 'cancelled';
                      await latestAppt.save();
                      await sendAndLog(wa, from, 'Your appointment "' + latestAppt.title + '" has been cancelled. Reply BOOK to schedule a new one.', io, workspace, conversation, contact, 'appointment');
                      keywordMatched = true;
                      console.log('[Appointment] Customer cancelled via reply:', latestAppt.title);
                    } else if (incomingText === 'reschedule') {
                      // Mark as pending reschedule so we can track the date reply
                      latestAppt.pendingReschedule = true;
                      await latestAppt.save();
                      await sendAndLog(wa, from, 'To reschedule your appointment "' + latestAppt.title + '", please reply with new date and time in format:\n\nDD/MM/YYYY HH:MM\n\nExample: 15/07/2026 14:30', io, workspace, conversation, contact, 'appointment');
                      keywordMatched = true;
                      console.log('[Appointment] Customer requested reschedule:', latestAppt.title);
                    }
                  }
                } catch (apptErr) {
                  console.error('[Appointment] Reply handling error:', apptErr.message);
                }
              }

              // 0b. Check for reschedule date reply (DD/MM/YYYY HH:MM format)
              if (!keywordMatched) {
                const dateMatch = incomingText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})$/);
                if (dateMatch) {
                  try {
                    const Appointment = require('../models/Appointment');
                    const pendingAppt = await Appointment.findOne({
                      workspace: workspace._id,
                      $or: [
                        { contactPhone: { $regex: fromLast10 + '$' } },
                        { contact: contact?._id },
                      ],
                      status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
                    }).sort('-createdAt');

                    if (pendingAppt) {
                      const [, day, month, year, hour, minute] = dateMatch;
                      const newDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                      
                      if (isNaN(newDate.getTime()) || newDate < new Date()) {
                        const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                        await sendAndLog(wa, from, 'Invalid date. Please enter a future date in format DD/MM/YYYY HH:MM\n\nExample: 15/07/2026 14:30', io, workspace, conversation, contact, 'appointment');
                      } else {
                        // Check time slot conflict
                        const newStartTime = hour.padStart(2, '0') + ':' + minute;
                        const endH = parseInt(hour) + Math.floor((parseInt(minute) + 30) / 60);
                        const endM = (parseInt(minute) + 30) % 60;
                        const newEndTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
                        
                        const dayStart = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
                        const dayEnd = new Date(dayStart.getTime() + 86400000);
                        const conflictAppt = await Appointment.findOne({
                          workspace: workspace._id,
                          _id: { $ne: pendingAppt._id },
                          date: { $gte: dayStart, $lt: dayEnd },
                          status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
                          $expr: {
                            $and: [
                              { $lt: [{ $toInt: { $replaceAll: { input: '$startTime', find: ':', replacement: '' } } }, parseInt(newEndTime.replace(':', ''))] },
                              { $gt: [{ $toInt: { $replaceAll: { input: '$endTime', find: ':', replacement: '' } } }, parseInt(newStartTime.replace(':', ''))] },
                            ]
                          }
                        });
                        
                        if (conflictAppt) {
                          const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                          await sendAndLog(wa, from, 'Sorry! This time slot is already booked ("' + conflictAppt.title + '" at ' + conflictAppt.startTime + '-' + conflictAppt.endTime + '). Please choose a different time.\n\nReply with: DD/MM/YYYY HH:MM', io, workspace, conversation, contact, 'appointment');
                          keywordMatched = true;
                        } else {
                        pendingAppt.previousDate = pendingAppt.date;
                        pendingAppt.previousTime = pendingAppt.startTime;
                        pendingAppt.date = newDate;
                        pendingAppt.startTime = hour.padStart(2, '0') + ':' + minute;
                        const endH = parseInt(hour) + Math.floor((parseInt(minute) + 30) / 60);
                        const endM = (parseInt(minute) + 30) % 60;
                        pendingAppt.endTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
                        pendingAppt.status = 'rescheduled';
                        pendingAppt.pendingReschedule = false;
                        pendingAppt.rescheduleCount = (pendingAppt.rescheduleCount || 0) + 1;
                        pendingAppt.reminder1hSent = false;
                        pendingAppt.reminder24hSent = false;
                        await pendingAppt.save();

                        const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                        const dateStr = newDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
                        await sendAndLog(wa, from, 'Your appointment "' + pendingAppt.title + '" has been rescheduled to ' + dateStr + ' at ' + pendingAppt.startTime + ' (IST). See you then!', io, workspace, conversation, contact, 'appointment');
                        console.log('[Appointment] Customer rescheduled via reply:', pendingAppt.title, 'to', dateStr);
                        }
                      }
                      keywordMatched = true;
                    }
                  } catch (apptErr) {
                    console.error('[Appointment] Date reply error:', apptErr.message);
                  }
                }
              }

              // 0c. Automation settings: welcome / out-of-office / auto-assign
              if (!aiHandles) {
                try {
                  const AutomationSettings = require('../models/AutomationSettings');
                  const autoSettings = await AutomationSettings.findOne({ workspace: workspace._id });
                  if (autoSettings) {
                    const waAuto = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                    // Welcome message: first ever inbound message from this contact
                    if (autoSettings.welcome && autoSettings.welcome.enabled && (autoSettings.welcome.message || autoSettings.welcome.stickerUrl)) {
                      const inboundCount = await Message.countDocuments({ conversation: conversation._id, direction: 'inbound' });
                      if (inboundCount <= 1) {
                        if (autoSettings.welcome.message) {
                          await sendAndLog(waAuto, from, autoSettings.welcome.message, io, workspace, conversation, contact, 'welcome');
                        }
                        if (autoSettings.welcome.stickerUrl) {
                          await sendStickerAndLog(waAuto, from, autoSettings.welcome.stickerUrl, io, workspace, conversation, contact, 'welcome');
                        }
                        console.log('[Automation] Welcome message sent to', from);
                      }
                    }
                    // Out of office: outside working hours (IST)
                    const ooo = autoSettings.outOfOffice;
                    if (ooo && ooo.enabled && (ooo.message || ooo.stickerUrl)) {
                      const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
                      const day = nowIST.getUTCDay();
                      const hm = String(nowIST.getUTCHours()).padStart(2, '0') + ':' + String(nowIST.getUTCMinutes()).padStart(2, '0');
                      const workingDay = (ooo.days || []).includes(day);
                      const withinHours = hm >= (ooo.startTime || '09:00') && hm <= (ooo.endTime || '18:00');
                      if (!workingDay || !withinHours) {
                        const cacheKey = String(conversation._id);
                        const last = oooSentCache.get(cacheKey) || 0;
                        if (Date.now() - last > 6 * 60 * 60 * 1000) {
                          oooSentCache.set(cacheKey, Date.now());
                          if (ooo.message) await sendAndLog(waAuto, from, ooo.message, io, workspace, conversation, contact, 'out_of_office');
                          if (ooo.stickerUrl) await sendStickerAndLog(waAuto, from, ooo.stickerUrl, io, workspace, conversation, contact, 'out_of_office');
                          console.log('[Automation] Out-of-office message sent to', from);
                        }
                      }
                    }
                    // Auto assign: keyword rules -> assign agent + label
                    for (const rule of autoSettings.autoAssignRules || []) {
                      const kw = (rule.keyword || '').toLowerCase().trim();
                      if (!kw) continue;
                      const matched = rule.matchType === 'exact' ? incomingText === kw
                        : rule.matchType === 'starts_with' ? incomingText.startsWith(kw)
                        : incomingText.includes(kw);
                      if (!matched) continue;
                      if (rule.agent && !conversation.assignedAgent) {
                        conversation.assignedAgent = rule.agent;
                        await conversation.save();
                        console.log('[Automation] Auto-assigned conversation to agent', String(rule.agent));
                      }
                      if (rule.tag && contact) {
                        const Tag = require('../models/Tag');
                        const tagDoc = await Tag.findOneAndUpdate(
                          { workspace: workspace._id, name: rule.tag },
                          { $setOnInsert: { workspace: workspace._id, name: rule.tag } },
                          { new: true, upsert: true }
                        );
                        if (!(contact.tags || []).some(t => String(t) === String(tagDoc._id))) {
                          contact.tags = [...(contact.tags || []), tagDoc._id];
                          await contact.save();
                          console.log('[Automation] Auto-tagged contact:', rule.tag);
                        }
                      }
                      break;
                    }
                  }
                } catch (autoErr) {
                  console.error('[Automation] settings processing error:', autoErr.message);
                }
              }

              // 1. Check Keyword model (separate keywords feature)
              try {
                const keywords = await Keyword.find({
                  workspace: workspace._id,
                  status: 'active',
                });

                if (!aiHandles) for (const kw of keywords) {
                  const kwText = kw.keyword.toLowerCase().trim();
                  const kwList = kwText.split(',').map(k => k.trim()).filter(k => k);
                  let matched = false;

                  for (const kwItem of kwList) {
                    if (kw.matchType === 'exact' && incomingText === kwItem) matched = true;
                    else if (kw.matchType === 'contains' && incomingText.includes(kwItem)) matched = true;
                    else if (kw.matchType === 'starts_with' && incomingText.startsWith(kwItem)) matched = true;
                    else if (kw.matchType === 'regex') {
                      try { if (new RegExp(kwItem, 'i').test(incomingText)) matched = true; } catch {}
                    }
                  }

                  if (matched) {
                    keywordMatched = true;
                    kw.stats.triggered++;
                    kw.stats.lastTriggeredAt = new Date();
                    await kw.save();

                    // Send reply based on responseType
                    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);

                    if (kw.responseType === 'text' && kw.responseText) {
                      const replyText = kw.responseText
                        .replace(/\{\{name\}\}/g, contact.name || '')
                        .replace(/\{\{phone\}\}/g, contact.phone || '');
                      const result = await wa.sendTextMessage(from, replyText);
                      if (result.success) {
                        const kwMsg = await Message.create({
                          workspace: workspace._id,
                          conversation: conversation._id,
                          contact: contact._id,
                          direction: 'outbound',
                          type: 'text',
                          text: replyText,
                          waMessageId: result.data?.messages?.[0]?.id || '',
                          status: 'sent',
                          metadata: { source: 'keyword_auto_reply', keywordId: kw._id },
                        });
                        // Update conversation last message
                        await Conversation.findByIdAndUpdate(conversation._id, {
                          lastMessage: { text: replyText, timestamp: new Date(), direction: 'outbound', type: 'text' },
                        });
                        // Socket emit
                        if (io) {
                          io.to(`workspace:${workspace._id}`).emit('new_message', { message: kwMsg, conversationId: conversation._id });
                          const updatedConv = await Conversation.findById(conversation._id).populate('contact', 'name phone avatar profileName');
                          io.to(`workspace:${workspace._id}`).emit('conversation_updated', updatedConv);
                        }
                      }
                    } else if (kw.responseType === 'media' && kw.responseMedia?.url) {
                      const mediaType = kw.responseMedia.type || 'image';
                      const result = await wa.sendMediaMessage(from, mediaType, kw.responseMedia.url, kw.responseMedia.caption || '');
                      if (result.success) {
                        const kwMsg = await Message.create({
                          workspace: workspace._id,
                          conversation: conversation._id,
                          contact: contact._id,
                          direction: 'outbound',
                          type: mediaType,
                          text: kw.responseMedia.caption || '',
                          media: { url: kw.responseMedia.url, caption: kw.responseMedia.caption || '' },
                          waMessageId: result.data?.messages?.[0]?.id || '',
                          status: 'sent',
                          metadata: { source: 'keyword_auto_reply', keywordId: kw._id },
                        });
                        await Conversation.findByIdAndUpdate(conversation._id, {
                          lastMessage: { text: kw.responseMedia.caption || `[${mediaType}]`, timestamp: new Date(), direction: 'outbound', type: mediaType },
                        });
                        if (io) {
                          io.to(`workspace:${workspace._id}`).emit('new_message', { message: kwMsg, conversationId: conversation._id });
                        }
                      }
                    } else if (kw.responseType === 'template' && kw.responseTemplate) {
                      const Template = require('../models/Template');
                      const template = await Template.findById(kw.responseTemplate);
                      if (template) {
                        const result = await wa.sendTemplateMessage(from, template.name, template.language || 'en');
                        if (result.success) {
                          const kwMsg = await Message.create({
                            workspace: workspace._id,
                            conversation: conversation._id,
                            contact: contact._id,
                            direction: 'outbound',
                            type: 'template',
                            text: template.body || template.name,
                            template: { name: template.name, language: template.language || 'en', components: [] },
                            waMessageId: result.data?.messages?.[0]?.id || '',
                            status: 'sent',
                            metadata: { source: 'keyword_auto_reply', keywordId: kw._id },
                          });
                          await Conversation.findByIdAndUpdate(conversation._id, {
                            lastMessage: { text: `Template: ${template.name}`, timestamp: new Date(), direction: 'outbound', type: 'template' },
                          });
                          if (io) {
                            io.to(`workspace:${workspace._id}`).emit('new_message', { message: kwMsg, conversationId: conversation._id });
                          }
                        }
                      }
                    }

                    break; // Only trigger first matching keyword
                  }
                }
              } catch (err) {
                console.error('Keyword processing error:', err.message);
              }

              // 2. Check Automation model (automation builder feature)
              if (!keywordMatched && !aiHandles) {
                try {
                  const automations = await Automation.find({
                    workspace: workspace._id,
                    status: 'active',
                    triggerType: 'keyword',
                  });

                  for (const auto of automations) {
                    const keywords = auto.triggerConfig.keywords || [];
                    const matchType = auto.triggerConfig.matchType || 'contains';
                    let matched = false;

                    for (const keyword of keywords) {
                      const kw = keyword.toLowerCase().trim();
                      if (matchType === 'exact' && incomingText === kw) matched = true;
                      else if (matchType === 'contains' && incomingText.includes(kw)) matched = true;
                      else if (matchType === 'starts_with' && incomingText.startsWith(kw)) matched = true;
                    }

                    if (matched) {
                      auto.stats.triggered++;
                      await auto.save();
                      // Execute automation flow
                      const AutomationEngine = require('../services/automationEngine');
                      const engine = new AutomationEngine(io);
                      engine.execute(auto._id, workspace, contact, msg).catch(err =>
                        console.error('Automation execution error:', err.message)
                      );
                      break; // Only trigger first matching automation
                    }
                  }
                } catch (err) {
                  console.error('Automation processing error:', err.message);
                }
              }

              // 3. AI Chatbot Auto-Reply
              if (!keywordMatched || aiEvalWhenAssigned) {
                try {
                  const AISettings = require('../models/AISettings');
                  const aiSettings = await AISettings.findOne({ workspace: workspace._id });
                  const aiResolver = require('../services/aiResolver');
                  const aiCreds = await aiResolver.resolveAiCreds(workspace, aiSettings);
                  if (aiSettings && aiCreds && aiCreds.apiKey) {
                    // Check targeting rules
                    let shouldReply = false;
                    const rules = aiSettings.targetingRules || {};

                    // Global AI auto-reply: only applies when enabled in AI Chatbot Settings.
                    if (aiSettings.enabled) {
                      if (rules.mode === 'all') {
                        shouldReply = true;
                      } else if (rules.targets && rules.targets.length > 0) {
                        for (const target of rules.targets) {
                          if (target.type === 'all') shouldReply = true;
                          else if (target.type === 'new_leads' && contact.createdAt > new Date(Date.now() - 24*60*60*1000)) shouldReply = true;
                          else if (target.type === 'unassigned' && !conversation.assignedAgent) shouldReply = true;
                        }
                      } else {
                        shouldReply = true;
                      }
                      // Exclude rules — but assignment must not stop AI when it is ON for this chat.
                      if (rules.excludeAssigned && conversation.assignedAgent && !aiEvalWhenAssigned) shouldReply = false;
                    }

                    // Per-conversation "Chat AI" toggle overrides — works even if global AI is OFF.
                    if (conversation.aiEnabled === true) shouldReply = true;
                    // Manual per-chat OFF beats everything, including global AI.
                    if (conversation.aiDisabled === true) shouldReply = false;
                    
                    // Check handoff keywords
                    const handoffKeywords = aiSettings.handoffRules?.keywords || [];
                    const isHandoff = handoffKeywords.some(kw => incomingText.includes(kw.toLowerCase()));
                    
                    if (isHandoff) {
                      const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                      await sendAndLog(wa, from, aiSettings.handoffRules.autoHandoffMessage || 'Connecting you with a human agent...', io, workspace, conversation, contact, 'ai_handoff');
                      aiSettings.stats.totalHandoffs++;
                      await aiSettings.save();
                      shouldReply = false;
                    }

                    if (shouldReply) {
                      const aiService = require('../services/aiService');
                      // Get recent conversation context
                      const recentMessages = await Message.find({ conversation: conversation._id }).sort('-createdAt').limit(10);
                      const chatHistory = recentMessages.reverse().map(m => ({
                        role: m.direction === 'inbound' ? 'user' : 'assistant',
                        content: m.text || m.caption || '[media]',
                      }));
                      
                      const knowledgeBlock = await aiResolver.buildKnowledgeBlock(workspace._id, aiSettings);
                      const systemMsg = (aiSettings.systemPrompt || '') + knowledgeBlock
                        + '\n\nTOOLS: You can book appointments (book_appointment: collect name, date, time, purpose first), save sales leads (save_lead), schedule an AI callback call (schedule_callback), notify the human team (transfer_to_human), cancel a scheduled callback (cancel_callback), send the catalog/price list (send_catalog), and look up order status (get_order_status). For relative times like "abhi", "2 minute baad", "aadhe ghante baad" use schedule_callback with minutes_from_now instead of date/time. Always confirm to the customer after a tool succeeds. To CHANGE a callback time, call schedule_callback again with the new time (it updates the same reminder, never create a duplicate). To CANCEL a callback, call cancel_callback. Current date/time: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' (IST).'
                        + '\n\nLANGUAGE: Start and greet in English by default. Mirror the language of the customer\'s most recent message — Hindi → reply in Hindi, Hinglish (Roman Hindi) → reply in Hinglish, any other language → that language. If the language is unclear, use English.'
                        + '\n\nCALLBACK REMINDER: If the customer asks you to call them back (later / on phone) and has not given an exact time, politely ask what time you should call (accept relative times like \"kal 4 baje\", \"shaam 6 baje\", \"2 ghante baad\"). Once the customer states a time, confirm it warmly in your reply, then append on a NEW LINE at the very end this hidden marker (the customer will NOT see it): [[REMIND: YYYY-MM-DD HH:MM]] using 24-hour IST computed from the current date/time above. Only emit the marker after the customer has actually given a time.';
                      const messages = [{ role: 'system', content: systemMsg }, ...chatHistory];

                      let result;
                      if (aiCreds.provider === 'openai' || aiCreds.provider === 'azure') {
                        // Tool-enabled reply: same tools as the AI calling agent.
                        const aiCallBridge = require('../services/aiCallBridge');
                        const AICallingAgent = require('../models/AICallingAgent');
                        const chatAgent = await AICallingAgent.findOne({ workspace: workspace._id, isDefault: true, status: 'active' })
                          || await AICallingAgent.findOne({ workspace: workspace._id, status: 'active' });
                        const toolCtx = {
                          workspaceId: workspace._id,
                          phone: from,
                          accessToken: workspace.whatsapp.accessToken,
                          phoneNumberId: workspace.whatsapp.phoneNumberId,
                          agent: chatAgent,
                        };
                        const toolDefs = [
                          { type: 'function', function: { name: 'book_appointment', description: 'Book an appointment for the customer.', parameters: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: '24h HH:MM IST' }, purpose: { type: 'string' } }, required: ['date', 'time'] } } },
                          { type: 'function', function: { name: 'save_lead', description: 'Save the customer as a sales lead when they show interest.', parameters: { type: 'object', properties: { name: { type: 'string' }, requirement: { type: 'string' }, budget: { type: 'string' } }, required: ['requirement'] } } },
                          { type: 'function', function: { name: 'schedule_callback', description: 'Schedule an AI phone callback. For a specific date/time pass date+time; for relative requests ("abhi", "in 2 minutes", "after half an hour") pass minutes_from_now instead.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: '24h HH:MM IST' }, minutes_from_now: { type: 'number', description: 'Minutes from now (use for relative/immediate requests)' }, reason: { type: 'string' } } } } },
                          { type: 'function', function: { name: 'cancel_callback', description: 'Cancel a pending callback/reminder for the customer when they say they no longer want the call. Logs the cancellation.', parameters: { type: 'object', properties: { reason: { type: 'string' } } } } },
                          { type: 'function', function: { name: 'transfer_to_human', description: 'Notify the human team that the customer wants to talk to a person.', parameters: { type: 'object', properties: { reason: { type: 'string' } } } } },
                          { type: 'function', function: { name: 'send_catalog', description: 'Send the business catalog/price list to the customer on WhatsApp.', parameters: { type: 'object', properties: {} } } },
                          { type: 'function', function: { name: 'get_order_status', description: 'Look up order status by order number or latest order.', parameters: { type: 'object', properties: { order_number: { type: 'string' } } } } },
                        ];
                        const convo = [...messages];
                        let usage = null;
                        for (let round = 0; round < 4; round++) {
                          const r = await aiService.chatRaw(aiCreds.provider, aiCreds.apiKey, convo, {
                            model: aiCreds.model,
                            temperature: aiSettings.temperature,
                            maxTokens: aiSettings.maxTokens,
                            extra: { tools: toolDefs, tool_choice: 'auto' },
                            ...aiService.azureOpts(aiCreds),
                          });
                          usage = r.usage;
                          const msg = r.message;
                          if (msg.tool_calls && msg.tool_calls.length) {
                            convo.push(msg);
                            for (const tc of msg.tool_calls) {
                              let toolResult;
                              try {
                                toolResult = await aiCallBridge.handleTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'), toolCtx);
                              } catch (te) { toolResult = { ok: false, error: te.message }; }
                              console.log('[AI Chatbot] tool', tc.function.name, JSON.stringify(toolResult).slice(0, 200));
                              convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
                            }
                            continue;
                          }
                          result = { content: msg.content, usage };
                          break;
                        }
                        if (!result) result = { content: '', usage };
                      } else {
                        result = await aiService.chat(aiCreds.provider, aiCreds.apiKey, messages, {
                          model: aiCreds.model,
                          temperature: aiSettings.temperature,
                          maxTokens: aiSettings.maxTokens,
                          ...aiService.azureOpts(aiCreds),
                        });
                      }

                      if (result.content) {
                        try {
                          const cb = require('../services/callbackReminder');
                          if (cb.CALLBACK_RE.test(result.content)) { await cb.extractAndSchedule(workspace, contact, result.content); result.content = cb.stripMarker(result.content); }
                        } catch (e) { /* noop */ }
                        const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
                        // Voice question gets a voice answer (OpenAI TTS); falls back to text.
                        let aiVoiceUrl = null;
                        if (msg.type === 'audio') {
                          try { aiVoiceUrl = await require('../services/aiFeatures').textToSpeech(workspace._id, result.content); }
                          catch (te) { console.error('[AI Voice] TTS failed:', te.message); }
                        }
                        let sendResult;
                        if (aiVoiceUrl) {
                          sendResult = await wa.sendMediaMessage(from, 'audio', aiVoiceUrl, '');
                          if (!sendResult?.success) { aiVoiceUrl = null; sendResult = await wa.sendTextMessage(from, result.content); }
                        } else {
                          sendResult = await wa.sendTextMessage(from, result.content);
                        }
                        if (sendResult.success) {
                          const aiMsg = await Message.create({
                            workspace: workspace._id,
                            conversation: conversation._id,
                            contact: contact._id,
                            direction: 'outbound',
                            type: aiVoiceUrl ? 'audio' : 'text',
                            text: result.content,
                            media: aiVoiceUrl ? { url: aiVoiceUrl } : undefined,
                            waMessageId: sendResult.data?.messages?.[0]?.id || '',
                            status: 'sent',
                            metadata: { source: 'ai_auto_reply', provider: aiSettings.provider, isAI: true, voiceReply: !!aiVoiceUrl },
                          });
                          await Conversation.findByIdAndUpdate(conversation._id, {
                            lastMessage: { text: result.content, timestamp: new Date(), direction: 'outbound', type: 'text' },
                          });
                          if (io) {
                            io.to(`workspace:${workspace._id}`).emit('new_message', { message: aiMsg, conversationId: conversation._id });
                          }
                          aiSettings.stats.totalReplies++;
                          aiSettings.stats.totalTokensUsed += (result.usage?.total_tokens || 0);
                          aiSettings.stats.lastActiveAt = new Date();
                          await aiSettings.save();
                          console.log('[AI Chatbot] Replied to', from);
                        }
                      }
                    }
                  }
                } catch (aiErr) {
                  console.error('[AI Chatbot] Error:', aiErr.message);
                }
              }

              // 3. Check automations with triggerType 'message_received' (all messages trigger)
              try {
                const msgAutomations = await Automation.find({
                  workspace: workspace._id,
                  status: 'active',
                  triggerType: 'message_received',
                });

                for (const auto of msgAutomations) {
                  auto.stats.triggered++;
                  await auto.save();
                  const AutomationEngine = require('../services/automationEngine');
                  const engine = new AutomationEngine(io);
                  engine.execute(auto._id, workspace, contact, msg).catch(err =>
                    console.error('Automation (msg_received) error:', err.message)
                  );
                }
              } catch (err) {
                console.error('Message automation error:', err.message);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
};

// @POST /api/webhook/razorpay
const handleRazorpayWebhook = async (req, res) => {
  try {
    const event = req.body;
    // Collect every secret this event could be signed with: the master's global
    // secret (env / SystemSettings) plus the per-workspace Razorpay integration
    // secret, because payment links are created with each workspace's own
    // Razorpay account (whose webhook is configured with that account's secret).
    const secrets = [];
    if (process.env.RAZORPAY_WEBHOOK_SECRET) secrets.push(process.env.RAZORPAY_WEBHOOK_SECRET);
    try {
      const SystemSettings = require('../models/SystemSettings');
      const sysSettings = await SystemSettings.findOne().select('paymentGateways.razorpay.webhookSecret').lean();
      const gs = sysSettings?.paymentGateways?.razorpay?.webhookSecret;
      if (gs) secrets.push(gs);
    } catch (e) { /* ignore */ }
    try {
      const wsId = event?.payload?.payment_link?.entity?.notes?.workspace
        || event?.payload?.payment?.entity?.notes?.workspace
        || event?.payload?.subscription?.entity?.notes?.workspace
        || event?.payload?.order?.entity?.notes?.workspace;
      if (wsId) {
        const Integration = require('../models/Integration');
        const integ = await Integration.findOne({ workspace: wsId, type: 'razorpay' }).select('config webhookSecret').lean();
        const ws = integ?.config?.webhookSecret || integ?.webhookSecret;
        if (ws) secrets.push(ws);
      }
    } catch (e) { /* ignore */ }
    if (secrets.length && req.rawBody) {
      const crypto = require('crypto');
      const signature = req.headers['x-razorpay-signature'] || '';
      const sigBuf = Buffer.from(signature);
      const valid = secrets.some((s) => {
        const expected = crypto.createHmac('sha256', s).update(req.rawBody).digest('hex');
        return sigBuf.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), sigBuf);
      });
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    const Payment = require('../models/Payment');
    const User = require('../models/User');
    const WalletTransaction = require('../models/WalletTransaction');

    if (event.event === 'payment_link.paid') {
      const PaymentLink = require('../models/PaymentLink');
      const entity = event.payload.payment_link.entity;
      const pl = await PaymentLink.findOne({ razorpayLinkId: entity.id });
      if (pl && pl.status !== 'paid') {
        pl.status = 'paid';
        pl.paidAt = new Date();
        await pl.save();
        const io = req.app.get('io');
        if (io) io.to(`workspace:${pl.workspace}`).emit('payment_link_paid', { id: String(pl._id), amount: pl.amount, contact: String(pl.contact) });
        require('../services/paymentAutomation').deliverPaymentOutcome(pl._id, 'success', io);
      }
    }

    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity;
      const plId = paymentEntity?.notes?.plId;
      if (plId) {
        const PaymentLink = require('../models/PaymentLink');
        const pl = await PaymentLink.findById(plId);
        if (pl && pl.status !== 'paid') {
          require('../services/paymentAutomation').deliverPaymentOutcome(pl._id, 'failure', req.app.get('io'));
        }
      }
    }

    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const payment = await Payment.findOne({ gatewayOrderId: paymentEntity.order_id });

      if (payment && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.gatewayPaymentId = paymentEntity.id;
        await payment.save();

        if (payment.type === 'wallet_topup') {
          const user = await User.findById(payment.user);
          user.walletBalance += payment.amount;
          await user.save();

          await WalletTransaction.create({
            user: user._id,
            type: 'credit',
            amount: payment.amount,
            balanceAfter: user.walletBalance,
            description: 'Wallet top-up',
            category: 'topup',
            reference: payment._id.toString(),
          });
        } else if (payment.type === 'subscription') {
          const user = await User.findById(payment.user);
          const Plan = require('../models/Plan');
          const paidPlan = await Plan.findById(payment.plan);
          let endDate = null;
          if (paidPlan && paidPlan.price > 0) {
            if (paidPlan.interval === 'monthly') endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            else if (paidPlan.interval === 'yearly') endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          }
          user.plan = payment.plan;
          user.planExpiry = endDate;
          await user.save();
          const Subscription = require('../models/Subscription');
          await Subscription.updateMany({ vendor: user._id, status: 'active' }, { status: 'expired' });
          await Subscription.create({ vendor: user._id, plan: payment.plan, status: 'active', endDate, assignedBy: 'auto', payment: payment._id, notes: 'Razorpay payment (webhook)' });
          if (payment.metadata?.couponCode) {
            const Coupon = require('../models/Coupon');
            await Coupon.updateOne({ code: payment.metadata.couponCode }, { $inc: { usedCount: 1 } });
          }
        }
      }
    }

    if (event.event === 'subscription.charged') {
      const subEnt = event.payload?.subscription?.entity;
      const payEnt = event.payload?.payment?.entity;
      if (subEnt && payEnt && !(await Payment.findOne({ gatewayPaymentId: payEnt.id }))) {
        const Subscription = require('../models/Subscription');
        const sub = await Subscription.findOne({ gatewaySubscriptionId: subEnt.id }).sort('-createdAt');
        const userDoc = sub
          ? await User.findById(sub.vendor)
          : await User.findOne({ 'walletAutoTopup.gatewaySubscriptionId': subEnt.id });
        if (sub && userDoc) {
          // Plan renewal: extend expiry by one billing cycle
          const Plan = require('../models/Plan');
          const paidPlan = await Plan.findById(sub.plan);
          const cycleMs = (paidPlan?.interval === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000;
          const base = sub.endDate && sub.endDate > new Date() ? sub.endDate.getTime() : Date.now();
          sub.endDate = new Date(base + cycleMs);
          sub.status = 'active';
          await sub.save();
          userDoc.plan = sub.plan;
          userDoc.planExpiry = sub.endDate;
          await userDoc.save();
          await Payment.create({
            user: userDoc._id, plan: sub.plan, amount: (payEnt.amount || 0) / 100, gateway: 'razorpay',
            gatewayPaymentId: payEnt.id, gatewaySubscriptionId: subEnt.id,
            type: 'subscription', status: 'completed', description: 'Auto-renew charge',
          });
        } else if (!sub && !userDoc) {
          // First charge where the browser verify step never ran: activate from the pending payment
          const pendingPay = await Payment.findOne({ gatewaySubscriptionId: subEnt.id, status: 'pending' }).sort('-createdAt');
          if (pendingPay) {
            const owner = await User.findById(pendingPay.user);
            pendingPay.status = 'completed';
            pendingPay.gatewayPaymentId = payEnt.id;
            await pendingPay.save();
            if (owner && pendingPay.type === 'subscription' && pendingPay.plan) {
              const Plan = require('../models/Plan');
              const paidPlan = await Plan.findById(pendingPay.plan);
              const cycleMs = (paidPlan?.interval === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000;
              const endDate = new Date(Date.now() + cycleMs);
              owner.plan = pendingPay.plan;
              owner.planExpiry = endDate;
              await owner.save();
              const Subscription2 = require('../models/Subscription');
              await Subscription2.updateMany({ vendor: owner._id, status: 'active' }, { status: 'expired' });
              await Subscription2.create({
                vendor: owner._id, plan: pendingPay.plan, status: 'active', endDate,
                autoRenew: true, gatewaySubscriptionId: subEnt.id, assignedBy: 'auto',
                payment: pendingPay._id, notes: 'Razorpay auto-renew (webhook)',
              });
            } else if (owner && pendingPay.type === 'wallet_topup') {
              owner.walletBalance += pendingPay.amount;
              owner.walletAutoTopup = { active: true, amount: pendingPay.amount, gatewaySubscriptionId: subEnt.id };
              await owner.save();
              await WalletTransaction.create({
                user: owner._id, type: 'credit', amount: pendingPay.amount, balanceAfter: owner.walletBalance,
                description: 'Wallet auto top-up', category: 'topup', reference: pendingPay._id.toString(),
              });
            }
          }
        } else if (userDoc && userDoc.walletAutoTopup?.active) {
          // Wallet auto top-up charge
          const amount = (payEnt.amount || 0) / 100;
          userDoc.walletBalance += amount;
          await userDoc.save();
          const payDoc = await Payment.create({
            user: userDoc._id, amount, gateway: 'razorpay',
            gatewayPaymentId: payEnt.id, gatewaySubscriptionId: subEnt.id,
            type: 'wallet_topup', status: 'completed', description: 'Monthly auto wallet top-up',
          });
          await WalletTransaction.create({
            user: userDoc._id, type: 'credit', amount, balanceAfter: userDoc.walletBalance,
            description: 'Wallet auto top-up', category: 'topup', reference: payDoc._id.toString(),
          });
        }
      }
    }

    if (['subscription.cancelled', 'subscription.halted', 'subscription.completed'].includes(event.event)) {
      const subEnt = event.payload?.subscription?.entity;
      if (subEnt) {
        const Subscription = require('../models/Subscription');
        await Subscription.updateMany({ gatewaySubscriptionId: subEnt.id }, { autoRenew: false });
        await User.updateMany(
          { 'walletAutoTopup.gatewaySubscriptionId': subEnt.id },
          { $set: { walletAutoTopup: { active: false, amount: 0, gatewaySubscriptionId: '' } } }
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.json({ success: true });
  }
};

// @POST /api/webhook/stripe
const handleStripeWebhook = async (req, res) => {
  try {
    const event = req.body;
    const Payment = require('../models/Payment');
    const User = require('../models/User');

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const payment = await Payment.findOne({ gatewayPaymentId: session.id });

      if (payment && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.gatewaySubscriptionId = session.subscription;
        await payment.save();

        const user = await User.findById(payment.user);
        const Plan = require('../models/Plan');
        const paidPlan = await Plan.findById(payment.plan);
        let endDate = null;
        if (paidPlan && paidPlan.price > 0) {
          if (paidPlan.interval === 'monthly') endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          else if (paidPlan.interval === 'yearly') endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
        user.plan = payment.plan;
        user.planExpiry = endDate;
        await user.save();
        const Subscription = require('../models/Subscription');
        await Subscription.updateMany({ vendor: user._id, status: 'active' }, { status: 'expired' });
        await Subscription.create({ vendor: user._id, plan: payment.plan, status: 'active', endDate, assignedBy: 'auto', payment: payment._id, notes: 'Stripe payment (webhook)' });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.json({ success: true });
  }
};

module.exports = { verifyWebhook, handleWhatsAppWebhook, handleRazorpayWebhook, handleStripeWebhook };
