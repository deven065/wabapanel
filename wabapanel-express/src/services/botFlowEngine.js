const BotFlow = require('../models/BotFlow');
const Message = require('../models/Message');
const WhatsAppService = require('./whatsappService');

function pickLang(text, contact) {
  if (!/\[(hi|en)\]/i.test(text)) return text;
  const lang = (contact && contact.language) || 'en';
  const parts = {};
  const re = /\[(hi|en)\]([\s\S]*?)(?=\[(?:hi|en)\]|$)/gi;
  let m;
  while ((m = re.exec(text))) parts[m[1].toLowerCase()] = m[2].trim();
  return parts[lang] || parts.en || parts.hi || text;
}

function renderVars(text, contact, lastReply) {
  if (!text) return text;
  text = pickLang(text, contact);
  const name = contact?.name || contact?.profileName || '';
  const parts = name.trim().split(/\s+/);
  let out = text
    .replace(/\{first_name\}/g, parts[0] || '')
    .replace(/\{last_name\}/g, parts.slice(1).join(' ') || '')
    .replace(/\{full_name\}/g, name)
    .replace(/\{phone_number\}/g, contact?.phone || '')
    .replace(/\{last_reply\}/g, lastReply || '');
  const cf = contact?.customFields || {};
  const reserved = ['payment_link', 'appointment_date', 'appointment_time', 'webhook_response'];
  out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) => (!reserved.includes(key) && cf[key] != null && cf[key] !== '' ? String(cf[key]) : m));
  return out;
}

// Channel-aware sender: WhatsApp QR conversations send through the Baileys
// socket; everything else uses the official Cloud API.
function getSender(workspace, conversation) {
  if (conversation && conversation.channel === 'telegram_personal') {
    const tgUser = require('./tgUserService');
    const wsId = workspace._id;
    const wrap = async (fn) => {
      try {
        const r = await fn();
        return { success: true, data: { messages: [{ id: `tgp_${r?.id || ''}` }] } };
      } catch (e) {
        console.error('[BotFlow][TG] send failed:', e.message);
        return { success: false, error: { message: e.message } };
      }
    };
    const sender = {
      sendTextMessage: (to, text) => wrap(() => tgUser.send(wsId, to, { type: 'text', text })),
      sendMediaMessage: (to, type, url, caption) => wrap(() => tgUser.send(wsId, to, { type, media: { url, caption: caption || '' } })),
      sendTemplateMessage: async () => ({ success: false, error: { message: 'Templates are not supported on the Personal Telegram channel' } }),
      sendInteractiveMessage: (to, interactive) => wrap(async () => {
        const opts = [];
        for (const b of interactive?.action?.buttons || []) {
          if (b?.reply?.id) opts.push({ id: b.reply.id, title: b.reply.title || '' });
        }
        for (const s of interactive?.action?.sections || []) {
          for (const row of s?.rows || []) {
            if (row?.id) opts.push({ id: row.id, title: row.title || '', description: row.description || '' });
          }
        }
        let text = '';
        if (interactive?.header?.type === 'text' && interactive.header.text) text += `${interactive.header.text}\n\n`;
        text += interactive?.body?.text || '';
        if (interactive?.action?.parameters?.url) text += `\n${interactive.action.parameters.url}`;
        if (opts.length) {
          text += '\n\n' + opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ' — ' + o.description : ''}`).join('\n');
          text += '\n\nReply with the option number.';
          require('./qrAutomation').rememberOptions(conversation._id, opts);
        }
        if (interactive?.footer?.text) text += `\n\n${interactive.footer.text}`;
        sender.lastSentText = text;
        const h = interactive?.header;
        const mediaLink = h && h.type && h.type !== 'text' && h[h.type]?.link;
        if (mediaLink) return tgUser.send(wsId, to, { type: h.type, media: { url: mediaLink, caption: text } });
        return tgUser.send(wsId, to, { type: 'text', text });
      }),
    };
    return sender;
  }
  if (conversation && ['telegram', 'facebook', 'instagram'].includes(conversation.channel)) {
    const qrAuto = require('./qrAutomation');
    const label = conversation.channel;
    const wrap = async (fn) => {
      try {
        const r = await fn();
        return { success: true, data: { messages: [{ id: r?.id || '' }] } };
      } catch (e) {
        console.error(`[BotFlow][${label}] send failed:`, e.response?.data?.error?.message || e.message);
        return { success: false, error: { message: e.response?.data?.error?.message || e.message } };
      }
    };
    const sender = {
      sendTextMessage: (to, text) => wrap(() => qrAuto.channelSend(workspace, conversation, to, { type: 'text', text })),
      sendMediaMessage: (to, type, url, caption) => wrap(() => qrAuto.channelSend(workspace, conversation, to, { type, media: { url, caption: caption || '' } })),
      sendTemplateMessage: async () => ({ success: false, error: { message: `Templates are not supported on the ${label} channel` } }),
      sendInteractiveMessage: (to, interactive) => wrap(async () => {
        const opts = [];
        for (const b of interactive?.action?.buttons || []) {
          if (b?.reply?.id) opts.push({ id: b.reply.id, title: b.reply.title || '' });
        }
        for (const s of interactive?.action?.sections || []) {
          for (const row of s?.rows || []) {
            if (row?.id) opts.push({ id: row.id, title: row.title || '', description: row.description || '' });
          }
        }
        let text = '';
        if (interactive?.header?.type === 'text' && interactive.header.text) text += `${interactive.header.text}\n\n`;
        text += interactive?.body?.text || '';
        if (interactive?.action?.parameters?.url) text += `\n${interactive.action.parameters.url}`;
        if (opts.length) {
          text += '\n\n' + opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ' — ' + o.description : ''}`).join('\n');
          text += '\n\nReply with the option number.';
          qrAuto.rememberOptions(conversation._id, opts);
        }
        if (interactive?.footer?.text) text += `\n\n${interactive.footer.text}`;
        sender.lastSentText = text;
        const h = interactive?.header;
        const mediaLink = h && h.type && h.type !== 'text' && h[h.type]?.link;
        if (mediaLink) return qrAuto.channelSend(workspace, conversation, to, { type: h.type, media: { url: mediaLink, caption: text } });
        return qrAuto.channelSend(workspace, conversation, to, { type: 'text', text });
      }),
    };
    return sender;
  }
  if (conversation && conversation.channel === 'whatsapp_qr') {
    const waQr = require('./waQrService');
    const wsId = workspace._id;
    const wrap = async (fn) => {
      try {
        const r = await fn();
        return { success: true, data: { messages: [{ id: `qr_${r?.key?.id || ''}` }] } };
      } catch (e) {
        console.error('[BotFlow][QR] send failed:', e.message);
        return { success: false, error: { message: e.message } };
      }
    };
    const sender = {
      sendTextMessage: (to, text) => wrap(() => waQr.sendMessage(wsId, to, { type: 'text', text })),
      sendMediaMessage: (to, type, url, caption) => wrap(() => waQr.sendMessage(wsId, to, { type, media: { url, caption: caption || '' } })),
      sendTemplateMessage: async () => ({ success: false, error: { message: 'Templates are not supported on the WhatsApp QR channel' } }),
      // Interactive buttons/lists are rendered as numbered text options on QR;
      // the reply number/title is mapped back to the option id on incoming.
      sendInteractiveMessage: (to, interactive) => wrap(async () => {
        const opts = [];
        for (const b of interactive?.action?.buttons || []) {
          if (b?.reply?.id) opts.push({ id: b.reply.id, title: b.reply.title || '' });
        }
        for (const s of interactive?.action?.sections || []) {
          for (const row of s?.rows || []) {
            if (row?.id) opts.push({ id: row.id, title: row.title || '', description: row.description || '' });
          }
        }
        let text = '';
        if (interactive?.header?.type === 'text' && interactive.header.text) text += `*${interactive.header.text}*\n\n`;
        text += interactive?.body?.text || '';
        if (interactive?.action?.parameters?.url) text += `\n${interactive.action.parameters.url}`;
        if (opts.length) {
          text += '\n\n' + opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ' — ' + o.description : ''}`).join('\n');
          text += '\n\nReply with the option number.';
          require('./qrAutomation').rememberOptions(conversation._id, opts);
        }
        if (interactive?.footer?.text) text += `\n\n_${interactive.footer.text}_`;
        sender.lastSentText = text;
        const h = interactive?.header;
        const mediaLink = h && h.type && h.type !== 'text' && h[h.type]?.link;
        if (mediaLink) return waQr.sendMessage(wsId, to, { type: h.type, media: { url: mediaLink, caption: text } });
        return waQr.sendMessage(wsId, to, { type: 'text', text });
      }),
    };
    return sender;
  }
  return new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
}

async function saveOutbound({ workspace, conversation, contact, type, text, result, io, interactive }) {
  const msg = await Message.create({
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type,
    text,
    ...(interactive ? { interactive } : {}),
    waMessageId: result?.data?.messages?.[0]?.id || '',
    status: 'sent',
    metadata: { source: 'bot_flow' },
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
}

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const toHM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function findFreeSlots({ workspace, node, limit = 1 }) {
  const Appointment = require('../models/Appointment');
  const dur = Math.max(5, node.apptDuration || 30);
  const dayStartMin = toMin(node.apptTime || '10:00');
  const dayEndMin = Math.max(dayStartMin + dur, toMin(node.apptDayEnd || '18:00'));
  const d = new Date();
  d.setDate(d.getDate() + (node.apptDaysAhead == null ? 1 : node.apptDaysAhead));
  d.setHours(0, 0, 0, 0);
  const slots = [];
  for (let day = 0; day < 30 && slots.length < limit; day++) {
    const cur = new Date(d.getTime() + day * 86400000);
    const existing = await Appointment.find({
      workspace: workspace._id,
      date: { $gte: cur, $lt: new Date(cur.getTime() + 86400000) },
      status: { $nin: ['cancelled'] },
      archived: { $ne: true },
    }).select('startTime endTime').lean();
    const busy = existing.map((a) => [toMin(a.startTime), Math.max(toMin(a.endTime), toMin(a.startTime) + 1)]);
    for (let m = dayStartMin; m + dur <= dayEndMin && slots.length < limit; m += dur) {
      const clash = busy.some(([bs, be]) => m < be && m + dur > bs);
      if (!clash) slots.push({ date: cur, startMin: m, dur });
    }
  }
  return slots;
}

async function createBooking({ workspace, node, contact, to, slot }) {
  const Appointment = require('../models/Appointment');
  const start = toHM(slot.startMin);
  const end = toHM(slot.startMin + slot.dur);
  await Appointment.create({
    workspace: workspace._id,
    title: node.apptTitle || 'WhatsApp booking',
    contactName: contact?.name || contact?.profileName || '',
    contactPhone: contact?.phone || to,
    date: slot.date, startTime: start, endTime: end, duration: slot.dur,
    status: 'scheduled', notes: 'Booked via bot flow', type: 'general',
  });
  return {
    date: slot.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: `${start} - ${end}`,
  };
}

async function sendNode({ flow, node, workspace, conversation, contact, to, io, depth = 0, lastReply = '' }) {
  if (!node || depth > 12) return false;
  const wa = getSender(workspace, conversation);
  let result = null;
  let savedType = 'text';
  let savedText = '';
  let savedInteractive = null;

  if (node.type === 'question') {
    // Ask an open question and pause the flow until the contact's next free-text reply
    savedText = renderVars(node.text, contact, lastReply);
    if (!savedText) return false;
    result = await wa.sendTextMessage(to, savedText);
    if (!result?.success) {
      console.error('[BotFlow] question send failed:', result?.error?.message || '');
      return false;
    }
    await saveOutbound({ workspace, conversation, contact, type: 'text', text: savedText, result, io });
    const Conversation = require('../models/Conversation');
    // If a timeout branch is configured, expire after waitTimeoutHours so the scheduler can fire it.
    const waitHrs = Math.max(0, Number(node.waitTimeoutHours) || 0);
    const expiresAt = new Date(Date.now() + (waitHrs > 0 ? waitHrs : 24) * 3600 * 1000);
    await Conversation.updateOne({ _id: conversation._id }, {
      botFlowWait: { flowId: String(flow._id), nodeId: node.id, expiresAt },
      $unset: { botFlowResume: 1 },
    });
    return true;
  } else if (node.type === 'delay') {
    // Wait, then continue to the next card. Short delays (<=1h) run in-memory; longer
    // delays (minutes/hours/days) are persisted and resumed durably by the scheduler.
    const unit = node.delayUnit || 'seconds';
    const mult = unit === 'days' ? 86400000 : unit === 'hours' ? 3600000 : unit === 'minutes' ? 60000 : 1000;
    const ms = Math.max(0, Number(node.delaySeconds) || 0) * mult;
    const nids = nextIds(node.next);
    if (!nids.length) return true;
    if (ms > 3600000) {
      const Conversation = require('../models/Conversation');
      await Conversation.updateOne({ _id: conversation._id }, {
        botFlowResume: { flowId: String(flow._id), nodeId: node.id, runAt: new Date(Date.now() + ms) },
      });
      return true;
    }
    setTimeout(() => {
      (async () => {
        for (const nid of nids) {
          const nextNode = flow.nodes.find((n) => n.id === nid);
          if (nextNode) await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: depth + 1, lastReply });
        }
      })().catch((e) => console.error('[BotFlow] delay chain error:', e.message));
    }, ms);
    return true;
  } else if (node.type === 'condition') {
    // Branch on the last reply, a contact tag, or a saved variable
    let subject = '';
    let matched = false;
    if (node.condField === 'tag') {
      matched = (contact?.tags || []).some((t) => String(t).toLowerCase().trim() === String(node.condValue || '').toLowerCase().trim());
    } else {
      if (node.condField === 'variable') subject = String((contact?.customFields || {})[node.condVarName] ?? '');
      else subject = String(lastReply || conversation?.lastMessage?.text || '');
      const val = String(node.condValue || '');
      const op = node.condOp || 'contains';
      if (op === 'exists') matched = subject.trim() !== '';
      else if (op === 'equals') matched = subject.toLowerCase().trim() === val.toLowerCase().trim();
      else matched = subject.toLowerCase().includes(val.toLowerCase().trim());
    }
    const branch = matched ? node.nextTrue : node.nextFalse;
    for (const nid of nextIds(branch)) {
      const nextNode = flow.nodes.find((n) => n.id === nid);
      if (nextNode) {
        await new Promise((r) => setTimeout(r, 500));
        await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: depth + 1, lastReply });
      }
    }
    return true;
  } else if (node.type === 'text') {
    savedText = renderVars(node.text, contact, lastReply);
    result = await wa.sendTextMessage(to, savedText);
  } else if (node.type === 'media') {
    if (!node.mediaUrl) return false;
    savedType = node.mediaType || 'image';
    savedText = renderVars(node.caption || '', contact);
    result = await wa.sendMediaMessage(to, savedType, node.mediaUrl, savedText);
  } else if (node.type === 'template') {
    if (!node.templateName) return false;
    savedType = 'template';
    savedText = node.templateName;
    result = await wa.sendTemplateMessage(to, node.templateName, node.templateLanguage || 'en', []);
  } else if (node.type === 'products') {
    const Product = require('../models/Product');
    const prods = await Product.find({ workspace: workspace._id, _id: { $in: node.productIds || [] }, status: 'active' }).lean();
    if (!prods.length) return false;
    savedType = 'interactive';
    savedText = renderVars(node.text || 'Hamare products dekhein 👇', contact);
    const rows = prods.slice(0, 10).map((p) => ({
      id: `bfprod_${flow._id}_${node.id}_${p._id}`,
      title: String(p.name).slice(0, 24),
      description: `${p.currency === 'INR' ? '₹' : ''}${p.price || ''}${p.description ? ' — ' + p.description : ''}`.slice(0, 72),
    }));
    result = await wa.sendInteractiveMessage(to, {
      type: 'list',
      body: { text: savedText },
      action: { button: 'View Products', sections: [{ title: 'Products', rows }] },
    });
    savedInteractive = { type: 'list', body: savedText, sections: [{ title: 'Products', rows }] };
  } else if (node.type === 'action') {
    let apptVars = null;
    let payLink = null;
    try {
      if (node.actionType === 'book_appointment' && node.apptMode === 'choose') {
        const slots = await findFreeSlots({ workspace, node, limit: 10 });
        if (!slots.length) {
          savedText = 'Sorry, no slots are available right now. Please try again later.';
          result = await wa.sendTextMessage(to, savedText);
        } else {
          const rows = slots.map((sl) => ({
            id: `bfslot_${flow._id}_${node.id}_${sl.date.toISOString().slice(0, 10)}_${toHM(sl.startMin)}`,
            title: `${sl.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${toHM(sl.startMin)}`,
            description: `${toHM(sl.startMin)} - ${toHM(sl.startMin + sl.dur)}`,
          }));
          savedText = 'Apna slot chunein 👇';
          result = await wa.sendInteractiveMessage(to, {
            type: 'list',
            body: { text: `${node.apptTitle ? node.apptTitle + ' — ' : ''}apna available slot chunein:` },
            action: { button: 'Available Slots', sections: [{ title: 'Available Slots', rows }] },
          });
        }
        await saveOutbound({ workspace, conversation, contact, type: 'interactive', text: savedText, result, io });
        return true;
      }
      if (node.actionType === 'book_appointment') {
        const slots = await findFreeSlots({ workspace, node, limit: 1 });
        const slot = slots[0] || { date: (() => { const d = new Date(); d.setDate(d.getDate() + (node.apptDaysAhead == null ? 1 : node.apptDaysAhead)); d.setHours(0, 0, 0, 0); return d; })(), startMin: toMin(node.apptTime || '10:00'), dur: Math.max(5, node.apptDuration || 30) };
        apptVars = await createBooking({ workspace, node, contact, to, slot });
      } else if (node.actionType === 'send_payment') {
        const amount = Number(node.payAmount) || 0;
        if (amount > 0 && contact) {
          const PaymentLink = require('../models/PaymentLink');
          let link = '', razorpayLinkId = '';
          if (node.payMethod === 'upi' && node.payUpiId) {
            const pl = await PaymentLink.create({
              workspace: workspace._id, contact: contact._id, conversation: conversation._id,
              amount, description: node.payDesc || '', method: 'upi', link: '', upiId: node.payUpiId,
            });
            const pn = encodeURIComponent(workspace.name || 'Business');
            pl.link = `upi://pay?pa=${encodeURIComponent(node.payUpiId)}&pn=${pn}&am=${amount}&cu=INR${node.payDesc ? '&tn=' + encodeURIComponent(node.payDesc) : ''}`;
            await pl.save();
            payLink = `${process.env.FRONTEND_URL || 'https://app.wabapanel.com'}/pay/${pl._id}`;
          } else {
            const Integration = require('../models/Integration');
            const integ = await Integration.findOne({ workspace: workspace._id, type: 'razorpay', connected: true });
            if (integ?.config?.apiKey && integ?.config?.apiSecret) {
              const Razorpay = require('razorpay');
              const rzp = new Razorpay({ key_id: integ.config.apiKey, key_secret: integ.config.apiSecret });
              const plink = await rzp.paymentLink.create({
                amount: Math.round(amount * 100),
                currency: 'INR',
                description: node.payDesc || `Payment of Rs.${amount}`,
                customer: { name: contact.name || 'Customer', contact: `+${String(contact.phone).replace(/^\+/, '')}` },
                notify: { sms: false, email: false },
                notes: { workspace: String(workspace._id) },
              });
              link = plink.short_url; razorpayLinkId = plink.id;
              await PaymentLink.create({
                workspace: workspace._id, contact: contact._id, conversation: conversation._id,
                amount, description: node.payDesc || '', method: 'razorpay', link, razorpayLinkId,
              });
              payLink = link;
            } else {
              console.error('[BotFlow] send_payment: Razorpay not connected');
            }
          }
        }
      } else if (node.actionType === 'add_tag' && node.actionTag) {
        const Contact = require('../models/Contact');
        await Contact.updateOne({ _id: contact._id }, { $addToSet: { tags: node.actionTag } });
      } else if (node.actionType === 'assign_agent' && node.actionAgent) {
        const Conversation = require('../models/Conversation');
        await Conversation.updateOne({ _id: conversation._id }, { assignedAgent: node.actionAgent });
      } else if (node.actionType === 'ai_on' || node.actionType === 'ai_off') {
        const Conversation = require('../models/Conversation');
        await Conversation.updateOne({ _id: conversation._id }, { aiEnabled: node.actionType === 'ai_on' });
      }
    } catch (e) {
      console.error('[BotFlow] action failed:', e.message);
    }
    if (node.text || payLink) {
      savedText = renderVars(node.text || (payLink ? `💳 Payment Request: ₹${node.payAmount}${node.payDesc ? '\n' + node.payDesc : ''}\n\nPay securely here: {payment_link}` : ''), contact);
      if (apptVars) {
        savedText = savedText
          .replace(/\{appointment_date\}/g, apptVars.date)
          .replace(/\{appointment_time\}/g, apptVars.time);
      }
      if (payLink) savedText = savedText.replace(/\{payment_link\}/g, payLink);
      result = await wa.sendTextMessage(to, savedText);
    } else {
      if (node.next) {
        const nextNode = flow.nodes.find((n) => n.id === node.next);
        if (nextNode) {
          await new Promise((r) => setTimeout(r, 800));
          await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: depth + 1, lastReply });
        }
      }
      return true;
    }
  } else if (node.type === 'webhook') {
    // Outbound webhook: POST/GET to external URL with contact variable interpolation
    const axios = require('axios');
    try {
      const url = renderVars(node.webhookUrl || '', contact);
      if (!url) return false;
      const method = (node.webhookMethod || 'POST').toUpperCase();
      const headers = {};
      (node.webhookHeaders || []).forEach(h => { if (h.key && h.value) headers[h.key] = renderVars(h.value, contact); });
      let body = null;
      if (method !== 'GET' && method !== 'DELETE') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        const raw = renderVars(node.webhookBody || '{}', contact);
        try { body = JSON.parse(raw); } catch { body = raw; }
      }
      const resp = await axios({ method, url, headers, data: body, timeout: 15000 });
      console.log(`[BotFlow] webhook ${method} ${url} → ${resp.status}`);
      if (node.text) {
        savedText = renderVars(node.text, contact);
        const respStr = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        savedText = savedText.replace(/\{webhook_response\}/g, respStr.slice(0, 500));
        result = await wa.sendTextMessage(to, savedText);
      }
    } catch (e) {
      console.error('[BotFlow] webhook error:', e.message);
      if (node.text) {
        savedText = renderVars(node.text, contact).replace(/\{webhook_response\}/g, 'Error');
        result = await wa.sendTextMessage(to, savedText);
      }
    }
    if (!result && !node.text) {
      // No confirmation text — just chain to next node silently
      if (node.next) {
        const nextNode = flow.nodes.find((n) => n.id === node.next);
        if (nextNode) { await new Promise((r) => setTimeout(r, 800)); await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: depth + 1, lastReply }); }
      }
      return true;
    }
  } else if (node.type === 'interactive') {
    savedType = 'interactive';
    savedText = renderVars(node.text, contact);
    let interactive;
    const normUrl = (u) => (u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : '');
    const ctas = [];
    if (node.ctaUrl) ctas.push({ text: node.ctaText || 'Open', url: normUrl(node.ctaUrl) });
    (node.ctas || []).forEach((c) => { if (c.url) ctas.push({ text: c.text || 'Open', url: normUrl(c.url) }); });
    const body = { text: savedText || ' ' };
    if (node.mode === 'cta') {
      if (!ctas.length) return false;
      const first = ctas.shift();
      interactive = {
        type: 'cta_url',
        body,
        action: { name: 'cta_url', parameters: { display_text: first.text.slice(0, 20), url: first.url } },
      };
      savedInteractive = { type: 'cta_url', body: savedText, ctaText: first.text.slice(0, 20), ctaUrl: first.url };
    } else if (node.mode === 'list') {
      const rows = (node.rows || []).filter((r) => r.title).slice(0, 10).map((r, i) => ({
        id: `bf_${flow._id}_${r.next || 'none' + i}_${i}`,
        title: String(r.title).slice(0, 24),
        description: String(r.description || '').slice(0, 72),
      }));
      if (!rows.length) return false;
      interactive = {
        type: 'list',
        body,
        action: { button: (node.listButtonText || 'Choose').slice(0, 20), sections: [{ title: (node.name || 'Options').slice(0, 24), rows }] },
      };
    } else {
      const buttons = (node.buttons || []).filter((b) => b.title).slice(0, 3).map((b, i) => ({
        type: 'reply',
        reply: { id: `bf_${flow._id}_${b.next || 'none' + i}_${i}`, title: String(b.title).slice(0, 20) },
      }));
      if (!buttons.length) return false;
      interactive = { type: 'button', body, action: { buttons } };
    }
    if (interactive.type === 'button') {
      savedInteractive = { type: 'button', body: savedText, buttons: (interactive.action.buttons || []).map((b) => ({ id: b.reply.id, title: b.reply.title })) };
    } else if (interactive.type === 'list') {
      savedInteractive = { type: 'list', body: savedText, sections: interactive.action.sections || [] };
    }
    const ht = node.headerType || (node.header ? 'text' : 'none');
    if (ht === 'text' && node.header) {
      interactive.header = { type: 'text', text: renderVars(node.header, contact).slice(0, 60) };
    } else if (['image', 'video', 'document'].includes(ht) && node.headerMediaUrl) {
      interactive.header = { type: ht, [ht]: { link: node.headerMediaUrl } };
    }
    if (node.footer) interactive.footer = { text: renderVars(node.footer, contact).slice(0, 60) };
    result = await wa.sendInteractiveMessage(to, interactive);

    // WhatsApp only allows one URL button per message, so each remaining CTA
    // goes out as its own URL-button message after the main one.
    if (result?.success && ctas.length) {
      for (const c of ctas) {
        const ctaRes = await wa.sendInteractiveMessage(to, {
          type: 'cta_url',
          body: { text: c.text },
          action: { name: 'cta_url', parameters: { display_text: c.text.slice(0, 20), url: c.url } },
        });
        if (ctaRes?.success) await saveOutbound({ workspace, conversation, contact, type: 'interactive', text: `${c.text}: ${c.url}`, result: ctaRes, io, interactive: { type: 'cta_url', body: c.text, ctaText: c.text.slice(0, 20), ctaUrl: c.url } });
      }
    }
  }

  if (!result?.success) {
    console.error('[BotFlow] send failed:', node.type, result?.error?.message || result?.error || '');
    return false;
  }
  await saveOutbound({ workspace, conversation, contact, type: savedType, text: savedText, result, io, interactive: savedInteractive || undefined });

  for (const nid of nextIds(node.next)) {
    const nextNode = flow.nodes.find((n) => n.id === nid);
    if (nextNode) {
      await new Promise((r) => setTimeout(r, 800));
      await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: depth + 1, lastReply });
    }
  }
  return true;
}

// Free-text reply to a pending Question card: save the answer and resume the flow
async function handleAwaitingAnswer({ workspace, conversation, contact, to, text, io }) {
  try {
    const Conversation = require('../models/Conversation');
    const conv = await Conversation.findById(conversation._id).select('botFlowWait lastMessage').lean();
    const wait = conv?.botFlowWait;
    if (!wait || !wait.flowId || !wait.nodeId) return false;
    // Clear the wait first so a crash can't loop the same answer
    await Conversation.updateOne({ _id: conversation._id }, { $unset: { botFlowWait: 1 } });
    if (wait.expiresAt && new Date(wait.expiresAt) < new Date()) return false;
    const flow = await BotFlow.findOne({ _id: wait.flowId, workspace: workspace._id, isActive: true });
    if (!flow) return false;
    const node = flow.nodes.find((n) => n.id === wait.nodeId);
    if (!node) return false;
    const answer = String(text || '').trim();
    if (node.answerVar && answer) {
      const Contact = require('../models/Contact');
      await Contact.updateOne({ _id: contact._id }, { $set: { [`customFields.${node.answerVar.replace(/[^a-zA-Z0-9_]/g, '_')}`]: answer } });
      if (contact.customFields) contact.customFields[node.answerVar.replace(/[^a-zA-Z0-9_]/g, '_')] = answer;
      else contact.customFields = { [node.answerVar.replace(/[^a-zA-Z0-9_]/g, '_')]: answer };
    }
    let any = false;
    for (const nid of nextIds(node.next)) {
      const nextNode = flow.nodes.find((n) => n.id === nid);
      if (!nextNode) continue;
      await new Promise((r) => setTimeout(r, 500));
      const ok = await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, lastReply: answer });
      if (ok) any = true;
    }
    // Even with no next card, the answer was consumed — don't fall through to keyword triggers
    return true;
  } catch (e) {
    console.error('[BotFlow] handleAwaitingAnswer error:', e.message);
    return false;
  }
}

// A next value may hold multiple node ids joined by '.'
function nextIds(v) {
  return String(v || '').split('.').filter(Boolean);
}

// Button tap: bf_<flowId>_<nodeId> (nodeId may be several ids joined by '.')
async function sendFlowNode({ flowId, nodeId, workspace, conversation, contact, to, io }) {
  const flow = await BotFlow.findOne({ _id: flowId, workspace: workspace._id, isActive: true });
  if (!flow) return false;
  let any = false;
  for (const nid of nextIds(nodeId)) {
    const node = flow.nodes.find((n) => n.id === nid);
    if (!node) continue;
    const ok = await sendNode({ flow, node, workspace, conversation, contact, to, io });
    if (ok) {
      any = true;
      BotFlow.updateOne({ _id: flow._id }, { $inc: { [`nodeHits.${nid}`]: 1 } }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return any;
}

// Template quick-reply button tap: match against template node button branches
async function handleTemplateButton({ workspace, conversation, contact, to, text, io }) {
  if (!text) return false;
  const flows = await BotFlow.find({ workspace: workspace._id, isActive: true });
  for (const flow of flows) {
    for (const node of flow.nodes) {
      if (node.type !== 'template') continue;
      const btn = (node.buttons || []).find((b) => b.next && String(b.title || '').toLowerCase().trim() === text);
      if (!btn) continue;
      let any = false;
      for (const nid of nextIds(btn.next)) {
        const target = flow.nodes.find((n) => n.id === nid);
        if (!target) continue;
        const sent = await sendNode({ flow, node: target, workspace, conversation, contact, to, io });
        if (sent) { any = true; await new Promise((r) => setTimeout(r, 500)); }
      }
      if (any) return true;
    }
  }
  return false;
}

// Inbound text: match trigger keywords of active flows
async function handleTrigger({ workspace, conversation, contact, to, text, io }) {
  const flows = await BotFlow.find({ workspace: workspace._id, isActive: true });
  for (const flow of flows) {
    const matched = (flow.triggerKeywords || []).some((kw) => {
      const k = String(kw || '').toLowerCase().trim();
      if (!k) return false;
      return flow.matchType === 'contains' ? text.includes(k) : text === k;
    });
    if (!matched) continue;
    const start = flow.nodes.find((n) => n.id === flow.startNode) || flow.nodes[0];
    if (!start) continue;
    const sent = await sendNode({ flow, node: start, workspace, conversation, contact, to, io });
    if (sent) { BotFlow.updateOne({ _id: flow._id }, { $inc: { runs: 1 } }).catch(() => {}); return true; }
  }
  return false;
}

// Slot list tap: bfslot_<flowId>_<nodeId>_<yyyy-mm-dd>_<HH:MM>
async function bookChosenSlot({ flowId, nodeId, dateStr, timeStr, workspace, conversation, contact, to, io }) {
  const flow = await BotFlow.findOne({ _id: flowId, workspace: workspace._id });
  if (!flow) return false;
  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const wa = getSender(workspace, conversation);
  const Appointment = require('../models/Appointment');
  const date = new Date(dateStr + 'T00:00:00');
  const dur = Math.max(5, node.apptDuration || 30);
  const startMin = toMin(timeStr);
  const existing = await Appointment.find({
    workspace: workspace._id,
    date: { $gte: date, $lt: new Date(date.getTime() + 86400000) },
    status: { $nin: ['cancelled'] },
    archived: { $ne: true },
  }).select('startTime endTime').lean();
  const clash = existing.some((a) => startMin < Math.max(toMin(a.endTime), toMin(a.startTime) + 1) && startMin + dur > toMin(a.startTime));
  if (clash) {
    const result = await wa.sendTextMessage(to, 'Sorry, this slot was just booked 😕 Please go back and pick another slot.');
    await saveOutbound({ workspace, conversation, contact, type: 'text', text: 'Slot taken', result, io });
    return true;
  }
  const apptVars = await createBooking({ workspace, node, contact, to, slot: { date, startMin, dur } });
  let msg = node.text
    ? renderVars(node.text, contact).replace(/\{appointment_date\}/g, apptVars.date).replace(/\{appointment_time\}/g, apptVars.time)
    : `Your booking is confirmed ✅\n📅 ${apptVars.date}\n⏰ ${apptVars.time}`;
  const result = await wa.sendTextMessage(to, msg);
  await saveOutbound({ workspace, conversation, contact, type: 'text', text: msg, result, io });
  if (node.next) {
    const nextNode = flow.nodes.find((n) => n.id === node.next);
    if (nextNode) {
      await new Promise((r) => setTimeout(r, 800));
      await sendNode({ flow, node: nextNode, workspace, conversation, contact, to, io, depth: 1 });
    }
  }
  return true;
}

// Product row tap: bfprod_<flowId>_<nodeId>_<productId>
async function sendProductDetail({ flowId, nodeId, productId, workspace, conversation, contact, to, io }) {
  const flow = await BotFlow.findOne({ _id: flowId, workspace: workspace._id });
  if (!flow) return false;
  const node = flow.nodes.find((n) => n.id === nodeId);
  const Product = require('../models/Product');
  const p = await Product.findOne({ _id: productId, workspace: workspace._id }).lean();
  if (!p) return false;
  const wa = getSender(workspace, conversation);
  const cap = `*${p.name}*\n${p.currency === 'INR' ? '₹' : ''}${p.price || ''}${p.description ? '\n' + p.description : ''}${p.url ? '\n' + p.url : ''}`;
  let result;
  const img = (p.images || [])[0];
  if (img) result = await wa.sendMediaMessage(to, 'image', img, cap);
  else result = await wa.sendTextMessage(to, cap);
  await saveOutbound({ workspace, conversation, contact, type: img ? 'image' : 'text', text: cap, result, io });
  if (node && node.next) {
    const nx = flow.nodes.find((n) => n.id === node.next);
    if (nx) { await new Promise((r) => setTimeout(r, 800)); await sendNode({ flow, node: nx, workspace, conversation, contact, to, io, depth: 1 }); }
  }
  return true;
}

// Product row tap from a preset products list: prsprod_<presetId>_<productId>
async function sendPresetProductDetail({ productId, workspace, conversation, contact, to, io }) {
  const Product = require('../models/Product');
  const p = await Product.findOne({ _id: productId, workspace: workspace._id }).lean();
  if (!p) return false;
  const wa = getSender(workspace, conversation);
  const cap = `*${p.name}*\n${p.currency === 'INR' ? '₹' : ''}${p.price || ''}${p.description ? '\n' + p.description : ''}${p.url ? '\n' + p.url : ''}`;
  let result;
  const img = (p.images || [])[0];
  if (img) result = await wa.sendMediaMessage(to, 'image', img, cap);
  else result = await wa.sendTextMessage(to, cap);
  await saveOutbound({ workspace, conversation, contact, type: img ? 'image' : 'text', text: cap, result, io });
  return true;
}

// External webhook trigger: API call triggers a specific bot flow for a phone number
async function triggerFlowByWebhook({ workspaceId, flowId, phone, data }) {
  const Workspace = require('../models/Workspace');
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace || !workspace.whatsapp?.isConnected) return { ok: false, error: 'Workspace not found or WhatsApp not connected' };
  const flow = await BotFlow.findOne({ _id: flowId, workspace: workspaceId });
  if (!flow) return { ok: false, error: 'Flow not found' };
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return { ok: false, error: 'Invalid phone' };
  let contact = await Contact.findOne({ workspace: workspaceId, phone: { $in: [digits, digits.replace(/^91/, '')] } });
  if (!contact) contact = await Contact.create({ workspace: workspaceId, phone: digits, name: data?.name || '' });
  let conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id });
  if (!conversation) conversation = await Conversation.create({ workspace: workspaceId, contact: contact._id, lastMessageAt: new Date() });
  const start = flow.nodes.find(n => n.id === flow.startNode) || flow.nodes[0];
  if (!start) return { ok: false, error: 'Flow has no start node' };
  const sent = await sendNode({ flow, node: start, workspace, conversation, contact, to: digits, io: null, depth: 0 });
  if (sent) BotFlow.updateOne({ _id: flow._id }, { $inc: { runs: 1 } }).catch(() => {});
  return { ok: sent };
}

// WooCommerce webhook handler: receives order data, sends WhatsApp notification
async function handleWooCommerceOrder({ workspaceId, order }) {
  const Workspace = require('../models/Workspace');
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace || !workspace.whatsapp?.isConnected) return { ok: false, error: 'Workspace not connected' };
  const phone = String(order.billing?.phone || '').replace(/[^0-9]/g, '');
  if (!phone) return { ok: false, error: 'No phone in order' };
  let contact = await Contact.findOne({ workspace: workspaceId, phone: { $in: [phone, phone.replace(/^91/, '')] } });
  if (!contact) contact = await Contact.create({ workspace: workspaceId, phone, name: order.billing?.first_name ? `${order.billing.first_name} ${order.billing.last_name || ''}`.trim() : '' });
  let conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id });
  if (!conversation) conversation = await Conversation.create({ workspace: workspaceId, contact: contact._id, lastMessageAt: new Date() });
  // Check if there's a WooCommerce-triggered bot flow
  const flow = await BotFlow.findOne({ workspace: workspaceId, isActive: true, triggerKeywords: 'woocommerce_order' });
  if (flow) {
    const start = flow.nodes.find(n => n.id === flow.startNode) || flow.nodes[0];
    if (start) {
      await sendNode({ flow, node: start, workspace, conversation, contact, to: phone, io: null, depth: 0 });
      BotFlow.updateOne({ _id: flow._id }, { $inc: { runs: 1 } }).catch(() => {});
      return { ok: true, method: 'bot_flow' };
    }
  }
  // Default: send order confirmation text
  const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
  const items = (order.line_items || []).map(i => `${i.name} x${i.quantity}`).join(', ');
  const msg = `Order Confirmed!\n\nOrder #${order.number || order.id}\nItems: ${items}\nTotal: ${order.currency || 'INR'} ${order.total}\n\nThank you for your purchase!`;
  const result = await wa.sendTextMessage(phone, msg);
  await saveOutbound({ workspace, conversation, contact, type: 'text', text: msg, result, io: null });
  return { ok: true, method: 'direct_message' };
}

// Resume flows whose durable timed delay (botFlowResume.runAt) has elapsed.
async function processTimedResumes({ io } = {}) {
  const Conversation = require('../models/Conversation');
  const Workspace = require('../models/Workspace');
  const Contact = require('../models/Contact');
  const due = await Conversation.find({ 'botFlowResume.runAt': { $lte: new Date() }, 'botFlowResume.flowId': { $ne: '' } }).limit(100).lean();
  for (const conv of due) {
    try {
      const r = conv.botFlowResume || {};
      await Conversation.updateOne({ _id: conv._id }, { $unset: { botFlowResume: 1 } });
      const flow = await BotFlow.findOne({ _id: r.flowId, workspace: conv.workspace, isActive: true });
      if (!flow) continue;
      const node = flow.nodes.find((n) => n.id === r.nodeId);
      if (!node) continue;
      const workspace = await Workspace.findById(conv.workspace);
      const contact = await Contact.findById(conv.contact);
      if (!workspace || !contact) continue;
      for (const nid of nextIds(node.next)) {
        const nextNode = flow.nodes.find((n) => n.id === nid);
        if (nextNode) await sendNode({ flow, node: nextNode, workspace, conversation: conv, contact, to: contact.phone, io });
      }
    } catch (e) { console.error('[BotFlow] resume error:', e.message); }
  }
}

// Fire the "no reply" branch of question cards whose wait window elapsed.
async function processReplyTimeouts({ io } = {}) {
  const Conversation = require('../models/Conversation');
  const Workspace = require('../models/Workspace');
  const Contact = require('../models/Contact');
  const due = await Conversation.find({ 'botFlowWait.expiresAt': { $lte: new Date() }, 'botFlowWait.flowId': { $ne: '' } }).limit(100).lean();
  for (const conv of due) {
    try {
      const w = conv.botFlowWait || {};
      await Conversation.updateOne({ _id: conv._id }, { $unset: { botFlowWait: 1 } });
      const flow = await BotFlow.findOne({ _id: w.flowId, workspace: conv.workspace, isActive: true });
      if (!flow) continue;
      const node = flow.nodes.find((n) => n.id === w.nodeId);
      if (!node || !node.nextTimeout) continue; // no timeout branch -> silent expiry (old behavior)
      const workspace = await Workspace.findById(conv.workspace);
      const contact = await Contact.findById(conv.contact);
      if (!workspace || !contact) continue;
      for (const nid of nextIds(node.nextTimeout)) {
        const nextNode = flow.nodes.find((n) => n.id === nid);
        if (nextNode) await sendNode({ flow, node: nextNode, workspace, conversation: conv, contact, to: contact.phone, io });
      }
    } catch (e) { console.error('[BotFlow] reply-timeout error:', e.message); }
  }
}

// Start a flow marked with a given eventTrigger (e.g. 'dnp', 'new_lead') for a contact.
async function triggerFlowByEvent({ workspaceId, contactId, eventKey, io }) {
  try {
    const Workspace = require('../models/Workspace');
    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const flow = await BotFlow.findOne({ workspace: workspaceId, isActive: true, eventTrigger: eventKey });
    if (!flow) return false;
    const workspace = await Workspace.findById(workspaceId);
    const contact = await Contact.findById(contactId);
    if (!workspace || !contact) return false;
    const conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id });
    if (!conversation) return false;
    const start = flow.nodes.find((n) => n.id === flow.startNode) || flow.nodes[0];
    if (!start) return false;
    const sent = await sendNode({ flow, node: start, workspace, conversation, contact, to: contact.phone, io });
    if (sent) BotFlow.updateOne({ _id: flow._id }, { $inc: { runs: 1 } }).catch(() => {});
    return sent;
  } catch (e) { console.error('[BotFlow] triggerFlowByEvent error:', e.message); return false; }
}

module.exports = { sendFlowNode, handleTrigger, handleTemplateButton, handleAwaitingAnswer, bookChosenSlot, sendProductDetail, sendPresetProductDetail, triggerFlowByWebhook, handleWooCommerceOrder, getSender, processTimedResumes, processReplyTimeouts, triggerFlowByEvent };
