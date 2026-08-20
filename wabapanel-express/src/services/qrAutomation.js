// Automation pipeline for the WhatsApp QR (Baileys) and Personal Telegram channels.
// Mirrors the official-API webhook pipeline: bot flows, keywords,
// welcome/out-of-office, and AI auto-reply — all sends go through the
// QR socket (with the warm-up safety engine applied).
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// conversationId -> [{ id, title }] from the last interactive (list/buttons)
// message rendered as numbered text options on the QR channel.
const optionMaps = new Map();

function rememberOptions(conversationId, opts) {
  optionMaps.set(String(conversationId), opts);
  if (optionMaps.size > 5000) optionMaps.delete(optionMaps.keys().next().value);
}

async function channelSend(workspace, conversation, phone, payload) {
  if (conversation.channel === 'telegram_personal') {
    const r = await require('./tgUserService').send(workspace._id, phone, payload);
    return { id: r?.id ? `tgp_${r.id}` : '' };
  }
  if (conversation.channel === 'telegram') {
    const tg = workspace.telegram || {};
    if (!tg.botToken || !tg.enabled) throw new Error('Telegram bot is not connected');
    const tgService = require('./telegramService');
    let r;
    if (payload.media?.url) r = await tgService.sendMedia(tg.botToken, phone, payload.type, payload.media.url, payload.media.caption || payload.text || '');
    else r = await tgService.sendMessage(tg.botToken, phone, payload.text || '');
    return { id: r?.message_id ? `tg_${r.message_id}` : '' };
  }
  if (conversation.channel === 'facebook' || conversation.channel === 'instagram') {
    const mc = workspace.metaChat || {};
    if (!mc.pageAccessToken) throw new Error('Facebook/Instagram is not configured');
    const axios = require('axios');
    const body = { recipient: { id: phone }, messaging_type: 'RESPONSE' };
    if (payload.media?.url) {
      body.message = { attachment: { type: payload.type === 'document' ? 'file' : payload.type, payload: { url: payload.media.url, is_reusable: false } } };
      const r1 = await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${mc.pageAccessToken}`, body);
      const cap = payload.media.caption || payload.text;
      if (cap) await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${mc.pageAccessToken}`, { recipient: { id: phone }, messaging_type: 'RESPONSE', message: { text: cap } });
      return { id: r1.data?.message_id || '' };
    }
    body.message = { text: payload.text || '' };
    const r = await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${mc.pageAccessToken}`, body);
    return { id: r.data?.message_id || '' };
  }
  const r = await require('./waQrService').sendMessage(workspace._id, phone, payload);
  return { id: `qr_${r?.key?.id || ''}` };
}

async function sendAndLogQr({ workspace, conversation, contact, phone, text, source }) {
  const r = await channelSend(workspace, conversation, phone, { type: 'text', text });
  const msg = await Message.create({
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: 'text',
    text,
    waMessageId: r.id,
    status: 'sent',
    metadata: { source, channel: conversation.channel },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: 'text' },
    lastMessageAt: new Date(),
  });
  if (global.io) global.io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  return msg;
}

const oooSentCache = new Map();

async function processIncoming({ workspace, conversation, contact, phone, text, buttonId }) {
  const incomingText = String(text || '').toLowerCase().trim();
  if (!incomingText && !buttonId) return;
  const io = global.io;
  const botFlowEngine = require('./botFlowEngine');
  let handled = false;
  // Agent-assigned chats are handled by humans — skip bot flows & keyword replies.
  // But AI keeps replying whenever it is ON for this chat (per-chat toggle OR global AI,
  // unless muted) — assignment alone must not stop AI. Mirrors the inbox "Chat AI" pill.
  const humanAssigned = conversation.assignedAgent && conversation.aiEnabled !== true;
  let aiEvalWhenAssigned = false;
  if (humanAssigned) {
    let aiGlobalOn = false;
    try {
      const AISettings = require('../models/AISettings');
      const _ais = await AISettings.findOne({ workspace: workspace._id }).select('enabled');
      aiGlobalOn = !!(_ais && _ais.enabled);
    } catch (e) { /* ignore */ }
    aiEvalWhenAssigned = conversation.aiDisabled !== true && aiGlobalOn;
    if (!aiEvalWhenAssigned) return;
  }

  // Bot Flow question card: a pending open question consumes this reply first
  if (!buttonId && incomingText && !aiEvalWhenAssigned) {
    try {
      if (await botFlowEngine.handleAwaitingAnswer({ workspace, conversation, contact, to: phone, text, io })) return;
    } catch (e) { console.error('[qrAuto] question answer error:', e.message); }
  }

  // 1. Numbered/typed reply to a previously sent interactive (list/buttons)
  if (!aiEvalWhenAssigned) try {
    const opts = optionMaps.get(String(conversation._id)) || [];
    let chosen = null;
    const num = parseInt(incomingText, 10);
    if (!isNaN(num) && num >= 1 && num <= opts.length && String(num) === incomingText) chosen = opts[num - 1];
    if (!chosen) chosen = opts.find(o => String(o.title || '').toLowerCase().trim() === incomingText);
    if (buttonId) chosen = { id: buttonId }; // real button tap: id comes directly
    if (chosen) {
      optionMaps.delete(String(conversation._id));
      const id = chosen.id;
      const bfProd = id.match(/^bfprod_([0-9a-f]{24})_(.+)_([0-9a-f]{24})$/);
      const prsProd = id.match(/^prsprod_(?:[0-9a-f]{24}|x)_([0-9a-f]{24})$/);
      const bfSlot = id.match(/^bfslot_([0-9a-f]{24})_(.+)_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/);
      const bfBtn = id.match(/^bf_([0-9a-f]{24})_(.+)$/);
      const pBtn = id.match(/^preset_([0-9a-f]{24})_(\d+)$/);
      const pList = id.match(/^plist_([0-9a-f]{24})_(\d+)$/);
      if (pBtn || pList) {
        const PresetMessage = require('../models/PresetMessage');
        const pm = await PresetMessage.findById((pBtn || pList)[1]);
        let val = '';
        if (pBtn) {
          const b = pm?.buttons?.[parseInt(pBtn[2], 10)];
          val = b?.value || (b?.type === 'URL' ? b.url : '') || (b?.type === 'PHONE_NUMBER' ? b.phone : '');
        } else val = pm?.listItems?.[parseInt(pList[2], 10)]?.value || '';
        if (val) {
          await sendAndLogQr({ workspace, conversation, contact, phone, text: val, source: 'preset_button_value' });
          handled = true;
        }
      }
      else if (bfProd) handled = await botFlowEngine.sendProductDetail({ flowId: bfProd[1], nodeId: bfProd[2], productId: bfProd[3], workspace, conversation, contact, to: phone, io });
      else if (prsProd) handled = await botFlowEngine.sendPresetProductDetail({ productId: prsProd[1], workspace, conversation, contact, to: phone, io });
      else if (bfSlot) handled = await botFlowEngine.bookChosenSlot({ flowId: bfSlot[1], nodeId: bfSlot[2], dateStr: bfSlot[3], timeStr: bfSlot[4], workspace, conversation, contact, to: phone, io });
      else if (bfBtn) handled = await botFlowEngine.sendFlowNode({ flowId: bfBtn[1], nodeId: bfBtn[2].replace(/_\d+$/, ''), workspace, conversation, contact, to: phone, io });
    }
  } catch (e) { console.error('[qrAuto] option reply error:', e.message); }

  // 2. Bot flows: button-title match, then trigger keywords
  if (!handled && !aiEvalWhenAssigned) {
    try {
      if (await botFlowEngine.handleTemplateButton({ workspace, conversation, contact, to: phone, text: incomingText, io })) handled = true;
      else if (await botFlowEngine.handleTrigger({ workspace, conversation, contact, to: phone, text: incomingText, io })) handled = true;
    } catch (e) { console.error('[qrAuto] bot flow error:', e.message); }
  }

  // 3. Keywords (text/media auto-replies)
  if (!handled && !aiEvalWhenAssigned) {
    try {
      const Keyword = require('../models/Keyword');
      const keywords = await Keyword.find({ workspace: workspace._id, status: 'active' });
      for (const kw of keywords) {
        const kwList = String(kw.keyword || '').toLowerCase().trim().split(',').map(k => k.trim()).filter(Boolean);
        let matched = false;
        for (const k of kwList) {
          if (kw.matchType === 'exact' && incomingText === k) matched = true;
          else if (kw.matchType === 'contains' && incomingText.includes(k)) matched = true;
          else if (kw.matchType === 'starts_with' && incomingText.startsWith(k)) matched = true;
          else if (kw.matchType === 'regex') { try { if (new RegExp(k, 'i').test(incomingText)) matched = true; } catch {} }
        }
        if (!matched) continue;
        kw.stats.triggered++;
        kw.stats.lastTriggeredAt = new Date();
        await kw.save();
        if (kw.responseType === 'text' && kw.responseText) {
          const replyText = kw.responseText
            .replace(/\{\{name\}\}/g, contact.name || '')
            .replace(/\{\{phone\}\}/g, contact.phone || '');
          await sendAndLogQr({ workspace, conversation, contact, phone, text: replyText, source: 'keyword_auto_reply' });
          handled = true;
        } else if (kw.responseType === 'media' && kw.responseMedia?.url) {
          const mediaType = kw.responseMedia.type || 'image';
          const r = await channelSend(workspace, conversation, phone, { type: mediaType, media: { url: kw.responseMedia.url, caption: kw.responseMedia.caption || '' } });
          const msg = await Message.create({
            workspace: workspace._id, conversation: conversation._id, contact: contact._id,
            direction: 'outbound', type: mediaType, text: kw.responseMedia.caption || '',
            media: { url: kw.responseMedia.url, caption: kw.responseMedia.caption || '' },
            waMessageId: r.id, status: 'sent',
            metadata: { source: 'keyword_auto_reply', channel: conversation.channel },
          });
          if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
          handled = true;
        }
        if (handled) break;
      }
    } catch (e) { console.error('[qrAuto] keyword error:', e.message); }
  }

  // 4. Welcome / out-of-office (independent of the handled flag, like the API pipeline)
  if (!aiEvalWhenAssigned) try {
    const AutomationSettings = require('../models/AutomationSettings');
    const autoSettings = await AutomationSettings.findOne({ workspace: workspace._id });
    if (autoSettings) {
      if (autoSettings.welcome?.enabled && autoSettings.welcome.message) {
        const inboundCount = await Message.countDocuments({ conversation: conversation._id, direction: 'inbound' });
        if (inboundCount <= 1) {
          await sendAndLogQr({ workspace, conversation, contact, phone, text: autoSettings.welcome.message, source: 'welcome' });
        }
      }
      const ooo = autoSettings.outOfOffice;
      if (ooo?.enabled && ooo.message) {
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
            await sendAndLogQr({ workspace, conversation, contact, phone, text: ooo.message, source: 'out_of_office' });
          }
        }
      }
    }
  } catch (e) { console.error('[qrAuto] automation settings error:', e.message); }

  // 5. AI auto-reply (when nothing else matched)
  if (!handled) {
    try {
      const AISettings = require('../models/AISettings');
      const aiSettings = await AISettings.findOne({ workspace: workspace._id });
      const aiResolver = require('./aiResolver');
      const aiCreds = await aiResolver.resolveAiCreds(workspace, aiSettings);
      if (aiSettings && aiCreds && aiCreds.apiKey) {
        let shouldReply = false;
        const rules = aiSettings.targetingRules || {};
        if (aiSettings.enabled) {
          if (rules.mode === 'all') shouldReply = true;
          else if (rules.targets && rules.targets.length > 0) {
            for (const target of rules.targets) {
              if (target.type === 'all') shouldReply = true;
              else if (target.type === 'new_leads' && contact.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)) shouldReply = true;
              else if (target.type === 'unassigned' && !conversation.assignedAgent) shouldReply = true;
            }
          } else shouldReply = true;
          if (rules.excludeAssigned && conversation.assignedAgent && !aiEvalWhenAssigned) shouldReply = false;
        }
        if (conversation.aiEnabled === true) shouldReply = true;
        if (conversation.aiDisabled === true) shouldReply = false;

        const handoffKeywords = aiSettings.handoffRules?.keywords || [];
        if (handoffKeywords.some(kw => incomingText.includes(String(kw).toLowerCase()))) {
          await sendAndLogQr({ workspace, conversation, contact, phone, text: aiSettings.handoffRules.autoHandoffMessage || 'Connecting you with a human agent...', source: 'ai_handoff' });
          aiSettings.stats.totalHandoffs++;
          await aiSettings.save();
          shouldReply = false;
        }

        if (shouldReply) {
          const aiService = require('./aiService');
          const recentMessages = await Message.find({ conversation: conversation._id }).sort('-createdAt').limit(10);
          const chatHistory = recentMessages.reverse().map(m => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.text || '[media]',
          }));
          const knowledgeBlock = await aiResolver.buildKnowledgeBlock(workspace._id, aiSettings);
          const systemMsg = (aiSettings.systemPrompt || '') + knowledgeBlock
            + '\n\nCurrent date/time: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' (IST).'
            + '\n\nLANGUAGE: Start and greet in English by default. Mirror the language of the customer\'s most recent message — Hindi → reply in Hindi, Hinglish (Roman Hindi) → reply in Hinglish, any other language → that language. If the language is unclear, use English.'
            + '\n\nCALLBACK REMINDER: If the customer asks you to call them back (later / on phone) and has not given an exact time, politely ask what time you should call (accept relative times like \"kal 4 baje\", \"shaam 6 baje\", \"2 ghante baad\"). Once the customer states a time, confirm it warmly in your reply, then append on a NEW LINE at the very end this hidden marker (the customer will NOT see it): [[REMIND: YYYY-MM-DD HH:MM]] using 24-hour IST computed from the current date/time above. Only emit the marker after the customer has actually given a time. If the customer later changes the time, emit the marker again with the new time (the system updates the same reminder, not a new one).';
          const messages = [{ role: 'system', content: systemMsg }, ...chatHistory];
          const result = await aiService.chat(aiCreds.provider, aiCreds.apiKey, messages, {
            model: aiCreds.model,
            temperature: aiSettings.temperature,
            maxTokens: aiSettings.maxTokens,
            ...aiService.azureOpts(aiCreds),
          });
          if (result.content) {
            try {
              const cb = require('./callbackReminder');
              if (cb.CALLBACK_RE.test(result.content)) { await cb.extractAndSchedule(workspace, contact, result.content); result.content = cb.stripMarker(result.content); }
            } catch (e) { /* noop */ }
            const aiMsg = await sendAndLogQr({ workspace, conversation, contact, phone, text: result.content, source: 'ai_auto_reply' });
            if (aiMsg) {
              aiSettings.stats.totalReplies++;
              aiSettings.stats.totalTokensUsed += (result.usage?.total_tokens || 0);
              aiSettings.stats.lastActiveAt = new Date();
              await aiSettings.save();
              console.log('[qrAuto] AI replied to', phone);
            }
          }
        }
      }
    } catch (e) { console.error('[qrAuto] AI error:', e.message); }
  }
}

module.exports = { processIncoming, rememberOptions, channelSend };
